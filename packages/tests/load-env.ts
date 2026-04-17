/**
 * Preload for bun test: load .env.local and .env.test so DATABASE_URL and other
 * vars are available. Run with: bun test --preload ./tests/load-env.ts ...
 */
import { config } from "dotenv";
import { resolve } from "path";
import {
  applyDatabaseUrlFallback,
  getLocalDockerDatabaseUrl,
} from "@/db/database-url";

const root = resolve(import.meta.dir, "..");
const workspaceRoot = resolve(root, "..");

for (const envPath of [
  resolve(workspaceRoot, ".env"),
  resolve(workspaceRoot, ".env.local"),
  resolve(workspaceRoot, ".env.test"),
  resolve(root, ".env"),
  resolve(root, ".env.local"),
  resolve(root, ".env.test"),
]) {
  config({ path: envPath });
}

// Keep all test execution pinned to the local app surface.
(process.env as Record<string, string | undefined>).NODE_ENV = "test";
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
