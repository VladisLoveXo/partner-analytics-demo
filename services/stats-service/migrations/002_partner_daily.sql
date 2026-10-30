-- Daily aggregates per partner for dashboards.
-- SummingMergeTree adds rows with the same key up only when parts merge,
-- so reads still have to use sum() ... GROUP BY.
-- The table keeps its own deduplication window: a block skipped in analytics.events is still
-- pushed through the materialized view, and it is dropped here only when the INSERT runs with
-- deduplicate_blocks_in_dependent_materialized_views = 1 (see events-repo.ts).
CREATE TABLE IF NOT EXISTS analytics.partner_daily
(
    partner_id    LowCardinality(String),
    event_date    Date,
    clicks        UInt64,
    conversions   UInt64,
    revenue_minor Int64
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (partner_id, event_date)
SETTINGS non_replicated_deduplication_window = 10000;

-- A materialized view is an insert trigger: it aggregates each inserted block, not the merged table.
-- A duplicate that ReplacingMergeTree collapses later has already been counted here,
-- so retried batches have to be dropped at insert time, by the deduplication token.
CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.partner_daily_mv
TO analytics.partner_daily
AS SELECT
    partner_id,
    toDate(occurred_at) AS event_date,
    countIf(event_type = 'click') AS clicks,
    countIf(event_type = 'conversion') AS conversions,
    sumIf(revenue_minor, event_type = 'conversion') AS revenue_minor
FROM analytics.events
GROUP BY partner_id, event_date;
