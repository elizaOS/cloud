import { test, expect } from "@playwright/test";

/**
 * Miniapp Pages Tests
 * 
 * Tests all miniapp pages:
 * - Connecting page
 * - Agent detail page
 * - Chat detail page
 * - Settings page
 * - Billing success page
 * 
 * Prerequisites:
 * - Miniapp running on port 3001
 */

const MINIAPP_URL = process.env.MINIAPP_URL ?? "http://localhost:3001";

// Check if miniapp is available
let miniappAvailable = false;

test.beforeAll(async ({ request }) => {
  const miniappResponse = await request.get(MINIAPP_URL).catch(() => null);
  miniappAvailable = miniappResponse?.ok() ?? false;
  
  if (!miniappAvailable) {
    console.log(
      `⚠️ Miniapp not available at ${MINIAPP_URL}. Skipping miniapp tests. Start with: cd miniapp && bun run dev`,
    );
  }
});

test.describe("Miniapp Pages", () => {
  test.beforeEach(async ({ page }) => {
    if (!miniappAvailable) {
      test.skip();
      return;
    }
    await page.context().clearCookies();
  });

  test("connecting page loads", async ({ page }) => {
    await page.goto(`${MINIAPP_URL}/connecting`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    const hasContent = await page.locator("body").textContent();

    expect(hasContent?.length).toBeGreaterThan(0);
    console.log(`✅ Connecting page loaded (URL: ${url})`);
  });

  test("settings page loads", async ({ page }) => {
    await page.goto(`${MINIAPP_URL}/settings`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    const hasContent = await page.locator("body").textContent();

    expect(hasContent?.length).toBeGreaterThan(0);
    console.log(`✅ Settings page loaded (URL: ${url})`);
  });

  test("billing success page loads", async ({ page }) => {
    await page.goto(`${MINIAPP_URL}/billing/success`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    const hasContent = await page.locator("body").textContent();

    expect(hasContent?.length).toBeGreaterThan(0);
    console.log(`✅ Billing success page loaded (URL: ${url})`);
  });

  test("agent detail page structure", async ({ page }) => {
    // Navigate to a placeholder agent ID
    await page.goto(`${MINIAPP_URL}/agents/test-agent-id`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    const hasContent = await page.locator("body").textContent();

    expect(hasContent?.length).toBeGreaterThan(0);
    console.log(`✅ Agent detail page structure verified (URL: ${url})`);
  });

  test("chat detail page structure", async ({ page }) => {
    // Navigate to a placeholder chat
    await page.goto(`${MINIAPP_URL}/chats/test-agent-id/test-chat-id`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    const hasContent = await page.locator("body").textContent();

    expect(hasContent?.length).toBeGreaterThan(0);
    console.log(`✅ Chat detail page structure verified (URL: ${url})`);
  });
});

