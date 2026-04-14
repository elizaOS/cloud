import { type APIRequestContext, type BrowserContext, expect, test } from "@playwright/test";
import { ensureLocalTestAuth } from "../../infrastructure/local-test-auth";

function resolveBaseUrl(baseUrl?: string): URL {
  return new URL(baseUrl || process.env.TEST_BASE_URL || "http://localhost:3000");
}

export function hasApiKey(): boolean {
  const value = process.env.TEST_API_KEY?.trim();
  return Boolean(value);
}

export async function authenticateBrowserContext(
  _request: APIRequestContext,
  context: BrowserContext,
  baseUrl?: string,
): Promise<void> {
  const auth = await ensureLocalTestAuth();
  const url = resolveBaseUrl(baseUrl);

  await context.addCookies([
    {
      name: auth.sessionCookieName,
      value: auth.sessionToken,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: url.protocol === "https:",
    },
  ]);
}

export { expect, test };
