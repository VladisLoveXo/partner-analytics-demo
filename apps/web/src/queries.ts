import { queryOptions } from "@tanstack/react-query";
import { apiFetch } from "./api";
import type { DateRange } from "./range";

export interface Me {
  subject: string;
  username: string | null;
  roles: string[];
  partnerId: string | null;
}

export interface Totals {
  clicks: number;
  conversions: number;
  revenueMinor: number;
  cr: number;
}

export interface DailyPoint extends Totals {
  date: string;
}

export interface DailyStats extends DateRange {
  partnerId: string;
  totals: Totals;
  days: DailyPoint[];
}

export type PartnerStatus = "active" | "disabled";

export interface Partner {
  id: string;
  name: string;
  status: PartnerStatus;
  createdAt: string;
}

export interface AdminPartnerRow extends Partner, Totals {}

export interface AdminPartners extends DateRange {
  partners: AdminPartnerRow[];
}

// Ranges ending today keep changing while the generator sends live traffic.
const LIVE_REFRESH_MS = 30_000;

export const meQuery = () =>
  queryOptions({
    queryKey: ["me"],
    queryFn: () => apiFetch<Me>("/api/me"),
    staleTime: 5 * 60_000,
  });

export const partnerQuery = (partnerId: string) =>
  queryOptions({
    queryKey: ["partners", partnerId],
    queryFn: () => apiFetch<Partner>(`/api/partners/${encodeURIComponent(partnerId)}`),
    staleTime: 60_000,
  });

export const dailyStatsQuery = (partnerId: string, range: DateRange) =>
  queryOptions({
    queryKey: ["stats", "daily", partnerId, range.from, range.to],
    queryFn: () =>
      apiFetch<DailyStats>(
        `/api/partners/${encodeURIComponent(partnerId)}/stats/daily?from=${range.from}&to=${range.to}`,
      ),
    refetchInterval: LIVE_REFRESH_MS,
  });

export const adminPartnersQuery = (range: DateRange) =>
  queryOptions({
    queryKey: ["admin", "partners", range.from, range.to],
    queryFn: () => apiFetch<AdminPartners>(`/api/admin/partners?from=${range.from}&to=${range.to}`),
    refetchInterval: LIVE_REFRESH_MS,
  });

export function createPartner(input: { id: string; name: string }): Promise<Partner> {
  return apiFetch<Partner>("/api/admin/partners", { method: "POST", body: input });
}

export function setPartnerStatus(partnerId: string, status: PartnerStatus): Promise<Partner> {
  return apiFetch<Partner>(`/api/admin/partners/${encodeURIComponent(partnerId)}`, {
    method: "PATCH",
    body: { status },
  });
}
