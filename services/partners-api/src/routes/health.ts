import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../app.js";

export function registerHealthRoutes(app: FastifyInstance, deps: AppDeps): void {
  // Liveness: the process answers. Nothing external is checked here, otherwise
  // a database outage would make Kubernetes restart every replica for no gain.
  app.get("/healthz", async () => ({ status: "ok" }));

  // Readiness: PostgreSQL only. Redis fails open and stats-service errors are reported per request,
  // so pulling every replica out of the Service because of them would turn a partial outage into a full one.
  app.get("/readyz", async (request, reply) => {
    try {
      await deps.checks.database();
      return { status: "ready" };
    } catch (error) {
      request.log.warn({ err: error }, "not ready: database check failed");
      return reply.code(503).send({ status: "not ready" });
    }
  });

  // Diagnostics for people and smoke tests. Not used by probes, not exposed through the web proxy.
  app.get("/healthz/deps", async (_request, reply) => {
    const [postgres, redis, stats] = await Promise.all([
      succeeds(deps.checks.database),
      succeeds(deps.checks.redis),
      deps.stats.healthy(),
    ]);
    return reply.code(postgres && redis && stats ? 200 : 503).send({ postgres, redis, stats });
  });
}

function succeeds(check: () => Promise<void>): Promise<boolean> {
  return check().then(
    () => true,
    () => false,
  );
}
