import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/security/**/*.test.ts",
      "tests/integration/payout-*.test.ts",
      "tests/integration/agent-*.test.ts",
    ],
    exclude: [
      "**/node_modules/**",
      "tests/integration/a2a-protocol.test.ts",
      "tests/integration/mcp-protocol.test.ts",
      "tests/e2e/**",
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: "forks",
    retry: process.env.CI ? 2 : 0,
    reporters: process.env.CI ? ["default", "github-actions"] : ["default"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["lib/**/*.ts"],
      exclude: ["**/*.d.ts", "**/*.test.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
