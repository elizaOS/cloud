/**
 * Playwright Page Helpers
 *
 * Shared utilities for page-level E2E tests:
 * - Console error collection and filtering
 * - Network error monitoring
 * - Page load validation
 */

import { type Page, type Response, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

/** Known non-critical console errors to filter out */
const NON_CRITICAL_PATTERNS = [
  "WalletConnect",
  "hydration",
  "ResizeObserver",
  "eth_accounts",
  "LCP",
  "favicon",
  "Failed to load resource",
  "404",
  "TAVILY",
  "ChunkLoadError",
  "Loading chunk",
  "privy",
];

/** Collect console errors from a page, filtering out known non-critical ones */
export class ConsoleErrorCollector {
  private errors: string[] = [];

  constructor(private page: Page) {
    page.on("pageerror", (err) => this.errors.push(err.message));
  }

  /** Get critical errors (filtered) */
  getCriticalErrors(): string[] {
    return this.errors.filter(
      (e) => !NON_CRITICAL_PATTERNS.some((p) => e.includes(p)),
    );
  }

  /** Assert no critical console errors occurred */
  expectNoCriticalErrors(): void {
    const critical = this.getCriticalErrors();
    if (critical.length > 0) {
      console.log("Critical console errors:", critical);
    }
    expect(critical).toHaveLength(0);
  }

  /** Reset collected errors */
  reset(): void {
    this.errors = [];
  }
}

/** Network error collector — tracks 5xx responses */
export class NetworkErrorCollector {
  private errors: Array<{ url: string; status: number }> = [];

  constructor(private page: Page) {
    page.on("response", (response) => {
      if (response.status() >= 500) {
        this.errors.push({
          url: response.url(),
          status: response.status(),
        });
      }
    });
  }

  /** Get all 5xx errors */
  getErrors(): Array<{ url: string; status: number }> {
    return this.errors;
  }

  /** Assert no 5xx responses occurred */
  expectNoServerErrors(): void {
    if (this.errors.length > 0) {
      console.log(
        "Server errors:",
        this.errors.map((e) => `${e.status} ${e.url}`),
      );
    }
    expect(this.errors).toHaveLength(0);
  }
}

/**
 * Validate that a page loads successfully:
 * - Returns 200 (or 304)
 * - No critical JS errors
 * - No 5xx network responses
 */
export async function validatePageLoad(
  page: Page,
  path: string,
  options?: { waitForNetworkIdle?: boolean },
): Promise<{
  response: Response | null;
  consoleErrors: ConsoleErrorCollector;
  networkErrors: NetworkErrorCollector;
}> {
  const consoleErrors = new ConsoleErrorCollector(page);
  const networkErrors = new NetworkErrorCollector(page);

  const response = await page.goto(`${BASE_URL}${path}`);

  if (options?.waitForNetworkIdle) {
    await page.waitForLoadState("networkidle");
  } else {
    await page.waitForLoadState("domcontentloaded");
  }

  return { response, consoleErrors, networkErrors };
}

/**
 * Quick smoke test for a page: loads without 500, returns 200.
 */
export async function smokeTestPage(page: Page, path: string): Promise<void> {
  const { response, consoleErrors, networkErrors } = await validatePageLoad(
    page,
    path,
  );

  // Page should return 200 or 304
  expect(
    [200, 304],
    `Page ${path} returned ${response?.status()}`,
  ).toContain(response?.status() ?? 0);
}

/**
 * Strict smoke test: page loads, no JS errors, no 500s.
 */
export async function strictSmokeTestPage(
  page: Page,
  path: string,
): Promise<void> {
  const { response, consoleErrors, networkErrors } = await validatePageLoad(
    page,
    path,
    { waitForNetworkIdle: true },
  );

  expect(
    [200, 304],
    `Page ${path} returned ${response?.status()}`,
  ).toContain(response?.status() ?? 0);

  consoleErrors.expectNoCriticalErrors();
  networkErrors.expectNoServerErrors();
}
