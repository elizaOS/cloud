import { defineConfig, devices } from "@playwright/test";
import path from "path";

/**
 * Playwright Configuration for E2E Tests
 *
 * Supports two modes:
 * 1. Development: Runs against `bun run dev` with longer timeouts
 * 2. CI/Production: Runs against `bun run start` with standard timeouts
 */

const isCI = !!process.env.CI;
const isProduction = process.env.NODE_ENV === "production";
const useProductionServer = isCI || isProduction;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

const CACHE_DIR = path.join(__dirname, ".cache-synpress");

const actionTimeout = useProductionServer ? 15000 : 30000;
const navigationTimeout = useProductionServer ? 30000 : 90000;
const testTimeout = useProductionServer ? 60000 : 180000;
const expectTimeout = useProductionServer ? 10000 : 20000;
const webServerTimeout = useProductionServer ? 60000 : 180000;

export default defineConfig({
  metadata: {
    mode: useProductionServer ? "Production/CI" : "Development",
    baseURL,
    actionTimeout,
    navigationTimeout,
    testTimeout,
  },

  testDir: "./playwright",
  outputDir: "./playwright/test-results",

  globalSetup: "./playwright/global.setup.ts",

  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,

  reporter: [
    ["list"],
    ["html", { outputFolder: "./playwright/test-reports/html", open: "never" }],
    ...(isCI ? ([["github"]] as const) : []),
  ],

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout,
    navigationTimeout,
    ignoreHTTPSErrors: true,
  },

  projects: [
    {
      name: "wallet-setup",
      testMatch: /wallet\.setup\.ts/,
      teardown: "cleanup",
    },
    {
      name: "chromium-metamask",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
      dependencies: ["wallet-setup"],
      testMatch: /.*wallet.*\.spec\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
      testIgnore: [
        /wallet-login\.spec\.ts$/,
        /app.*\.spec\.ts$/,
        /.*-api\.spec\.ts$/,
      ],
    },
    {
      name: "api",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
      testMatch: [/.*-api\.spec\.ts$/, /app-authenticated\.spec\.ts$/],
    },
    {
      name: "app",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
      testMatch: /app.*\.spec\.ts$/,
    },
    {
      name: "todoapp",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
      testMatch: /todoapp.*\.spec\.ts$/,
    },
    {
      name: "orgapp",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
      testMatch: /org-app.*\.spec\.ts$/,
    },
    {
      name: "cleanup",
      testMatch: /global\.teardown\.ts/,
    },
  ],

  timeout: testTimeout,
  expect: { timeout: expectTimeout },

  webServer: useProductionServer
    ? {
        command: "bun run start",
        url: baseURL,
        reuseExistingServer: true,
        timeout: webServerTimeout,
        stdout: "pipe",
        stderr: "pipe",
      }
    : {
        command: "bun run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: webServerTimeout,
        stdout: "pipe",
        stderr: "pipe",
      },
});
