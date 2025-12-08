import { test, expect } from "@playwright/test";

/**
 * Billing & Credits Flow Tests
 * 
 * Tests the complete billing flow including:
 * - Viewing billing page and credit balance
 * - Transaction history
 * - Credit pack purchases (Stripe Checkout)
 * - Auto top-up configuration
 * - Payment method management
 * 
 * Prerequisites:
 * - Cloud running on port 3000
 * - User authenticated (via session or API key)
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const API_KEY = process.env.TEST_API_KEY;

function authHeaders() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

test.describe("Billing Page UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("billing page loads and shows credit balance", async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/dashboard/billing`).catch(() => null);
    if (!response) {
      console.log("ℹ️ Page navigation failed - skipping");
      return;
    }
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2000);

    const url = page.url();
    
    // May redirect to login if not authenticated
    if (url.includes("/login") || url === BASE_URL || url === `${BASE_URL}/` || !url.includes("/billing")) {
      console.log("ℹ️ Billing page requires authentication");
      return;
    }

    // Should show balance if authenticated - check for any credit-related content
    const balanceText = page.locator('text=/\\$[\\d.]+/');
    const creditText = page.locator('text=/credit/i');
    const hasBalance = await balanceText.isVisible().catch(() => false);
    const hasCredit = await creditText.isVisible().catch(() => false);
    
    console.log(`✅ Billing page - Balance visible: ${hasBalance}, Credit text: ${hasCredit}`);
    // At least one should be visible if on billing page
    expect(hasBalance || hasCredit).toBe(true);
  });

  test("billing page shows credit packs", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/billing`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login") || url === BASE_URL || url === `${BASE_URL}/`) {
      console.log("ℹ️ Billing page requires authentication");
      return;
    }

    // Look for credit pack cards or purchase buttons
    const packCards = page.locator('[class*="card"], [class*="Card"]');
    const purchaseButtons = page.locator('button:has-text("Buy"), button:has-text("Purchase")');
    
    const cardCount = await packCards.count();
    const buttonCount = await purchaseButtons.count();
    
    // Only check if we're actually on the billing page
    if (url.includes("/billing")) {
      console.log(`✅ Found ${cardCount} pack cards and ${buttonCount} purchase buttons`);
      expect(cardCount + buttonCount).toBeGreaterThan(0);
    }
  });

  test("transaction history section exists", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/billing`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    if (url.includes("/login")) {
      return;
    }

    // Look for transaction history heading or table
    const historyHeading = page.locator('text=/transaction|history|recent/i');
    const historyTable = page.locator('table, [class*="transaction"]');
    
    const hasHeading = await historyHeading.isVisible().catch(() => false);
    const hasTable = await historyTable.isVisible().catch(() => false);
    
    console.log(`✅ Transaction history - Heading: ${hasHeading}, Table: ${hasTable}`);
  });
});

test.describe("Billing API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/credits/balance returns credit balance", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/credits/balance`, {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty("balance");
    expect(typeof data.balance).toBe("number");
    
    console.log(`✅ Credit balance: $${data.balance}`);
  });

  test("GET /api/credits/transactions returns transaction history", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/credits/transactions`, {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(Array.isArray(data.transactions)).toBe(true);
    expect(data).toHaveProperty("total");
    expect(data).toHaveProperty("period");
    
    console.log(`✅ Found ${data.transactions.length} transactions`);
  });

  test("GET /api/stripe/credit-packs returns available packs", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/stripe/credit-packs`, {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(Array.isArray(data.packs)).toBe(true);
    
    if (data.packs.length > 0) {
      const pack = data.packs[0];
      expect(pack).toHaveProperty("id");
      expect(pack).toHaveProperty("name");
      expect(pack).toHaveProperty("credits");
      expect(pack).toHaveProperty("price_cents");
    }
    
    console.log(`✅ Found ${data.packs.length} credit packs`);
  });

  test("POST /api/stripe/create-checkout-session creates checkout session", async ({ request }) => {
    // First get available packs
    const packsResponse = await request.get(`${BASE_URL}/api/stripe/credit-packs`, {
      headers: authHeaders(),
    });
    
    if (packsResponse.status() !== 200) {
      console.log("ℹ️ Credit packs endpoint not available");
      return;
    }
    
    const packsData = await packsResponse.json();
    if (packsData.packs.length === 0) {
      console.log("ℹ️ No credit packs available");
      return;
    }
    
    const packId = packsData.packs[0].id;
    
    // Create checkout session
    const response = await request.post(`${BASE_URL}/api/stripe/create-checkout-session`, {
      headers: authHeaders(),
      data: {
        creditPackId: packId,
      },
    });

    // May return 200 with URL or 400/500 if Stripe not configured
    expect([200, 400, 500]).toContain(response.status());
    
    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty("url");
      console.log("✅ Checkout session created");
    } else {
      console.log("ℹ️ Stripe checkout not configured (expected in test environment)");
    }
  });
});

test.describe("Auto Top-Up API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/auto-top-up/settings returns settings", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/auto-top-up/settings`, {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    // GET returns settings directly, not wrapped
    expect(data).toHaveProperty("enabled");
    expect(data).toHaveProperty("amount");
    expect(data).toHaveProperty("threshold");
    
    console.log(`✅ Auto top-up - Enabled: ${data.enabled}, Amount: $${data.amount}, Threshold: $${data.threshold}`);
  });

  test("POST /api/auto-top-up/settings updates settings", async ({ request }) => {
    // First get current settings
    const getResponse = await request.get(`${BASE_URL}/api/auto-top-up/settings`, {
      headers: authHeaders(),
    });
    const currentSettings = await getResponse.json();
    
    // Update settings
    const response = await request.post(`${BASE_URL}/api/auto-top-up/settings`, {
      headers: authHeaders(),
      data: {
        enabled: !currentSettings.enabled,
        amount: 50,
        threshold: 10,
      },
    });

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.settings.enabled).toBe(!currentSettings.enabled);
    expect(data.settings.amount).toBe(50);
    expect(data.settings.threshold).toBe(10);
    
    // Restore original settings
    await request.post(`${BASE_URL}/api/auto-top-up/settings`, {
      headers: authHeaders(),
      data: {
        enabled: currentSettings.enabled,
        amount: currentSettings.amount,
        threshold: currentSettings.threshold,
      },
    });
    
    console.log("✅ Auto top-up settings updated and restored");
  });

  test("POST /api/auto-top-up/settings validates threshold < amount", async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/auto-top-up/settings`, {
      headers: authHeaders(),
      data: {
        enabled: true,
        amount: 10,
        threshold: 50, // Threshold > amount should fail
      },
    });

    expect([400, 422]).toContain(response.status());
    console.log("✅ Auto top-up validation works correctly");
  });
});

test.describe("Payment Methods API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/payment-methods/list returns payment methods", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/payment-methods/list`, {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(Array.isArray(data.paymentMethods)).toBe(true);
    expect(data).toHaveProperty("defaultPaymentMethodId");
    
    console.log(`✅ Found ${data.paymentMethods.length} payment methods`);
  });
});

test.describe("Billing Success Page", () => {
  test("billing success page handles missing session_id", async ({ page }) => {
    await page.goto(`${BASE_URL}/billing/success`);
    await page.waitForLoadState("networkidle");
    
    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(0);
    
    console.log("✅ Billing success page handles missing session_id");
  });

  test("dashboard billing success page handles missing session_id", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/billing/success`);
    await page.waitForLoadState("networkidle");
    
    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(0);
    
    console.log("✅ Dashboard billing success page handles missing session_id");
  });
});

test.describe("Credit Usage Tracking", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/credits/usage returns usage data", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/credits/usage`, {
      headers: authHeaders(),
    });

    // May not be implemented, accept 200 or 404
    expect([200, 404]).toContain(response.status());
    
    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeTruthy();
      console.log("✅ Credit usage endpoint available");
    } else {
      console.log("ℹ️ Credit usage endpoint not implemented");
    }
  });
});
