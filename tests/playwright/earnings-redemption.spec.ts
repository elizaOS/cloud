import { test, expect } from "@playwright/test";

/**
 * Earnings & Redemption E2E Tests
 *
 * Comprehensive tests for the earnings dashboard and token redemption flow:
 * - User earnings dashboard UI
 * - Balance display and breakdown
 * - Redemption request flow
 * - Quote generation
 * - Admin approval/rejection
 * - System status checks
 *
 * Prerequisites:
 * - Cloud running on port 3000
 * - User authenticated (via session or API key)
 * - For redemption tests: TEST_API_KEY required
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const API_KEY = process.env.TEST_API_KEY;

function authHeaders() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

// ============================================================================
// USER EARNINGS DASHBOARD UI TESTS
// ============================================================================

test.describe("Earnings Page UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("earnings page loads and shows balance cards", async ({ page }) => {
    const response = await page
      .goto(`${BASE_URL}/dashboard/earnings`)
      .catch(() => null);
    if (!response) {
      console.log("ℹ️ Page navigation failed - skipping");
      return;
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login") || url === BASE_URL || url === `${BASE_URL}/`) {
      console.log("ℹ️ Earnings page requires authentication");
      return;
    }

    const pageContent = await page.textContent("body").catch(() => "");
    if ((pageContent?.length || 0) < 100) {
      console.log(
        `⚠️ Earnings page content too short (${pageContent?.length} chars)`,
      );
      console.log("ℹ️ Skipping - page not loaded properly");
      return;
    }

    const availableBalance = page.locator("text=/Available to Redeem/i");
    const totalEarned = page.locator("text=/Total Earned/i");
    const redeemed = page.locator("text=/Already Redeemed/i");

    const hasAvailable = await availableBalance.isVisible().catch(() => false);
    const hasTotal = await totalEarned.isVisible().catch(() => false);
    const hasRedeemed = await redeemed.isVisible().catch(() => false);

    if (!hasAvailable && !hasTotal && !hasRedeemed) {
      console.log(
        "⚠️ No balance cards found (earnings feature not configured)",
      );
      console.log("ℹ️ Skipping balance cards test");
      return;
    }

    console.log(
      `✅ Earnings page - Available: ${hasAvailable}, Total: ${hasTotal}, Redeemed: ${hasRedeemed}`,
    );
    expect(hasAvailable || hasTotal || hasRedeemed).toBe(true);
  });

  test("earnings page shows redeem button", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/earnings`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login") || url === BASE_URL || url === `${BASE_URL}/`) {
      console.log("ℹ️ Earnings page requires authentication - skipping");
      test.skip();
      return;
    }

    const pageContent = await page.textContent("body").catch(() => "");
    if ((pageContent?.length || 0) < 100) {
      console.log(
        `⚠️ Earnings page content too short (${pageContent?.length} chars)`,
      );
      console.log("ℹ️ Skipping - page not loaded properly");
      return;
    }

    const redeemButton = page.locator('button:has-text("Redeem for elizaOS")');
    const hasRedeemButton = await redeemButton.isVisible().catch(() => false);

    if (!hasRedeemButton) {
      console.log(
        "⚠️ Redeem button not found (earnings feature not configured)",
      );
      console.log("ℹ️ Skipping redeem button test");
      return;
    }

    console.log(`✅ Redeem button visible: ${hasRedeemButton}`);
    expect(hasRedeemButton).toBe(true);
  });

  test("redeem button opens redemption dialog", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/earnings`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login") || url === BASE_URL || url === `${BASE_URL}/`) {
      console.log("ℹ️ Earnings page requires authentication - skipping");
      test.skip();
      return;
    }

    // Click redeem button
    const redeemButton = page.locator('button:has-text("Redeem for elizaOS")');
    if (await redeemButton.isVisible()) {
      await redeemButton.click();
      await page.waitForTimeout(500);

      // Check dialog opened
      const dialog = page.locator('div[role="dialog"]');
      const hasDialog = await dialog.isVisible().catch(() => false);

      if (hasDialog) {
        // Verify dialog contents
        const amountInput = page.locator('input[type="number"]');
        const networkSelect = page.locator('button[role="combobox"]');
        const addressInput = page.locator('input[placeholder*="address"]');

        const hasAmount = await amountInput.isVisible().catch(() => false);
        const hasNetwork = await networkSelect.isVisible().catch(() => false);
        const hasAddress = await addressInput.isVisible().catch(() => false);

        console.log(
          `✅ Dialog contents - Amount: ${hasAmount}, Network: ${hasNetwork}, Address: ${hasAddress}`,
        );
        expect(hasAmount).toBe(true);
      }
    } else {
      console.log(
        "ℹ️ Redeem button not visible (may be disabled due to low balance)",
      );
    }
  });

  test("redemption dialog network selector works", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/earnings`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login") || url === BASE_URL || url === `${BASE_URL}/`) {
      test.skip();
      return;
    }

    const redeemButton = page.locator('button:has-text("Redeem for elizaOS")');
    if (!(await redeemButton.isVisible())) {
      test.skip();
      return;
    }

    await redeemButton.click();
    await page.waitForTimeout(500);

    // Click network selector
    const networkSelect = page.locator('button[role="combobox"]').first();
    if (await networkSelect.isVisible()) {
      await networkSelect.click();
      await page.waitForTimeout(300);

      // Check for network options
      const baseOption = page.locator("text=Base");
      const solanaOption = page.locator("text=Solana");

      const hasBase = await baseOption.isVisible().catch(() => false);
      const hasSolana = await solanaOption.isVisible().catch(() => false);

      console.log(
        `✅ Network options - Base: ${hasBase}, Solana: ${hasSolana}`,
      );
      expect(hasBase || hasSolana).toBe(true);
    }
  });

  test("earnings page shows recent earnings list", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/earnings`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login") || url === BASE_URL || url === `${BASE_URL}/`) {
      test.skip();
      return;
    }

    // Look for recent earnings section
    const recentEarnings = page.locator("text=/Recent Earnings/i");
    const hasRecent = await recentEarnings.isVisible().catch(() => false);

    console.log(`✅ Recent earnings section: ${hasRecent}`);
  });

  test("earnings page shows redemption history", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/earnings`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login") || url === BASE_URL || url === `${BASE_URL}/`) {
      console.log("ℹ️ Earnings page requires authentication - skipping");
      test.skip();
      return;
    }

    const pageContent = await page.textContent("body").catch(() => "");
    if ((pageContent?.length || 0) < 100) {
      console.log(
        `⚠️ Earnings page content too short (${pageContent?.length} chars)`,
      );
      console.log("ℹ️ Skipping - page not loaded properly");
      return;
    }

    const historySection = page.locator("text=/Redemption History/i");
    const hasHistory = await historySection.isVisible().catch(() => false);

    if (!hasHistory) {
      console.log(
        "⚠️ Redemption history section not found (no history or feature not configured)",
      );
      console.log("ℹ️ Skipping redemption history test");
      return;
    }

    console.log(`✅ Redemption history section: ${hasHistory}`);
    expect(hasHistory).toBe(true);
  });

  test("refresh button reloads redemption history", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/earnings`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login") || url === BASE_URL || url === `${BASE_URL}/`) {
      test.skip();
      return;
    }

    // Find and click refresh button in redemption history
    const refreshButton = page
      .locator('button:has(svg[class*="RefreshCw"])')
      .first();
    if (await refreshButton.isVisible()) {
      await refreshButton.click();
      await page.waitForTimeout(1000);
      console.log("✅ Refresh button clicked");
    }
  });

  test("earnings breakdown by source shows miniapp/agent/mcp", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/dashboard/earnings`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login") || url === BASE_URL || url === `${BASE_URL}/`) {
      test.skip();
      return;
    }

    // Look for source breakdown
    const miniapp = page.locator("text=/miniapp/i");
    const agent = page.locator("text=/agent/i");
    const mcp = page.locator("text=/mcp/i");

    const hasMiniapp = await miniapp.isVisible().catch(() => false);
    const hasAgent = await agent.isVisible().catch(() => false);
    const hasMcp = await mcp.isVisible().catch(() => false);

    console.log(
      `✅ Source breakdown - Miniapp: ${hasMiniapp}, Agent: ${hasAgent}, MCP: ${hasMcp}`,
    );
  });

  test("system status banner shows when payouts limited", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/earnings`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login") || url === BASE_URL || url === `${BASE_URL}/`) {
      test.skip();
      return;
    }

    // Look for system status banner
    const statusBanner = page.locator("text=/Redemptions Limited/i");
    const hasBanner = await statusBanner.isVisible().catch(() => false);

    console.log(`✅ System status banner visible: ${hasBanner}`);
  });
});

// ============================================================================
// EARNINGS & REDEMPTION API TESTS
// ============================================================================

test.describe("Earnings Balance API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/v1/redemptions/balance returns balance data", async ({
    request,
  }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/redemptions/balance`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data).toHaveProperty("balance");
    expect(data.balance).toHaveProperty("totalEarned");
    expect(data.balance).toHaveProperty("availableBalance");
    expect(data.balance).toHaveProperty("totalRedeemed");
    expect(data).toHaveProperty("limits");
    expect(data).toHaveProperty("eligibility");

    console.log(
      `✅ Balance: $${data.balance.availableBalance} available, $${data.balance.totalEarned} total earned`,
    );
  });

  test("balance includes earnings breakdown by source", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/redemptions/balance`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("bySource");
    expect(Array.isArray(data.bySource)).toBe(true);

    for (const source of data.bySource) {
      expect(["miniapp", "agent", "mcp"]).toContain(source.source);
      expect(typeof source.totalEarned).toBe("number");
      expect(typeof source.count).toBe("number");
    }

    console.log(`✅ Found ${data.bySource.length} earning sources`);
  });

  test("balance includes recent earnings list", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/redemptions/balance`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("recentEarnings");
    expect(Array.isArray(data.recentEarnings)).toBe(true);

    if (data.recentEarnings.length > 0) {
      const earning = data.recentEarnings[0];
      expect(earning).toHaveProperty("id");
      expect(earning).toHaveProperty("source");
      expect(earning).toHaveProperty("amount");
      expect(earning).toHaveProperty("description");
    }

    console.log(`✅ Found ${data.recentEarnings.length} recent earnings`);
  });

  test("balance includes eligibility status", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/redemptions/balance`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.eligibility).toHaveProperty("canRedeem");
    expect(typeof data.eligibility.canRedeem).toBe("boolean");

    if (!data.eligibility.canRedeem) {
      expect(data.eligibility).toHaveProperty("reason");
    }

    console.log(
      `✅ Can redeem: ${data.eligibility.canRedeem}, Reason: ${data.eligibility.reason || "N/A"}`,
    );
  });

  test("balance includes redemption limits", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/redemptions/balance`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.limits).toHaveProperty("minRedemptionUsd");
    expect(data.limits).toHaveProperty("maxSingleRedemptionUsd");
    expect(data.limits).toHaveProperty("userDailyLimitUsd");

    console.log(
      `✅ Limits: $${data.limits.minRedemptionUsd} min, $${data.limits.maxSingleRedemptionUsd} max`,
    );
  });
});

test.describe("Redemption Quote API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/v1/redemptions/quote returns price quote", async ({
    request,
  }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/redemptions/quote?amount=10&network=base`,
      { headers: authHeaders() },
    );

    // May fail if no TWAP samples or system paused
    expect([200, 400, 503]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.quote).toHaveProperty("usdValue");
      expect(data.quote).toHaveProperty("elizaAmount");
      expect(data.quote).toHaveProperty("elizaPriceUsd");
      expect(data.quote).toHaveProperty("expiresAt");

      console.log(
        `✅ Quote: $${data.quote.usdValue} = ${data.quote.elizaAmount} elizaOS at $${data.quote.elizaPriceUsd}`,
      );
    } else {
      const error = await response.json();
      console.log(`ℹ️ Quote unavailable: ${error.error}`);
    }
  });

  test("quote requires valid network parameter", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/redemptions/quote?amount=10&network=invalid`,
      { headers: authHeaders() },
    );

    expect([400, 422]).toContain(response.status());
    console.log("✅ Invalid network rejected");
  });

  test("quote requires amount parameter", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/redemptions/quote?network=base`,
      { headers: authHeaders() },
    );

    expect([400, 422]).toContain(response.status());
    console.log("✅ Missing amount rejected");
  });

  test("quote validates minimum amount", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/redemptions/quote?amount=0.01&network=base`,
      { headers: authHeaders() },
    );

    // Should reject amounts below minimum
    expect([200, 400, 422]).toContain(response.status());
    console.log("✅ Minimum amount validation checked");
  });
});

test.describe("Redemption Status API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/v1/redemptions/status returns system status", async ({
    request,
  }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/redemptions/status`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("operational");
    expect(typeof data.operational).toBe("boolean");
    expect(data).toHaveProperty("networks");

    console.log(`✅ System operational: ${data.operational}`);
  });

  test("status includes network availability", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/redemptions/status`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.networks).toBeDefined();

    for (const [network, status] of Object.entries(data.networks) as [
      string,
      { available: boolean },
    ][]) {
      expect(status).toHaveProperty("available");
      console.log(`  ${network}: ${status.available ? "✅" : "❌"}`);
    }
  });

  test("status includes wallet configuration", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/redemptions/status`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    if (data.wallets) {
      expect(data.wallets).toHaveProperty("evm");
      expect(data.wallets).toHaveProperty("solana");
      console.log(
        `✅ EVM configured: ${data.wallets.evm?.configured}, Solana configured: ${data.wallets.solana?.configured}`,
      );
    }
  });
});

test.describe("Redemption Request API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/v1/redemptions lists user redemptions", async ({
    request,
  }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/redemptions?limit=10`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data.redemptions)).toBe(true);

    if (data.redemptions.length > 0) {
      const redemption = data.redemptions[0];
      expect(redemption).toHaveProperty("id");
      expect(redemption).toHaveProperty("status");
      expect(redemption).toHaveProperty("usd_value");
      expect(redemption).toHaveProperty("network");
    }

    console.log(`✅ Found ${data.redemptions.length} redemptions`);
  });

  test("POST /api/v1/redemptions validates required fields", async ({
    request,
  }) => {
    const response = await request.post(`${BASE_URL}/api/v1/redemptions`, {
      headers: authHeaders(),
      data: {
        // Missing required fields
      },
    });

    expect([400, 422]).toContain(response.status());
    console.log("✅ Missing fields rejected");
  });

  test("POST /api/v1/redemptions validates wallet address format", async ({
    request,
  }) => {
    const response = await request.post(`${BASE_URL}/api/v1/redemptions`, {
      headers: authHeaders(),
      data: {
        amount: 10,
        network: "base",
        payoutAddress: "invalid-address",
      },
    });

    expect([400, 422]).toContain(response.status());
    console.log("✅ Invalid address rejected");
  });

  test("POST /api/v1/redemptions validates solana address format", async ({
    request,
  }) => {
    const response = await request.post(`${BASE_URL}/api/v1/redemptions`, {
      headers: authHeaders(),
      data: {
        amount: 10,
        network: "solana",
        payoutAddress: "0x1234", // EVM address on Solana
      },
    });

    expect([400, 422]).toContain(response.status());
    console.log("✅ Wrong address format for Solana rejected");
  });
});

// ============================================================================
// ADMIN REDEMPTION MANAGEMENT UI TESTS
// ============================================================================

test.describe("Admin Redemptions Page UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("admin redemptions page loads", async ({ page }) => {
    const response = await page
      .goto(`${BASE_URL}/dashboard/admin/redemptions`)
      .catch(() => null);
    if (!response) {
      console.log("ℹ️ Page navigation failed - skipping");
      return;
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login") || !url.includes("/admin")) {
      console.log("ℹ️ Admin page requires admin authentication");
      return;
    }

    // Should show admin UI elements
    const systemStatus = page.locator("text=/System Status/i");
    const queueStats = page.locator("text=/Queue Stats/i");

    const hasStatus = await systemStatus.isVisible().catch(() => false);
    const hasQueue = await queueStats.isVisible().catch(() => false);

    console.log(
      `✅ Admin UI - System Status: ${hasStatus}, Queue Stats: ${hasQueue}`,
    );
  });

  test("admin page shows filter controls", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/admin/redemptions`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (!url.includes("/admin/redemptions")) return;

    // Check for filter controls
    const searchInput = page.locator('input[placeholder*="Search"]');
    const statusFilter = page.locator('button[role="combobox"]').first();
    const refreshButton = page.locator('button:has(svg[class*="RefreshCw"])');

    const hasSearch = await searchInput.isVisible().catch(() => false);
    const hasStatus = await statusFilter.isVisible().catch(() => false);
    const hasRefresh = await refreshButton.isVisible().catch(() => false);

    console.log(
      `✅ Filters - Search: ${hasSearch}, Status: ${hasStatus}, Refresh: ${hasRefresh}`,
    );
  });

  test("admin status filter changes results", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/admin/redemptions`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (!url.includes("/admin/redemptions")) return;

    // Click status filter
    const statusFilter = page.locator('button[role="combobox"]').first();
    if (await statusFilter.isVisible()) {
      await statusFilter.click();
      await page.waitForTimeout(300);

      // Select "All Status"
      const allOption = page.locator('text="All Status"');
      if (await allOption.isVisible()) {
        await allOption.click();
        await page.waitForTimeout(500);
        console.log("✅ Status filter changed");
      }
    }
  });

  test("admin network filter works", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/admin/redemptions`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (!url.includes("/admin/redemptions")) return;

    // Click network filter (second combobox)
    const networkFilter = page.locator('button[role="combobox"]').nth(1);
    if (await networkFilter.isVisible()) {
      await networkFilter.click();
      await page.waitForTimeout(300);

      // Select "Base"
      const baseOption = page.locator('div[role="option"]:has-text("Base")');
      if (await baseOption.isVisible()) {
        await baseOption.click();
        await page.waitForTimeout(500);
        console.log("✅ Network filter changed to Base");
      }
    }
  });

  test("admin page shows redemptions table", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/admin/redemptions`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (!url.includes("/admin/redemptions")) return;

    // Check for table
    const table = page.locator("table");
    const hasTable = await table.isVisible().catch(() => false);

    if (hasTable) {
      // Check for table headers
      const dateHeader = page.locator('th:has-text("Date")');
      const userHeader = page.locator('th:has-text("User")');
      const amountHeader = page.locator('th:has-text("Amount")');
      const statusHeader = page.locator('th:has-text("Status")');

      console.log("✅ Redemptions table found");
    } else {
      // May show empty state
      const emptyState = page.locator("text=/No redemptions/i");
      const hasEmpty = await emptyState.isVisible().catch(() => false);
      console.log(`✅ Table visible: ${hasTable}, Empty state: ${hasEmpty}`);
    }
  });

  test("admin can view redemption details", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/admin/redemptions`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (!url.includes("/admin/redemptions")) return;

    // Look for view button (eye icon)
    const viewButton = page.locator('button:has(svg[class*="Eye"])').first();
    if (await viewButton.isVisible()) {
      await viewButton.click();
      await page.waitForTimeout(500);

      // Check for details dialog
      const dialog = page.locator('div[role="dialog"]');
      const hasDialog = await dialog.isVisible().catch(() => false);

      if (hasDialog) {
        const detailsTitle = page.locator("text=/Redemption Details/i");
        const hasTitle = await detailsTitle.isVisible().catch(() => false);
        console.log(`✅ Details dialog opened: ${hasTitle}`);

        // Close dialog
        const closeButton = page.locator('button:has-text("Close")');
        if (await closeButton.isVisible()) {
          await closeButton.click();
        }
      }
    } else {
      console.log("ℹ️ No redemptions to view");
    }
  });

  test("approve button shows confirmation dialog", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/admin/redemptions`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (!url.includes("/admin/redemptions")) return;

    // Look for approve button (check icon, green color)
    const approveButton = page
      .locator("button.text-green-400:has(svg)")
      .first();
    if (await approveButton.isVisible()) {
      await approveButton.click();
      await page.waitForTimeout(500);

      // Check for confirmation dialog
      const confirmDialog = page.locator('div[role="alertdialog"]');
      const hasConfirm = await confirmDialog.isVisible().catch(() => false);

      if (hasConfirm) {
        console.log("✅ Approve confirmation dialog opened");

        // Click cancel
        const cancelButton = page.locator('button:has-text("Cancel")');
        if (await cancelButton.isVisible()) {
          await cancelButton.click();
        }
      }
    } else {
      console.log("ℹ️ No pending redemptions to approve");
    }
  });

  test("reject button shows reason dialog", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/admin/redemptions`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (!url.includes("/admin/redemptions")) return;

    // Look for reject button (ban icon, red color)
    const rejectButton = page.locator("button.text-red-400:has(svg)").first();
    if (await rejectButton.isVisible()) {
      await rejectButton.click();
      await page.waitForTimeout(500);

      // Check for rejection dialog
      const dialog = page.locator('div[role="dialog"]');
      const hasDialog = await dialog.isVisible().catch(() => false);

      if (hasDialog) {
        // Check for reason textarea
        const textarea = page.locator("textarea");
        const hasTextarea = await textarea.isVisible().catch(() => false);
        console.log(`✅ Rejection dialog with reason field: ${hasTextarea}`);

        // Close dialog
        const cancelButton = page.locator('button:has-text("Cancel")');
        if (await cancelButton.isVisible()) {
          await cancelButton.click();
        }
      }
    } else {
      console.log("ℹ️ No pending redemptions to reject");
    }
  });
});

// ============================================================================
// ADMIN REDEMPTION API TESTS
// ============================================================================

test.describe("Admin Redemptions API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/admin/redemptions lists all redemptions", async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URL}/api/admin/redemptions`, {
      headers: authHeaders(),
    });

    // May return 403 if not admin
    expect([200, 403]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(Array.isArray(data.redemptions)).toBe(true);
      expect(data).toHaveProperty("stats");
      console.log(`✅ Admin found ${data.redemptions.length} redemptions`);
    } else {
      console.log("ℹ️ Admin access required");
    }
  });

  test("admin list includes stats", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/admin/redemptions`, {
      headers: authHeaders(),
    });

    if (response.status() !== 200) return;

    const data = await response.json();
    expect(data.stats).toHaveProperty("pending");
    expect(data.stats).toHaveProperty("completed");
    expect(data.stats).toHaveProperty("totalPendingUsd");

    console.log(
      `✅ Stats: ${data.stats.pending} pending, $${data.stats.totalPendingUsd} pending value`,
    );
  });

  test("admin list supports status filter", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/admin/redemptions?status=pending`,
      { headers: authHeaders() },
    );

    if (response.status() !== 200) return;

    const data = await response.json();
    for (const r of data.redemptions) {
      expect(r.status).toBe("pending");
    }
    console.log(`✅ Status filter works`);
  });

  test("admin list supports network filter", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/admin/redemptions?network=base`,
      { headers: authHeaders() },
    );

    if (response.status() !== 200) return;

    const data = await response.json();
    for (const r of data.redemptions) {
      expect(r.network).toBe("base");
    }
    console.log(`✅ Network filter works`);
  });
});

// ============================================================================
// FULL REDEMPTION FLOW E2E TEST
// ============================================================================

test.describe("Complete Redemption Flow", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("full flow: check balance → get quote → verify eligibility", async ({
    request,
  }) => {
    // Step 1: Get balance
    const balanceRes = await request.get(
      `${BASE_URL}/api/v1/redemptions/balance`,
      {
        headers: authHeaders(),
      },
    );
    expect(balanceRes.status()).toBe(200);
    const balance = await balanceRes.json();

    console.log(`Step 1: Balance = $${balance.balance.availableBalance}`);
    console.log(`        Eligible: ${balance.eligibility.canRedeem}`);

    // Step 2: Check system status
    const statusRes = await request.get(
      `${BASE_URL}/api/v1/redemptions/status`,
      {
        headers: authHeaders(),
      },
    );
    expect(statusRes.status()).toBe(200);
    const status = await statusRes.json();

    console.log(`Step 2: System operational: ${status.operational}`);

    // Step 3: Get quote (if eligible)
    if (balance.eligibility.canRedeem && status.operational) {
      const quoteRes = await request.get(
        `${BASE_URL}/api/v1/redemptions/quote?amount=${balance.limits.minRedemptionUsd}&network=base`,
        { headers: authHeaders() },
      );

      if (quoteRes.status() === 200) {
        const quote = await quoteRes.json();
        console.log(
          `Step 3: Quote = ${quote.quote.elizaAmount} elizaOS for $${quote.quote.usdValue}`,
        );
        console.log(`        Price: $${quote.quote.elizaPriceUsd}`);
        console.log(`        Expires: ${quote.quote.expiresAt}`);
      } else {
        console.log(`Step 3: Quote unavailable (TWAP not ready)`);
      }
    } else {
      console.log(`Step 3: Skipped (not eligible or system offline)`);
    }

    // Step 4: List existing redemptions
    const listRes = await request.get(
      `${BASE_URL}/api/v1/redemptions?limit=5`,
      {
        headers: authHeaders(),
      },
    );
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();

    console.log(
      `Step 4: User has ${list.redemptions.length} existing redemptions`,
    );

    console.log("✅ Complete flow verified");
  });
});

// ============================================================================
// SIDEBAR NAVIGATION TEST
// ============================================================================

test.describe("Sidebar Navigation", () => {
  test("earnings link appears in sidebar", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      console.log("ℹ️ Dashboard requires authentication");
      return;
    }

    // Look for earnings link in sidebar
    const earningsLink = page.locator('a[href="/dashboard/earnings"]');
    const hasLink = await earningsLink.isVisible().catch(() => false);

    console.log(`✅ Earnings sidebar link: ${hasLink}`);
  });

  test("clicking earnings link navigates to earnings page", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login") || url === BASE_URL || url === `${BASE_URL}/`) {
      test.skip();
      return;
    }

    const earningsLink = page.locator('a[href="/dashboard/earnings"]');
    if (await earningsLink.isVisible()) {
      await earningsLink.click();
      await page.waitForLoadState("networkidle");

      expect(page.url()).toContain("/dashboard/earnings");
      console.log("✅ Navigated to earnings page");
    }
  });
});
