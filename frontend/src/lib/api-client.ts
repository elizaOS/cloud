/**
 * Typed fetch wrapper for the SPA. All `/api/*` calls go through this so
 * we have one place that:
 *
 * - injects credentials (the steward-token cookie + Authorization Bearer
 *   from localStorage when present)
 * - resolves the API base URL (Vite env `VITE_API_URL`, otherwise relative
 *   so the Cloudflare Pages `_redirects` proxy can forward to the Worker)
 * - throws structured errors on non-2xx
 *
 * Usage:
 *   const me = await api<MeResponse>("/api/users/me");
 *   await api("/api/v1/apps/123", { method: "DELETE" });
 */

const STEWARD_TOKEN_KEY = "steward_session_token";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv.replace(/\/$/, "");
  return "";
}

function readStewardToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STEWARD_TOKEN_KEY);
  } catch {
    return null;
  }
}

export interface ApiRequestInit extends Omit<RequestInit, "body"> {
  /** JSON body — automatically serialized + Content-Type applied. */
  json?: unknown;
  /** Raw body (string / FormData / Blob). Mutually exclusive with `json`. */
  body?: BodyInit | null;
  /** Skip steward token injection (e.g. for the steward-session endpoint itself). */
  skipAuth?: boolean;
}

export async function api<T = unknown>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { json, body, skipAuth, headers: rawHeaders, ...rest } = init;

  const headers = new Headers(rawHeaders);
  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (!skipAuth) {
    const token = readStewardToken();
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const url = path.startsWith("http") ? path : `${getApiBaseUrl()}${path}`;

  const res = await fetch(url, {
    credentials: "include",
    ...rest,
    headers,
    body: json !== undefined ? JSON.stringify(json) : (body ?? null),
  });

  // 204 / 205 — no content
  if (res.status === 204 || res.status === 205) {
    return undefined as T;
  }

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload: unknown = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const errBody = payload as { error?: string; code?: string; message?: string } | string | null;
    const message =
      (typeof errBody === "object" && errBody && (errBody.error || errBody.message)) ||
      (typeof errBody === "string" && errBody) ||
      `Request failed with status ${res.status}`;
    const code = (typeof errBody === "object" && errBody && errBody.code) || `HTTP_${res.status}`;
    throw new ApiError(res.status, String(code), String(message), payload);
  }

  return payload as T;
}
