import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { meQuery } from "../queries";

// A convenience guard for the UI only: partners-api checks the admin role on every /api/admin call.
export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery());
    if (!me.roles.includes("admin")) throw redirect({ to: "/cabinet" });
  },
  component: Outlet,
});
