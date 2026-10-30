import { earningsPerClick, formatCompact, formatNumber, formatPercent, formatRubles, formatRublesPrecise } from "./format";
import type { Totals } from "./queries";

export const METRIC_KEYS = ["clicks", "conversions", "cr", "revenue", "epc"] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];
export const DEFAULT_METRIC: MetricKey = "clicks";

export interface Metric {
  label: string;
  hint: string;
  value(totals: Totals): number;
  format(value: number): string;
  /** Short form for axis ticks. */
  tick(value: number): string;
}

const percentTick = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 1 });

export const METRICS: Record<MetricKey, Metric> = {
  clicks: {
    label: "Клики",
    hint: "переходы по партнёрским ссылкам",
    value: (totals) => totals.clicks,
    format: formatNumber,
    tick: formatCompact,
  },
  conversions: {
    label: "Конверсии",
    hint: "оплаченные заказы",
    value: (totals) => totals.conversions,
    format: formatNumber,
    tick: formatCompact,
  },
  cr: {
    label: "CR",
    hint: "конверсии на клик",
    value: (totals) => totals.cr,
    format: formatPercent,
    tick: (value) => percentTick.format(value),
  },
  revenue: {
    label: "Выручка",
    hint: "сумма конверсий",
    value: (totals) => totals.revenueMinor,
    format: formatRubles,
    tick: (minor) => formatCompact(minor / 100),
  },
  epc: {
    label: "EPC",
    hint: "выручка на один клик",
    value: (totals) => earningsPerClick(totals.revenueMinor, totals.clicks),
    format: formatRublesPrecise,
    tick: (minor) => formatCompact(minor / 100),
  },
};
