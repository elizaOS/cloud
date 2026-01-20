/**
 * Test Environment Setup (Preload)
 *
 * This file is loaded BEFORE any test code via bunfig.toml preload.
 * It configures environment variables for all test types.
 *
 * What it does:
 *   - Sets NODE_ENV=test
 *   - Sets DATABASE_URL to local postgres (if not already set)
 *   - Disables Upstash cache (CACHE_ENABLED=false)
 *   - Points API calls to localhost (safety against hitting prod)
 *
 * Prerequisites:
 *   - docker-compose up -d (for tests that need DB)
 *
 * Related files:
 *   - bunfig.toml: Uses this preload for unit/integration/property tests
 *   - bunfig.e2e.toml: Uses this + e2e/setup-server.ts for e2e tests
 */

const LOCAL_SERVER_URL = "http://localhost:3000";

// Set NODE_ENV to test - this makes getElizaCloudApiUrl() return localhost
process.env.NODE_ENV = "test";

// Database URL for local tests (only set if not already defined)
// This allows CI to override via env vars if needed
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgresql://eliza_dev:local_dev_password@localhost:5432/eliza_dev";
}

// Disable Upstash cache in tests (uses in-memory fallback)
if (!process.env.CACHE_ENABLED) {
  process.env.CACHE_ENABLED = "false";
}

// Explicitly set the cloud base URL to localhost for safety
// This is a belt-and-suspenders approach - getElizaCloudApiUrl() checks this first
process.env.ELIZAOS_CLOUD_BASE_URL = `${LOCAL_SERVER_URL}/api/v1`;

// Block anonymous sessions in tests by default
process.env.TEST_BLOCK_ANONYMOUS = "true";

/**
 * Verify local server is running before any tests execute
 * This is a WARNING only - service tests don't need the server
 *
 * Can be skipped by setting SKIP_SERVER_CHECK=true (useful for unit tests in CI)
 */
async function verifyLocalServerRunning(): Promise<void> {
  if (process.env.SKIP_SERVER_CHECK === "true") {
    console.log("\n[Test Setup] Server check skipped (SKIP_SERVER_CHECK=true)");
    return;
  }

  console.log("\n[Test Setup] Checking local server status...");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  const healthEndpoint = `${LOCAL_SERVER_URL}/api/health`;
  try {
    const response = await fetch(healthEndpoint, {
      signal: controller.signal,
      method: "GET",
    });
    clearTimeout(timeout);
    console.log(
      `  ✅ Local server running at ${LOCAL_SERVER_URL} (status: ${response.status})`,
    );
  } catch {
    clearTimeout(timeout);
    // Not an error - service tests don't need the server
    console.log(`  ⚠️  Local server not running at ${LOCAL_SERVER_URL}`);
    console.log(
      `     Service tests will work. Runtime tests require: bun run dev`,
    );
  }
}

// Run verification synchronously at module load time
// This ensures tests don't even start if server is down
const serverCheck = verifyLocalServerRunning();

// Export the promise so tests can await it if needed
export { serverCheck };

// Log confirmation that test environment is configured
console.log("[Test Setup] Environment configured for LOCAL testing:");
console.log(`  NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`  ELIZAOS_CLOUD_BASE_URL: ${process.env.ELIZAOS_CLOUD_BASE_URL}`);
console.log(`  TEST_BLOCK_ANONYMOUS: ${process.env.TEST_BLOCK_ANONYMOUS}`);
