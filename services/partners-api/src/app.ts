import { randomUUID } from "node:crypto";
import Fastify, { type FastifyBaseLogger, type FastifyError, type FastifyInstance } from "fastify";
import type { Principal } from "./auth/principal.js";
import type { TokenVerifier } from "./auth/verifier.js";
import { HttpError, unauthorized } from "./errors.js";
import type { PartnersRepo } from "./partners-repo.js";
import type { KeyUseStore } from "./redis/idempotency.js";
import type { RateLimiter, RateLimitResult } from "./redis/rate-limiter.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerMeRoutes } from "./routes/me.js";
import { registerPartnerRoutes } from "./routes/partners.js";
import type { StatsGateway } from "./stats/gateway.js";

export type LimiterName = "api" | "ingest";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by the authentication hook for every /api route. */
    principal: Principal | null;
  }
  interface FastifyContextConfig {
    rateLimit?: LimiterName;
  }
}

export interface AppDeps {
  verifyToken: TokenVerifier;
  partners: PartnersRepo;
  stats: StatsGateway;
  keyUses: KeyUseStore;
  rateLimiters: Record<LimiterName, RateLimiter>;
  checks: {
    database(): Promise<void>;
    redis(): Promise<void>;
  };
  logger?: FastifyBaseLogger;
  now?: () => Date;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    loggerInstance: deps.logger,
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
    bodyLimit: 2 * 1024 * 1024,
    // Behind nginx: take the client address from X-Forwarded-For.
    trustProxy: true,
  });
  app.decorateRequest("principal", null);

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  // Authentication: every /api route needs a valid bearer token.
  app.addHook("onRequest", async (request) => {
    if (!request.url.startsWith("/api/")) return;
    const header = request.headers.authorization;
    if (header === undefined || !header.startsWith("Bearer ")) throw unauthorized();
    request.principal = await deps.verifyToken(header.slice("Bearer ".length).trim());
  });

  // Rate limiting after authentication, so the counter belongs to the token subject, not to an IP.
  app.addHook("onRequest", async (request, reply) => {
    if (request.principal === null) return;
    const limiter = deps.rateLimiters[request.routeOptions.config?.rateLimit ?? "api"];
    let result: RateLimitResult;
    try {
      result = await limiter.hit(request.principal.subject);
    } catch (error) {
      // Fail open: losing the limiter for a while is better than refusing every request.
      request.log.warn({ err: error }, "rate limiter unavailable, request let through");
      return;
    }
    const resetSeconds = Math.ceil(result.resetMs / 1000);
    reply
      .header("ratelimit-limit", result.limit)
      .header("ratelimit-remaining", result.remaining)
      .header("ratelimit-reset", resetSeconds);
    if (!result.allowed) {
      reply.header("retry-after", resetSeconds);
      throw new HttpError(429, "rate_limited", "too many requests, slow down");
    }
  });

  app.setErrorHandler((error: FastifyError | HttpError, request, reply) => {
    if (error instanceof HttpError) {
      if (error.status >= 500) request.log.warn({ err: error }, error.message);
      return reply.code(error.status).send({ error: { code: error.code, message: error.message, ...error.details } });
    }
    // Fastify's own client errors: malformed JSON, wrong content type, body too large.
    if (typeof error.statusCode === "number" && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: { code: "bad_request", message: error.message } });
    }
    request.log.error({ err: error }, "unhandled error");
    return reply.code(500).send({ error: { code: "internal", message: "internal error" } });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({ error: { code: "not_found", message: `no route for ${request.method} ${request.url}` } }),
  );

  registerHealthRoutes(app, deps);
  registerMeRoutes(app);
  registerPartnerRoutes(app, deps);
  registerAdminRoutes(app, deps);
  registerEventRoutes(app, deps);
  return app;
}
