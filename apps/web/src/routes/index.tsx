import { createFileRoute, redirect } from "@tanstack/react-router";
import { meQuery } from "../queries";

// The role decides the start page. The roles come from /api/me: the SPA does not read the access token.
export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery());
    throw redirect({ to: me.roles.includes("admin") ? "/admin" : "/cabinet", replace: true });
  },
});
