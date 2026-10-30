import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer } from "@testcontainers/redis";
import type { Redis } from "ioredis";
import type pg from "pg";
import { createPool, runMigrations } from "../../src/db.js";
import { createRedis } from "../../src/redis/client.js";

export const POSTGRES_IMAGE = "postgres:18-alpine";
export const REDIS_IMAGE = "redis:7.4-alpine";
export const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations/", import.meta.url));

export interface TestPostgres {
  pool: pg.Pool;
  stop(): Promise<void>;
}

export interface TestRedis {
  redis: Redis;
  url: string;
  stop(): Promise<void>;
}

/** A throwaway PostgreSQL with the service migrations applied. */
export async function startPostgres(): Promise<TestPostgres> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const pool = createPool(container.getConnectionUri());
  await runMigrations(pool, MIGRATIONS_DIR);
  return {
    pool,
    async stop() {
      await pool.end();
      await container.stop();
    },
  };
}

export async function startRedis(): Promise<TestRedis> {
  const container = await new RedisContainer(REDIS_IMAGE).start();
  const url = container.getConnectionUrl();
  const redis = createRedis(url);
  await once(redis, "ready");
  return {
    redis,
    url,
    async stop() {
      redis.disconnect();
      await container.stop();
    },
  };
}
