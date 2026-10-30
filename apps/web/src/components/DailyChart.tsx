import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDay } from "../format";
import { METRICS, type MetricKey } from "../metrics";
import type { DailyPoint } from "../queries";
import { useThemeColors } from "./useThemeColors";

interface Props {
  days: DailyPoint[];
  metric: MetricKey;
}

interface TooltipArgs {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<{ value?: unknown }>;
}

/** A single series, so there is no legend: the title names what is plotted. */
export function DailyChart({ days, metric }: Props) {
  const colors = useThemeColors();
  const definition = METRICS[metric];
  const data = days.map((day) => ({ date: day.date, value: definition.value(day) }));

  const renderTooltip = ({ active, label, payload }: TooltipArgs) => {
    const value = payload?.[0]?.value;
    if (!active || typeof value !== "number") return null;
    return (
      <div className="rounded-lg border border-line bg-card px-3 py-2 shadow-sm">
        {/* Value first: the reader already knows the series and wants the number. */}
        <div className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-3 rounded" style={{ background: colors.series }} />
          <span className="font-semibold">{definition.format(value)}</span>
        </div>
        <div className="mt-0.5 text-xs text-ink-2">{formatDay(String(label))}</div>
      </div>
    );
  };

  return (
    <figure className="rounded-xl border border-line bg-card p-4">
      <figcaption className="mb-3 text-sm font-medium">{definition.label} по дням</figcaption>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={colors.grid} strokeWidth={1} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDay}
              tick={{ fill: colors.muted, fontSize: 12 }}
              axisLine={{ stroke: colors.baseline }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              domain={[0, "auto"]}
              tickFormatter={definition.tick}
              tick={{ fill: colors.muted, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <Tooltip cursor={{ stroke: colors.baseline, strokeWidth: 1 }} content={renderTooltip} />
            <Area
              type="linear"
              dataKey="value"
              stroke={colors.series}
              strokeWidth={2}
              fill={colors.series}
              fillOpacity={0.1}
              dot={false}
              activeDot={{ r: 4, fill: colors.series, stroke: colors.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
