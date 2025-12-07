import { defineConfig, devices } from "@playwright/test";
import path from "path";

/**
 * Playwright Configuration
 *
 * Supports two modes:
 * 1. Development: Runs against `bun run dev` with longer timeouts for page compilation
 * 2. CI/Production: Runs against `bun run start` (pre-built) with standard timeouts
 *
 * Page warmup is handled by global.setup.ts to pre-compile pages before tests run.
 */

// Environment detection
const isCI = !!process.env.CI;
const isProduction = process.env.NODE_ENV === "production";
const useProductionServer = isCI || isProduction;

// Base URL for tests
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// Cache directory for wallet setups
const CACHE_DIR = path.join(__dirname, ".cache-synpress");

// Timeouts - longer for dev mode (page compilation), shorter for CI
const actionTimeout = useProductionServer ? 15000 : 30000;
const navigationTimeout = useProductionServer ? 30000 : 90000;
const testTimeout = useProductionServer ? 60000 : 180000;
const expectTimeout = useProductionServer ? 10000 : 20000;
const webServerTimeout = useProductionServer ? 60000 : 180000;

export default defineConfig({
  // Log config at startup (printed by global setup)
  metadata: {
    mode: useProductionServer ? "Production/CI" : "Development",
    baseURL,
    actionTimeout,
    navigationTimeout,
    testTimeout,
  },

  testDir: "./tests",
  outputDir: "./test-results",

  // Global setup - warms up pages before tests run
  globalSetup: "./global.setup.ts",

  // Run tests in files in parallel
  fullyParallel: false, // Disabled for wallet tests to avoid conflicts

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: isCI,

  // Retry on CI only
  retries: isCI ? 2 : 0,

  // Opt out of parallel tests for wallet testing
  workers: 1,

  // Reporter to use
  reporter: [
    ["list"],
    ["html", { outputFolder: "./test-reports/html", open: "never" }],
    ...(isCI ? ([["github"]] as const) : []),
  ],

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
    actionTimeout,

    // Navigation timeout
    navigationTimeout,

    // Ignore HTTPS errors (for local dev)
    ignoreHTTPSErrors: true,
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
      // Only ignore the full wallet test (requires MetaMask), miniapp tests, and API tests
      testIgnore: [
        /wallet-login\.spec\.ts$/,
        /miniapp.*\.spec\.ts$/,
        /.*-api\.spec\.ts$/,
      ],
    },

    // API integration tests (apps, miniapp authenticated, etc.)
    {
      name: "api",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
      testMatch: [/.*-api\.spec\.ts$/, /miniapp-authenticated\.spec\.ts$/],
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
  timeout: testTimeout,

  // Expect timeout
  expect: {
    timeout: expectTimeout,
  },

  // Web server configuration
  webServer: useProductionServer
    ? {
        // Production/CI: Use pre-built server
        command: "bun run start",
        url: baseURL,
        reuseExistingServer: true,
        timeout: webServerTimeout,
        stdout: "pipe",
        stderr: "pipe",
      }
    : {
        // Development: Use dev server with turbopack
        command: "bun run dev",
        url: baseURL,
        reuseExistingServer: true, // Important: reuse existing dev server if running
        timeout: webServerTimeout,
        stdout: "pipe",
        stderr: "pipe",
      },
});
