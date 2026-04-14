import type { Locator, Page } from "@playwright/test";
import { authenticateBrowserContext, expect, hasApiKey, test } from "../fixtures/auth.fixture";

async function waitForFirstVisible(locators: Locator[], timeout = 10_000): Promise<void> {
  await Promise.any(
    locators.map(async (locator) => {
      await locator.waitFor({ state: "visible", timeout });
    }),
  );
}

async function expectInstancesPageContent(page: Page): Promise<void> {
  await expect(page.getByRole("main").getByRole("heading", { name: "Instances" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New Agent" })).toBeVisible();

  await waitForFirstVisible(
    [
      page.getByPlaceholder("Search agents…"),
      page.getByText("No agents yet"),
      page.getByRole("columnheader", { name: /agent/i }),
      page.getByRole("link", { name: /Unnamed Agent/i }),
    ],
    15_000,
  );
}

test.describe("Milady agent lifecycle", () => {
  test.skip(() => !hasApiKey(), "TEST_API_KEY environment variable required");

  test.beforeEach(async ({ page, request, baseURL }) => {
    await authenticateBrowserContext(request, page.context(), baseURL);
  });

  test("instances dashboard renders an authenticated Milady session", async ({ page, baseURL }) => {
    const baseUrl = baseURL ?? "http://localhost:3000";
    const response = await page.goto(`${baseUrl}/dashboard/milady`);
    expect(response?.status()).toBe(200);
    expect(page.url()).toBe(`${baseUrl}/dashboard/milady`);

    await expectInstancesPageContent(page);
  });

  test("authenticated dashboard navigation stays inside Milady and agent surfaces", async ({
    page,
    baseURL,
  }) => {
    const baseUrl = baseURL ?? "http://localhost:3000";
    const miladyResponse = await page.goto(`${baseUrl}/dashboard/milady`);
    expect(miladyResponse?.status()).toBe(200);
    await expectInstancesPageContent(page);

    const agentsResponse = await page.goto(`${baseUrl}/dashboard/my-agents`);
    expect(agentsResponse?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /My Agents/i })).toBeVisible();
    expect(page.url()).toBe(`${baseUrl}/dashboard/my-agents`);

    const returnResponse = await page.goto(`${baseUrl}/dashboard/milady`);
    expect(returnResponse?.status()).toBe(200);
    await expectInstancesPageContent(page);
  });

  test("Milady agent detail route fails gracefully for unknown agents", async ({
    page,
    baseURL,
  }) => {
    const baseUrl = baseURL ?? "http://localhost:3000";
    const response = await page.goto(
      `${baseUrl}/dashboard/milady/agents/00000000-0000-4000-8000-000000000000`,
    );

    expect(response?.status(), `unexpected status for ${page.url()}`).not.toBe(500);
    expect(page.url()).not.toContain("/login");
  });
});
