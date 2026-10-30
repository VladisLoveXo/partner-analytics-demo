import type { Redis } from "ioredis";

export type KeyUse = "new" | "repeat" | "conflict";

export interface KeyUseStore {
  /**
   * Remembers the payload fingerprint a key was first used with.
   * A repeat with the same fingerprint is a retry; with another fingerprint it is a client bug.
   */
  remember(scope: string, key: string, fingerprint: string): Promise<KeyUse>;
}

const TTL_SECONDS = 24 * 60 * 60;

export function createKeyUseStore(redis: Redis): KeyUseStore {
  return {
    async remember(scope, key, fingerprint) {
      // SET NX GET is atomic: it stores the fingerprint only for a new key and returns the old value otherwise.
      const previous = await redis.set(`idempotency:${scope}:${key}`, fingerprint, "EX", TTL_SECONDS, "NX", "GET");
      if (previous === null) return "new";
      return previous === fingerprint ? "repeat" : "conflict";
    },
  };
}
