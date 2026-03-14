import { expect, test } from "@playwright/test";

/**
 * Admin Pages Smoke Tests
 *
 * Admin pages may require special auth — tests just verify they don't crash.
 */

const ADMIN_PAGES = [
  "/dashboard/admin",
  "/dashboard/admin/metrics",
  "/dashboard/admin/infrastructure",
  "/dashboard/admin/redemptions",
] as const;

test.describe("Admin Pages", () => {
  for (const path of ADMIN_PAGES) {
    test(`${path} loads without 500`, async ({ page }) => {
      const response = await page.goto(`http://localhost:3000${path}`);
      // Admin pages redirect to login or show forbidden — but never 500
      expect(response?.status(), `${path} returned ${response?.status()}`).not.toBe(500);
    });
  }
});
