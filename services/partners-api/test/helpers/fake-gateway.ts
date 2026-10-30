import type { DateRange } from "../../src/dates.js";
import type { IngestEvent, StatsGateway } from "../../src/stats/gateway.js";

export interface FakeGateway extends StatsGateway {
  dailyCalls: Array<{ partnerId: string; range: DateRange }>;
  ingested: Array<{ events: IngestEvent[]; idempotencyKey: string }>;
}

/** In-memory stats-service: route tests check HTTP behavior, gRPC is covered by its own tests. */
export function createFakeGateway(): FakeGateway {
  const dailyCalls: FakeGateway["dailyCalls"] = [];
  const ingested: FakeGateway["ingested"] = [];
  const day = { clicks: 100, conversions: 4, revenueMinor: 400_000, cr: 0.04 };

  return {
    dailyCalls,
    ingested,
    async daily(partnerId, range) {
      dailyCalls.push({ partnerId, range });
      return { days: [{ date: range.from, ...day }], totals: day, cache: "MISS" };
    },
    async totals() {
      return { partners: [{ partnerId: "alpha", ...day }], cache: "MISS" };
    },
    async ingest(events, idempotencyKey) {
      ingested.push({ events, idempotencyKey });
      return { accepted: events.length };
    },
    async healthy() {
      return true;
    },
  };
}
