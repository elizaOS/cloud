/**
 * Global Test Setup for Runtime Tests
 *
 * Sets up Docker PostgreSQL, runs migrations, creates test data,
 * and manages the Next.js test server for e2e testing.
 * This is the foundation for all runtime integration tests.
 */

import { spawn, type Subprocess } from "bun";
import {
  startPostgres,
  stopPostgres,
  runCloudMigrations,
  runAgentMigrations,
  createTestDataSet,
  cleanupTestData,
  type TestDataSet,
} from "./infrastructure";

// Global test state
let connectionString: string | null = null;
let globalTestData: TestDataSet | null = null;
let isSetup = false;

// Server state
let serverProcess: Subprocess | null = null;
let serverPort: number = 3001;
let serverBaseUrl: string | null = null;

/**
 * Get the global test data set
 */
export function getTestData(): TestDataSet {
  if (!globalTestData) {
    throw new Error("Test data not initialized. Call setupTestEnvironment() first.");
  }
  return globalTestData;
}

/**
 * Get the database connection string
 */
export function getDatabaseUrl(): string {
  if (!connectionString) {
    throw new Error("Database not initialized. Call setupTestEnvironment() first.");
  }
  return connectionString;
}

/**
 * Check if environment is already set up
 */
export function isEnvironmentReady(): boolean {
  return isSetup;
}

export interface SetupOptions {
  includeCharacter?: boolean;
  characterName?: string;
  characterData?: Record<string, unknown>;
  characterSettings?: Record<string, unknown>;
}

/**
 * Setup the test environment
 * Call this in beforeAll() of your test suite
 */
export async function setupTestEnvironment(options: SetupOptions = {}): Promise<void> {
  if (isSetup) {
    console.log("[Setup] Environment already initialized, skipping...");
    return;
  }

  console.log("\n" + "=".repeat(60));
  console.log("🚀 SETTING UP GLOBAL TEST ENVIRONMENT");
  console.log("=".repeat(60));

  // Step 1: Start PostgreSQL container
  console.log("\n📦 Step 1: Starting PostgreSQL container...");
  connectionString = await startPostgres();

  // Set environment variables for the test run
  process.env.DATABASE_URL = connectionString;
  process.env.POSTGRES_URL = connectionString;
  console.log(`✅ PostgreSQL running: ${connectionString}`);

  // Step 2: Run cloud migrations (users, orgs, api_keys, etc.)
  console.log("\n📊 Step 2: Running cloud database migrations...");
  await runCloudMigrations(connectionString);
  console.log("✅ Cloud migrations complete");

  // Step 3: Run ElizaOS agent migrations (entities, memories, rooms)
  console.log("\n🤖 Step 3: Running ElizaOS agent migrations...");
  await runAgentMigrations(connectionString);
  console.log("✅ Agent migrations complete");

  // Step 4: Create test data (org, user, api key)
  console.log("\n👤 Step 4: Creating test data...");
  globalTestData = await createTestDataSet(connectionString, {
    organizationName: "Test Organization",
    userName: "Test User",
    userEmail: "test@eliza.test",
    creditBalance: 1000.0,
    ...options,
  });
  console.log("✅ Test data created");

  isSetup = true;

  console.log("\n" + "=".repeat(60));
  console.log("✅ GLOBAL TEST ENVIRONMENT READY");
  console.log("=".repeat(60) + "\n");
}

/**
 * Cleanup the test environment
 * Call this in afterAll() of your test suite
 */
export async function cleanupTestEnvironment(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("🧹 CLEANING UP GLOBAL TEST ENVIRONMENT");
  console.log("=".repeat(60));

  // Clean up test data
  if (globalTestData && connectionString) {
    try {
      await cleanupTestData(connectionString, globalTestData.organization.id);
      console.log("✅ Test data cleaned up");
    } catch (error) {
      console.warn(`⚠️ Test data cleanup warning: ${error}`);
    }
  }

  // Stop PostgreSQL container
  try {
    await stopPostgres();
    console.log("✅ PostgreSQL container stopped");
  } catch (error) {
    console.warn(`⚠️ PostgreSQL cleanup warning: ${error}`);
  }

  // Clear environment variables
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;

  // Reset state
  connectionString = null;
  globalTestData = null;
  isSetup = false;

  console.log("=".repeat(60) + "\n");
}

// ============================================================================
// Test Server Lifecycle Management
// ============================================================================

/**
 * Get the test server base URL
 */
export function getServerBaseUrl(): string {
  if (!serverBaseUrl) {
    throw new Error("Test server not started. Call startTestServer() first.");
  }
  return serverBaseUrl;
}

/**
 * Check if test server is running
 */
export function isServerRunning(): boolean {
  return serverProcess !== null && serverBaseUrl !== null;
}

/**
 * Wait for the server to be ready by polling the health endpoint
 */
