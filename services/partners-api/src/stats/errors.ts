import { Code, ConnectError } from "@connectrpc/connect";
import { HttpError } from "../errors.js";

/** Maps a failed stats-service call to what the REST client should see. */
export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  const connectError = ConnectError.from(error);
  switch (connectError.code) {
    case Code.InvalidArgument:
      return new HttpError(400, "bad_request", connectError.rawMessage);
    case Code.NotFound:
      return new HttpError(404, "not_found", connectError.rawMessage);
    case Code.ResourceExhausted:
      return new HttpError(429, "rate_limited", "statistics service is overloaded, try again later");
    case Code.Unavailable:
      return new HttpError(503, "stats_unavailable", "statistics service is unavailable, try again later");
    case Code.DeadlineExceeded:
      return new HttpError(504, "stats_timeout", "statistics service did not answer in time");
    default:
      return new HttpError(502, "stats_failed", "statistics service failed");
  }
}
