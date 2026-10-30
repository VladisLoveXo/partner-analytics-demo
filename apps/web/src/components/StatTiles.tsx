import { METRIC_KEYS, METRICS, type MetricKey } from "../metrics";
import type { Totals } from "../queries";

interface Props {
  totals: Totals;
  selected: MetricKey;
  onSelect(metric: MetricKey): void;
}

/** Period totals. A tile is also the switch for the chart below: one metric per chart, never two axes. */
export function StatTiles({ totals, selected, onSelect }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {METRIC_KEYS.map((key) => {
        const metric = METRICS[key];
        const active = key === selected;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(key)}
            className={`rounded-xl border bg-card p-4 text-left transition-colors ${
              active ? "border-accent ring-1 ring-accent" : "border-line hover:border-muted"
            }`}
          >
            <div className="text-sm text-ink-2">{metric.label}</div>
            <div className="mt-1 text-2xl font-semibold">{metric.format(metric.value(totals))}</div>
            <div className="mt-1 text-xs text-muted">{metric.hint}</div>
          </button>
        );
      })}
    </div>
  );
}
