import { test as setup } from "@playwright/test";

/**
 * Wallet Setup for Synpress Tests
 *
 * This setup file prepares MetaMask for the OAuth3 wallet login tests.
 * It's run once before the wallet tests to ensure the extension is ready.
 */

setup("setup MetaMask wallet", async ({ page }) => {
  // This setup is handled by Synpress's built-in MetaMask fixture
  // The test runner will automatically:
  // 1. Load MetaMask extension
  // 2. Create/import a test wallet
  // 3. Make it available to subsequent tests

  console.log("MetaMask wallet setup initiated");
  console.log("Test wallet will be available for OAuth3 login tests");
  
  // Navigate to a blank page to ensure the browser context is ready
  await page.goto("about:blank");
});

