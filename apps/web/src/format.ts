const integer = new Intl.NumberFormat("ru-RU");
const compact = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 });
const rubles = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
const rublesWithKopecks = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("ru-RU", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatNumber = (value: number): string => integer.format(value);

export const formatCompact = (value: number): string => compact.format(value);

/** Money arrives in minor units (kopecks) to stay exact; rubles appear only on screen. */
export const formatRubles = (minor: number): string => rubles.format(minor / 100);

export const formatRublesPrecise = (minor: number): string => rublesWithKopecks.format(minor / 100);

export const formatPercent = (rate: number): string => percent.format(rate);

/** "2026-10-07" -> "07.10" */
export const formatDay = (day: string): string => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

/** Earnings per click in kopecks: the affiliate's headline efficiency metric. */
export const earningsPerClick = (revenueMinor: number, clicks: number): number => (clicks === 0 ? 0 : revenueMinor / clicks);
