/**
 * Playwright Auth Fixtures
 *
 * Provides authenticated and anonymous browser contexts for E2E tests.
 * Since we can't easily mock Privy in browser context, we test:
 * - Unauthenticated page behavior (redirects, public access)
 * - Anonymous session flows (cookie-based)
 * - Authenticated flows require TEST_API_KEY env var
 */

import type { BrowserContext } from "@playwright/test";
import { type APIRequestContext, test as base, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const API_KEY = process.env.TEST_API_KEY;
const TEST_AUTH_COOKIE_NAME = "eliza-test-session";

/** Auth headers for API requests */
export function authHeaders(): Record<string, string> {
  if (!API_KEY) throw new Error("TEST_API_KEY required for authenticated tests");
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

/** Check if API key is available for authenticated tests */
export function hasApiKey(): boolean {
  return !!API_KEY;
}

export async function authenticateBrowserContext(
  request: APIRequestContext,
  context: BrowserContext,
  baseUrl: string = BASE_URL,
): Promise<void> {
  if (!API_KEY) {
    throw new Error("TEST_API_KEY required for authenticated browser tests");
  }

  const response = await request.post(`${baseUrl}/api/test/auth/session`, {
    headers: authHeaders(),
  });

  if (response.status() === 404) {
    throw new Error(
      "Playwright test auth endpoint is unavailable. Start the Playwright web server or set PLAYWRIGHT_TEST_AUTH=true.",
    );
  }

  expect(response.status()).toBe(200);
  const body = (await response.json()) as { token?: string; cookieName?: string };
  expect(body.token).toBeTruthy();

  await context.addCookies([
    {
      name: body.cookieName || TEST_AUTH_COOKIE_NAME,
      value: body.token!,
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

/**
 * Create an anonymous session and get the session token.
 * Returns the token that can be used for X-Anonymous-Session header.
 */
export async function createAnonymousSession(
  request: APIRequestContext,
): Promise<{ sessionToken: string; userId: string }> {
  const response = await request.post(`${BASE_URL}/api/auth/create-anonymous-session`, {
    headers: { "Content-Type": "application/json" },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  return {
    sessionToken: body.sessionToken || body.token,
    userId: body.userId || body.user?.id,
  };
}

/** Extended test fixtures with auth helpers */
export const test = base.extend<{
  apiKey: string | undefined;
  baseUrl: string;
}>({
  apiKey: [API_KEY, { option: true }],
  baseUrl: [BASE_URL, { option: true }],
});

export { expect };
