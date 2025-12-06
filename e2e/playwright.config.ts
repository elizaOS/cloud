import { defineConfig, devices } from "@playwright/test";
import path from "path";

// Base URL for tests
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// Cache directory for wallet setups
const CACHE_DIR = path.join(__dirname, ".cache-synpress");

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",

  // Run tests in files in parallel
  fullyParallel: false, // Disabled for wallet tests to avoid conflicts

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests for wallet testing
  workers: 1,

  // Reporter to use
  reporter: [["list"], ...(process.env.CI ? ([["github"]] as const) : [])],

  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL,

    // Collect trace when retrying the failed test
    trace: "on-first-retry",

    // Take screenshot on failure
    screenshot: "only-on-failure",

    // Record video on failure
    video: "retain-on-failure",

    // Timeout for each action
    actionTimeout: 30000,

    // Navigation timeout
    navigationTimeout: 60000,
  },

  // Configure projects for major browsers
  projects: [
    // Wallet setup project - runs before all wallet tests
    {
      name: "wallet-setup",
      testMatch: /wallet\.setup\.ts/,
      teardown: "cleanup",
    },

    // Chromium tests with MetaMask extension
    {
      name: "chromium-metamask",
      use: {
        ...devices["Desktop Chrome"],
        // Use a consistent viewport for wallet tests
        viewport: { width: 1280, height: 720 },
      },
      dependencies: ["wallet-setup"],
      testMatch: /.*wallet.*\.spec\.ts/,
    },

    // Standard Chromium tests (no extension) for social login and local wallet tests
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
      // Only ignore the full wallet test (requires MetaMask), allow local wallet test
      testIgnore: [/wallet-login\.spec\.ts$/, /miniapp.*\.spec\.ts$/],
    },

    // Miniapp integration tests
    {
      name: "miniapp",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
      testMatch: /miniapp.*\.spec\.ts$/,
    },

    // Cleanup project
    {
      name: "cleanup",
      testMatch: /global\.teardown\.ts/,
    },
  ],

  // Global timeout for tests
  timeout: 120000,

  // Expect timeout
  expect: {
    timeout: 15000,
  },

  // Run your local dev server before starting the tests
  webServer: {
    command: "bun run dev",
    url: baseURL,
    reuseExistingServer: true, // Always reuse existing server if running
    timeout: 120000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
