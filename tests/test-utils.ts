/**
 * Test Utilities
 *
 * Provides robust setup/teardown helpers for tests that need:
 * - Database access (with schema availability checking)
 * - Server connection
 * - Graceful skipping with clear warnings
 *
 * Usage:
 *   import { requireDatabase, requireServer, requireSchema } from "../test-utils";
 *
 *   beforeAll(async () => {
 *     if (!await requireDatabase()) return;
 *     if (!await requireSchema("userModerationStatus")) return;
 *   });
 *
 *   test("my test", async () => {
 *     if (!testContext.dbAvailable) {
 *       console.log("⏭️ Skipping - database not available");
 *       return;
 *     }
 *   });
 */

import { config } from "dotenv";

// Load environment
config({ path: ".env" });
config({ path: ".env.local", override: true });

// ============================================================================
// Test Context - Shared state for tests
// ============================================================================

interface TestContext {
  dbAvailable: boolean;
  serverAvailable: boolean;
  serverUrl: string;
  availableSchemas: Set<string>;
  warnings: string[];
}

export const testContext: TestContext = {
  dbAvailable: false,
  serverAvailable: false,
  serverUrl: process.env.TEST_API_URL || "http://localhost:3000",
  availableSchemas: new Set(),
  warnings: [],
};

// ============================================================================
// Database Utilities
// ============================================================================

/**
 * Check if database is available and functional.
 * This performs a lightweight query to verify connection.
 */
export async function requireDatabase(): Promise<boolean> {
  try {
    // Dynamic import to avoid errors if DATABASE_URL not set
    const { db } = await import("@/db/client");
    
    // Try a simple query to verify connection
    if (!db || !db.query) {
      logWarning("Database client not properly initialized");
      return false;
    }

    // Check if we can query a basic table
    if (db.query.users) {
      await db.query.users.findFirst();
      testContext.dbAvailable = true;
      return true;
    }

    logWarning("Database schemas not loaded");
    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("DATABASE_URL")) {
      logWarning("DATABASE_URL not configured");
    } else if (message.includes("ECONNREFUSED")) {
      logWarning("Database connection refused - is PostgreSQL running?");
    } else {
      logWarning(`Database error: ${message.slice(0, 100)}`);
    }
    return false;
  }
}

/**
 * Check if a specific database schema/table is available.
 * This is useful for tests that need optional tables (like moderation).
 */
export async function requireSchema(schemaName: string): Promise<boolean> {
  if (testContext.availableSchemas.has(schemaName)) {
    return true;
  }

  try {
    const { db } = await import("@/db/client");
    
    // Check if the schema exists on db.query
    const queryObj = db.query as Record<string, { findFirst?: () => Promise<unknown> }>;
    if (!queryObj[schemaName]) {
      logWarning(`Schema '${schemaName}' not exported in db client`);
      return false;
    }

    // Try to query it (this will fail if table doesn't exist in database)
    await queryObj[schemaName].findFirst?.();
    testContext.availableSchemas.add(schemaName);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("does not exist") || message.includes("relation")) {
      logWarning(`Table for '${schemaName}' not migrated - run: bun run db:migrate`);
    } else {
      logWarning(`Schema '${schemaName}' not available: ${message.slice(0, 50)}`);
    }
    return false;
  }
}

/**
 * Check multiple schemas at once, returns true only if all are available.
 */
export async function requireSchemas(...schemaNames: string[]): Promise<boolean> {
  const results = await Promise.all(schemaNames.map(requireSchema));
  return results.every(Boolean);
}

// ============================================================================
// Server Utilities
// ============================================================================

/**
 * Check if the test server is available.
 */
export async function requireServer(url?: string): Promise<boolean> {
  const testUrl = url || testContext.serverUrl;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    // Try health endpoint first, fall back to root
    const endpoints = ["/api/health", "/api/v1/storage", "/"];
    
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(testUrl + endpoint, {
          signal: controller.signal,
          method: "GET",
        });
        clearTimeout(timeoutId);
        
        // Any response means server is running
        if (response) {
          testContext.serverAvailable = true;
          testContext.serverUrl = testUrl;
          return true;
        }
      } catch {
        // Continue to next endpoint
      }
    }
    
    clearTimeout(timeoutId);
  } catch {
    // Fall through to warning
  }

  logWarning(`Server not responding at ${testUrl}`);
  logWarning("Start server with: bun run dev");
  return false;
}

// ============================================================================
// Test Skip Helpers
// ============================================================================

/**
 * Skip condition helper - returns early from test if condition is false.
 * Logs a clear message about why the test was skipped.
 */
export function skipIf(condition: boolean, reason: string): boolean {
  if (condition) {
    console.log(`⏭️ Skipping - ${reason}`);
    return true;
  }
  return false;
}

/**
 * Skip if database is not available.
 */
export function skipIfNoDb(): boolean {
  return skipIf(!testContext.dbAvailable, "database not available");
}

/**
 * Skip if server is not available.
 */
export function skipIfNoServer(): boolean {
  return skipIf(!testContext.serverAvailable, "server not available");
}

/**
 * Skip if a specific schema is not available.
 */
export async function skipIfNoSchema(schemaName: string): Promise<boolean> {
  const available = await requireSchema(schemaName);
  return skipIf(!available, `${schemaName} schema not available`);
}

// ============================================================================
// Logging Utilities
// ============================================================================

function logWarning(message: string): void {
  const warning = `⚠️ ${message}`;
  if (!testContext.warnings.includes(warning)) {
    testContext.warnings.push(warning);
    console.log(warning);
  }
}

/**
 * Print a summary banner at the start of tests.
 */
export function printTestBanner(suiteName: string): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  ${suiteName.padEnd(66)}║
╠══════════════════════════════════════════════════════════════════════╣
║  Database: ${testContext.dbAvailable ? "✅ Available" : "❌ Not available"}                                              ║
║  Server:   ${testContext.serverAvailable ? "✅ " + testContext.serverUrl.padEnd(52) : "❌ Not available                                            "}║
╚══════════════════════════════════════════════════════════════════════╝
`);
}

/**
 * Print warnings collected during test setup.
 */
export function printWarnings(): void {
  if (testContext.warnings.length > 0) {
    console.log("\n⚠️ Test Setup Warnings:");
    testContext.warnings.forEach(w => console.log(`   ${w}`));
    console.log("");
  }
}

// ============================================================================
// Cleanup Utilities
// ============================================================================

/**
 * Reset test context between test suites.
 */
export function resetTestContext(): void {
  testContext.warnings = [];
  // Don't reset db/server availability - cache those
}

// ============================================================================
// Convenience: Combined Setup
// ============================================================================

/**
 * Standard setup for integration tests.
 * Call in beforeAll to check database and optionally server.
 */
export async function setupIntegrationTest(options: {
  requireDb?: boolean;
  requireServer?: boolean;
  requiredSchemas?: string[];
} = {}): Promise<boolean> {
  const { requireDb = true, requireServer: needServer = false, requiredSchemas = [] } = options;

  let success = true;

  if (requireDb) {
    success = await requireDatabase();
    if (!success) return false;
  }

  if (needServer) {
    success = await requireServer();
    if (!success) return false;
  }

  if (requiredSchemas.length > 0) {
    success = await requireSchemas(...requiredSchemas);
    if (!success) return false;
  }

  return true;
}
