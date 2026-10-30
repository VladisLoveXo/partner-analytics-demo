import { randomUUID } from "node:crypto";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError, createClient, type Client } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEventsRepo } from "../src/events-repo.js";
import { Health, HealthCheckResponse_ServingStatus as ServingStatus } from "../src/gen/grpc/health/v1/health_pb.js";
import { EventSchema, EventType, StatsService, type Event } from "../src/gen/stats/v1/stats_pb.js";
import { createHealthState, type HealthState } from "../src/health.js";
import { createGrpcServer, type GrpcServer } from "../src/server.js";
import { IDEMPOTENCY_HEADER } from "../src/stats-handlers.js";
import { startClickHouse, type TestClickHouse } from "./clickhouse-container.js";

let ch: TestClickHouse;
let server: GrpcServer;
let health: HealthState;
let stats: Client<typeof StatsService>;
let healthClient: Client<typeof Health>;

beforeAll(async () => {
  ch = await startClickHouse();
  health = createHealthState();
  server = createGrpcServer({ repo: createEventsRepo(ch.client), health, log: pino({ level: "silent" }) });
  const port = await server.listen(0, "127.0.0.1");
  const transport = createGrpcTransport({ baseUrl: `http://127.0.0.1:${port}` });
  stats = createClient(StatsService, transport);
  healthClient = createClient(Health, transport);
});

afterAll(async () => {
  await server?.close({ graceMs: 1_000 });
  await ch?.stop();
});

function event(partnerId: string, type: EventType, revenueMinor = 0n): Event {
  return create(EventSchema, {
    eventId: randomUUID(),
    partnerId,
    type,
    occurredAt: timestampFromDate(new Date("2026-10-05T12:00:00.000Z")),
    revenueMinor,
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

describe("IngestEvents", () => {
  it("rejects a batch without an idempotency key", async () => {
    const call = stats.ingestEvents({ events: [event("alpha", EventType.CLICK)] });
    expect(await codeOf(call)).toBe(Code.InvalidArgument);
  });

  it("stores a batch retried with the same key once", async () => {
    const partner = `p-${randomUUID().slice(0, 8)}`;
    const events = [event(partner, EventType.CLICK), event(partner, EventType.CONVERSION, 4_990n)];
    const headers = { [IDEMPOTENCY_HEADER]: `key-${randomUUID()}` };

    const first = await stats.ingestEvents({ events }, { headers });
    const retry = await stats.ingestEvents({ events }, { headers });

    expect(first.accepted).toBe(2);
    expect(retry.accepted).toBe(2);
    const { days } = await stats.getPartnerDaily({ partnerId: partner, from: "2026-10-05", to: "2026-10-05" });
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ date: "2026-10-05", clicks: 1n, conversions: 1n, revenueMinor: 4_990n });
  });

  it("counts an event repeated inside one batch once", async () => {
    const partner = `p-${randomUUID().slice(0, 8)}`;
    const click = event(partner, EventType.CLICK);

    const response = await stats.ingestEvents(
      { events: [click, click] },
      { headers: { [IDEMPOTENCY_HEADER]: `key-${randomUUID()}` } },
    );

    expect(response.accepted).toBe(1);
    const { days } = await stats.getPartnerDaily({ partnerId: partner, from: "2026-10-05", to: "2026-10-05" });
    expect(days[0]?.clicks).toBe(1n);
  });

  it("names the broken event when validation fails", async () => {
    const broken = { ...event("alpha", EventType.CLICK), eventId: "not-a-uuid" };
    const call = stats.ingestEvents({ events: [event("alpha", EventType.CLICK), broken] }, {
      headers: { [IDEMPOTENCY_HEADER]: `key-${randomUUID()}` },
    });
    await expect(call).rejects.toThrow(/events\[1\]\.event_id/);
    expect(await codeOf(call)).toBe(Code.InvalidArgument);
  });

  it("refuses revenue on a click", async () => {
    const call = stats.ingestEvents({ events: [event("alpha", EventType.CLICK, 100n)] }, {
      headers: { [IDEMPOTENCY_HEADER]: `key-${randomUUID()}` },
    });
    expect(await codeOf(call)).toBe(Code.InvalidArgument);
  });
});

describe("reads", () => {
  it("rejects an inverted date range", async () => {
    const call = stats.getPartnerDaily({ partnerId: "alpha", from: "2026-10-10", to: "2026-10-01" });
    expect(await codeOf(call)).toBe(Code.InvalidArgument);
  });

  it("returns a zero-filled day per date of the range", async () => {
    const { days } = await stats.getPartnerDaily({ partnerId: "nobody", from: "2026-01-01", to: "2026-01-07" });
    expect(days.map((day) => day.date)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
    ]);
  });
});

describe("health", () => {
  it("reports SERVING, then NOT_SERVING once shutdown starts", async () => {
    expect((await healthClient.check({})).status).toBe(ServingStatus.SERVING);
    health.serving = false;
    try {
      expect((await healthClient.check({})).status).toBe(ServingStatus.NOT_SERVING);
    } finally {
      health.serving = true;
    }
  });

  it("answers NOT_FOUND for an unknown service name", async () => {
    expect(await codeOf(healthClient.check({ service: "unknown.v1.Nope" }))).toBe(Code.NotFound);
  });
});
