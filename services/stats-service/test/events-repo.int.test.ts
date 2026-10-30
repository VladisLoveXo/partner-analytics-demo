import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEventsRepo, type EventRow, type EventsRepo } from "../src/events-repo.js";
import { startClickHouse, type TestClickHouse } from "./clickhouse-container.js";

let ch: TestClickHouse;
let repo: EventsRepo;

beforeAll(async () => {
  ch = await startClickHouse();
  repo = createEventsRepo(ch.client);
});

afterAll(async () => {
  await ch?.stop();
});

// Every test writes under its own partner id, so tests sharing the container do not see each other's rows.
function newPartner(): string {
  return `p-${randomUUID().slice(0, 8)}`;
}

function click(partnerId: string, day: string): EventRow {
  return {
    eventId: randomUUID(),
    partnerId,
    type: "click",
    occurredAt: new Date(`${day}T10:00:00.000Z`),
    revenueMinor: 0n,
    subId: "",
  };
}

function conversion(partnerId: string, day: string, revenueMinor: bigint): EventRow {
  return { ...click(partnerId, day), type: "conversion", revenueMinor };
}

async function countRawRows(partnerId: string): Promise<number> {
  const result = await ch.client.query({
    query: "SELECT count() AS n FROM analytics.events WHERE partner_id = {partnerId:String}",
    query_params: { partnerId },
    format: "JSONEachRow",
  });
  const [row] = await result.json<{ n: string }>();
  return Number(row?.n);
}

describe("insert deduplication", () => {
  it("stores a retried batch once, both in raw events and in the daily aggregate", async () => {
    const partner = newPartner();
    const batch = [click(partner, "2026-10-01"), click(partner, "2026-10-01"), conversion(partner, "2026-10-01", 150_000n)];

    await repo.insertBatch(batch, `batch-${partner}`);
    // The response of the first attempt was "lost", the caller retries with the same key.
    await repo.insertBatch(batch, `batch-${partner}`);

    expect(await countRawRows(partner)).toBe(3);
    expect(await repo.dailyStats(partner, "2026-10-01", "2026-10-01")).toEqual([
      { date: "2026-10-01", clicks: 2n, conversions: 1n, revenueMinor: 150_000n },
    ]);
  });

  it("collapses the same event sent in another batch only in raw data read with FINAL", async () => {
    const partner = newPartner();
    const event = click(partner, "2026-10-02");

    await repo.insertBatch([event], `first-${partner}`);
    await repo.insertBatch([event], `second-${partner}`);

    const exact = await repo.exactDailyStats(partner, "2026-10-02", "2026-10-02");
    const fromView = await repo.dailyStats(partner, "2026-10-02", "2026-10-02");
    expect(exact[0]?.clicks).toBe(1n);
    // The materialized view is an insert trigger and counted both inserts: the documented trade-off.
    expect(fromView[0]?.clicks).toBe(2n);
  });
});

describe("daily stats", () => {
  it("returns every day of the range and fills days without events with zeros", async () => {
    const partner = newPartner();
    await repo.insertBatch([click(partner, "2026-09-02"), conversion(partner, "2026-09-04", 99_900n)], `fill-${partner}`);

    expect(await repo.dailyStats(partner, "2026-09-01", "2026-09-05")).toEqual([
      { date: "2026-09-01", clicks: 0n, conversions: 0n, revenueMinor: 0n },
      { date: "2026-09-02", clicks: 1n, conversions: 0n, revenueMinor: 0n },
      { date: "2026-09-03", clicks: 0n, conversions: 0n, revenueMinor: 0n },
      { date: "2026-09-04", clicks: 0n, conversions: 1n, revenueMinor: 99_900n },
      { date: "2026-09-05", clicks: 0n, conversions: 0n, revenueMinor: 0n },
    ]);
  });

  it("does not mix partners", async () => {
    const mine = newPartner();
    const other = newPartner();
    await repo.insertBatch([click(mine, "2026-08-10"), click(other, "2026-08-10"), click(other, "2026-08-10")], `mix-${mine}`);

    const [day] = await repo.dailyStats(mine, "2026-08-10", "2026-08-10");
    expect(day?.clicks).toBe(1n);
  });
});

describe("partner totals", () => {
  it("sums the range per partner, highest revenue first", async () => {
    const small = newPartner();
    const big = newPartner();
    // A date range no other test writes to, because totals cover every partner.
    await repo.insertBatch(
      [
        click(small, "2025-03-01"),
        conversion(small, "2025-03-01", 1_000n),
        click(big, "2025-03-01"),
        click(big, "2025-03-02"),
        conversion(big, "2025-03-02", 5_000n),
        conversion(big, "2025-03-04", 5_000n),
      ],
      `totals-${big}`,
    );

    expect(await repo.partnerTotals("2025-03-01", "2025-03-03")).toEqual([
      { partnerId: big, clicks: 2n, conversions: 1n, revenueMinor: 5_000n },
      { partnerId: small, clicks: 1n, conversions: 1n, revenueMinor: 1_000n },
    ]);
  });
});
