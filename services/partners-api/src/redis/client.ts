import { Redis } from "ioredis";

/**
 * Rate limiting and caching fail open, so a Redis outage must surface as a fast error,
 * not as requests queued until Redis is back.
 */
export function createRedis(url: string): Redis {
  return new Redis(url, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    commandTimeout: 500,
  });
}
