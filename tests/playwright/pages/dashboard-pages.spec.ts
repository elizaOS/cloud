import { test, expect } from "@playwright/test";
import { smokeTestPage } from "../fixtures/page-helpers";

/**
 * Dashboard Pages Smoke Tests
 *
 * Ensures every dashboard page loads without 500 errors.
 * Dashboard pages may redirect to /login for unauthenticated users,
 * but should NEVER return 500.
 */

const DASHBOARD_PAGES = [
  // Core
  "/dashboard",
  "/dashboard/chat",
  "/dashboard/build",

  // Agents & Containers
  "/dashboard/my-agents",
  "/dashboard/containers",

  // API & Development
  "/dashboard/api-keys",
  "/dashboard/api-explorer",

  // Billing & Finances
  "/dashboard/billing",
  "/dashboard/billing/success",
  "/dashboard/earnings",

  // Media
  "/dashboard/gallery",
  "/dashboard/image",
  "/dashboard/video",
  "/dashboard/voices",

  // Apps
  "/dashboard/apps",
  "/dashboard/apps/create",

  // Knowledge & MCPs
  "/dashboard/knowledge",
  "/dashboard/mcps",

  // Analytics & Account
  "/dashboard/analytics",
  "/dashboard/account",
  "/dashboard/settings",

  // Affiliates
  "/dashboard/affiliates",
] as const;

test.describe("Dashboard Pages", () => {
  for (const path of DASHBOARD_PAGES) {
    test(`${path} loads without 500`, async ({ page }) => {
      const response = await page.goto(`http://localhost:3000${path}`);
      // Dashboard pages should either render (200) or redirect to login (302)
      // but NEVER return 500
      expect(
        response?.status(),
        `${path} returned ${response?.status()}`,
      ).not.toBe(500);
      expect([200, 301, 302, 304]).toContain(response?.status() ?? 0);
    });
  }

  test.describe("Dynamic Dashboard Pages", () => {
    test("/dashboard/containers/[id] handles nonexistent ID", async ({
      page,
    }) => {
      const response = await page.goto(
        "http://localhost:3000/dashboard/containers/00000000-0000-4000-8000-000000000000",
      );
      expect(response?.status()).not.toBe(500);
    });

    test("/dashboard/containers/agents/[id] handles nonexistent ID", async ({
      page,
    }) => {
      const response = await page.goto(
        "http://localhost:3000/dashboard/containers/agents/00000000-0000-4000-8000-000000000000",
      );
      expect(response?.status()).not.toBe(500);
    });

    test("/dashboard/apps/[id] handles nonexistent ID", async ({ page }) => {
      const response = await page.goto(
        "http://localhost:3000/dashboard/apps/00000000-0000-4000-8000-000000000000",
      );
      expect(response?.status()).not.toBe(500);
    });

    test("/dashboard/invoices/[id] handles nonexistent ID", async ({
      page,
    }) => {
      const response = await page.goto(
        "http://localhost:3000/dashboard/invoices/00000000-0000-4000-8000-000000000000",
      );
      expect(response?.status()).not.toBe(500);
    });
  });
});
