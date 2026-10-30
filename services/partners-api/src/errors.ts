/** An error that already knows its HTTP status and the body the client gets. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: Record<string, unknown>) =>
  new HttpError(400, "bad_request", message, details);

export const unauthorized = (message = "authentication required") => new HttpError(401, "unauthorized", message);

export const forbidden = (message = "access denied") => new HttpError(403, "forbidden", message);

export const notFound = (message: string) => new HttpError(404, "not_found", message);

export const conflict = (message: string) => new HttpError(409, "conflict", message);
