CREATE DATABASE IF NOT EXISTS analytics;

-- Raw events.
-- ReplacingMergeTree collapses rows with the same sorting key (partner_id, event_date, event_id)
-- when parts merge, or at read time with FINAL. Merges run in the background at an unknown moment,
-- so until then a duplicate is physically present.
-- non_replicated_deduplication_window turns on insert deduplication for this non-replicated table:
-- an INSERT that repeats the insert_deduplication_token of one of the last 10000 blocks is skipped.
CREATE TABLE IF NOT EXISTS analytics.events
(
    event_id      UUID,
    partner_id    LowCardinality(String),
    event_type    Enum8('click' = 1, 'conversion' = 2),
    occurred_at   DateTime64(3, 'UTC'),
    event_date    Date MATERIALIZED toDate(occurred_at),
    revenue_minor Int64,
    sub_id        LowCardinality(String),
    ingested_at   DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(event_date)
ORDER BY (partner_id, event_date, event_id)
SETTINGS non_replicated_deduplication_window = 10000;
