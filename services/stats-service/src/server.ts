import type { AddressInfo } from "node:net";
import { createServer, type ServerHttp2Session } from "node:http2";
import { setTimeout as sleep } from "node:timers/promises";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import type { Logger } from "pino";
import type { EventsRepo } from "./events-repo.js";
import { Health } from "./gen/grpc/health/v1/health_pb.js";
import { StatsService } from "./gen/stats/v1/stats_pb.js";
import { createHealthHandlers, type HealthState } from "./health.js";
import { chaosInterceptor, errorInterceptor, loggingInterceptor, type ChaosOptions } from "./interceptors.js";
import { createStatsHandlers } from "./stats-handlers.js";

export interface GrpcServerDeps {
  repo: EventsRepo;
  health: HealthState;
  log: Logger;
  chaos?: ChaosOptions;
}

export interface CloseOptions {
  /** Time to keep serving after reporting NOT_SERVING, so the load balancer notices first. */
  drainMs?: number;
  /** Hard limit for in-flight calls to finish after GOAWAY. */
  graceMs?: number;
}

export interface GrpcServer {
  listen(port: number, host?: string): Promise<number>;
  close(options?: CloseOptions): Promise<void>;
}

/** gRPC over cleartext HTTP/2 (h2c). Connect serves gRPC, gRPC-Web and Connect protocols on one port. */
export function createGrpcServer(deps: GrpcServerDeps): GrpcServer {
  const shutdown = new AbortController();
  const handler = connectNodeAdapter({
    routes(router) {
      router.service(StatsService, createStatsHandlers(deps.repo));
      router.service(Health, createHealthHandlers(deps.health));
    },
    // The first interceptor is the outermost one.
    interceptors: [
      loggingInterceptor(deps.log),
      errorInterceptor(deps.log),
      chaosInterceptor(deps.chaos ?? { unavailableRate: 0, delayMs: 0 }),
    ],
    // Aborting it cancels the context signal of every running call.
    shutdownSignal: shutdown.signal,
  });

  const server = createServer(handler);
  const sessions = new Set<ServerHttp2Session>();
  server.on("session", (session) => {
    sessions.add(session);
    session.once("close", () => sessions.delete(session));
  });

  return {
    listen(port, host = "0.0.0.0") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve((server.address() as AddressInfo).port));
      });
    },

    async close({ drainMs = 0, graceMs = 10_000 } = {}) {
      deps.health.serving = false;
      if (drainMs > 0) await sleep(drainMs);
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      // GOAWAY: clients finish in-flight calls and open new ones on another instance.
      for (const session of sessions) session.close();
      const forceTimer = setTimeout(() => {
        shutdown.abort();
        for (const session of sessions) session.destroy();
      }, graceMs);
      await closed;
      clearTimeout(forceTimer);
    },
  };
}
