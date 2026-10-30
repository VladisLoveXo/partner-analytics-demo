import type { ClickHouseClient } from "@clickhouse/client";

export type EventKind = "click" | "conversion";

export interface EventRow {
  eventId: string;
  partnerId: string;
  type: EventKind;
  occurredAt: Date;
  revenueMinor: bigint;
  subId: string;
}

export interface DailyRow {
  date: string;
  clicks: bigint;
  conversions: bigint;
  revenueMinor: bigint;
}

export interface TotalsRow {
  partnerId: string;
  clicks: bigint;
  conversions: bigint;
  revenueMinor: bigint;
}

export interface EventsRepo {
  /** Writes the batch as one INSERT. Repeating it with the same token stores nothing new. */
  insertBatch(rows: readonly EventRow[], dedupToken: string, signal?: AbortSignal): Promise<void>;
  /** Fast path for dashboards: reads the aggregate filled by the materialized view. */
  dailyStats(partnerId: string, from: string, to: string, signal?: AbortSignal): Promise<DailyRow[]>;
  /** Exact path for reconciliation: reads raw events with FINAL, so duplicates are collapsed. */
  exactDailyStats(partnerId: string, from: string, to: string, signal?: AbortSignal): Promise<DailyRow[]>;
  partnerTotals(from: string, to: string, signal?: AbortSignal): Promise<TotalsRow[]>;
}

// ClickHouse quotes 64-bit integers in JSON output, so sums arrive as strings.
interface RawDaily {
  event_date: string;
  clicks_total: string;
  conversions_total: string;
  revenue_total: string;
}

interface RawTotals {
  partner_id: string;
  clicks_total: string;
  conversions_total: string;
  revenue_total: string;
}

const READ_SETTINGS = {
  // Over HTTP ClickHouse keeps running a SELECT after the client disconnects unless told otherwise.
  // With this, an expired gRPC deadline (aborted request) also stops the query in the database.
  cancel_http_readonly_queries_on_client_close: 1,
} as const;

// WITH FILL adds the missing days of the range with zero values. TO is exclusive, hence + 1.
const DAILY_FROM_VIEW = `
  SELECT
      event_date,
      sum(clicks) AS clicks_total,
      sum(conversions) AS conversions_total,
      sum(revenue_minor) AS revenue_total
  FROM analytics.partner_daily
  WHERE partner_id = {partnerId:String}
    AND event_date BETWEEN {from:Date} AND {to:Date}
  GROUP BY event_date
  ORDER BY event_date WITH FILL FROM {from:Date} TO {to:Date} + 1`;

const DAILY_EXACT = `
  SELECT
      event_date,
      countIf(event_type = 'click') AS clicks_total,
      countIf(event_type = 'conversion') AS conversions_total,
      sumIf(revenue_minor, event_type = 'conversion') AS revenue_total
  FROM analytics.events FINAL
  WHERE partner_id = {partnerId:String}
    AND event_date BETWEEN {from:Date} AND {to:Date}
  GROUP BY event_date
  ORDER BY event_date WITH FILL FROM {from:Date} TO {to:Date} + 1`;

const TOTALS = `
  SELECT
      partner_id,
      sum(clicks) AS clicks_total,
      sum(conversions) AS conversions_total,
      sum(revenue_minor) AS revenue_total
  FROM analytics.partner_daily
  WHERE event_date BETWEEN {from:Date} AND {to:Date}
  GROUP BY partner_id
  ORDER BY revenue_total DESC, partner_id ASC`;

export function createEventsRepo(client: ClickHouseClient): EventsRepo {
  async function daily(query: string, partnerId: string, from: string, to: string, signal?: AbortSignal) {
    const result = await client.query({
      query,
      query_params: { partnerId, from, to },
      format: "JSONEachRow",
      clickhouse_settings: READ_SETTINGS,
      abort_signal: signal,
    });
    const rows = await result.json<RawDaily>();
    return rows.map((row) => ({
      date: row.event_date,
      clicks: BigInt(row.clicks_total),
      conversions: BigInt(row.conversions_total),
      revenueMinor: BigInt(row.revenue_total),
    }));
  }

  return {
    async insertBatch(rows, dedupToken, signal) {
      if (rows.length === 0) return;
      await client.insert({
        table: "analytics.events",
        format: "JSONEachRow",
        values: rows.map(toInsertRecord),
        clickhouse_settings: {
          // A retried INSERT with the same token is skipped as a whole block in analytics.events.
          insert_deduplicate: 1,
          insert_deduplication_token: dedupToken,
          // The skipped block still flows through the materialized view. With this setting the view's
          // target table checks the derived token itself and drops the repeat, so aggregates stay exact.
          deduplicate_blocks_in_dependent_materialized_views: 1,
        },
        abort_signal: signal,
      });
    },

    dailyStats: (partnerId, from, to, signal) => daily(DAILY_FROM_VIEW, partnerId, from, to, signal),

    exactDailyStats: (partnerId, from, to, signal) => daily(DAILY_EXACT, partnerId, from, to, signal),

    async partnerTotals(from, to, signal) {
      const result = await client.query({
        query: TOTALS,
        query_params: { from, to },
        format: "JSONEachRow",
        clickhouse_settings: READ_SETTINGS,
        abort_signal: signal,
      });
      const rows = await result.json<RawTotals>();
      return rows.map((row) => ({
        partnerId: row.partner_id,
        clicks: BigInt(row.clicks_total),
        conversions: BigInt(row.conversions_total),
        revenueMinor: BigInt(row.revenue_total),
      }));
    },
  };
}

function toInsertRecord(row: EventRow) {
  return {
    event_id: row.eventId,
    partner_id: row.partnerId,
    event_type: row.type,
    // DateTime64(3, 'UTC') column: a plain "YYYY-MM-DD hh:mm:ss.sss" string is read as UTC.
    occurred_at: row.occurredAt.toISOString().replace("T", " ").replace("Z", ""),
    revenue_minor: row.revenueMinor.toString(),
    sub_id: row.subId,
  };
}
