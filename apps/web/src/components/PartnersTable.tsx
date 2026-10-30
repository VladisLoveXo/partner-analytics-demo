import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { describeError } from "../api";
import { earningsPerClick, formatNumber, formatPercent, formatRubles, formatRublesPrecise } from "../format";
import { setPartnerStatus, type AdminPartnerRow } from "../queries";
import type { RangeKey } from "../range";
import { StatusBadge } from "./StatusBadge";

interface Props {
  rows: AdminPartnerRow[];
  range: RangeKey;
}

export function PartnersTable({ rows, range }: Props) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: (row: AdminPartnerRow) => setPartnerStatus(row.id, row.status === "active" ? "disabled" : "active"),
    // Every cached range of the list is stale now, whatever period it covers.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "partners"] }),
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-card">
      <table className="w-full text-sm tabular-nums">
        <thead className="text-left text-ink-2">
          <tr>
            <th className="px-4 py-3 font-medium">Партнёр</th>
            <th className="px-4 py-3 font-medium">Статус</th>
            <th className="px-4 py-3 text-right font-medium">Клики</th>
            <th className="px-4 py-3 text-right font-medium">Конверсии</th>
            <th className="px-4 py-3 text-right font-medium">CR</th>
            <th className="px-4 py-3 text-right font-medium">Выручка</th>
            <th className="px-4 py-3 text-right font-medium">EPC</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-line">
              <td className="px-4 py-3">
                <Link
                  to="/admin/partners/$partnerId"
                  params={{ partnerId: row.id }}
                  search={{ range }}
                  className="font-medium hover:underline"
                >
                  {row.name}
                </Link>
                <div className="text-xs text-muted">{row.id}</div>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={row.status} />
              </td>
              <td className="px-4 py-3 text-right">{formatNumber(row.clicks)}</td>
              <td className="px-4 py-3 text-right">{formatNumber(row.conversions)}</td>
              <td className="px-4 py-3 text-right">{formatPercent(row.cr)}</td>
              <td className="px-4 py-3 text-right">{formatRubles(row.revenueMinor)}</td>
              <td className="px-4 py-3 text-right">{formatRublesPrecise(earningsPerClick(row.revenueMinor, row.clicks))}</td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate(row)}
                  className="rounded-md border border-line px-2 py-1 text-xs text-ink-2 hover:bg-grid disabled:opacity-50"
                >
                  {row.status === "active" ? "Отключить" : "Включить"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {toggle.isError && <p className="border-t border-line px-4 py-2 text-sm text-critical">{describeError(toggle.error)}</p>}
    </div>
  );
}
