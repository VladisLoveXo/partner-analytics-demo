import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { requireRole } from "../auth/guards.js";
import { parseRange } from "../dates.js";
import { notFound } from "../errors.js";
import type { Partner } from "../partners-repo.js";
import type { PartnerTotals } from "../stats/gateway.js";
import { parseWith, partnerIdParams, partnerIdSchema, rangeQuery } from "../validation.js";

const createBody = z.object({ id: partnerIdSchema, name: z.string().trim().min(1).max(100) });
const updateBody = z.object({ status: z.enum(["active", "disabled"]) });

export function registerAdminRoutes(app: FastifyInstance, deps: AppDeps): void {
  const now = deps.now ?? (() => new Date());

  // An encapsulated plugin: the role hook applies to these routes only.
  app.register(
    async (admin) => {
      admin.addHook("preHandler", requireRole("admin"));

      admin.get("/partners", async (request, reply) => {
        const range = parseRange(parseWith(rangeQuery, request.query), now());
        const [partners, stats] = await Promise.all([deps.partners.list(), deps.stats.totals(range, request.id)]);
        reply.header("x-cache", stats.cache);
        return { ...range, partners: withTotals(partners, stats.partners) };
      });

      admin.post("/partners", async (request, reply) => {
        const partner = await deps.partners.create(parseWith(createBody, request.body));
        return reply.code(201).send(partner);
      });

      admin.patch("/partners/:partnerId", async (request) => {
        const { partnerId } = parseWith(partnerIdParams, request.params);
        const { status } = parseWith(updateBody, request.body);
        const partner = await deps.partners.setStatus(partnerId, status);
        if (partner === null) throw notFound(`partner ${partnerId} not found`);
        return partner;
      });
    },
    { prefix: "/api/admin" },
  );
}

/** Registry rows from PostgreSQL with their traffic from ClickHouse; a partner without events gets zeros. */
function withTotals(partners: Partner[], totals: PartnerTotals[]) {
  const byId = new Map(totals.map((row) => [row.partnerId, row]));
  return partners.map((partner) => {
    const row = byId.get(partner.id);
    return {
      ...partner,
      clicks: row?.clicks ?? 0,
      conversions: row?.conversions ?? 0,
      revenueMinor: row?.revenueMinor ?? 0,
      cr: row?.cr ?? 0,
    };
  });
}
