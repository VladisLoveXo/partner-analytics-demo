import { setTimeout as sleep } from "node:timers/promises";
import { Code, ConnectError, type Interceptor } from "@connectrpc/connect";
import type { Logger } from "pino";
import { Health } from "./gen/grpc/health/v1/health_pb.js";

export const REQUEST_ID_HEADER = "x-request-id";

/** One log line per call. Health probes are skipped: Kubernetes sends them every few seconds. */
export function loggingInterceptor(log: Logger): Interceptor {
  return (next) => async (request) => {
    if (request.service.typeName === Health.typeName) return next(request);
    const started = performance.now();
    const fields = { rpc: request.method.name, requestId: request.header.get(REQUEST_ID_HEADER) ?? undefined };
    try {
      const response = await next(request);
      log.info({ ...fields, ms: Math.round(performance.now() - started) }, "rpc ok");
      return response;
    } catch (error) {
      const connectError = ConnectError.from(error);
      log.warn(
        { ...fields, ms: Math.round(performance.now() - started), code: Code[connectError.code], reason: connectError.rawMessage },
        "rpc failed",
      );
      throw error;
    }
  };
}

const NETWORK_ERRORS = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND", "EPIPE"]);

/**
 * Turns errors that are not ConnectError into proper gRPC codes. A database that cannot be reached
 * becomes UNAVAILABLE (the client may retry), everything else INTERNAL, without leaking details.
 */
export function errorInterceptor(log: Logger): Interceptor {
  return (next) => async (request) => {
    try {
      return await next(request);
    } catch (error) {
      if (error instanceof ConnectError || request.signal.aborted) throw error;
      const code = (error as { code?: unknown }).code;
      if (typeof code === "string" && NETWORK_ERRORS.has(code)) {
        throw new ConnectError("storage is unavailable", Code.Unavailable, undefined, undefined, error);
      }
      log.error({ err: error, rpc: request.method.name }, "unexpected error");
      throw new ConnectError("internal error", Code.Internal, undefined, undefined, error);
    }
  };
}

export interface ChaosOptions {
  /** Share of StatsService calls answered with UNAVAILABLE, from 0 to 1. */
  unavailableRate: number;
  /** Extra latency added to every StatsService call. */
  delayMs: number;
}

/** Fault injection for demos of retries and deadlines. Off unless configured. */
export function chaosInterceptor(options: ChaosOptions, random: () => number = Math.random): Interceptor {
  return (next) => async (request) => {
    if (request.service.typeName === Health.typeName) return next(request);
    if (options.delayMs > 0) await sleep(options.delayMs, undefined, { signal: request.signal });
    if (random() < options.unavailableRate) {
      throw new ConnectError("chaos: injected failure", Code.Unavailable);
    }
    return next(request);
  };
}
