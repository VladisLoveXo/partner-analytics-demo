import { createServer, type ServerHttp2Session } from "node:http2";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { Code, ConnectError, type ServiceImpl } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { afterEach, describe, expect, it } from "vitest";
import { HttpError } from "../src/errors.js";
import { StatsService } from "../src/gen/stats/v1/stats_pb.js";
import type { Cache } from "../src/redis/cache.js";
import { createStatsClients, type StatsClients } from "../src/stats/client.js";
import { toHttpError } from "../src/stats/errors.js";
import { createStatsGateway } from "../src/stats/gateway.js";

interface Stub {
  baseUrl: string;
  close(): Promise<void>;
}

const stubs: Stub[] = [];

/** A stats-service stand-in whose behavior every test scripts on its own. */
async function startStub(impl: Partial<ServiceImpl<typeof StatsService>>): Promise<Stub> {
  const server = createServer(connectNodeAdapter({ routes: (router) => router.service(StatsService, impl) }));
  const sessions = new Set<ServerHttp2Session>();
  server.on("session", (session) => sessions.add(session));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const stub = {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () =>
      new Promise<void>((resolve) => {
        for (const session of sessions) session.destroy();
        server.close(() => resolve());
      }),
  };
  stubs.push(stub);
  return stub;
}

afterEach(async () => {
  await Promise.all(stubs.splice(0).map((stub) => stub.close()));
});

function clients(baseUrl: string, retries: number[] = []): StatsClients {
  return createStatsClients(baseUrl, {
    maxAttempts: 3,
    baseDelayMs: 5,
    maxDelayMs: 20,
    onRetry: (info) => retries.push(info.attempt),
  });
}

async function codeOf(call: Promise<unknown>): Promise<Code | undefined> {
  try {
    await call;
    return undefined;
  } catch (error) {
    return ConnectError.from(error).code;
  }
}

describe("retries", () => {
  it("retries UNAVAILABLE and sends the same idempotency key every time", async () => {
    const keys: (string | null)[] = [];
    const stub = await startStub({
      ingestEvents(request, context) {
        keys.push(context.requestHeader.get("idempotency-key"));
        if (keys.length < 3) throw new ConnectError("overloaded", Code.Unavailable);
        return { accepted: request.events.length };
      },
    });
    const retries: number[] = [];

    const response = await clients(stub.baseUrl, retries).stats.ingestEvents(
      { events: [] },
      { headers: { "idempotency-key": "key-0001" }, timeoutMs: 2_000 },
    );

    expect(response.accepted).toBe(0);
    expect(keys).toEqual(["key-0001", "key-0001", "key-0001"]);
    expect(retries).toEqual([1, 2]);
  });

  it("gives up after the last attempt", async () => {
    let calls = 0;
    const stub = await startStub({
      listPartnerTotals() {
        calls++;
        throw new ConnectError("down", Code.Unavailable);
      },
    });

    const code = await codeOf(clients(stub.baseUrl).stats.listPartnerTotals({ from: "2026-10-01", to: "2026-10-02" }));

    expect(code).toBe(Code.Unavailable);
    expect(calls).toBe(3);
  });

  it("does not retry an error the caller has to fix", async () => {
    let calls = 0;
    const stub = await startStub({
      getPartnerDaily() {
        calls++;
        throw new ConnectError("bad range", Code.InvalidArgument);
      },
    });

    const code = await codeOf(clients(stub.baseUrl).stats.getPartnerDaily({ partnerId: "alpha", from: "x", to: "y" }));

    expect(code).toBe(Code.InvalidArgument);
    expect(calls).toBe(1);
  });
});

