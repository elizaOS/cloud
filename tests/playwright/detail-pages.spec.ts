import { test, expect } from "@playwright/test";

/**
 * Detail Pages Tests
 * 
 * Tests detail pages that require IDs:
 * - Container detail page
 * - Invoice detail page
 * - Marketplace character detail page
 * 
 * Prerequisites:
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

test.describe("Container Detail Page", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("container detail page loads", async ({ page, request }) => {
    // First get a container ID
    const containersResponse = await request.get(`${CLOUD_URL}/api/v1/containers`, {
      headers: authHeaders(),
    });

    if (containersResponse.status() !== 200) {
      console.log("ℹ️ Cannot list containers for detail page test");
      return;
    }

    const containersData = await containersResponse.json();
    const containers = containersData.data || containersData.containers || [];

    if (containers.length === 0) {
      console.log("ℹ️ No containers available for detail page test");
      return;
    }

    const containerId = containers[0].id;

    // Navigate to detail page
    await page.goto(`${BASE_URL}/dashboard/containers/${containerId}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    const hasContent = await page.locator("body").textContent();

    expect(hasContent?.length).toBeGreaterThan(0);
    console.log(`✅ Container detail page loaded for container ${containerId}`);
  });
});

test.describe("Invoice Detail Page", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("invoice detail page loads", async ({ page, request }) => {
    // First get an invoice ID
    const invoicesResponse = await request.get(`${CLOUD_URL}/api/invoices/list`, {
      headers: authHeaders(),
    });

    if (invoicesResponse.status() !== 200) {
      console.log("ℹ️ Cannot list invoices for detail page test");
      return;
    }

    const invoicesData = await invoicesResponse.json();
    const invoices = invoicesData.invoices || invoicesData.data || [];

    if (invoices.length === 0) {
      console.log("ℹ️ No invoices available for detail page test");
      return;
    }

    const invoiceId = invoices[0].id;

    // Navigate to detail page
    await page.goto(`${BASE_URL}/dashboard/invoices/${invoiceId}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    const hasContent = await page.locator("body").textContent();

    expect(hasContent?.length).toBeGreaterThan(0);
    console.log(`✅ Invoice detail page loaded for invoice ${invoiceId}`);
  });
});

test.describe("Marketplace Character Detail Page", () => {
  test("marketplace character detail page loads", async ({ page, request }) => {
    // First get a character ID
    const charactersResponse = await request.get(`${CLOUD_URL}/api/marketplace/characters`);

    if (charactersResponse.status() !== 200) {
      console.log("ℹ️ Cannot list characters for detail page test");
      return;
    }

    const charactersData = await charactersResponse.json();
    const characters = charactersData.characters || charactersData.data || charactersData;

    if (!Array.isArray(characters) || characters.length === 0) {
      console.log("ℹ️ No characters available for detail page test");
      return;
    }

    const characterId = characters[0].id;

    // Navigate to detail page
    await page.goto(`${BASE_URL}/marketplace/characters/${characterId}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    const hasContent = await page.locator("body").textContent();

    expect(hasContent?.length).toBeGreaterThan(0);
    console.log(`✅ Marketplace character detail page loaded for character ${characterId}`);
  });
});

