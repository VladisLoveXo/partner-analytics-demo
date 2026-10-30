import { useQueryClient, useSuspenseQuery, type QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet, useRouter, useRouterState, type ErrorComponentProps } from "@tanstack/react-router";
import { describeError } from "../api";
import { AppHeader } from "../components/AppHeader";
import { buttonClass, Message } from "../components/Message";
import { meQuery } from "../queries";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  loader: ({ context }) => context.queryClient.ensureQueryData(meQuery()),
  component: RootLayout,
  errorComponent: RouteError,
  notFoundComponent: () => <Message title="Страница не найдена" />,
});

function RootLayout() {
  const { data: me } = useSuspenseQuery(meQuery());
  // While the next page or period loads, the current one stays on screen, dimmed: no skeleton flash.
  const loading = useRouterState({ select: (state) => state.isLoading });

  return (
    <div className="min-h-screen">
      <AppHeader me={me} />
      <main className={`mx-auto max-w-6xl px-4 py-6 transition-opacity ${loading ? "opacity-60" : ""}`}>
        <Outlet />
      </main>
    </div>
  );
}

function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const retry = async () => {
    await queryClient.resetQueries();
    reset();
    await router.invalidate();
  };
  return (
    <Message
      title="Не удалось загрузить данные"
      text={describeError(error)}
      action={
        <button type="button" onClick={() => void retry()} className={buttonClass}>
          Повторить
        </button>
      }
    />
  );
}
