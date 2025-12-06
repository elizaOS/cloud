import { test as base, expect, type Page } from "@playwright/test";
import { metaMaskFixtures, MetaMask } from "@synthetixio/synpress/playwright";
import walletSetup from "../wallet-setup/wallet.setup";

/**
 * Test fixtures for E2E testing
 *
 * Provides common utilities and page objects for tests:
 * - MetaMask wallet automation via Synpress fixtures
 * - Page navigation helpers
 * - Authentication state management
 */

// Create test with MetaMask fixtures using our wallet setup
export const test = metaMaskFixtures(walletSetup, 0);

export { expect };

// Type for the MetaMask fixture
export type { MetaMask };

/**
 * Helper functions for common test operations
 */

/**
 * Wait for the page to be fully loaded
 */
export async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.waitForLoadState("domcontentloaded");
}

/**
 * Wait for Privy to be ready
 * Privy shows a loading state until it's initialized
 */
export async function waitForPrivyReady(page: Page): Promise<void> {
  // Wait for any loading spinners to disappear
  const loadingSpinner = page.locator('[data-testid="loading-spinner"]');
  if (await loadingSpinner.isVisible({ timeout: 1000 }).catch(() => false)) {
    await loadingSpinner.waitFor({ state: "hidden", timeout: 30000 });
  }

  // Alternative: wait for the login form to be visible
  await page
    .waitForSelector('[data-testid="login-form"]', { timeout: 30000 })
    .catch(() => {
      // If login form not found, we might be on a different page
    });
}

/**
 * Check if user is on the dashboard
 */
export async function isOnDashboard(page: Page): Promise<boolean> {
  return page.url().includes("/dashboard");
}

/**
 * Navigate to login page
 */
export async function goToLogin(page: Page): Promise<void> {
  await page.goto("/login");
  await waitForPageLoad(page);
  await waitForPrivyReady(page);
}

/**
 * Navigate to dashboard
 */
export async function goToDashboard(page: Page): Promise<void> {
  await page.goto("/dashboard");
  await waitForPageLoad(page);
}

/**
 * Get the current auth state from cookies/localStorage
 */
export async function getAuthState(page: Page): Promise<{
  isAuthenticated: boolean;
  hasPrivyToken: boolean;
}> {
  const cookies = await page.context().cookies();
  const privyToken = cookies.find((c) => c.name === "privy-token");

  return {
    isAuthenticated: !!privyToken,
    hasPrivyToken: !!privyToken,
  };
}

/**
 * Clear authentication state
 */
export async function clearAuthState(page: Page): Promise<void> {
  const context = page.context();
  await context.clearCookies();
  // Note: localStorage/sessionStorage can only be cleared after navigating to the page
  // So we skip this step in beforeEach - cookies are sufficient for auth state
}

/**
 * Wait for redirect to dashboard after login
 */
export async function waitForDashboardRedirect(
  page: Page,
  timeout = 60000,
): Promise<void> {
  await page.waitForURL("**/dashboard**", { timeout });
  await waitForPageLoad(page);
}

/**
 * Selectors for login page elements
 * Using text-based and role-based selectors for robustness
 */
export const LoginSelectors = {
  // Main containers
  loginPage: "body",
  loginForm: "form",
  loginCard: "form",
  loadingSpinner: ".animate-spin",

  // Email login
  emailInput: 'input[type="email"], input[placeholder*="example.com"]',
  sendCodeButton: 'button:has-text("Continue with Email")',
  codeInput: 'input[placeholder="000000"]',
  verifyCodeButton: 'button:has-text("Verify")',
  resendCodeButton: 'button:has-text("Resend Code")',
  changeEmailButton: 'button:has-text("Change email")',

  // OAuth buttons
  googleButton: 'button:has-text("Google")',
  discordButton: 'button:has-text("Discord")',
  githubButton: 'button:has-text("GitHub")',

  // Wallet connect
  walletButton: 'button:has-text("Connect Wallet")',

  // Privy modal (when using login() method)
  privyModal: '[class*="privy"], [id*="privy"], iframe[src*="privy"]',
  privyWalletOption: '[class*="privy"] button:has-text("Wallet")',
  privyMetamaskOption: '[class*="privy"] button:has-text("MetaMask")',

  // Success/redirect states
  signingInMessage: "text=Signing you in",
  redirectingMessage: "text=Taking you to your dashboard",
} as const;

/**
 * Dashboard selectors
 */
export const DashboardSelectors = {
  // Main layout
  sidebar: '[data-testid="sidebar"]',
  header: '[data-testid="header"]',
  mainContent: '[data-testid="main-content"]',

  // Dashboard page
  dashboardTitle: '[data-testid="dashboard-title"]',
  overviewSection: '[data-testid="overview-section"]',
  agentsSection: '[data-testid="agents-section"]',
  containersSection: '[data-testid="containers-section"]',

  // User info
  userAvatar: '[data-testid="user-avatar"]',
  userName: '[data-testid="user-name"]',
} as const;
