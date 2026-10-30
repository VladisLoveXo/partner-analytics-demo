import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { includesToday, type DateRange } from "../dates.js";
import { HealthCheckResponse_ServingStatus as ServingStatus } from "../gen/grpc/health/v1/health_pb.js";
import { EventType } from "../gen/stats/v1/stats_pb.js";
import type { Cache } from "../redis/cache.js";
import type { StatsClients } from "./client.js";
import { toHttpError } from "./errors.js";

export type CacheStatus = "HIT" | "MISS";

export interface Totals {
  clicks: number;
  conversions: number;
  revenueMinor: number;
  /** Conversion rate: conversions / clicks, 0 when there are no clicks. */
  cr: number;
}

export interface DailyPoint extends Totals {
  date: string;
}

export interface PartnerTotals extends Totals {
  partnerId: string;
}

export interface IngestEvent {
  eventId: string;
  partnerId: string;
  type: "click" | "conversion";
  occurredAt: string;
  revenueMinor: number;
  subId: string;
}

/** What the REST layer needs from stats-service, in JSON-friendly types. */
export interface StatsGateway {
  daily(partnerId: string, range: DateRange, requestId: string): Promise<{ days: DailyPoint[]; totals: Totals; cache: CacheStatus }>;
  totals(range: DateRange, requestId: string): Promise<{ partners: PartnerTotals[]; cache: CacheStatus }>;
  ingest(events: IngestEvent[], idempotencyKey: string, requestId: string): Promise<{ accepted: number }>;
  healthy(): Promise<boolean>;
}

export interface GatewayDeps {
  clients: StatsClients;
  cache: Cache;
  timeouts: { readMs: number; writeMs: number };
  now?: () => Date;
}

// A range that includes today keeps changing, an old range does not.
const LIVE_TTL_SECONDS = 30;
const SETTLED_TTL_SECONDS = 600;

export function createStatsGateway({ clients, cache, timeouts, now = () => new Date() }: GatewayDeps): StatsGateway {
  const ttlFor = (range: DateRange) => (includesToday(range, now()) ? LIVE_TTL_SECONDS : SETTLED_TTL_SECONDS);
  const callOptions = (timeoutMs: number, requestId: string, headers: Record<string, string> = {}) => ({
    timeoutMs,
    headers: { "x-request-id": requestId, ...headers },
  });

  return {
    async daily(partnerId, range, requestId) {
      const key = `stats:v1:daily:${partnerId}:${range.from}:${range.to}`;
      const { value: days, hit } = await cache.getOrLoad(key, ttlFor(range), async () => {
        const response = await clients.stats
          .getPartnerDaily({ partnerId, ...range }, callOptions(timeouts.readMs, requestId))
          .catch((error: unknown) => Promise.reject(toHttpError(error)));
        return response.days.map((day) => ({
          date: day.date,
          ...withRate(Number(day.clicks), Number(day.conversions), Number(day.revenueMinor)),
        }));
      });
      const sum = days.reduce(
        (acc, day) => ({
          clicks: acc.clicks + day.clicks,
          conversions: acc.conversions + day.conversions,
          revenueMinor: acc.revenueMinor + day.revenueMinor,
        }),
        { clicks: 0, conversions: 0, revenueMinor: 0 },
      );
      return { days, totals: withRate(sum.clicks, sum.conversions, sum.revenueMinor), cache: hit ? "HIT" : "MISS" };
    },

    async totals(range, requestId) {
      const key = `stats:v1:totals:${range.from}:${range.to}`;
      const { value: partners, hit } = await cache.getOrLoad(key, ttlFor(range), async () => {
        const response = await clients.stats
          .listPartnerTotals(range, callOptions(timeouts.readMs, requestId))
          .catch((error: unknown) => Promise.reject(toHttpError(error)));
        return response.partners.map((row) => ({
          partnerId: row.partnerId,
          ...withRate(Number(row.clicks), Number(row.conversions), Number(row.revenueMinor)),
        }));
      });
      return { partners, cache: hit ? "HIT" : "MISS" };
    },

    async ingest(events, idempotencyKey, requestId) {
      try {
        const response = await clients.stats.ingestEvents(
          {
            events: events.map((event) => ({
              eventId: event.eventId,
              partnerId: event.partnerId,
              type: event.type === "click" ? EventType.CLICK : EventType.CONVERSION,
              occurredAt: timestampFromDate(new Date(event.occurredAt)),
              revenueMinor: BigInt(event.revenueMinor),
              subId: event.subId,
            })),
          },
          callOptions(timeouts.writeMs, requestId, { "idempotency-key": idempotencyKey }),
        );
        return { accepted: response.accepted };
      } catch (error) {
        throw toHttpError(error);
      }
    },

    async healthy() {
      try {
        const response = await clients.health.check({}, { timeoutMs: 1_000 });
        return response.status === ServingStatus.SERVING;
      } catch {
        return false;
      }
    },
  };
}

// 64-bit counters arrive as bigint. Partner aggregates stay far below 2^53, so a JSON number is exact.
function withRate(clicks: number, conversions: number, revenueMinor: number): Totals {
  return { clicks, conversions, revenueMinor, cr: clicks === 0 ? 0 : Math.round((conversions / clicks) * 10_000) / 10_000 };
}
