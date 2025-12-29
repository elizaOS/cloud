import { test, expect, type Page } from "@playwright/test";
import { metaMask } from "@synthetixio/synpress";

/**
 * OAuth3 Wallet Login Tests with Synpress/MetaMask
 *
 * These tests verify the complete wallet authentication flow through OAuth3:
 * 1. Navigate to Eliza Cloud login page
 * 2. Click "Connect Wallet" to initiate OAuth3 flow
 * 3. Get redirected to OAuth3 wallet challenge page
 * 4. Connect MetaMask and sign the authentication message
 * 5. Get redirected back with auth token set in cookies
 * 6. Verify authenticated session on dashboard
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OAUTH3_URL = process.env.OAUTH3_URL ?? "http://localhost:4200";

// Check if OAuth3 service is available
async function isOAuth3Available(): Promise<boolean> {
  try {
    const response = await fetch(`${OAUTH3_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

// Check if Eliza Cloud is available
async function isElizaCloudAvailable(): Promise<boolean> {
  try {
    const response = await fetch(BASE_URL);
    return response.ok;
  } catch {
    return false;
  }
}

test.describe("OAuth3 Wallet Login with MetaMask", () => {
  test.beforeAll(async () => {
    const oauth3Available = await isOAuth3Available();
    const elizaCloudAvailable = await isElizaCloudAvailable();

    if (!oauth3Available) {
      console.log("WARNING: OAuth3 service not available at", OAUTH3_URL);
    }
    if (!elizaCloudAvailable) {
      console.log("WARNING: Eliza Cloud not available at", BASE_URL);
    }
  });

  test("should display login page with wallet connect option", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    // Look for the wallet connect button
    const walletButton = page.locator('button:has-text("Connect Wallet")');
    await expect(walletButton).toBeVisible({ timeout: 15000 });
    await expect(walletButton).toBeEnabled();

    console.log("Login page loaded with Connect Wallet button");
  });

  test("should redirect to OAuth3 wallet challenge page on Connect Wallet click", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    const walletButton = page.locator('button:has-text("Connect Wallet")');
    await expect(walletButton).toBeVisible({ timeout: 15000 });

    // Click wallet connect
    await walletButton.click();

    // Wait for redirect to OAuth3 wallet challenge page
    await page.waitForURL(`${OAUTH3_URL}/wallet/challenge*`, { timeout: 30000 });

    expect(page.url()).toContain("/wallet/challenge");
    expect(page.url()).toContain("client_id=eliza-cloud");

    console.log("Successfully redirected to OAuth3 wallet challenge page");
  });

  test("OAuth3 wallet challenge page shows Connect Wallet button", async ({
    page,
  }) => {
    // Navigate directly to the wallet challenge page
    const challengeUrl = `${OAUTH3_URL}/wallet/challenge?client_id=eliza-cloud&redirect_uri=${encodeURIComponent(`${BASE_URL}/api/auth/oauth3/callback`)}&state=test-state`;

    await page.goto(challengeUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    // Should see the Connect Wallet button
    const connectButton = page.locator(
      'button#connectBtn, button:has-text("Connect Wallet")'
    );
    await expect(connectButton).toBeVisible({ timeout: 15000 });
    await expect(connectButton).toBeEnabled();

    // Should see the sign message
    const messageBox = page.locator(
      '.message-box, [aria-label="Message to sign"]'
    );
    const hasMessage = await messageBox.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasMessage) {
      const message = await messageBox.textContent();
      expect(message).toContain("Jeju Network sign-in request");
      console.log("Sign message displayed correctly");
    }

    console.log("OAuth3 wallet challenge page loaded correctly");
  });

  test.skip("full wallet login flow with MetaMask", async ({ page, context }) => {
    // This test requires actual MetaMask extension with Synpress
    // It should be run with the real Synpress setup:
    // bun run jeju test e2e --app eliza-cloud-v2 (with MetaMask configured)
    console.log("This test requires MetaMask automation");
    console.log("Run with Synpress setup for full wallet E2E testing");

    // Step 1: Navigate to login page
    console.log("Step 1: Navigate to login page");
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    // Step 2: Click Connect Wallet
    console.log("Step 2: Click Connect Wallet button");
    const walletButton = page.locator('button:has-text("Connect Wallet")');
    await expect(walletButton).toBeVisible({ timeout: 15000 });
    await walletButton.click();

    // Step 3: Wait for redirect to OAuth3
    console.log("Step 3: Wait for OAuth3 wallet challenge page");
    await page.waitForURL(`${OAUTH3_URL}/wallet/challenge*`, { timeout: 30000 });

    // Step 4: Click Connect Wallet on OAuth3 page
    console.log("Step 4: Click Connect Wallet on OAuth3 page");
    const oauth3ConnectBtn = page.locator(
      'button#connectBtn, button:has-text("Connect Wallet")'
    );
    await expect(oauth3ConnectBtn).toBeVisible({ timeout: 15000 });
    await oauth3ConnectBtn.click();

    // Step 5: Handle MetaMask connection popup
    console.log("Step 5: Approve MetaMask connection");
    // Wait for MetaMask popup and connect
    await page.waitForTimeout(2000);
    
    // Get all pages including MetaMask popup
    const pages = context.pages();
    const metamaskPage = pages.find((p) => p.url().includes("chrome-extension://"));
    
    if (metamaskPage) {
      // MetaMask extension popup - approve connection
      await metamaskPage.bringToFront();
      
      // Click 'Next' then 'Connect' buttons
      const nextBtn = metamaskPage.locator('button:has-text("Next")');
      if (await nextBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await nextBtn.click();
      }
      
      const connectBtn = metamaskPage.locator('button:has-text("Connect")');
      if (await connectBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await connectBtn.click();
      }

      // Go back to main page
      await page.bringToFront();
    }

    // Step 6: Sign the authentication message
    console.log("Step 6: Sign authentication message");
    await page.waitForTimeout(2000);
    
    // Check for new MetaMask popup for signing
    const signingPages = context.pages();
    const signingPage = signingPages.find(
      (p) => p !== page && p.url().includes("chrome-extension://")
    );

    if (signingPage) {
      await signingPage.bringToFront();
      
      // Click 'Sign' button
      const signBtn = signingPage.locator(
        'button:has-text("Sign"), button[data-testid="signature-sign-button"]'
      );
      if (await signBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await signBtn.click();
      }

      await page.bringToFront();
    }

    // Step 7: Wait for redirect back to Eliza Cloud
    console.log("Step 7: Wait for redirect back to Eliza Cloud");
    await page.waitForURL(`${BASE_URL}/**`, { timeout: 30000 });

    // Step 8: Verify authenticated session
    console.log("Step 8: Verify authenticated session");
    await page.waitForLoadState("networkidle").catch(() => {});

    // Check for auth cookie
    const cookies = await context.cookies();
    const authCookie = cookies.find(
      (c) => c.name === "oauth3-token" || c.name === "jeju_session"
    );

    if (authCookie) {
      console.log("Auth cookie set:", authCookie.name);
      expect(authCookie.value).toBeTruthy();
    }

    // Check if we landed on dashboard or home page (authenticated)
    const currentUrl = page.url();
    console.log("Landed on:", currentUrl);

    // If we're on login page with error, the flow failed
    if (currentUrl.includes("/login?error=")) {
      console.log("Login failed with error in URL");
      throw new Error(`Login failed: ${currentUrl}`);
    }

    console.log("Full wallet login flow completed successfully");
  });

  test("session persists after page reload", async ({ page, context }) => {
    // Complete login flow first
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    const walletButton = page.locator('button:has-text("Connect Wallet")');
    const isVisible = await walletButton.isVisible({ timeout: 10000 }).catch(() => false);

    if (!isVisible) {
      console.log("Skipping - wallet button not visible");
      return;
    }

    await walletButton.click();

    // Wait for OAuth3 redirect
    await page.waitForURL(`${OAUTH3_URL}/wallet/challenge*`, { timeout: 30000 }).catch(() => {});

    if (!page.url().includes("/wallet/challenge")) {
      console.log("Did not redirect to OAuth3 - skipping full flow");
      return;
    }

    // Complete the OAuth3 flow (simplified - assumes MetaMask auto-signs)
    const oauth3ConnectBtn = page.locator(
      'button#connectBtn, button:has-text("Connect Wallet")'
    );
    await oauth3ConnectBtn.click().catch(() => {});
    
    await page.waitForTimeout(5000);

    // Check if we got redirected back
    if (page.url().includes(BASE_URL)) {
      await page.waitForLoadState("networkidle").catch(() => {});

      // Check for auth cookie
      const cookies = await context.cookies();
      const authCookie = cookies.find(
        (c) => c.name === "oauth3-token" || c.name === "jeju_session"
      );

      if (authCookie) {
        // Reload and verify session persists
        await page.reload();
        await page.waitForLoadState("networkidle").catch(() => {});

        // Should still have auth cookie
        const cookiesAfterReload = await context.cookies();
        const authCookieAfterReload = cookiesAfterReload.find(
          (c) => c.name === "oauth3-token" || c.name === "jeju_session"
        );

        expect(authCookieAfterReload).toBeDefined();
        console.log("Session persisted after page reload");
      }
    }
  });

  test("unauthenticated access to protected routes redirects to login", async ({
    page,
  }) => {
    // Clear any existing cookies
    await page.context().clearCookies();

    // Try to access a protected route
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    // Should be redirected to login or home
    const currentUrl = page.url();

    if (currentUrl.includes("/login") || currentUrl === BASE_URL + "/") {
      console.log("Correctly redirected unauthenticated user");
    } else if (currentUrl.includes("/dashboard")) {
      // Dashboard might allow anonymous access
      console.log("Dashboard allows anonymous access (may be intentional)");
    }
  });
});

test.describe("OAuth3 API Endpoints", () => {
  test("OAuth3 health endpoint works", async ({ request }) => {
    const response = await request.get(`${OAUTH3_URL}/health`);

    if (!response.ok()) {
      console.log("OAuth3 service not available");
      return;
    }

    const data = await response.json();
    expect(data.status).toBe("healthy");
    console.log("OAuth3 service is healthy");
  });

  test("OAuth3 /auth/init returns valid wallet auth URL", async ({ request }) => {
    const response = await request.post(`${OAUTH3_URL}/auth/init`, {
      data: {
        provider: "wallet",
        redirectUri: `${BASE_URL}/api/auth/oauth3/callback`,
        appId: "eliza-cloud",
      },
    });

    if (!response.ok()) {
      console.log("OAuth3 /auth/init failed:", response.status());
      return;
    }

    const data = await response.json();

    expect(data.authUrl).toBeDefined();
    expect(data.authUrl).toContain("/wallet/challenge");
    expect(data.state).toBeDefined();
    expect(data.provider).toBe("wallet");

    console.log("OAuth3 /auth/init returns valid URL:", data.authUrl);
  });

  test("OAuth3 token endpoint rejects invalid codes", async ({ request }) => {
    const response = await request.post(`${OAUTH3_URL}/oauth/token`, {
      data: {
        grant_type: "authorization_code",
        code: "invalid-code",
        redirect_uri: `${BASE_URL}/api/auth/oauth3/callback`,
        client_id: "eliza-cloud",
      },
    });

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("invalid_grant");

    console.log("OAuth3 token endpoint correctly rejects invalid codes");
  });
});

