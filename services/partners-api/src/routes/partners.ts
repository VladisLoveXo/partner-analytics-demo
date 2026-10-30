import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";
import { assertCanReadPartner, requirePrincipal } from "../auth/guards.js";
import { parseRange } from "../dates.js";
import { notFound } from "../errors.js";
import { parseWith, partnerIdParams, rangeQuery } from "../validation.js";

export function registerPartnerRoutes(app: FastifyInstance, deps: AppDeps): void {
  const now = deps.now ?? (() => new Date());

  app.get("/api/partners/:partnerId", async (request) => {
    const { partnerId } = parseWith(partnerIdParams, request.params);
    assertCanReadPartner(requirePrincipal(request), partnerId);
    const partner = await deps.partners.get(partnerId);
    if (partner === null) throw notFound(`partner ${partnerId} not found`);
    return partner;
  });

  app.get("/api/partners/:partnerId/stats/daily", async (request, reply) => {
    const { partnerId } = parseWith(partnerIdParams, request.params);
    // Access is checked before anything else is looked at, so a foreign id reveals nothing.
    assertCanReadPartner(requirePrincipal(request), partnerId);
    const range = parseRange(parseWith(rangeQuery, request.query), now());
    const { days, totals, cache } = await deps.stats.daily(partnerId, range, request.id);
    reply.header("x-cache", cache);
    return { partnerId, ...range, totals, days };
  });
}
