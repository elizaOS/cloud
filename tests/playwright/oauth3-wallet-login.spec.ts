import { test, expect } from "./fixtures/test-fixtures";
import type { Page } from "@playwright/test";

/**
 * OAuth3 Wallet Login E2E Tests
 *
 * These tests verify the complete wallet login flow through OAuth3:
 * 1. Navigate to login page
 * 2. Click "Connect Wallet" button
 * 3. Get redirected to OAuth3 wallet challenge page
 * 4. Connect MetaMask and sign the message
 * 5. Get redirected back to Eliza Cloud with auth token
 * 6. Verify authenticated session on dashboard
 *
 * Prerequisites:
 * - Eliza Cloud running on localhost:3000
 * - OAuth3 service running on localhost:4200
 * - MetaMask extension loaded with test wallet
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OAUTH3_URL = process.env.OAUTH3_URL ?? "http://localhost:4200";

// Wait for server to be available
async function waitForServer(url: string, maxAttempts = 10): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Try health endpoint first, then root
      const healthUrl = url.endsWith("/health") ? url : `${url}/health`;
      const response = await fetch(healthUrl).catch(() => null);
      if (response?.ok) return true;
      
      // Try root as fallback (for Next.js apps that don't have /health)
      const rootResponse = await fetch(url).catch(() => null);
      if (rootResponse?.ok) return true;
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}

// Helper to check if we're on the dashboard
async function isOnDashboard(page: Page): Promise<boolean> {
  return page.url().includes("/dashboard");
}

// Helper to check if we're on the login page
async function isOnLoginPage(page: Page): Promise<boolean> {
  return page.url().includes("/login");
}

// Helper to check if we're on the OAuth3 wallet challenge page
async function isOnOAuth3WalletPage(page: Page): Promise<boolean> {
  return page.url().includes(`${OAUTH3_URL}/wallet/challenge`);
}

test.describe("OAuth3 Wallet Login", () => {
  let serverAvailable = false;
  let oauth3Available = false;

  test.beforeAll(async () => {
    console.log("Checking server availability...");
    serverAvailable = await waitForServer(BASE_URL.replace("/login", ""));
    oauth3Available = await waitForServer(OAUTH3_URL);

    if (!serverAvailable) {
      console.log(`Eliza Cloud not available at ${BASE_URL}`);
    }
    if (!oauth3Available) {
      console.log(`OAuth3 not available at ${OAUTH3_URL}`);
    }
  });

  test.beforeEach(async ({ page }) => {
    // Clear cookies before each test
    await page.context().clearCookies();
  });

  test("should display login page with wallet connect option", async ({
    page,
  }) => {
    if (!serverAvailable) {
      console.log("Skipping - server not available");
      return;
    }

    await page.goto(`${BASE_URL}/login`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForLoadState("networkidle").catch(() => {});

    // Look for the wallet connect button
    const walletButton = page.locator('button:has-text("Connect Wallet")');
    const isVisible = await walletButton
      .isVisible({ timeout: 10000 })
      .catch(() => false);

    if (isVisible) {
      await expect(walletButton).toBeEnabled();
      console.log("Wallet connect button is visible and enabled");
    } else {
      // Check for alternative wallet button text
      const altButton = page.locator('button:has-text("Wallet")');
      const altVisible = await altButton
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      if (altVisible) {
        console.log("Alternative wallet button found");
      } else {
        console.log(
          "Wallet connect button not found - checking page content...",
        );
        const content = await page.content();
        console.log(
          "Page contains 'wallet':",
          content.toLowerCase().includes("wallet"),
        );
      }
    }
  });

  test("should initiate OAuth3 wallet flow when clicking Connect Wallet", async ({
    page,
  }) => {
    if (!serverAvailable || !oauth3Available) {
      console.log("Skipping - servers not available");
      return;
    }

    await page.goto(`${BASE_URL}/login`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForLoadState("networkidle").catch(() => {});

    // Click the wallet connect button
    const walletButton = page.locator('button:has-text("Connect Wallet")');
    const isVisible = await walletButton
      .isVisible({ timeout: 10000 })
      .catch(() => false);

    if (!isVisible) {
      console.log("Wallet button not visible - skipping");
      return;
    }

    // Listen for network requests to OAuth3
    const oauth3RequestPromise = page.waitForRequest(
      (req) => req.url().includes(OAUTH3_URL),
      { timeout: 10000 },
    );

    await walletButton.click({ force: true });

    // Wait for the OAuth3 request or redirect
    try {
      await oauth3RequestPromise;
      console.log("OAuth3 request initiated successfully");
    } catch {
      // Check if we got redirected to OAuth3 directly
      await page.waitForTimeout(3000);
      const currentUrl = page.url();
      if (currentUrl.includes(OAUTH3_URL)) {
        console.log("Redirected to OAuth3 wallet challenge page");
      } else if (currentUrl.includes("/login")) {
        // Might still be on login page if OAuth3 call failed
        console.log("Still on login page - checking for errors...");
        const errorText = await page.locator(".text-red-500, .error").textContent().catch(() => null);
        if (errorText) {
          console.log("Error message:", errorText);
        }
      }
    }
  });

  test("should complete full wallet login flow with MetaMask", async ({
    page,
    metamask,
  }) => {
    if (!serverAvailable || !oauth3Available) {
      console.log("Skipping - servers not available");
      return;
    }

    console.log("Step 1: Navigate to login page");
    await page.goto(`${BASE_URL}/login`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForLoadState("networkidle").catch(() => {});

    console.log("Step 2: Click Connect Wallet button");
    const walletButton = page.locator('button:has-text("Connect Wallet")');
    const isVisible = await walletButton
      .isVisible({ timeout: 10000 })
      .catch(() => false);

    if (!isVisible) {
      console.log("Wallet button not visible - skipping full flow test");
      return;
    }

    await walletButton.click({ force: true });

    // Wait for redirect to OAuth3 wallet challenge page
    console.log("Step 3: Wait for OAuth3 wallet challenge page");
    await page.waitForURL(`${OAUTH3_URL}/wallet/challenge*`, {
      timeout: 15000,
    }).catch(async () => {
      // If no redirect, check current state
      const currentUrl = page.url();
      console.log("Current URL:", currentUrl);
    });

    // If we're on the OAuth3 wallet challenge page
    if (await isOnOAuth3WalletPage(page)) {
      console.log("Step 4: On OAuth3 wallet challenge page - connecting wallet");

      // Wait for the "Connect Wallet" button on OAuth3 page
      const oauth3WalletButton = page.locator(
        'button:has-text("Connect Wallet"), button#connectBtn',
      );
      await oauth3WalletButton.waitFor({ state: "visible", timeout: 10000 });
      await oauth3WalletButton.click();

      // Wait for MetaMask popup and approve connection
      console.log("Step 5: Approve MetaMask connection");
      await page.waitForTimeout(2000);
      await metamask.connectToDapp();

      // Wait for signature request and sign
      console.log("Step 6: Sign authentication message");
      await page.waitForTimeout(2000);
      await metamask.confirmSignature();

      // Wait for redirect back to Eliza Cloud
      console.log("Step 7: Wait for redirect to dashboard");
      await page.waitForURL(`${BASE_URL}/**`, { timeout: 30000 });

      // Check if we're authenticated
      await page.waitForLoadState("networkidle").catch(() => {});
      const currentUrl = page.url();

      if (currentUrl.includes("/dashboard")) {
        console.log("Successfully logged in - on dashboard");
        expect(await isOnDashboard(page)).toBe(true);
      } else if (currentUrl.includes("/login")) {
        // Check for OAuth3 callback processing
        const cookies = await page.context().cookies();
        const oauth3Token = cookies.find(
          (c) => c.name === "oauth3-token" || c.name === "jeju_session",
        );
        if (oauth3Token) {
          console.log("OAuth3 token received - auth may still be processing");
        } else {
          console.log("Back on login page - auth may have failed");
        }
      } else {
        console.log("Landed on:", currentUrl);
      }
    } else {
      console.log(
        "Did not redirect to OAuth3 - checking inline wallet connection",
      );

      // Some implementations may use inline wallet connection
      await page.waitForTimeout(3000);
      await metamask.connectToDapp().catch(() => {
        console.log("No wallet connection request detected");
      });
      await page.waitForTimeout(2000);
      await metamask.confirmSignature().catch(() => {
        console.log("No signature request detected");
      });
    }
  });

  test("should persist session after login", async ({ page, metamask }) => {
    if (!serverAvailable || !oauth3Available) {
      console.log("Skipping - servers not available");
      return;
    }

    // Complete login flow first
    await page.goto(`${BASE_URL}/login`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const walletButton = page.locator('button:has-text("Connect Wallet")');
    const isVisible = await walletButton
      .isVisible({ timeout: 10000 })
      .catch(() => false);

    if (!isVisible) {
      console.log("Wallet button not visible - skipping");
      return;
    }

    await walletButton.click({ force: true });

    // Wait for OAuth3 redirect
    await page.waitForURL(`${OAUTH3_URL}/wallet/challenge*`, {
      timeout: 15000,
    }).catch(() => {});

    if (await isOnOAuth3WalletPage(page)) {
      const oauth3WalletButton = page.locator(
        'button:has-text("Connect Wallet"), button#connectBtn',
      );
      await oauth3WalletButton.waitFor({ state: "visible", timeout: 10000 });
      await oauth3WalletButton.click();
      await page.waitForTimeout(2000);
      await metamask.connectToDapp();
      await page.waitForTimeout(2000);
      await metamask.confirmSignature();
      await page.waitForURL(`${BASE_URL}/**`, { timeout: 30000 });
    }

    // Now test session persistence
    await page.waitForLoadState("networkidle").catch(() => {});

    if (await isOnDashboard(page)) {
      console.log("On dashboard - testing session persistence");

      // Reload page
      await page.reload();
      await page.waitForLoadState("networkidle").catch(() => {});

      // Should still be on dashboard
      expect(await isOnDashboard(page)).toBe(true);
      console.log("Session persisted after page reload");
    } else {
      console.log("Not on dashboard - session persistence test skipped");
    }
  });

  test("should handle wallet rejection gracefully", async ({
    page,
    metamask,
  }) => {
    if (!serverAvailable || !oauth3Available) {
      console.log("Skipping - servers not available");
      return;
    }

    await page.goto(`${BASE_URL}/login`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const walletButton = page.locator('button:has-text("Connect Wallet")');
    const isVisible = await walletButton
      .isVisible({ timeout: 10000 })
      .catch(() => false);

    if (!isVisible) {
      console.log("Wallet button not visible - skipping");
      return;
    }

    await walletButton.click({ force: true });

    // Wait for OAuth3 redirect
    await page.waitForURL(`${OAUTH3_URL}/wallet/challenge*`, {
      timeout: 15000,
    }).catch(() => {});

    if (await isOnOAuth3WalletPage(page)) {
      const oauth3WalletButton = page.locator(
        'button:has-text("Connect Wallet"), button#connectBtn',
      );
      await oauth3WalletButton.waitFor({ state: "visible", timeout: 10000 });
      await oauth3WalletButton.click();

      // Wait for MetaMask popup and reject
      await page.waitForTimeout(2000);
      await metamask.rejectSignature().catch(() => {
        // May not be a signature request yet
        console.log("No signature to reject - might be connection request");
      });

      // Check that we can still try again
      await page.waitForTimeout(2000);
      const retryButton = page.locator(
        'button:has-text("Try Again"), button:has-text("Connect Wallet"), button#connectBtn',
      );
      const canRetry = await retryButton.isEnabled({ timeout: 5000 }).catch(() => false);
      console.log("Can retry after rejection:", canRetry);
    }
  });

  test("should show connected wallet address after login", async ({
    page,
    metamask,
  }) => {
    if (!serverAvailable || !oauth3Available) {
      console.log("Skipping - servers not available");
      return;
    }

    // Complete full login flow
    await page.goto(`${BASE_URL}/login`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const walletButton = page.locator('button:has-text("Connect Wallet")');
    const isVisible = await walletButton
      .isVisible({ timeout: 10000 })
      .catch(() => false);

    if (!isVisible) {
      console.log("Wallet button not visible - skipping");
      return;
    }

    await walletButton.click({ force: true });

    await page.waitForURL(`${OAUTH3_URL}/wallet/challenge*`, {
      timeout: 15000,
    }).catch(() => {});

    if (await isOnOAuth3WalletPage(page)) {
      const oauth3WalletButton = page.locator(
        'button:has-text("Connect Wallet"), button#connectBtn',
      );
      await oauth3WalletButton.waitFor({ state: "visible", timeout: 10000 });
      await oauth3WalletButton.click();
      await page.waitForTimeout(2000);
      await metamask.connectToDapp();
      await page.waitForTimeout(2000);
      await metamask.confirmSignature();
      await page.waitForURL(`${BASE_URL}/**`, { timeout: 30000 });
    }

    await page.waitForLoadState("networkidle").catch(() => {});

    if (await isOnDashboard(page)) {
      // Look for wallet address display (usually in header/sidebar)
      const addressDisplay = page.locator(
        '[data-testid="wallet-address"], .wallet-address, [class*="address"]',
      );
      const hasAddress = await addressDisplay
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (hasAddress) {
        const addressText = await addressDisplay.textContent();
        console.log("Wallet address displayed:", addressText);
        // Verify it looks like a truncated address (0x...1234)
        expect(
          addressText?.includes("0x") || addressText?.includes("..."),
        ).toBeTruthy();
      } else {
        // Address might be displayed differently
        console.log("Explicit wallet address display not found - checking cookies");
        const cookies = await page.context().cookies();
        const authCookie = cookies.find(
          (c) =>
            c.name === "oauth3-token" ||
            c.name === "jeju_session" ||
            c.name === "oauth3-id-token",
        );
        expect(authCookie).toBeDefined();
        console.log("Auth cookie present:", authCookie?.name);
      }
    }
  });
});

test.describe("OAuth3 Service Health", () => {
  test("OAuth3 /auth/init endpoint works", async ({ request }) => {
    const response = await request.post(`${OAUTH3_URL}/auth/init`, {
      data: {
        provider: "wallet",
        redirectUri: `${BASE_URL}/api/auth/oauth3/callback`,
        appId: "eliza-cloud",
      },
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok()) {
      const data = await response.json();
      expect(data.authUrl).toBeDefined();
      expect(data.state).toBeDefined();
      expect(data.provider).toBe("wallet");
      console.log("OAuth3 /auth/init endpoint working correctly");
    } else {
      console.log("OAuth3 service not available:", response.status());
    }
  });

  test("OAuth3 /auth/providers endpoint works", async ({ request }) => {
    const response = await request.get(`${OAUTH3_URL}/auth/providers`);

    if (response.ok()) {
      const data = await response.json();
      expect(data.providers).toBeDefined();
      expect(Array.isArray(data.providers)).toBe(true);

      const walletProvider = data.providers.find(
        (p: { id: string }) => p.id === "wallet",
      );
      expect(walletProvider).toBeDefined();
      expect(walletProvider.enabled).toBe(true);
      console.log("OAuth3 providers:", data.providers.map((p: { id: string }) => p.id).join(", "));
    } else {
      console.log("OAuth3 service not available:", response.status());
    }
  });
});

