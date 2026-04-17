import { expect, type Page } from "@playwright/test";

export async function smokeTestPage(page: Page, path: string): Promise<void> {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `unexpected status for ${path}`).not.toBe(500);
  await expect(page.locator("html")).toBeAttached();
  await expect
    .poll(() => page.evaluate(() => document.readyState))
    .toMatch(/interactive|complete/);
}

export async function strictSmokeTestPage(
  page: Page,
  path: string,
): Promise<void> {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error);
  });

  await smokeTestPage(page, path);
  expect(pageErrors).toHaveLength(0);
}
