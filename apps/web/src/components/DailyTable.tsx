import { earningsPerClick, formatDay, formatNumber, formatPercent, formatRubles, formatRublesPrecise } from "../format";
import type { DailyPoint } from "../queries";

/** The chart's table twin: every value is readable without hovering. */
export function DailyTable({ days }: { days: DailyPoint[] }) {
  const rows = [...days].reverse();
  return (
    <details className="rounded-xl border border-line bg-card">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Таблица по дням ({days.length})</summary>
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left text-ink-2">
            <tr>
              <th className="px-4 py-2 font-medium">Дата</th>
              <th className="px-4 py-2 text-right font-medium">Клики</th>
              <th className="px-4 py-2 text-right font-medium">Конверсии</th>
              <th className="px-4 py-2 text-right font-medium">CR</th>
              <th className="px-4 py-2 text-right font-medium">Выручка</th>
              <th className="px-4 py-2 text-right font-medium">EPC</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((day) => (
              <tr key={day.date} className="border-t border-line">
                <td className="px-4 py-2">{formatDay(day.date)}</td>
                <td className="px-4 py-2 text-right">{formatNumber(day.clicks)}</td>
                <td className="px-4 py-2 text-right">{formatNumber(day.conversions)}</td>
                <td className="px-4 py-2 text-right">{formatPercent(day.cr)}</td>
                <td className="px-4 py-2 text-right">{formatRubles(day.revenueMinor)}</td>
                <td className="px-4 py-2 text-right">{formatRublesPrecise(earningsPerClick(day.revenueMinor, day.clicks))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
