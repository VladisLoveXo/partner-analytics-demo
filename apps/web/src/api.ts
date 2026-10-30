import { signIn, userManager } from "./auth";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const MESSAGES: Record<string, string> = {
  unauthorized: "Сессия закончилась, выполняем вход заново.",
  forbidden: "Нет доступа к этим данным.",
  not_found: "Не найдено.",
  conflict: "Такая запись уже есть.",
  rate_limited: "Слишком много запросов. Подождите немного и повторите.",
  stats_unavailable: "Сервис статистики временно недоступен. Повторите через минуту.",
  stats_timeout: "Сервис статистики не ответил вовремя. Повторите запрос.",
  idp_unavailable: "Сервер входа недоступен.",
};

/** A message for people: known error codes in Russian, the server text otherwise. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) return MESSAGES[error.code] ?? error.message;
  return "Что-то пошло не так. Обновите страницу.";
}

/** Same-origin call to partners-api with the current access token. */
export async function apiFetch<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const user = await userManager.getUser();
  const headers: Record<string, string> = { accept: "application/json" };
  if (user) headers.authorization = `Bearer ${user.access_token}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload: unknown = await response.json().catch(() => undefined);

  if (response.status === 401) {
    void signIn();
    throw new ApiError(401, "unauthorized", "unauthorized");
  }
  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | undefined)?.error;
    throw new ApiError(response.status, error?.code ?? "http_error", error?.message ?? response.statusText);
  }
  return payload as T;
}
