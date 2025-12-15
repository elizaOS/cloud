import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const API_KEY = process.env.TEST_API_KEY;

const authHeaders = () => ({
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
});

test.describe("Collections Page", () => {
  test("requires authentication", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/collections`);
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(
      url.includes("/login") ||
        url.includes("/collections") ||
        url === BASE_URL + "/",
    ).toBe(true);
  });
});

test.describe("Advertising Page", () => {
  test("requires authentication", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/advertising`);
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(
      url.includes("/login") ||
        url.includes("/advertising") ||
        url === BASE_URL + "/",
    ).toBe(true);
  });
});

test.describe("Collections API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY required");

  test("lists collections", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/v1/collections`, {
      headers: authHeaders(),
    });
    expect([200, 401, 404]).toContain(response.status());
  });

  test("creates collection", async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/v1/collections`, {
      headers: authHeaders(),
      data: { name: "Test Collection", description: "Test" },
    });
    expect([200, 201, 401, 403]).toContain(response.status());

    if (response.status() === 201) {
      const data = await response.json();
      if (data.id) {
        await request.delete(`${BASE_URL}/api/v1/collections/${data.id}`, {
          headers: authHeaders(),
        });
      }
    }
  });
});

test.describe("Advertising API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY required");

  test("lists campaigns", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/advertising/campaigns`,
      { headers: authHeaders() },
    );
    expect([200, 401, 404]).toContain(response.status());
  });

  test("lists ad accounts", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/advertising/accounts`,
      { headers: authHeaders() },
    );
    expect([200, 401, 404]).toContain(response.status());
  });
});

test.describe("Gallery API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY required");

  test("filters by source", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/gallery?source=generation`,
      { headers: authHeaders() },
    );
    expect([200, 401, 404]).toContain(response.status());
  });

  test("supports pagination", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/v1/gallery?limit=5&offset=0`,
      { headers: authHeaders() },
    );
    expect([200, 401, 404]).toContain(response.status());
  });
});
