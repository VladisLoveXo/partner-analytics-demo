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
  /** Gracefully closes connections older than this; 0 keeps them forever. */
  maxConnectionAgeMs?: number;
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
  /** HTTP/2 connections accepted since start. */
  connectionsOpened(): number;
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
  const sessions = new Map<ServerHttp2Session, number>();
  let opened = 0;
  server.on("session", (session) => {
    opened++;
    sessions.set(session, Date.now());
    session.once("close", () => sessions.delete(session));
  });

  // kube-proxy balances TCP connections, not requests, and a gRPC client keeps one HTTP/2 connection
  // for hours, so a new replica would get no traffic. A GOAWAY after the age limit makes the client
  // reconnect, and the new connection may land on another pod. In-flight calls finish normally.
  const maxAgeMs = deps.maxConnectionAgeMs ?? 0;
  const ageTimer =
    maxAgeMs > 0
      ? setInterval(
          () => {
            const now = Date.now();
            for (const [session, openedAt] of sessions) {
              if (now - openedAt >= maxAgeMs && !session.closed) session.close();
            }
          },
          Math.min(maxAgeMs, 30_000),
        ).unref()
      : undefined;

  return {
    connectionsOpened: () => opened,

    listen(port, host = "0.0.0.0") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve((server.address() as AddressInfo).port));
      });
    },

    async close({ drainMs = 0, graceMs = 10_000 } = {}) {
      clearInterval(ageTimer);
      deps.health.serving = false;
      if (drainMs > 0) await sleep(drainMs);
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      // GOAWAY: clients finish in-flight calls and open new ones on another instance.
      for (const session of sessions.keys()) if (!session.closed) session.close();
      const forceTimer = setTimeout(() => {
        shutdown.abort();
        for (const session of sessions.keys()) session.destroy();
      }, graceMs);
      await closed;
      clearTimeout(forceTimer);
    },
  };
}
