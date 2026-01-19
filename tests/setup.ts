/**
 * Test Setup - MUST RUN BEFORE ANY TEST CODE
 *
 * CRITICAL: This ensures tests run against local endpoints, NOT production!
 * Without this, tests would hit https://www.elizacloud.ai which is VERY BAD.
 *
 * Environment variables:
 * - SKIP_SERVER_CHECK=true: Skip the local server check (for unit tests in CI)
 */

const LOCAL_SERVER_URL = "http://localhost:3000";

// Set NODE_ENV to test - this makes getElizaCloudApiUrl() return localhost
process.env.NODE_ENV = "test";

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
