import type { FastifyInstance } from "fastify";
import { requirePrincipal } from "../auth/guards.js";

export function registerMeRoutes(app: FastifyInstance): void {
  // The SPA decides where to go from this answer instead of parsing the access token itself.
  app.get("/api/me", async (request) => {
    const principal = requirePrincipal(request);
    return {
      subject: principal.subject,
      username: principal.username,
      roles: [...principal.roles].sort(),
      partnerId: principal.partnerId,
    };
  });
}
