import { defineConfig, devices } from "@playwright/test";
import { synpressFixtures } from "@synthetixio/synpress";
import path from "path";

/**
 * Synpress Configuration for Eliza Cloud Wallet E2E Tests
 *
 * Uses MetaMask automation for testing wallet login flows via OAuth3.
 */

const isCI = !!process.env.CI;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OAUTH3_URL = process.env.OAUTH3_URL ?? "http://localhost:4200";

export default defineConfig({
  testDir: "./tests/wallet",
  outputDir: "./test-results/synpress",

  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,

  reporter: [
    ["list"],
    ["html", { outputFolder: "./test-results/synpress-reports", open: "never" }],
  ],

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 30000,
    navigationTimeout: 60000,
  },

  projects: [
    {
      name: "wallet-setup",
      testMatch: /wallet-setup\.ts/,
    },
    {
      name: "oauth3-wallet-tests",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
      dependencies: ["wallet-setup"],
      testMatch: /.*\.spec\.ts/,
    },
  ],

  timeout: 120000,
  expect: { timeout: 20000 },

  webServer: {
    command: "bun run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180000,
    stdout: "pipe",
    stderr: "pipe",
  },
});

