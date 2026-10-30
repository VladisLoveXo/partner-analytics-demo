import type { Redis } from "ioredis";

// Fixed window counter. INCR and PEXPIRE run in one script, so no other client can slip in between them
// and leave a counter without a TTL.
const FIXED_WINDOW = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return { count, redis.call('PTTL', KEYS[1]) }
`;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Milliseconds until the current window ends. */
  resetMs: number;
}

export interface RateLimiter {
  hit(key: string): Promise<RateLimitResult>;
}

export interface RateLimiterOptions {
  name: string;
  limit: number;
  windowMs: number;
}

export function createRateLimiter(redis: Redis, options: RateLimiterOptions): RateLimiter {
  return {
    async hit(key) {
      const [count, ttl] = (await redis.eval(FIXED_WINDOW, 1, `ratelimit:${options.name}:${key}`, options.windowMs)) as [
        number,
        number,
      ];
      return {
        allowed: count <= options.limit,
        limit: options.limit,
        remaining: Math.max(0, options.limit - count),
        resetMs: ttl > 0 ? ttl : options.windowMs,
      };
    },
  };
}
