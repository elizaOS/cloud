/**
 * Preload for bun test: load .env.local and .env.test so DATABASE_URL and other
 * vars are available. Run with: bun test --preload ./tests/load-env.ts ...
 */
import { config } from "dotenv";
import { resolve } from "path";
import { applyDatabaseUrlFallback, getLocalDockerDatabaseUrl } from "@/db/database-url";

const root = resolve(import.meta.dir, "..");
config({ path: resolve(root, ".env") });
config({ path: resolve(root, ".env.local") });
config({ path: resolve(root, ".env.test") });

// Keep all test execution pinned to the local app surface.
process.env.NODE_ENV = "test";
process.env.ELIZAOS_CLOUD_BASE_URL = "http://localhost:3000/api/v1";
process.env.TEST_BLOCK_ANONYMOUS = "true";

if (process.env.SKIP_DB_DEPENDENT === "1") {
  delete process.env.DATABASE_URL;
  delete process.env.TEST_DATABASE_URL;
} else {
  const shouldPreferLocalDockerDb =
    process.env.CI !== "true" && process.env.DISABLE_LOCAL_DOCKER_DB_FALLBACK !== "1";

  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ||
    (shouldPreferLocalDockerDb ? getLocalDockerDatabaseUrl(process.env) : process.env.DATABASE_URL);

  if (testDatabaseUrl) {
    process.env.TEST_DATABASE_URL = testDatabaseUrl;
    process.env.DATABASE_URL = testDatabaseUrl;
  } else {
    applyDatabaseUrlFallback(process.env);
  }
}
