import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright Test Configuration
 * 
 * Run tests with: bunx playwright test
 * Run specific file: bunx playwright test tests/playwright/hero-chat-redirect.spec.ts
 * Run with UI: bunx playwright test --ui
 */
export default defineConfig({
  testDir: "./tests/playwright",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Can add more browsers if needed
    // {
    //   name: "firefox",
    //   use: { ...devices["Desktop Firefox"] },
    // },
    // {
    //   name: "webkit",
    //   use: { ...devices["Desktop Safari"] },
    // },
  ],

  // Start dev server before running tests (optional - uncomment if needed)
  // webServer: {
  //   command: "bun run dev",
  //   url: "http://localhost:3000",
  //   reuseExistingServer: !process.env.CI,
  // },
});
