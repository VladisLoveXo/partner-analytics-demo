import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { PageTitle } from "../components/Message";
import { PartnerDashboard } from "../components/PartnerDashboard";
import { StatusBadge } from "../components/StatusBadge";
import { DEFAULT_METRIC, METRIC_KEYS } from "../metrics";
import { dailyStatsQuery, partnerQuery } from "../queries";
import { DEFAULT_RANGE, RANGE_KEYS, rangeDates } from "../range";

const searchSchema = z.object({
  range: z.enum(RANGE_KEYS).optional().catch(undefined),
  metric: z.enum(METRIC_KEYS).optional().catch(undefined),
});

export const Route = createFileRoute("/admin/partners/$partnerId")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ range: search.range ?? DEFAULT_RANGE }),
  loader: ({ context, params, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(partnerQuery(params.partnerId)),
      context.queryClient.ensureQueryData(dailyStatsQuery(params.partnerId, rangeDates(deps.range))),
    ]),
  component: AdminPartnerPage,
});

function AdminPartnerPage() {
  const { partnerId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const range = search.range ?? DEFAULT_RANGE;
  const { data: partner } = useSuspenseQuery(partnerQuery(partnerId));

  return (
    <>
      <Link to="/admin" search={{ range }} className="text-sm text-ink-2 hover:underline">
        ← Все партнёры
      </Link>
      <PageTitle title={partner.name} subtitle={`Партнёр ${partner.id}`} aside={<StatusBadge status={partner.status} />} />
      <PartnerDashboard
        partnerId={partnerId}
        range={range}
        metric={search.metric ?? DEFAULT_METRIC}
        onRangeChange={(next) => void navigate({ search: (prev) => ({ ...prev, range: next }) })}
        onMetricChange={(metric) => void navigate({ search: (prev) => ({ ...prev, metric }), replace: true })}
      />
    </>
  );
}
