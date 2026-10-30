import { setTimeout as sleep } from "node:timers/promises";
import { MethodOptions_IdempotencyLevel as IdempotencyLevel } from "@bufbuild/protobuf/wkt";
import { Code, ConnectError, type Interceptor } from "@connectrpc/connect";

export interface RetryInfo {
  method: string;
  attempt: number;
  delayMs: number;
  error: ConnectError;
}

export interface RetryOptions {
  /** Attempts in total, the first call included. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  onRetry?: (info: RetryInfo) => void;
  random?: () => number;
}

// UNAVAILABLE means the request did not reach a working server or was refused before processing.
// DEADLINE_EXCEEDED is not here: the deadline covers all attempts, so there is no time left to retry.
const RETRYABLE_CODES = new Set([Code.Unavailable]);

/**
 * Retries unary calls that the proto marks as safe to repeat (idempotency_level).
 * All attempts share the call's deadline and its headers, the idempotency key included.
 */
export function retryInterceptor(options: RetryOptions): Interceptor {
  const random = options.random ?? Math.random;

  return (next) => async (request) => {
    if (request.stream || !isSafeToRepeat(request.method.idempotency)) return next(request);

    for (let attempt = 1; ; attempt++) {
      try {
        return await next(request);
      } catch (error) {
        const connectError = ConnectError.from(error);
        if (attempt >= options.maxAttempts || !RETRYABLE_CODES.has(connectError.code) || request.signal.aborted) {
          throw error;
        }
        // Full jitter: a random pause up to the exponential cap keeps many clients from retrying in lockstep.
        const cap = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** (attempt - 1));
        const delayMs = Math.round(random() * cap);
        options.onRetry?.({ method: request.method.name, attempt, delayMs, error: connectError });
        try {
          await sleep(delayMs, undefined, { signal: request.signal });
        } catch {
          // The deadline passed while waiting: report the deadline, not the last UNAVAILABLE.
          throw request.signal.reason instanceof ConnectError ? request.signal.reason : connectError;
        }
      }
    }
  };
}

function isSafeToRepeat(level: IdempotencyLevel): boolean {
  return level === IdempotencyLevel.IDEMPOTENT || level === IdempotencyLevel.NO_SIDE_EFFECTS;
}
