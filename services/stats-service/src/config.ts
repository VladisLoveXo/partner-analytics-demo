import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().min(0).max(65_535).default(50051),
  CLICKHOUSE_URL: z.url().default("http://localhost:8123"),
  CLICKHOUSE_USER: z.string().default("default"),
  CLICKHOUSE_PASSWORD: z.string().default(""),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  SHUTDOWN_DRAIN_MS: z.coerce.number().int().min(0).default(0),
  CHAOS_UNAVAILABLE_RATE: z.coerce.number().min(0).max(1).default(0),
  CHAOS_DELAY_MS: z.coerce.number().int().min(0).default(0),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.parse(env);
  return {
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    shutdownDrainMs: parsed.SHUTDOWN_DRAIN_MS,
    clickhouse: {
      url: parsed.CLICKHOUSE_URL,
      username: parsed.CLICKHOUSE_USER,
      password: parsed.CLICKHOUSE_PASSWORD,
    },
    chaos: {
      unavailableRate: parsed.CHAOS_UNAVAILABLE_RATE,
      delayMs: parsed.CHAOS_DELAY_MS,
    },
  };
}
