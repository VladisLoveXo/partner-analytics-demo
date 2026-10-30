import { z } from "zod";

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1).default("postgres://app:app@localhost:5432/partners"),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  SEED_DEMO: z.stringbool().default(false),
});

const serverSchema = databaseSchema.extend({
  PORT: z.coerce.number().int().min(0).max(65_535).default(4000),
  HOST: z.string().default("0.0.0.0"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  STATS_URL: z.url().default("http://localhost:50051"),
  /** Public realm URL, exactly as it appears in the `iss` claim. */
  OIDC_ISSUER: z.url(),
  OIDC_AUDIENCE: z.string().min(1).default("partners-api"),
  /** Where this service fetches the signing keys; inside a cluster it differs from the public issuer. */
  OIDC_JWKS_URL: z.url().optional(),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
  INGEST_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(1200),
  STATS_READ_TIMEOUT_MS: z.coerce.number().int().positive().default(1500),
  STATS_WRITE_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  SHUTDOWN_DRAIN_MS: z.coerce.number().int().min(0).default(0),
});

export function loadDatabaseConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = databaseSchema.parse(env);
  return { databaseUrl: parsed.DATABASE_URL, logLevel: parsed.LOG_LEVEL, seedDemo: parsed.SEED_DEMO };
}

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = serverSchema.parse(env);
  return {
    port: parsed.PORT,
    host: parsed.HOST,
    logLevel: parsed.LOG_LEVEL,
    databaseUrl: parsed.DATABASE_URL,
    redisUrl: parsed.REDIS_URL,
    statsUrl: parsed.STATS_URL,
    shutdownDrainMs: parsed.SHUTDOWN_DRAIN_MS,
    oidc: {
      issuer: parsed.OIDC_ISSUER,
      audience: parsed.OIDC_AUDIENCE,
      // Keycloak publishes the keys under the realm URL.
      jwksUrl: parsed.OIDC_JWKS_URL ?? `${parsed.OIDC_ISSUER}/protocol/openid-connect/certs`,
    },
    rateLimits: {
      apiPerMinute: parsed.RATE_LIMIT_PER_MINUTE,
      ingestPerMinute: parsed.INGEST_RATE_LIMIT_PER_MINUTE,
    },
    statsTimeouts: {
      readMs: parsed.STATS_READ_TIMEOUT_MS,
      writeMs: parsed.STATS_WRITE_TIMEOUT_MS,
    },
  };
}