describe("deadlines", () => {
  it("fails with DEADLINE_EXCEEDED close to the deadline and does not retry it", async () => {
    let calls = 0;
    const stub = await startStub({
      async getPartnerDaily(_request, context) {
        calls++;
        await sleep(2_000, undefined, { signal: context.signal });
        return { days: [] };
      },
    });

    const started = performance.now();
    const code = await codeOf(
      clients(stub.baseUrl).stats.getPartnerDaily({ partnerId: "alpha", from: "2026-10-01", to: "2026-10-01" }, { timeoutMs: 200 }),
    );

    expect(code).toBe(Code.DeadlineExceeded);
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(calls).toBe(1);
  });

  it("stops retrying once the shared deadline is spent", async () => {
    const stub = await startStub({
      listPartnerTotals() {
        throw new ConnectError("down", Code.Unavailable);
      },
    });
    const slowRetries = createStatsClients(stub.baseUrl, { maxAttempts: 10, baseDelayMs: 1_000, maxDelayMs: 1_000, random: () => 1 });

    const started = performance.now();
    const code = await codeOf(slowRetries.stats.listPartnerTotals({ from: "2026-10-01", to: "2026-10-02" }, { timeoutMs: 300 }));

    expect(code).toBe(Code.DeadlineExceeded);
    expect(performance.now() - started).toBeLessThan(900);
  });
});

describe("gateway", () => {
  function memoryCache(ttls: Map<string, number>): Cache {
    return {
      async getOrLoad(key, ttlSeconds, load) {
        ttls.set(key, ttlSeconds);
        return { value: await load(), hit: false };
      },
    };
  }

  it("converts aggregates to numbers, adds conversion rate and totals", async () => {
    const stub = await startStub({
      getPartnerDaily: () => ({
        days: [
          { date: "2026-10-01", clicks: 200n, conversions: 5n, revenueMinor: 1_250_000n },
          { date: "2026-10-02", clicks: 0n, conversions: 0n, revenueMinor: 0n },
        ],
      }),
    });
    const gateway = createStatsGateway({
      clients: clients(stub.baseUrl),
      cache: memoryCache(new Map()),
      timeouts: { readMs: 1_000, writeMs: 1_000 },
    });

    const result = await gateway.daily("alpha", { from: "2026-10-01", to: "2026-10-02" }, "req-1");

    expect(result.days).toEqual([
      { date: "2026-10-01", clicks: 200, conversions: 5, revenueMinor: 1_250_000, cr: 0.025 },
      { date: "2026-10-02", clicks: 0, conversions: 0, revenueMinor: 0, cr: 0 },
    ]);
    expect(result.totals).toEqual({ clicks: 200, conversions: 5, revenueMinor: 1_250_000, cr: 0.025 });
  });

  it("keeps ranges that include today in the cache for a shorter time", async () => {
    const stub = await startStub({ getPartnerDaily: () => ({ days: [] }) });
    const ttls = new Map<string, number>();
    const gateway = createStatsGateway({
      clients: clients(stub.baseUrl),
      cache: memoryCache(ttls),
      timeouts: { readMs: 1_000, writeMs: 1_000 },
      now: () => new Date("2026-10-30T12:00:00Z"),
    });

    await gateway.daily("alpha", { from: "2026-10-01", to: "2026-10-30" }, "req-1");
    await gateway.daily("alpha", { from: "2026-09-01", to: "2026-09-30" }, "req-2");

    expect(ttls.get("stats:v1:daily:alpha:2026-10-01:2026-10-30")).toBe(30);
    expect(ttls.get("stats:v1:daily:alpha:2026-09-01:2026-09-30")).toBe(600);
  });

  it("reports stats-service failures as HTTP errors", async () => {
    const stub = await startStub({
      getPartnerDaily() {
        throw new ConnectError("down", Code.Unavailable);
      },
    });
    const gateway = createStatsGateway({
      clients: clients(stub.baseUrl),
      cache: memoryCache(new Map()),
      timeouts: { readMs: 1_000, writeMs: 1_000 },
    });

    const error = await gateway.daily("alpha", { from: "2026-10-01", to: "2026-10-02" }, "req-1").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(503);
  });
});

describe("gRPC to HTTP status mapping", () => {
  it.each([
    [Code.InvalidArgument, 400],
    [Code.NotFound, 404],
    [Code.ResourceExhausted, 429],
    [Code.Unavailable, 503],
    [Code.DeadlineExceeded, 504],
    [Code.Internal, 502],
  ])("%s becomes %s", (code, status) => {
    expect(toHttpError(new ConnectError("x", code)).status).toBe(status);
  });
});
