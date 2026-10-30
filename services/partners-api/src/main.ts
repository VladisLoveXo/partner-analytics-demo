import { setTimeout as sleep } from "node:timers/promises";
import { Code } from "@connectrpc/connect";
import { pino } from "pino";
import { buildApp } from "./app.js";
import { createTokenVerifier, remoteJwks } from "./auth/verifier.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { createPartnersRepo } from "./partners-repo.js";
import { createCache } from "./redis/cache.js";
import { createRedis } from "./redis/client.js";
import { createKeyUseStore } from "./redis/idempotency.js";
import { createRateLimiter } from "./redis/rate-limiter.js";
import { createStatsClients } from "./stats/client.js";
import { createStatsGateway } from "./stats/gateway.js";

const config = loadConfig();
const log = pino({ level: config.logLevel, base: { service: "partners-api" } });

const pool = createPool(config.databaseUrl);
const redis = createRedis(config.redisUrl);
redis.on("error", (error: Error) => log.warn({ err: error }, "redis connection error"));

const clients = createStatsClients(config.statsUrl, {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 1_000,
  onRetry: (info) =>
    log.warn({ rpc: info.method, attempt: info.attempt, delayMs: info.delayMs, code: Code[info.error.code] }, "retrying stats-service call"),
});

let draining = false;

const app = buildApp({
  logger: log,
  verifyToken: createTokenVerifier({
    issuer: config.oidc.issuer,
    audience: config.oidc.audience,
    jwks: remoteJwks(config.oidc.jwksUrl),
  }),
  partners: createPartnersRepo(pool),
  stats: createStatsGateway({ clients, cache: createCache(redis, log), timeouts: config.statsTimeouts }),
  keyUses: createKeyUseStore(redis),
  rateLimiters: {
    api: createRateLimiter(redis, { name: "api", limit: config.rateLimits.apiPerMinute, windowMs: 60_000 }),
    ingest: createRateLimiter(redis, { name: "ingest", limit: config.rateLimits.ingestPerMinute, windowMs: 60_000 }),
  },
  checks: {
    async database() {
      if (draining) throw new Error("shutting down");
      await pool.query("SELECT 1");
    },
    async redis() {
      await redis.ping();
    },
  },
});

await app.listen({ port: config.port, host: config.host });

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    log.info({ signal }, "shutting down");
    draining = true;
    // Readiness fails first; the drain pause lets the Service drop this pod before the port closes.
    sleep(config.shutdownDrainMs)
      .then(() => app.close())
      .then(() => pool.end())
      .then(() => redis.disconnect())
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        log.error({ err: error }, "unclean shutdown");
        process.exit(1);
      });
  });
}
