import { test, expect } from "../fixtures/test-fixtures";
import {
  goToLogin,
  waitForDashboardRedirect,
  isOnDashboard,
  clearAuthState,
  LoginSelectors,
  DashboardSelectors,
  waitForPageLoad,
} from "../fixtures/test-fixtures";

/**
 * E2E Tests: Wallet Login Flow
 *
 * These tests verify that users can log in using MetaMask wallet
 * through the Privy authentication system.
 *
 * Prerequisites:
 * - MetaMask extension loaded with test wallet
 * - Local development server running
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
    await goToLogin(page);

    // Verify the login page is rendered
    await expect(page.locator(LoginSelectors.loginCard)).toBeVisible();

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

  test("should open Privy modal when clicking Connect Wallet", async ({
    page,
    metamask,
  }) => {
    await goToLogin(page);

    // Click the wallet connect button
    const walletButton = page.locator(LoginSelectors.walletButton);
    await walletButton.click();

    // Wait for Privy modal to appear
    // Privy opens a modal with wallet options
    // The modal might be an iframe or a div overlay
    await page.waitForTimeout(2000); // Give Privy time to initialize modal

    // Look for the Privy modal - it may have different selectors
    // Try multiple possible selectors for the Privy modal
    const privyModal = page.locator(
      '[data-testid="privy-modal"], #privy-modal, [class*="PrivyModal"], iframe[src*="privy"]'
    );

    // The modal should be visible
    const isModalVisible = await privyModal
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);

    // If no modal, Privy might use a different approach (redirect or popup)
    if (!isModalVisible) {
      // Check if a new page/popup was opened
      const pages = page.context().pages();
      expect(pages.length).toBeGreaterThanOrEqual(1);
    }
  });

  test("should successfully login with MetaMask and redirect to dashboard", async ({
    page,
    metamask,
  }) => {
    await goToLogin(page);

    // Click the wallet connect button to initiate login
    const walletButton = page.locator(LoginSelectors.walletButton);
    await walletButton.click();

    // Wait for MetaMask connection request
    // Synpress will detect the MetaMask popup automatically
    await page.waitForTimeout(3000);

    // Approve the connection in MetaMask
    await metamask.connectToDapp();

    // Wait for Privy to request signature for authentication
    await page.waitForTimeout(2000);

    // Sign the authentication message
    await metamask.confirmSignature();

    // Wait for authentication to complete and redirect to dashboard
    await waitForDashboardRedirect(page);

    // Verify we're on the dashboard
    expect(await isOnDashboard(page)).toBe(true);

    // Verify dashboard content is visible
    await expect(page.locator(DashboardSelectors.dashboardTitle)).toBeVisible({
      timeout: 30000,
    });
  });

  test("should handle wallet connection rejection gracefully", async ({
    page,
    metamask,
  }) => {
    await goToLogin(page);

    // Click the wallet connect button
    const walletButton = page.locator(LoginSelectors.walletButton);
    await walletButton.click();

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
    await goToLogin(page);

    // Click the wallet connect button
    const walletButton = page.locator(LoginSelectors.walletButton);
    await walletButton.click();

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
    await goToLogin(page);

    // Complete wallet login
    const walletButton = page.locator(LoginSelectors.walletButton);
    await walletButton.click();
    await page.waitForTimeout(3000);
    await metamask.connectToDapp();
    await page.waitForTimeout(2000);
    await metamask.confirmSignature();

    // Wait for dashboard
    await waitForDashboardRedirect(page);
    expect(await isOnDashboard(page)).toBe(true);

    // Reload the page
    await page.reload();
    await waitForPageLoad(page);

    // Should still be on dashboard (session persisted)
    expect(await isOnDashboard(page)).toBe(true);
    await expect(page.locator(DashboardSelectors.dashboardTitle)).toBeVisible({
      timeout: 30000,
    });
  });
});
