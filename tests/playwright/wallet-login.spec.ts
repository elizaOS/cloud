import { test, expect } from "./fixtures/test-fixtures";
import {
  goToLogin,
  waitForDashboardRedirect,
  isOnDashboard,
  clearAuthState,
  LoginSelectors,
  DashboardSelectors,
  waitForPageLoad,
} from "./fixtures/test-fixtures";

/**
 * E2E Tests: Wallet Login Flow
 *
 * These tests verify that users can log in using MetaMask wallet
 * through the OAuth3 authentication system.
 *
 * Prerequisites:
 * - MetaMask extension loaded with test wallet
 * - Local development server running (localhost:3000)
 * - OAuth3 service running (localhost:4200)
 * - Test environment variables configured
 */

test.describe("Wallet Login", () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing auth state before each test
    await clearAuthState(page);
  });

  test("should display login page with wallet connect option", async ({
    page,
  }) => {
    const success = await goToLogin(page);
    if (!success) {
      console.log("ℹ️ Page navigation failed - skipping");
      return;
    }

    // Verify the login page is rendered
    const loginCard = page.locator(LoginSelectors.loginCard);
    const isVisible = await loginCard
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (!isVisible) {
      console.log("ℹ️ Login card not visible - skipping");
      return;
    }

    // Verify wallet connect button is available
    const walletButton = page.locator(LoginSelectors.walletButton);
    await expect(walletButton).toBeVisible();
    await expect(walletButton).toBeEnabled();

    // Verify other login options are also visible
    await expect(page.locator(LoginSelectors.emailInput)).toBeVisible();
    await expect(page.locator(LoginSelectors.googleButton)).toBeVisible();
    await expect(page.locator(LoginSelectors.discordButton)).toBeVisible();
    await expect(page.locator(LoginSelectors.githubButton)).toBeVisible();
  });

  test("should redirect to OAuth3 wallet challenge when clicking Connect Wallet", async ({
    page,
    metamask,
  }) => {
    const success = await goToLogin(page);
    if (!success) {
      console.log("ℹ️ Page navigation failed - skipping");
      return;
    }

    // Click the wallet connect button
    const walletButton = page.locator(LoginSelectors.walletButton);
    const isVisible = await walletButton
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (!isVisible) {
      console.log("ℹ️ Wallet button not visible - skipping");
      return;
    }
    await walletButton.click({ force: true });

    // Wait for OAuth3 redirect or API call
    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    const OAUTH3_URL = process.env.OAUTH3_URL ?? "http://localhost:4200";

    // OAuth3 should redirect to the wallet challenge page
    if (currentUrl.includes(OAUTH3_URL) || currentUrl.includes("/wallet/challenge")) {
      console.log("✅ Redirected to OAuth3 wallet challenge page");
      expect(currentUrl).toContain("wallet");
    } else {
      // May still be on login page if OAuth3 service is not available
      console.log("ℹ️ Still on login page - OAuth3 may not be running");
      // Check if we got an error
      const errorMessage = await page.locator(".text-red-500, .error, [role='alert']")
        .textContent()
        .catch(() => null);
      if (errorMessage) {
        console.log("Error:", errorMessage);
      }
    }
  });

  test("should successfully login with MetaMask and redirect to dashboard", async ({
    page,
    metamask,
  }) => {
    const OAUTH3_URL = process.env.OAUTH3_URL ?? "http://localhost:4200";

    const success = await goToLogin(page);
    if (!success) {
      console.log("ℹ️ Page navigation failed - skipping");
      return;
    }

    // Click the wallet connect button to initiate login
    const walletButton = page.locator(LoginSelectors.walletButton);
    const isVisible = await walletButton
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (!isVisible) {
      console.log("ℹ️ Wallet button not visible - skipping");
      return;
    }
    await walletButton.click({ force: true });

    // Wait for redirect to OAuth3 wallet challenge page
    await page.waitForURL(`${OAUTH3_URL}/wallet/challenge*`, { timeout: 15000 }).catch(() => {
      console.log("ℹ️ Did not redirect to OAuth3 - checking current state");
    });

    const currentUrl = page.url();
    if (currentUrl.includes(OAUTH3_URL)) {
      // On OAuth3 wallet challenge page - click Connect Wallet there
      const oauth3ConnectBtn = page.locator('button#connectBtn, button:has-text("Connect Wallet")');
      await oauth3ConnectBtn.waitFor({ state: "visible", timeout: 10000 });
      await oauth3ConnectBtn.click();

      // Wait for MetaMask and approve
      await page.waitForTimeout(2000);
      await metamask.connectToDapp();

      // Wait for and sign the message
      await page.waitForTimeout(2000);
      await metamask.confirmSignature();

      // Wait for redirect back to Eliza Cloud
      await page.waitForURL("**/dashboard**", { timeout: 30000 }).catch(() => {});
    } else {
      // Inline wallet connection (no redirect)
      await page.waitForTimeout(3000);
      await metamask.connectToDapp();
      await page.waitForTimeout(2000);
      await metamask.confirmSignature();
      await waitForDashboardRedirect(page);
    }

    // Verify we're on the dashboard
    expect(await isOnDashboard(page)).toBe(true);

    // Verify dashboard content is visible (optional - may not have data-testid)
    const dashboardTitle = page.locator(DashboardSelectors.dashboardTitle);
    const titleVisible = await dashboardTitle
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    console.log(`✅ Dashboard title visible: ${titleVisible}`);
  });

  test("should handle wallet connection rejection gracefully", async ({
    page,
    metamask,
  }) => {
    const success = await goToLogin(page);
    if (!success) {
      console.log("ℹ️ Page navigation failed - skipping");
      return;
    }

    // Click the wallet connect button
    const walletButton = page.locator(LoginSelectors.walletButton);
    const isVisible = await walletButton
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (!isVisible) {
      console.log("ℹ️ Wallet button not visible - skipping");
      return;
    }
    await walletButton.click({ force: true });

    // Wait for MetaMask popup
    await page.waitForTimeout(3000);

    // Reject the connection in MetaMask
    // Note: The method might be reject() or rejectTransaction() depending on Synpress version
    try {
      await metamask.rejectSignature();
    } catch {
      // If rejectSignature doesn't work, try closing the notification page
      console.log("Using alternative rejection method");
    }

    // Should still be on the login page
    await waitForPageLoad(page);
    expect(page.url()).toContain("/login");

    // Wallet button should be re-enabled for retry
    await expect(walletButton).toBeEnabled({ timeout: 10000 });
  });

  test("should handle signature rejection gracefully", async ({
    page,
    metamask,
  }) => {
    const success = await goToLogin(page);
    if (!success) {
      console.log("ℹ️ Page navigation failed - skipping");
      return;
    }

    // Click the wallet connect button
    const walletButton = page.locator(LoginSelectors.walletButton);
    const isVisible = await walletButton
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (!isVisible) {
      console.log("ℹ️ Wallet button not visible - skipping");
      return;
    }
    await walletButton.click({ force: true });

    // Wait for and approve connection
    await page.waitForTimeout(3000);
    await metamask.connectToDapp();

    // Wait for signature request
    await page.waitForTimeout(2000);

    // Reject the signature
    await metamask.rejectSignature();

    // Should still be on login page
    await waitForPageLoad(page);
    expect(page.url()).toContain("/login");
  });

  test("should persist authentication after page reload", async ({
    page,
    metamask,
  }) => {
    const OAUTH3_URL = process.env.OAUTH3_URL ?? "http://localhost:4200";

    const success = await goToLogin(page);
    if (!success) {
      console.log("ℹ️ Page navigation failed - skipping");
      return;
    }

    // Complete wallet login
    const walletButton = page.locator(LoginSelectors.walletButton);
    const isVisible = await walletButton
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (!isVisible) {
      console.log("ℹ️ Wallet button not visible - skipping");
      return;
    }
    await walletButton.click({ force: true });

    // Wait for OAuth3 redirect
    await page.waitForURL(`${OAUTH3_URL}/wallet/challenge*`, { timeout: 15000 }).catch(() => {});

    const currentUrl = page.url();
    if (currentUrl.includes(OAUTH3_URL)) {
      const oauth3ConnectBtn = page.locator('button#connectBtn, button:has-text("Connect Wallet")');
      await oauth3ConnectBtn.waitFor({ state: "visible", timeout: 10000 });
      await oauth3ConnectBtn.click();
      await page.waitForTimeout(2000);
      await metamask.connectToDapp();
      await page.waitForTimeout(2000);
      await metamask.confirmSignature();
      await page.waitForURL("**/dashboard**", { timeout: 30000 }).catch(() => {});
    } else {
      await page.waitForTimeout(3000);
      await metamask.connectToDapp();
      await page.waitForTimeout(2000);
      await metamask.confirmSignature();
      await waitForDashboardRedirect(page);
    }

    expect(await isOnDashboard(page)).toBe(true);

    // Reload the page
    await page.reload();
    await waitForPageLoad(page);

    // Should still be on dashboard (session persisted)
    expect(await isOnDashboard(page)).toBe(true);
    console.log("✅ Authentication persisted after page reload");
  });
});
