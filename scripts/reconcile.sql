-- Compares the dashboard aggregate (filled by the materialized view) with exact numbers from raw events.
-- A row here means some event reached ClickHouse in two different batches: ReplacingMergeTree collapses it
-- in analytics.events (read with FINAL), while the view had already counted it twice.
-- Run from the repository root:
--   docker compose exec -T clickhouse clickhouse-client --user app --password app < scripts/reconcile.sql
SELECT
    partner_id,
    event_date,
    view.clicks - exact.clicks AS extra_clicks,
    view.conversions - exact.conversions AS extra_conversions,
    view.revenue_minor - exact.revenue_minor AS extra_revenue_minor
FROM
(
    SELECT partner_id, event_date, sum(clicks) AS clicks, sum(conversions) AS conversions, sum(revenue_minor) AS revenue_minor
    FROM analytics.partner_daily
    GROUP BY partner_id, event_date
) AS view
FULL OUTER JOIN
(
    SELECT
        partner_id,
        event_date,
        countIf(event_type = 'click') AS clicks,
        countIf(event_type = 'conversion') AS conversions,
        sumIf(revenue_minor, event_type = 'conversion') AS revenue_minor
    FROM analytics.events FINAL
    GROUP BY partner_id, event_date
) AS exact USING (partner_id, event_date)
WHERE view.clicks != exact.clicks
   OR view.conversions != exact.conversions
   OR view.revenue_minor != exact.revenue_minor
ORDER BY partner_id, event_date;
