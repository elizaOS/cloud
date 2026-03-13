/**
 * E2E API Client
 *
 * Typed HTTP client for API route tests using bun:test.
 * Provides auth-aware request methods plus assertion helpers.
 */

const SERVER_URL = process.env.TEST_BASE_URL || "http://localhost:3333";
const API_KEY = process.env.TEST_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET || "test-cron-secret";

/** Auth headers for API key authentication */
export function authHeaders(): Record<string, string> {
  if (!API_KEY) throw new Error("TEST_API_KEY required");
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

/** Headers for X-API-Key authentication */
export function apiKeyHeaders(): Record<string, string> {
  if (!API_KEY) throw new Error("TEST_API_KEY required");
  return {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json",
  };
}

/** Headers for cron secret authentication */
export function cronHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${CRON_SECRET}`,
    "Content-Type": "application/json",
  };
}

/** Check if API key is available */
export function hasApiKey(): boolean {
  return !!API_KEY;
}

/** Check if cron secret is available */
export function hasCronSecret(): boolean {
  return !!CRON_SECRET;
}

/** Build full URL from path */
export function url(path: string): string {
  return `${SERVER_URL}${path}`;
}

/** Default request timeout in ms */
const REQUEST_TIMEOUT = 10_000;

/** Create AbortSignal with timeout */
function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT);
}

/** GET request with optional auth */
export async function get(
  path: string,
  options?: { authenticated?: boolean; headers?: Record<string, string> },
): Promise<Response> {
  const { authenticated = false, headers = {} } = options || {};
  return fetch(url(path), {
    method: "GET",
    signal: timeoutSignal(),
    headers: {
      ...(authenticated ? authHeaders() : {}),
      ...headers,
    },
  });
}

/** POST request with optional auth and body */
export async function post(
  path: string,
  body?: unknown,
  options?: { authenticated?: boolean; headers?: Record<string, string> },
): Promise<Response> {
  const { authenticated = false, headers = {} } = options || {};
  return fetch(url(path), {
    method: "POST",
    signal: timeoutSignal(),
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? authHeaders() : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** PATCH request with auth and body */
export async function patch(
  path: string,
  body: unknown,
  options?: { authenticated?: boolean; headers?: Record<string, string> },
): Promise<Response> {
  const { authenticated = false, headers = {} } = options || {};
  return fetch(url(path), {
    method: "PATCH",
    signal: timeoutSignal(),
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? authHeaders() : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

/** DELETE request with auth */
export async function del(
  path: string,
  options?: { authenticated?: boolean; headers?: Record<string, string> },
): Promise<Response> {
  const { authenticated = false, headers = {} } = options || {};
  return fetch(url(path), {
    method: "DELETE",
    signal: timeoutSignal(),
    headers: {
      ...(authenticated ? authHeaders() : {}),
      ...headers,
    },
  });
}

/** PUT request with auth and body */
export async function put(
  path: string,
  body: unknown,
  options?: { authenticated?: boolean; headers?: Record<string, string> },
): Promise<Response> {
  const { authenticated = false, headers = {} } = options || {};
  return fetch(url(path), {
    method: "PUT",
    signal: timeoutSignal(),
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? authHeaders() : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

/** Assertion helpers */
export async function expectJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    const text = await response.text();
    throw new Error(
      `Expected JSON, got ${contentType}: ${text.slice(0, 200)}`,
    );
  }
  return response.json();
}

/** Assert response status is one of expected values */
export function expectStatus(
  response: Response,
  ...expected: number[]
): void {
  if (!expected.includes(response.status)) {
    throw new Error(
      `Expected status ${expected.join("|")}, got ${response.status} for ${response.url}`,
    );
  }
}
