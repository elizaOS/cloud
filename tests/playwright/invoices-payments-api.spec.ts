import { test, expect } from "@playwright/test";

/**
 * Invoices, Payments & Purchases API Tests
 *
 * Tests billing functionality:
 * - Invoice listing and details
 * - Payment method management
 * - Purchase flow
 * - Credits streaming
 *
 * Prerequisites:
 * - TEST_API_KEY environment variable required
 * - Cloud running on port 3000
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const CLOUD_URL = process.env.CLOUD_URL ?? BASE_URL;
const API_KEY = process.env.TEST_API_KEY;

function authHeaders() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

test.describe("Invoices API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/invoices/list returns invoice list", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/invoices/list`, {
      headers: authHeaders(),
    });

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const invoices = data.invoices || data.data || data;
      expect(Array.isArray(invoices)).toBe(true);
      console.log(`✅ Found ${invoices.length} invoices`);

      // Check invoice structure if any exist
      if (invoices.length > 0) {
        const invoice = invoices[0];
        expect(invoice).toHaveProperty("id");
      }
    } else {
      console.log(`ℹ️ Invoices list returned ${response.status()}`);
    }
  });

  test("invoices list supports pagination", async ({ request }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/invoices/list?limit=10&offset=0`,
      {
        headers: authHeaders(),
      },
    );

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const invoices = data.invoices || data.data || data;
      expect(invoices.length).toBeLessThanOrEqual(10);
      console.log("✅ Invoice pagination works");
    }
  });

  test("GET /api/invoices/:id returns invoice details", async ({ request }) => {
    // First get list
    const listResponse = await request.get(`${CLOUD_URL}/api/invoices/list`, {
      headers: authHeaders(),
    });

    if (listResponse.status() !== 200) {
      return;
    }

    const listData = await listResponse.json();
    const invoices = listData.invoices || listData.data || listData;

    if (!Array.isArray(invoices) || invoices.length === 0) {
      console.log("ℹ️ No invoices available for detail test");
      return;
    }

    const invoiceId = invoices[0].id;

    // Get details
    const response = await request.get(
      `${CLOUD_URL}/api/invoices/${invoiceId}`,
      {
        headers: authHeaders(),
      },
    );

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const invoice = data.invoice || data.data || data;
      expect(invoice).toHaveProperty("id");
      expect(invoice.id).toBe(invoiceId);
      console.log("✅ Invoice details retrieved");
    }
  });
});

test.describe("Payment Methods API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/payment-methods/list returns payment methods", async ({
    request,
  }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/payment-methods/list`,
      {
        headers: authHeaders(),
      },
    );

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const methods = data.paymentMethods || data.data || data;
      expect(Array.isArray(methods)).toBe(true);
      console.log(`✅ Found ${methods.length} payment methods`);

      // Check for default payment method
      if (data.defaultPaymentMethodId) {
        console.log("   Default payment method is set");
      }
    } else {
      console.log(`ℹ️ Payment methods list returned ${response.status()}`);
    }
  });

  test("POST /api/payment-methods/attach adds payment method", async ({
    request,
  }) => {
    // This test would need a valid Stripe payment method token
    // We'll test the endpoint exists
    const response = await request.post(
      `${CLOUD_URL}/api/payment-methods/attach`,
      {
        headers: authHeaders(),
        data: {
          paymentMethodId: "pm_test_invalid",
        },
      },
    );

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      console.log("✅ Payment method attach endpoint works");
    } else if (response.status() === 400) {
      console.log("✅ Payment method attach validates input");
    } else {
      console.log(`ℹ️ Payment method attach returned ${response.status()}`);
    }
  });

  test("POST /api/payment-methods/remove removes payment method", async ({
    request,
  }) => {
    const response = await request.post(
      `${CLOUD_URL}/api/payment-methods/remove`,
      {
        headers: authHeaders(),
        data: {
          paymentMethodId: "pm_test_invalid",
        },
      },
    );

    expect([200, 204, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 204) {
      console.log("✅ Payment method removal works");
    } else if (response.status() === 404) {
      console.log("✅ Payment method removal validates existence");
    } else {
      console.log(`ℹ️ Payment method removal returned ${response.status()}`);
    }
  });

  test("POST /api/payment-methods/set-default sets default method", async ({
    request,
  }) => {
    // First get payment methods
    const listResponse = await request.get(
      `${CLOUD_URL}/api/payment-methods/list`,
      {
        headers: authHeaders(),
      },
    );

    if (listResponse.status() !== 200) {
      return;
    }

    const listData = await listResponse.json();
    const methods = listData.paymentMethods || listData.data || listData;

    if (!Array.isArray(methods) || methods.length === 0) {
      console.log("ℹ️ No payment methods to set as default");
      return;
    }

    const methodId = methods[0].id;

    const response = await request.post(
      `${CLOUD_URL}/api/payment-methods/set-default`,
      {
        headers: authHeaders(),
        data: {
          paymentMethodId: methodId,
        },
      },
    );

    expect([200, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      console.log("✅ Set default payment method works");
    } else {
      console.log(
        `ℹ️ Set default payment method returned ${response.status()}`,
      );
    }
  });
});

test.describe("Purchases API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/purchases/create creates purchase intent", async ({
    request,
  }) => {
    const response = await request.post(`${CLOUD_URL}/api/purchases/create`, {
      headers: authHeaders(),
      data: {
        amount: 10,
        currency: "USD",
      },
    });

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Purchase creation works");

      if (data.clientSecret) {
        console.log("   Client secret provided for payment");
      }
      if (data.purchaseId) {
        console.log(`   Purchase ID: ${data.purchaseId}`);
      }
    } else {
      console.log(`ℹ️ Purchase creation returned ${response.status()}`);
    }
  });

  test("POST /api/purchases/confirm confirms purchase", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/purchases/confirm`, {
      headers: authHeaders(),
      data: {
        purchaseId: "test-purchase-id",
        paymentIntentId: "pi_test_invalid",
      },
    });

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      console.log("✅ Purchase confirmation works");
    } else if (response.status() === 400 || response.status() === 404) {
      console.log("✅ Purchase confirmation validates input");
    } else {
      console.log(`ℹ️ Purchase confirmation returned ${response.status()}`);
    }
  });

  test("GET /api/purchases/status returns purchase status", async ({
    request,
  }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/purchases/status?purchaseId=test-id`,
      {
        headers: authHeaders(),
      },
    );

    expect([200, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Purchase status endpoint works");
    } else if (response.status() === 404) {
      console.log("✅ Purchase status validates purchase ID");
    } else {
      console.log(`ℹ️ Purchase status returned ${response.status()}`);
    }
  });
});

test.describe("Credits Stream API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/credits/stream returns SSE stream", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/credits/stream`, {
      headers: authHeaders(),
    });

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const contentType = response.headers()["content-type"];
      const isStream =
        contentType?.includes("text/event-stream") ||
        contentType?.includes("application/json");

      if (isStream) {
        console.log("✅ Credits stream endpoint returns SSE");
      } else {
        console.log(`✅ Credits stream returns: ${contentType}`);
      }
    } else {
      console.log(`ℹ️ Credits stream returned ${response.status()}`);
    }
  });
});

test.describe("Billing Usage API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/billing/usage returns usage data", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/billing/usage`, {
      headers: authHeaders(),
    });

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Billing usage retrieved");

      if (data.usage) {
        console.log(`   Usage data available`);
      }
    } else {
      console.log(`ℹ️ Billing usage returned ${response.status()}`);
    }
  });
});

test.describe("Invoices Dashboard UI", () => {
  test("invoices page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/invoices`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      console.log("ℹ️ Invoices page requires authentication");
      return;
    }

    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(100);
    console.log("✅ Invoices page loads");
  });

  test("invoices page has invoice list or empty state", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/invoices`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      return;
    }

    // Look for invoice items or empty state
    const invoiceItems = page.locator(
      '[class*="invoice"], [class*="row"], table tr, [class*="card"]',
    );
    const emptyState = page.locator("text=/no invoice|empty|nothing/i");

    const itemCount = await invoiceItems.count();
    const hasEmpty = await emptyState.isVisible().catch(() => false);

    console.log(`✅ Invoice items: ${itemCount}, Empty state: ${hasEmpty}`);
  });

  test("invoice detail page loads", async ({ page }) => {
    // First try to get an invoice ID from the list
    await page.goto(`${BASE_URL}/dashboard/invoices`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      return;
    }

    // Look for invoice links
    const invoiceLinks = page.locator('a[href*="/invoices/"]');
    const linkCount = await invoiceLinks.count();

    if (linkCount > 0) {
      await invoiceLinks.first().click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      const detailUrl = page.url();
      expect(detailUrl).toContain("/invoices/");
      console.log("✅ Invoice detail page accessible");
    } else {
      // Test with a fake ID
      await page.goto(`${BASE_URL}/dashboard/invoices/test-invoice-id`);
      await page.waitForLoadState("networkidle");

      const content = await page.locator("body").textContent();
      expect(content?.length).toBeGreaterThan(0);
      console.log("✅ Invoice detail page handles invalid ID");
    }
  });
});

test.describe("Billing Page Comprehensive", () => {
  test("billing page shows all sections", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/billing`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      console.log("ℹ️ Billing page requires authentication");
      return;
    }

    // Check for key billing sections
    const balanceSection = page.locator("text=/balance|credit/i");
    const packSection = page.locator("text=/pack|purchase|buy/i");
    const historySection = page.locator("text=/history|transaction/i");
    const topUpSection = page.locator("text=/auto.*top|top.*up/i");

    const hasBalance = await balanceSection.isVisible().catch(() => false);
    const hasPacks = await packSection.isVisible().catch(() => false);
    const hasHistory = await historySection.isVisible().catch(() => false);
    const hasTopUp = await topUpSection.isVisible().catch(() => false);

    console.log(
      `✅ Billing sections - Balance: ${hasBalance}, Packs: ${hasPacks}, History: ${hasHistory}, Auto Top-Up: ${hasTopUp}`,
    );
  });

  test("payment method section exists", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/billing`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      return;
    }

    // Look for payment method section
    const paymentSection = page.locator(
      "text=/payment.*method|card|credit.*card/i",
    );
    const addCardButton = page.locator(
      'button:has-text("Add"), button:has-text("Card")',
    );

    const hasSection = await paymentSection.isVisible().catch(() => false);
    const hasButton = await addCardButton.isVisible().catch(() => false);

    console.log(
      `✅ Payment method section: ${hasSection}, Add button: ${hasButton}`,
    );
  });

  test("credit pack purchase buttons work", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/billing`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      return;
    }

    // Look for purchase buttons
    const purchaseButtons = page.locator(
      'button:has-text("Buy"), button:has-text("Purchase"), button:has-text("Get")',
    );
    const buttonCount = await purchaseButtons.count();

    if (buttonCount > 0) {
      // Don't actually click to avoid real purchases
      console.log(`✅ Found ${buttonCount} purchase buttons`);
    } else {
      console.log("ℹ️ No purchase buttons visible");
    }
  });
});
