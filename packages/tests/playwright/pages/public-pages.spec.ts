// @ts-nocheck — type errors from @elizaos/core version mismatch
import { expect, test } from "@playwright/test";
import { smokeTestPage, strictSmokeTestPage } from "../fixtures/page-helpers";

/**
 * Public Pages Smoke Tests
 *
 * Ensures every public (unauthenticated) page loads without errors.
 * These pages should always return 200 and render without crashing.
 */

test.describe("Public Pages", () => {
  test.describe("Landing & Marketing", () => {
    test("/ (landing page) loads successfully", async ({ page }) => {
      await smokeTestPage(page, "/");
    });

    test("/login loads successfully", async ({ page }) => {
      await smokeTestPage(page, "/login");
    });

    test("/login has no critical JS errors", async ({ page }) => {
      await strictSmokeTestPage(page, "/login");
    });

    test("/terms-of-service loads successfully", async ({ page }) => {
      await smokeTestPage(page, "/terms-of-service");
    });
  });

  test.describe("Blog", () => {
    test("/blog loads successfully", async ({ page }) => {
      await smokeTestPage(page, "/blog");
    });

    // Blog slug pages depend on content existing — just verify no 500
    test("/blog/[slug] handles missing slug gracefully", async ({ page }) => {
      const response = await page.goto(
        "http://localhost:3000/blog/nonexistent-post",
      );
      expect(response?.status()).not.toBe(500);
    });
  });

  test.describe("Documentation", () => {
    test("/docs loads successfully", async ({ page }) => {
      await smokeTestPage(page, "/docs");
    });
  });

  test.describe("Auth Pages", () => {
    test("/auth/success loads successfully", async ({ page }) => {
      await smokeTestPage(page, "/auth/success");
    });

    test("/auth/error loads successfully", async ({ page }) => {
      await smokeTestPage(page, "/auth/error");
    });

    test("/auth/cli-login loads successfully", async ({ page }) => {
      await smokeTestPage(page, "/auth/cli-login");
    });
  });

  test.describe("Public Chat", () => {
    // Chat with a known characterId — should load even if character doesn't exist
    test("/chat/[characterId] handles nonexistent character", async ({
      page,
    }) => {
      const response = await page.goto(
        "http://localhost:3000/chat/00000000-0000-4000-8000-000000000000",
        { waitUntil: "domcontentloaded" },
      );
      await expect(page.locator("body")).toContainText(
        "This page could not be found.",
      );
      expect(response?.status()).not.toBe(500);
      expect([200, 304, 404]).toContain(response?.status() ?? 0);
    });
  });

  test.describe("OAuth & App Auth", () => {
    test("/app-auth/authorize loads without crashing", async ({ page }) => {
      const response = await page.goto(
        "http://localhost:3000/app-auth/authorize",
      );
      expect(response?.status()).not.toBe(500);
    });
  });

  test.describe("Payment & Invite", () => {
    test("/payment/success loads successfully", async ({ page }) => {
      await smokeTestPage(page, "/payment/success");
    });

    test("/invite/accept loads with test token", async ({ page }) => {
      const response = await page.goto(
        "http://localhost:3000/invite/accept?token=test-token",
      );
      expect(response?.status()).not.toBe(500);
      expect([200, 304]).toContain(response?.status() ?? 0);
    });
  });

  test.describe("Sandbox Proxy", () => {
    test("/sandbox-proxy loads without crashing", async ({ page }) => {
      const response = await page.goto("http://localhost:3000/sandbox-proxy");
      expect(response?.status()).not.toBe(500);
    });
  });
});
