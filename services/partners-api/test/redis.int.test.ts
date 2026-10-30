import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCache } from "../src/redis/cache.js";
import { createKeyUseStore } from "../src/redis/idempotency.js";
import { createRateLimiter } from "../src/redis/rate-limiter.js";
import { startRedis, type TestRedis } from "./helpers/containers.js";

let r: TestRedis;
const silentLog = { warn: () => {} };

beforeAll(async () => {
  r = await startRedis();
});

afterAll(async () => {
  await r?.stop();
});

describe("rate limiter", () => {
  it("allows the limit within a window, then refuses with the time left", async () => {
    const limiter = createRateLimiter(r.redis, { name: "test-limit", limit: 3, windowMs: 60_000 });

    const results = [];
    for (let i = 0; i < 4; i++) results.push(await limiter.hit("user-1"));

    expect(results.map((result) => result.allowed)).toEqual([true, true, true, false]);
    expect(results[2]?.remaining).toBe(0);
    expect(results[3]?.resetMs).toBeGreaterThan(0);
    expect(results[3]?.resetMs).toBeLessThanOrEqual(60_000);
  });

  it("counts every key separately", async () => {
    const limiter = createRateLimiter(r.redis, { name: "test-keys", limit: 1, windowMs: 60_000 });
    expect((await limiter.hit("a")).allowed).toBe(true);
    expect((await limiter.hit("b")).allowed).toBe(true);
    expect((await limiter.hit("a")).allowed).toBe(false);
  });

  it("opens a new window when the old one expires", async () => {
    const limiter = createRateLimiter(r.redis, { name: "test-window", limit: 1, windowMs: 200 });
    expect((await limiter.hit("user")).allowed).toBe(true);
    expect((await limiter.hit("user")).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect((await limiter.hit("user")).allowed).toBe(true);
  });
});

describe("cache", () => {
  it("serves the second read from Redis without loading", async () => {
    const cache = createCache(r.redis, silentLog);
    const load = vi.fn(async () => ({ clicks: 42 }));

    const first = await cache.getOrLoad("test:cache:1", 60, load);
    const second = await cache.getOrLoad("test:cache:1", 60, load);

    expect(first).toEqual({ value: { clicks: 42 }, hit: false });
    expect(second).toEqual({ value: { clicks: 42 }, hit: true });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("loads once for concurrent misses of the same key", async () => {
    const cache = createCache(r.redis, silentLog);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const load = vi.fn(async () => {
      await gate;
      return "value";
    });

    const reads = Array.from({ length: 10 }, () => cache.getOrLoad("test:cache:flight", 60, load));
    // Let every reader pass the Redis lookup and join the in-flight load before it finishes.
    await new Promise((resolve) => setTimeout(resolve, 50));
    release();

    expect((await Promise.all(reads)).every((read) => read.value === "value")).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("falls back to loading when Redis is down", async () => {
    const offline = new Redis("redis://127.0.0.1:1", {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
    });
    const cache = createCache(offline, silentLog);

    expect(await cache.getOrLoad("any", 60, async () => 7)).toEqual({ value: 7, hit: false });
    offline.disconnect();
  });
});

describe("idempotency key store", () => {
  it("tells a new key, a repeat with the same payload and a reuse with another payload apart", async () => {
    const store = createKeyUseStore(r.redis);

    expect(await store.remember("client-a", "key-1", "fingerprint-1")).toBe("new");
    expect(await store.remember("client-a", "key-1", "fingerprint-1")).toBe("repeat");
    expect(await store.remember("client-a", "key-1", "fingerprint-2")).toBe("conflict");
    // Keys of different clients live in different namespaces.
    expect(await store.remember("client-b", "key-1", "fingerprint-2")).toBe("new");
  });
});
