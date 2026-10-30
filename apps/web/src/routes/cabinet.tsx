import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { Message, PageTitle } from "../components/Message";
import { PartnerDashboard } from "../components/PartnerDashboard";
import { StatusBadge } from "../components/StatusBadge";
import { DEFAULT_METRIC, METRIC_KEYS } from "../metrics";
import { dailyStatsQuery, meQuery, partnerQuery } from "../queries";
import { DEFAULT_RANGE, RANGE_KEYS, rangeDates } from "../range";

// Period and metric live in the URL: a link reproduces exactly what the partner sees.
const searchSchema = z.object({
  range: z.enum(RANGE_KEYS).optional().catch(undefined),
  metric: z.enum(METRIC_KEYS).optional().catch(undefined),
});

export const Route = createFileRoute("/cabinet")({
  validateSearch: searchSchema,
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery());
    if (me.roles.includes("admin") && me.partnerId === null) throw redirect({ to: "/admin" });
    // The partner id comes from the token on the server side; the page only shows it.
    return { partnerId: me.roles.includes("partner") ? me.partnerId : null };
  },
  loaderDeps: ({ search }) => ({ range: search.range ?? DEFAULT_RANGE }),
  loader: async ({ context, deps }) => {
    if (context.partnerId === null) return;
    await Promise.all([
      context.queryClient.ensureQueryData(partnerQuery(context.partnerId)),
      context.queryClient.ensureQueryData(dailyStatsQuery(context.partnerId, rangeDates(deps.range))),
    ]);
  },
  component: CabinetPage,
});

function CabinetPage() {
  const { partnerId } = Route.useRouteContext();
  if (partnerId === null) {
    return <Message title="Кабинет недоступен" text="Учётная запись не привязана к партнёру. Обратитесь к администратору." />;
  }
  return <Cabinet partnerId={partnerId} />;
}

function Cabinet({ partnerId }: { partnerId: string }) {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: partner } = useSuspenseQuery(partnerQuery(partnerId));

  return (
    <>
      <PageTitle title={partner.name} subtitle={`Кабинет партнёра ${partner.id}`} aside={<StatusBadge status={partner.status} />} />
      <PartnerDashboard
        partnerId={partnerId}
        range={search.range ?? DEFAULT_RANGE}
        metric={search.metric ?? DEFAULT_METRIC}
        onRangeChange={(range) => void navigate({ search: (prev) => ({ ...prev, range }) })}
        onMetricChange={(metric) => void navigate({ search: (prev) => ({ ...prev, metric }), replace: true })}
      />
    </>
  );
}
