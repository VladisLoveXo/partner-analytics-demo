import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CreatePartnerForm } from "../components/CreatePartnerForm";
import { PageTitle } from "../components/Message";
import { PartnersTable } from "../components/PartnersTable";
import { RangeFilter } from "../components/RangeFilter";
import { formatNumber, formatRubles } from "../format";
import { adminPartnersQuery } from "../queries";
import { DEFAULT_RANGE, RANGE_KEYS, rangeDates } from "../range";

const searchSchema = z.object({ range: z.enum(RANGE_KEYS).optional().catch(undefined) });

export const Route = createFileRoute("/admin/")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ range: search.range ?? DEFAULT_RANGE }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(adminPartnersQuery(rangeDates(deps.range))),
  component: AdminPage,
});

function AdminPage() {
  const range = Route.useSearch().range ?? DEFAULT_RANGE;
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(adminPartnersQuery(rangeDates(range)));

  const rows = [...data.partners].sort((a, b) => b.revenueMinor - a.revenueMinor || a.id.localeCompare(b.id));
  const active = rows.filter((row) => row.status === "active").length;
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const revenue = rows.reduce((sum, row) => sum + row.revenueMinor, 0);

  return (
    <div className="space-y-4">
      <PageTitle title="Партнёры" subtitle="Все партнёры программы и их трафик за период" />
      <RangeFilter value={range} onChange={(next) => void navigate({ search: { range: next } })} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Figure label="Активных партнёров" value={`${active} из ${rows.length}`} />
        <Figure label="Клики" value={formatNumber(clicks)} />
        <Figure label="Выручка" value={formatRubles(revenue)} />
      </div>
      <PartnersTable rows={rows} range={range} />
      <CreatePartnerForm />
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="text-sm text-ink-2">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
