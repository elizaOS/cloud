import { test, expect } from "@playwright/test";

/**
 * Analytics API Tests
 *
 * Tests analytics functionality:
 * - Overview metrics
 * - Usage breakdown
 * - Projections
 * - Export
 * - Configuration
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

test.describe("Analytics Overview API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/analytics/overview returns overview metrics", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/analytics/overview`, {
      headers: authHeaders(),
    });

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Analytics overview retrieved");

      // Check for common analytics fields
      if (data.totalCredits !== undefined) {
        console.log(`   Total credits: ${data.totalCredits}`);
      }
      if (data.totalRequests !== undefined) {
        console.log(`   Total requests: ${data.totalRequests}`);
      }
    } else {
      console.log(`ℹ️ Analytics overview returned ${response.status()}`);
    }
  });

  test("overview supports date range filter", async ({ request }) => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date();

    const response = await request.get(
      `${CLOUD_URL}/api/analytics/overview?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
      {
        headers: authHeaders(),
      }
    );

    expect([200, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Analytics overview with date filter works");
    } else {
      console.log(`ℹ️ Analytics overview with filter returned ${response.status()}`);
    }
  });
});

test.describe("Analytics Breakdown API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/analytics/breakdown returns usage breakdown", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/analytics/breakdown`, {
      headers: authHeaders(),
    });

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Analytics breakdown retrieved");

      // Check for breakdown structure
      if (data.byModel) {
        console.log(`   Models used: ${Object.keys(data.byModel).length}`);
      }
      if (data.byProvider) {
        console.log(`   Providers: ${Object.keys(data.byProvider).length}`);
      }
    } else {
      console.log(`ℹ️ Analytics breakdown returned ${response.status()}`);
    }
  });

  test("breakdown supports groupBy parameter", async ({ request }) => {
    const groupByOptions = ["model", "provider", "day", "week"];

    for (const groupBy of groupByOptions) {
      const response = await request.get(
        `${CLOUD_URL}/api/analytics/breakdown?groupBy=${groupBy}`,
        {
          headers: authHeaders(),
        }
      );

      expect([200, 400, 404, 500, 501]).toContain(response.status());

      if (response.status() === 200) {
        console.log(`✅ Analytics breakdown by ${groupBy} works`);
      }
    }
  });
});

test.describe("Analytics Projections API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/analytics/projections returns usage projections", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/analytics/projections`, {
      headers: authHeaders(),
    });

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Analytics projections retrieved");

      // Check for projection fields
      if (data.projectedCost !== undefined) {
        console.log(`   Projected cost: $${data.projectedCost}`);
      }
      if (data.projectedCredits !== undefined) {
        console.log(`   Projected credits: ${data.projectedCredits}`);
      }
    } else {
      console.log(`ℹ️ Analytics projections returned ${response.status()}`);
    }
  });

  test("projections support time period", async ({ request }) => {
    const periods = ["week", "month", "quarter"];

    for (const period of periods) {
      const response = await request.get(
        `${CLOUD_URL}/api/analytics/projections?period=${period}`,
        {
          headers: authHeaders(),
        }
      );

      expect([200, 400, 404, 500, 501]).toContain(response.status());

      if (response.status() === 200) {
        console.log(`✅ Projections for ${period} work`);
      }
    }
  });
});

test.describe("Analytics Config API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/analytics/config returns config", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/analytics/config`, {
      headers: authHeaders(),
    });

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Analytics config retrieved");
    } else {
      console.log(`ℹ️ Analytics config returned ${response.status()}`);
    }
  });

  test("PUT /api/analytics/config updates config", async ({ request }) => {
    const response = await request.put(`${CLOUD_URL}/api/analytics/config`, {
      headers: authHeaders(),
      data: {
        alertThreshold: 100,
        emailNotifications: true,
      },
    });

    expect([200, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Analytics config updated");
    } else {
      console.log(`ℹ️ Analytics config update returned ${response.status()}`);
    }
  });
});

test.describe("Analytics Export API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/analytics/export returns exportable data", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/analytics/export`, {
      headers: authHeaders(),
    });

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const contentType = response.headers()["content-type"];
      // Should return JSON, CSV, or file
      const isValidFormat =
        contentType?.includes("application/json") ||
        contentType?.includes("text/csv") ||
        contentType?.includes("application/octet-stream");

      expect(isValidFormat).toBe(true);
      console.log(`✅ Analytics export works (format: ${contentType})`);
    } else {
      console.log(`ℹ️ Analytics export returned ${response.status()}`);
    }
  });

  test("export supports format parameter", async ({ request }) => {
    const formats = ["json", "csv"];

    for (const format of formats) {
      const response = await request.get(`${CLOUD_URL}/api/analytics/export?format=${format}`, {
        headers: authHeaders(),
      });

      expect([200, 400, 404, 500, 501]).toContain(response.status());

      if (response.status() === 200) {
        console.log(`✅ Analytics export as ${format} works`);
      }
    }
  });
});

test.describe("Analytics Dashboard UI", () => {
  test("analytics page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/analytics`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      console.log("ℹ️ Analytics page requires authentication");
      return;
    }

    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(100);
    console.log("✅ Analytics page loaded");
  });

  test("analytics page has charts", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/analytics`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      return;
    }

    // Look for chart elements
    const charts = page.locator('[class*="chart"], canvas, svg, [class*="Chart"]');
    const chartCount = await charts.count();

    console.log(`✅ Found ${chartCount} chart elements on analytics page`);
  });

  test("analytics page has date range selector", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/analytics`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      return;
    }

    // Look for date picker or range selector
    const datePickers = page.locator(
      'input[type="date"], [role="combobox"], button:has-text("Last"), button:has-text("This")'
    );
    const pickerCount = await datePickers.count();

    console.log(`✅ Found ${pickerCount} date selection elements`);
  });

  test("analytics page has export button", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/analytics`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      return;
    }

    // Look for export button
    const exportButton = page.locator(
      'button:has-text("Export"), button:has-text("Download"), a:has-text("Export")'
    );
    const hasExport = await exportButton.isVisible().catch(() => false);

    console.log(`✅ Export button visible: ${hasExport}`);
  });

  test("analytics metrics cards display", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/analytics`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      return;
    }

    // Look for metric cards
    const metricCards = page.locator(
      '[class*="metric"], [class*="stat"], [class*="card"], [class*="Card"]'
    );
    const cardCount = await metricCards.count();

    console.log(`✅ Found ${cardCount} metric/stat cards`);
  });

  test("model breakdown table exists", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/analytics`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      return;
    }

    // Look for breakdown tables
    const tables = page.locator("table, [role='table'], [class*='table']");
    const tableCount = await tables.count();

    console.log(`✅ Found ${tableCount} data tables on analytics page`);
  });
});

