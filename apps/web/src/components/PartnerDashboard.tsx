import { useSuspenseQuery } from "@tanstack/react-query";
import type { MetricKey } from "../metrics";
import { dailyStatsQuery } from "../queries";
import { rangeDates, type RangeKey } from "../range";
import { DailyChart } from "./DailyChart";
import { DailyTable } from "./DailyTable";
import { RangeFilter } from "./RangeFilter";
import { StatTiles } from "./StatTiles";

interface Props {
  partnerId: string;
  range: RangeKey;
  metric: MetricKey;
  onRangeChange(range: RangeKey): void;
  onMetricChange(metric: MetricKey): void;
}

/** The same dashboard serves the partner cabinet and the admin drill-down. */
export function PartnerDashboard({ partnerId, range, metric, onRangeChange, onMetricChange }: Props) {
  // The route loader has already put this range into the cache.
  const { data } = useSuspenseQuery(dailyStatsQuery(partnerId, rangeDates(range)));

  return (
    <div className="space-y-4">
      <RangeFilter value={range} onChange={onRangeChange} />
      <StatTiles totals={data.totals} selected={metric} onSelect={onMetricChange} />
      <DailyChart days={data.days} metric={metric} />
      <DailyTable days={data.days} />
    </div>
  );
}
