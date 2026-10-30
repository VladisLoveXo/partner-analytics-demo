import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import type { JWTPayload } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type AppDeps } from "../src/app.js";
import { createTokenVerifier } from "../src/auth/verifier.js";
import { runSqlFile } from "../src/db.js";
import { createPartnersRepo } from "../src/partners-repo.js";
import { createKeyUseStore } from "../src/redis/idempotency.js";
import { createRateLimiter } from "../src/redis/rate-limiter.js";
import { startPostgres, startRedis, type TestPostgres, type TestRedis } from "./helpers/containers.js";
import { createFakeGateway, type FakeGateway } from "./helpers/fake-gateway.js";
import { adminClaims, AUDIENCE, createTestIssuer, ingestClaims, ISSUER, partnerClaims } from "./helpers/jwt.js";

const NOW = new Date("2026-10-30T12:00:00.000Z");
const SEED_FILE = fileURLToPath(new URL("../seed/demo.sql", import.meta.url));

let pg: TestPostgres;
let r: TestRedis;
let issuer: Awaited<ReturnType<typeof createTestIssuer>>;
let gateway: FakeGateway;
let app: FastifyInstance;

function buildTestApp(overrides: Partial<AppDeps> = {}): FastifyInstance {
  // Limiter names are unique per app, so tests never share counters.
  const limiter = (limit: number) => createRateLimiter(r.redis, { name: `test-${randomUUID()}`, limit, windowMs: 60_000 });
  return buildApp({
    verifyToken: createTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks: issuer.jwks }),
    partners: createPartnersRepo(pg.pool),
    stats: gateway,
    keyUses: createKeyUseStore(r.redis),
    rateLimiters: { api: limiter(1_000), ingest: limiter(1_000) },
    checks: {
      database: async () => {
        await pg.pool.query("SELECT 1");
      },
      redis: async () => {
        await r.redis.ping();
      },
    },
    now: () => NOW,
    ...overrides,
  });
}

beforeAll(async () => {
  [pg, r, issuer] = await Promise.all([startPostgres(), startRedis(), createTestIssuer()]);
  await runSqlFile(pg.pool, SEED_FILE);
  gateway = createFakeGateway();
  app = buildTestApp();
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await Promise.all([pg?.stop(), r?.stop()]);
});

async function call(method: "GET" | "POST" | "PATCH", url: string, claims?: JWTPayload, body?: unknown, headers: Record<string, string> = {}) {
  const authorization = claims ? { authorization: `Bearer ${await issuer.sign(claims)}` } : {};
  return app.inject({ method, url, headers: { ...authorization, ...headers }, ...(body === undefined ? {} : { payload: body as object }) });
}

function clickEvent(partnerId: string) {
  return { eventId: randomUUID(), partnerId, type: "click", occurredAt: "2026-10-29T10:00:00.000Z" };
}

describe("authentication", () => {
  it("answers 401 without a token", async () => {
    const response = await call("GET", "/api/me");
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "unauthorized" } });
  });

  it("answers 401 for a token issued to another API", async () => {
    const token = await issuer.sign(adminClaims, { audience: "account" });
    const response = await app.inject({ method: "GET", url: "/api/me", headers: { authorization: `Bearer ${token}` } });
    expect(response.statusCode).toBe(401);
  });

  it("leaves health endpoints public", async () => {
    expect((await call("GET", "/healthz")).statusCode).toBe(200);
    expect((await call("GET", "/readyz")).statusCode).toBe(200);
  });

  it("describes the caller", async () => {
    const response = await call("GET", "/api/me", partnerClaims("alpha"));
    expect(response.json()).toEqual({ subject: "user-alpha", username: "alpha", roles: ["partner"], partnerId: "alpha" });
  });
});

describe("tenant isolation", () => {
  it("serves a partner its own statistics", async () => {
    const response = await call("GET", "/api/partners/alpha/stats/daily?from=2026-10-01&to=2026-10-07", partnerClaims("alpha"));

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-cache"]).toBe("MISS");
    expect(response.json()).toMatchObject({ partnerId: "alpha", from: "2026-10-01", to: "2026-10-07" });
  });

  it("refuses a partner the statistics of another partner without asking stats-service", async () => {
    const before = gateway.dailyCalls.length;
    const response = await call("GET", "/api/partners/beta/stats/daily", partnerClaims("alpha"));

    expect(response.statusCode).toBe(403);
    expect(gateway.dailyCalls.length).toBe(before);
  });

  it("refuses a partner the card of another partner", async () => {
    expect((await call("GET", "/api/partners/beta", partnerClaims("alpha"))).statusCode).toBe(403);
    expect((await call("GET", "/api/partners/alpha", partnerClaims("alpha"))).statusCode).toBe(200);
  });

  it("lets an admin read any partner", async () => {
    expect((await call("GET", "/api/partners/beta/stats/daily", adminClaims)).statusCode).toBe(200);
  });

  it("uses the last 30 days by default and rejects a broken range", async () => {
    const response = await call("GET", "/api/partners/alpha/stats/daily", partnerClaims("alpha"));
    expect(response.json()).toMatchObject({ from: "2026-10-01", to: "2026-10-30" });

    const broken = await call("GET", "/api/partners/alpha/stats/daily?from=2026-10-10&to=2026-10-01", partnerClaims("alpha"));
    expect(broken.statusCode).toBe(400);
  });
});