async function waitForServerReady(
  url: string,
  maxAttempts: number = 120,
  intervalMs: number = 2000
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Try to fetch a simple endpoint to check if server is ready
      const response = await fetch(`${url}/api/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });

      // Accept 200 (OK), 401 (auth required = server running), or 404 (page compiling)
      // These all indicate the server is up and responding
      if (response.ok || response.status === 401) {
        console.log(`✅ Server ready after ${attempt} attempt(s) (status: ${response.status})`);
        return;
      }
      console.log(`  Attempt ${attempt}: Status ${response.status}`);
    } catch (err) {
      // Server not ready yet - show progress every 10 attempts
      if (attempt % 10 === 0) {
        const error = err as Error;
        console.log(`  Attempt ${attempt}/${maxAttempts}: ${error.message || "waiting..."}`);
      }
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error(`Server failed to start after ${maxAttempts} attempts`);
}

export interface ServerOptions {
  port?: number;
  startCommand?: "dev" | "start";
  timeout?: number;
}

/**
 * Kill any process using a specific port
 */
async function killProcessOnPort(port: number): Promise<void> {
  try {
    const result = Bun.spawnSync({
      cmd: ["lsof", "-ti", `:${port}`],
      stdout: "pipe",
    });
    const pids = new TextDecoder().decode(result.stdout).trim();
    if (pids) {
      for (const pid of pids.split("\n")) {
        if (pid) {
          console.log(`  Killing existing process ${pid} on port ${port}`);
          Bun.spawnSync({ cmd: ["kill", "-9", pid] });
        }
      }
      // Wait a moment for the port to be released
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Start the Next.js test server
 * Returns the base URL of the running server
 */
export async function startTestServer(options: ServerOptions = {}): Promise<string> {
  if (serverProcess) {
    console.log("[Server] Test server already running");
    return serverBaseUrl!;
  }

  const port = options.port || serverPort;
  const command = options.startCommand || "dev";
  const timeout = options.timeout || 60000;

  console.log("\n" + "=".repeat(60));
  console.log(`🌐 STARTING TEST SERVER (port ${port})`);
  console.log("=".repeat(60));

  // Kill any existing process on the port
  await killProcessOnPort(port);

  // Set the port for the server
  process.env.PORT = String(port);

  // Start the server process
  console.log(`📦 Starting Next.js ${command} server...`);

  serverProcess = spawn({
    cmd: ["bun", "run", command],
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: command === "dev" ? "development" : "production",
    },
    stdout: "inherit",
    stderr: "inherit",
  });

  serverBaseUrl = `http://localhost:${port}`;
  serverPort = port;

  // Wait for server to be ready
  console.log(`⏳ Waiting for server to be ready at ${serverBaseUrl}...`);
  const startTime = Date.now();

  try {
    await waitForServerReady(serverBaseUrl, Math.ceil(timeout / 1000), 1000);
  } catch (error) {
    // If server failed to start, clean up
    await stopTestServer();
    throw error;
  }

  const elapsed = Date.now() - startTime;
  console.log(`✅ Server started in ${elapsed}ms`);
  console.log("=".repeat(60) + "\n");

  return serverBaseUrl;
}

/**
 * Stop the test server
 */
export async function stopTestServer(): Promise<void> {
  if (!serverProcess) {
    return;
  }

  console.log("\n" + "=".repeat(60));
  console.log("🛑 STOPPING TEST SERVER");
  console.log("=".repeat(60));

  try {
    // Kill the server process
    serverProcess.kill();

    // Wait a bit for graceful shutdown
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log("✅ Server stopped");
  } catch (error) {
    console.warn(`⚠️ Server stop warning: ${error}`);
  } finally {
    serverProcess = null;
    serverBaseUrl = null;
    delete process.env.PORT;
  }

  console.log("=".repeat(60) + "\n");
}

// ============================================================================
// Combined E2E Setup (Database + Server)
// ============================================================================

export interface E2ESetupOptions extends SetupOptions, ServerOptions {
  startServer?: boolean;
}

/**
 * Setup complete e2e test environment (database + server)
 * Call this in beforeAll() of your e2e test suite
 */
export async function setupE2EEnvironment(options: E2ESetupOptions = {}): Promise<{
  testData: TestDataSet;
  serverUrl: string;
}> {
  const { startServer = true, ...setupOptions } = options;

  // Setup database environment first
  await setupTestEnvironment(setupOptions);

  // Start server if requested
  let serverUrl = "";
  if (startServer) {
    serverUrl = await startTestServer(options);
  }

  return {
    testData: getTestData(),
    serverUrl,
  };
}

/**
 * Cleanup complete e2e test environment
 * Call this in afterAll() of your e2e test suite
 */
export async function cleanupE2EEnvironment(): Promise<void> {
  // Stop server first
  await stopTestServer();

  // Then cleanup database
  await cleanupTestEnvironment();
}
