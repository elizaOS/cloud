import { defineConfig } from "@playwright/test";

const configuredPort = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? "3000", 10);
const PORT = Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : 3000;
const BASE_URL = `http://localhost:${PORT}`;
const PLAYWRIGHT_WORKERS = Number.parseInt(process.env.PLAYWRIGHT_WORKERS ?? "1", 10);

export default defineConfig({
  testDir: "./packages/tests/playwright",
  globalSetup: "./packages/tests/playwright/global-setup.ts",
  timeout: 30_000,
  fullyParallel: false,
  workers: Number.isFinite(PLAYWRIGHT_WORKERS) && PLAYWRIGHT_WORKERS > 0 ? PLAYWRIGHT_WORKERS : 1,
  use: {
    baseURL: BASE_URL,
    headless: true,
  },
  webServer: {
    // Use a production build for e2e: Next dev recompilation under route fan-out
    // causes intermittent timeouts and aborted navigations that do not reproduce
    // against the real deployed runtime.
    command: "bun run build && NEXT_DIST_DIR=.next-build bun run start",
    url: `${BASE_URL}/api/health`,
    // Cold production builds can take close to five minutes in this repo.
    // Leave headroom so Playwright waits for the server instead of failing
    // before `next start` can report readiness.
    timeout: 600_000,
    reuseExistingServer: true,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      REDIS_RATE_LIMITING: "true",
      PLAYWRIGHT_TEST_AUTH: process.env.PLAYWRIGHT_TEST_AUTH ?? "true",
      PLAYWRIGHT_TEST_AUTH_SECRET:
        process.env.PLAYWRIGHT_TEST_AUTH_SECRET ?? "playwright-local-auth-secret",
    },
  },
});