describe("admin", () => {
  it("is closed to partners", async () => {
    expect((await call("GET", "/api/admin/partners", partnerClaims("alpha"))).statusCode).toBe(403);
  });

  it("lists the registry with traffic totals, zeros for partners without traffic", async () => {
    const response = await call("GET", "/api/admin/partners?from=2026-10-01&to=2026-10-30", adminClaims);

    expect(response.statusCode).toBe(200);
    const partners = response.json().partners as Array<{ id: string; clicks: number }>;
    expect(partners.find((partner) => partner.id === "alpha")?.clicks).toBe(100);
    expect(partners.find((partner) => partner.id === "gamma")?.clicks).toBe(0);
  });

  it("creates a partner once and switches it off", async () => {
    const created = await call("POST", "/api/admin/partners", adminClaims, { id: "delta", name: "Дельта" });
    expect(created.statusCode).toBe(201);

    const again = await call("POST", "/api/admin/partners", adminClaims, { id: "delta", name: "Дельта" });
    expect(again.statusCode).toBe(409);

    const disabled = await call("PATCH", "/api/admin/partners/delta", adminClaims, { status: "disabled" });
    expect(disabled.json()).toMatchObject({ id: "delta", status: "disabled" });
  });

  it("validates the new partner", async () => {
    const response = await call("POST", "/api/admin/partners", adminClaims, { id: "Bad Id", name: "" });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.issues).toHaveLength(2);
  });
});

describe("event ingestion", () => {
  const key = () => ({ "idempotency-key": `batch-${randomUUID()}` });

  it("needs the ingest role", async () => {
    const response = await call("POST", "/api/events", partnerClaims("alpha"), { events: [clickEvent("alpha")] }, key());
    expect(response.statusCode).toBe(403);
  });

  it("needs an Idempotency-Key", async () => {
    const response = await call("POST", "/api/events", ingestClaims, { events: [clickEvent("alpha")] });
    expect(response.statusCode).toBe(400);
  });

  it("rejects the whole batch when a partner is unknown or disabled", async () => {
    const response = await call("POST", "/api/events", ingestClaims, { events: [clickEvent("alpha"), clickEvent("nobody")] }, key());

    expect(response.statusCode).toBe(422);
    expect(response.json().error.partnerIds).toEqual(["nobody"]);
  });

  it("accepts a batch and passes a client-scoped key to stats-service", async () => {
    const headers = key();
    const response = await call("POST", "/api/events", ingestClaims, { events: [clickEvent("alpha"), clickEvent("beta")] }, headers);

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ accepted: 2, replay: false });
    const forwarded = gateway.ingested.at(-1)?.idempotencyKey;
    expect(forwarded).toMatch(/^[0-9a-f]{64}$/);
    expect(forwarded).not.toBe(headers["idempotency-key"]);
  });

  it("forwards a repeat with the same body again and marks it as a replay", async () => {
    const headers = key();
    const body = { events: [clickEvent("alpha")] };

    await call("POST", "/api/events", ingestClaims, body, headers);
    const repeat = await call("POST", "/api/events", ingestClaims, body, headers);

    expect(repeat.statusCode).toBe(202);
    expect(repeat.json()).toEqual({ accepted: 1, replay: true });
    const [first, second] = gateway.ingested.slice(-2);
    expect(second?.idempotencyKey).toBe(first?.idempotencyKey);
  });

  it("answers 409 when the key comes back with another body", async () => {
    const headers = key();

    await call("POST", "/api/events", ingestClaims, { events: [clickEvent("alpha")] }, headers);
    const reused = await call("POST", "/api/events", ingestClaims, { events: [clickEvent("beta")] }, headers);

    expect(reused.statusCode).toBe(409);
  });

  it("refuses events from the distant past", async () => {
    const old = { ...clickEvent("alpha"), occurredAt: "2024-01-01T00:00:00.000Z" };
    expect((await call("POST", "/api/events", ingestClaims, { events: [old] }, key())).statusCode).toBe(400);
  });
});

describe("rate limiting", () => {
  it("answers 429 with Retry-After once the caller runs out of requests", async () => {
    const limited = buildTestApp({
      rateLimiters: {
        api: createRateLimiter(r.redis, { name: `tight-${randomUUID()}`, limit: 2, windowMs: 60_000 }),
        ingest: createRateLimiter(r.redis, { name: `tight-${randomUUID()}`, limit: 2, windowMs: 60_000 }),
      },
    });
    const token = await issuer.sign(partnerClaims("alpha"));
    const request = () => limited.inject({ method: "GET", url: "/api/me", headers: { authorization: `Bearer ${token}` } });

    const statuses = [(await request()).statusCode, (await request()).statusCode];
    const refused = await request();

    expect(statuses).toEqual([200, 200]);
    expect(refused.statusCode).toBe(429);
    expect(Number(refused.headers["retry-after"])).toBeGreaterThan(0);
    expect(refused.headers["ratelimit-remaining"]).toBe("0");
    await limited.close();
  });
});
