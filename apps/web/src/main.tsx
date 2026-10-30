import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider, hasAuthParams, useAuth } from "react-oidc-context";
import { ApiError } from "./api";
import { onSigninCallback, signInArgs, userManager } from "./auth";
import { buttonClass, Message } from "./components/Message";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // 4xx will not fix itself: retry only server and network failures.
      retry: (failures, error) => !(error instanceof ApiError && error.status < 500) && failures < 2,
    },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  // TanStack Query owns caching; the router always asks it.
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

/** Every page needs a user, so the router starts only after the OIDC session is in place. */
function App() {
  const auth = useAuth();

  // Calls go through the hook: it marks the navigator as busy, so a sign-out in progress
  // is not overtaken by this automatic sign-in. hasAuthParams(): the provider is handling ?code= right now.
  useEffect(() => {
    if (!hasAuthParams() && !auth.isLoading && !auth.isAuthenticated && !auth.error && !auth.activeNavigator) {
      void auth.signinRedirect(signInArgs());
    }
  }, [auth]);

  if (auth.error) {
    return (
      <Message
        title="Не удалось войти"
        text={auth.error.message}
        action={
          <button type="button" onClick={() => void auth.signinRedirect(signInArgs())} className={buttonClass}>
            Войти снова
          </button>
        }
      />
    );
  }
  if (!auth.isAuthenticated) return <Message title="Вход через Keycloak..." />;
  return <RouterProvider router={router} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider userManager={userManager} onSigninCallback={onSigninCallback}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </AuthProvider>
  </StrictMode>,
);
