import { defineConfig } from "@playwright/test";

const PORT = 3333;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/playwright",
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: BASE_URL,
    headless: true,
  },
  webServer: {
    command: "bun run dev:local",
    url: `${BASE_URL}/api/health`,
    timeout: 120_000,
    reuseExistingServer: true,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(PORT),
    },
  },
});
