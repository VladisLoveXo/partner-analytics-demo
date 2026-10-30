import type { Redis } from "ioredis";

export interface Cache {
  getOrLoad<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<{ value: T; hit: boolean }>;
}

interface WarnLogger {
  warn(fields: object, message: string): void;
}

/**
 * Cache-aside over Redis. Concurrent misses of one key share a single load inside this process,
 * so a popular key expiring does not send a burst of identical queries to ClickHouse.
 * Redis errors are logged and the value is loaded directly: the cache is an optimisation.
 */
export function createCache(redis: Redis, log: WarnLogger): Cache {
  const inFlight = new Map<string, Promise<unknown>>();

  return {
    async getOrLoad<T>(key: string, ttlSeconds: number, load: () => Promise<T>) {
      try {
        const cached = await redis.get(key);
        if (cached !== null) return { value: JSON.parse(cached) as T, hit: true };
      } catch (error) {
        log.warn({ err: error, key }, "cache read failed, loading directly");
      }

      let pending = inFlight.get(key) as Promise<T> | undefined;
      if (pending === undefined) {
        pending = (async () => {
          const value = await load();
          try {
            await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
          } catch (error) {
            log.warn({ err: error, key }, "cache write failed");
          }
          return value;
        })().finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      return { value: await pending, hit: false };
    },
  };
}
