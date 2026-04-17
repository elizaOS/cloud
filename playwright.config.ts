const { defineConfig } = require("@playwright/test");
const { config: loadEnvFile } = require("dotenv");
const {
  applyDatabaseUrlFallback,
  getLocalDockerDatabaseUrl,
} = require("./packages/db/database-url");

for (const envPath of [
  `${__dirname}/.env`,
  `${__dirname}/.env.local`,
  `${__dirname}/.env.test`,
  `${__dirname}/packages/tests/.env`,
  `${__dirname}/packages/tests/.env.local`,
  `${__dirname}/packages/tests/.env.test`,
]) {
  loadEnvFile({ path: envPath });
}

process.env.NODE_ENV = "test";
process.env.ELIZAOS_CLOUD_BASE_URL = "http://localhost:3000/api/v1";
process.env.TEST_BLOCK_ANONYMOUS = "true";

if (process.env.SKIP_DB_DEPENDENT === "1") {
  delete process.env.DATABASE_URL;
  delete process.env.TEST_DATABASE_URL;
} else {
  const shouldPreferLocalDockerDb =
    process.env.CI !== "true" &&
    process.env.DISABLE_LOCAL_DOCKER_DB_FALLBACK !== "1";
  const localDockerDatabaseUrl = getLocalDockerDatabaseUrl({
    ...process.env,
    LOCAL_DOCKER_DB_HOST: process.env.LOCAL_DOCKER_DB_HOST || "localhost",
  });
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ||
    (shouldPreferLocalDockerDb
      ? localDockerDatabaseUrl
      : process.env.DATABASE_URL);

  if (testDatabaseUrl) {
    process.env.TEST_DATABASE_URL = testDatabaseUrl;
    process.env.DATABASE_URL = testDatabaseUrl;
  } else {
    applyDatabaseUrlFallback(process.env);
  }
}

const configuredPort = Number.parseInt(
  process.env.PLAYWRIGHT_PORT ?? "3000",
  10,
);
const PORT =
  Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : 3000;
const BASE_URL = `http://localhost:${PORT}`;
const PLAYWRIGHT_WORKERS = Number.parseInt(
  process.env.PLAYWRIGHT_WORKERS ?? "1",
  10,
);

module.exports = defineConfig({
  testDir: "./packages/tests/playwright",
  globalSetup: "./packages/tests/playwright/global-setup.cjs",
  timeout: 30_000,
  fullyParallel: false,
  workers:
    Number.isFinite(PLAYWRIGHT_WORKERS) && PLAYWRIGHT_WORKERS > 0
      ? PLAYWRIGHT_WORKERS
      : 1,
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
      NEXT_PUBLIC_PLAYWRIGHT_TEST_AUTH:
        process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST_AUTH ?? "true",
      PLAYWRIGHT_TEST_AUTH_SECRET:
        process.env.PLAYWRIGHT_TEST_AUTH_SECRET ??
        "playwright-local-auth-secret",
    },
  },
});
