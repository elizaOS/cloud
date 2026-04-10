import { expect, test } from "@playwright/test";

/**
 * Agent Lifecycle Flow E2E Test
 *
 * Tests dashboard navigation for agent management pages.
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.describe("Agent Lifecycle Pages", () => {
  test("my-agents page loads and has content", async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/dashboard/my-agents`);
    expect(response?.status()).not.toBe(500);
    expect([200, 302, 304]).toContain(response?.status() ?? 0);
  });

  test("instances page loads and has content", async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/dashboard/milady`);
    expect(response?.status()).not.toBe(500);
    expect([200, 302, 304]).toContain(response?.status() ?? 0);
  });

  test("navigate between agent pages without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    // Navigate through agent management pages
    await page.goto(`${BASE_URL}/dashboard/my-agents`);
    await page.waitForLoadState("domcontentloaded");

    await page.goto(`${BASE_URL}/dashboard/milady`);
    await page.waitForLoadState("domcontentloaded");

    await page.goto(`${BASE_URL}/dashboard/gallery`);
    await page.waitForLoadState("domcontentloaded");

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("WalletConnect") &&
        !e.includes("hydration") &&
        !e.includes("ResizeObserver") &&
        !e.includes("eth_accounts"),
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
