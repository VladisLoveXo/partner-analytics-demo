import { RANGE_KEYS, RANGE_LABELS, type RangeKey } from "../range";

interface Props {
  value: RangeKey;
  onChange(range: RangeKey): void;
}

/** The one filter row above everything it scopes: tiles, chart and table always show the same period. */
export function RangeFilter({ value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="Период" className="inline-flex rounded-lg border border-line bg-card p-0.5 text-sm">
      {RANGE_KEYS.map((key) => {
        const selected = key === value;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(key)}
            className={
              selected
                ? "rounded-md bg-accent px-3 py-1.5 font-medium text-white"
                : "rounded-md px-3 py-1.5 text-ink-2 hover:bg-grid"
            }
          >
            {RANGE_LABELS[key]}
          </button>
        );
      })}
    </div>
  );
}
