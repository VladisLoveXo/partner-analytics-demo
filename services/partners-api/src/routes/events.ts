import { createHash } from "node:crypto";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { requirePrincipal, requireRole } from "../auth/guards.js";
import { badRequest, conflict, HttpError } from "../errors.js";
import type { KeyUse, KeyUseStore } from "../redis/idempotency.js";
import { parseWith, partnerIdSchema } from "../validation.js";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/;
const MAX_EVENT_AGE_MS = 400 * 86_400_000;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

const eventSchema = z
  .object({
    eventId: z.uuid(),
    partnerId: partnerIdSchema,
    type: z.enum(["click", "conversion"]),
    occurredAt: z.iso.datetime({ offset: true }),
    revenueMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
    subId: z.string().max(64).default(""),
  })
  .refine((event) => event.type === "conversion" || event.revenueMinor === 0, {
    message: "a click carries no revenue",
    path: ["revenueMinor"],
  });

const bodySchema = z.object({ events: z.array(eventSchema).min(1).max(1000) });

export function registerEventRoutes(app: FastifyInstance, deps: AppDeps): void {
  const now = deps.now ?? (() => new Date());

  app.post(
    "/api/events",
    { config: { rateLimit: "ingest" }, preHandler: requireRole("ingest") },
    async (request, reply) => {
      const principal = requirePrincipal(request);
      const key = request.headers["idempotency-key"];
      if (typeof key !== "string" || !IDEMPOTENCY_KEY.test(key)) {
        throw badRequest("the Idempotency-Key header is required: 8-128 characters of [A-Za-z0-9._:-]");
      }
      const { events } = parseWith(bodySchema, request.body);

      const nowMs = now().getTime();
      const late = events.findIndex((event) => {
        const at = Date.parse(event.occurredAt);
        return at < nowMs - MAX_EVENT_AGE_MS || at > nowMs + MAX_CLOCK_SKEW_MS;
      });
      if (late >= 0) throw badRequest(`events[${late}].occurredAt is outside the accepted time window`);

      // All or nothing: a batch that mentions an unknown partner is rejected as a whole.
      const partnerIds = [...new Set(events.map((event) => event.partnerId))];
      const active = await deps.partners.findActive(partnerIds);
      const rejected = partnerIds.filter((id) => !active.has(id));
      if (rejected.length > 0) {
        throw new HttpError(422, "unknown_partners", "events reference unknown or disabled partners", { partnerIds: rejected });
      }

      const use = await rememberKeyUse(deps.keyUses, principal.clientId, key, sha256(JSON.stringify(events)), request.log);
      if (use === "conflict") throw conflict("this Idempotency-Key was already used with a different body");

      // A repeat still goes to stats-service: the first attempt may have failed before ClickHouse stored it,
      // and ClickHouse drops the copy if it did. The key is scoped by client, so two producers never collide.
      const { accepted } = await deps.stats.ingest(events, sha256(`${principal.clientId}:${key}`), request.id);
      return reply.code(202).send({ accepted, replay: use === "repeat" });
    },
  );
}

async function rememberKeyUse(
  store: KeyUseStore,
  scope: string,
  key: string,
  fingerprint: string,
  log: FastifyBaseLogger,
): Promise<KeyUse> {
  try {
    return await store.remember(scope, key, fingerprint);
  } catch (error) {
    // Without Redis only the "same key, different body" check is lost: ClickHouse still drops repeats.
    log.warn({ err: error }, "idempotency key store unavailable");
    return "new";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
