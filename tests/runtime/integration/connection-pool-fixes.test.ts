/**
 * Connection Pool Fixes - Regression Tests
 *
 * Tests the critical database connection pooling fixes:
 * 1. Pool preservation after runtime invalidation (the critical bug fix)
 * 2. Retry logic for transient connection errors
 * 3. Concurrent runtime usage without pool exhaustion
 *
 * RUN: bun test tests/runtime/integration/connection-pool-fixes.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  runtimeFactory,
  invalidateRuntime,
  isRuntimeCached,
  getRuntimeCacheStats,
  AgentMode,
  buildUserContext,
  createTestUser,
  sendTestMessage,
  type TestRuntime,
  type TestUserContext,
} from "../../infrastructure";
import {
  getConnectionString,
  verifyConnection,
  createTestDataSet,
  cleanupTestData,
  type TestDataSet,
} from "../../infrastructure";
import {
  isConnectionError,
  withDbRetry,
  trackConnectionError,
  getConnectionErrorStats,
  resetConnectionErrorStats,
} from "../../../lib/utils/db";

// ============================================================================
// Test State
// ============================================================================

let connectionString: string;
let testData: TestDataSet;

async function setupEnvironment(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("🔧 CONNECTION POOL FIXES - REGRESSION TESTS");
  console.log("=".repeat(60));

  const connected = await verifyConnection();
  if (!connected) {
    throw new Error("Cannot connect to database. Ensure DATABASE_URL is set.");
  }
  connectionString = getConnectionString();
  console.log("✅ Database connected");

  testData = await createTestDataSet(connectionString, {
    organizationName: "Pool Fix Test Org",
    userName: "Pool Fix Test User",
    userEmail: "pool-fix-test-" + Date.now() + "@eliza.test",
    creditBalance: 100.0,
    includeCharacter: false,
  });
  console.log("✅ Test data created");
  console.log("=".repeat(60) + "\n");
}

async function cleanupEnvironment(): Promise<void> {
  console.log("\n🧹 Cleaning up...");
  if (testData) {
    await cleanupTestData(connectionString, testData.organization.id).catch(
      (err) => console.warn("Cleanup warning: " + err)
    );
  }
}

// ============================================================================
// TEST 1: Pool Preservation After Invalidation (Critical Fix)
// ============================================================================

describe("Pool Preservation After Invalidation", () => {
  let runtime1: TestRuntime;
  let runtime2: TestRuntime;

  beforeAll(setupEnvironment);
  afterAll(cleanupEnvironment);

  it("should create first runtime successfully", async () => {
    const userContext = buildUserContext(testData, {
      agentMode: AgentMode.CHAT,
      webSearchEnabled: false,
    });

    runtime1 = await runtimeFactory.createRuntimeForUser(userContext);

    expect(runtime1).toBeDefined();
    expect(runtime1.agentId).toBeDefined();
    console.log("✅ Runtime 1 created:", runtime1.agentId);
  }, 60000);

  it("should invalidate first runtime without closing pool", async () => {
    const agentId = runtime1.agentId as string;

    // Invalidate the runtime (simulates character update)
    const wasInvalidated = await invalidateRuntime(agentId);

    expect(wasInvalidated).toBe(true);
    expect(isRuntimeCached(agentId)).toBe(false);
    console.log(`✅ Runtime 1 invalidated (pool should still be alive)`);
  }, 30000);

  it("should create second runtime AFTER invalidation (pool preserved)", async () => {
    // THIS IS THE CRITICAL TEST
    // Before the fix: This would fail with "server conn crashed" or similar
    // After the fix: This should work because the pool is preserved

    const userContext = buildUserContext(testData, {
      agentMode: AgentMode.CHAT,
      webSearchEnabled: false,
    });

    // Create a new runtime - this reuses the preserved connection pool
    runtime2 = await runtimeFactory.createRuntimeForUser(userContext);

    expect(runtime2).toBeDefined();
    expect(runtime2.agentId).toBeDefined();
    console.log("✅ Runtime 2 created after invalidation:", runtime2.agentId);
  }, 60000);

  it("should process message on second runtime (confirms pool works)", async () => {
    const testUser = await createTestUser(runtime2, "PoolTestUser");

    const result = await sendTestMessage(
      runtime2,
      testUser,
      "Hello! Testing connection pool.",
      testData,
      { timeoutMs: 60000 }
    );

    expect(result.didRespond).toBe(true);
    console.log(`✅ Message processed on runtime 2 (pool is healthy)`);
    console.log(`   Response: ${result.response?.text?.substring(0, 50)}...`);

    // Cleanup
    await invalidateRuntime(runtime2.agentId as string);
  }, 120000);
});

// ============================================================================
// TEST 2: Concurrent Runtime Usage (Pool Exhaustion Prevention)
// ============================================================================

describe("Concurrent Runtime Usage", () => {
  const runtimes: TestRuntime[] = [];

  beforeAll(setupEnvironment);
  afterAll(async () => {
    // Cleanup all runtimes
    for (const runtime of runtimes) {
      await invalidateRuntime(runtime.agentId as string).catch(() => {});
    }
    await cleanupEnvironment();
  });

  it("should create multiple runtimes concurrently without pool exhaustion", async () => {
    const CONCURRENT_COUNT = 3;

    const userContext = buildUserContext(testData, {
      agentMode: AgentMode.CHAT,
      webSearchEnabled: false,
    });

    // Create multiple runtimes in parallel
    const startTime = Date.now();
    const createPromises = Array.from({ length: CONCURRENT_COUNT }, () =>
      runtimeFactory.createRuntimeForUser(userContext)
    );

    const results = await Promise.all(createPromises);
    const duration = Date.now() - startTime;

    for (const runtime of results) {
      expect(runtime).toBeDefined();
      runtimes.push(runtime);
    }

    console.log(
      `✅ Created ${CONCURRENT_COUNT} runtimes concurrently in ${duration}ms`
    );
    console.log(
      `   Average: ${(duration / CONCURRENT_COUNT).toFixed(0)}ms per runtime`
    );
  }, 120000);

  it("should report healthy cache stats", () => {
    const stats = getRuntimeCacheStats();

    expect(stats).toBeDefined();
    expect(stats.runtime.size).toBeGreaterThan(0);
    expect(stats.runtime.size).toBeLessThanOrEqual(stats.runtime.maxSize);

    console.log(
      `✅ Cache stats: ${stats.runtime.size}/${stats.runtime.maxSize}`
    );
  });
});

// ============================================================================
// TEST 3: Connection Error Detection Utility
// ============================================================================

describe("Connection Error Detection Utility", () => {
  beforeAll(() => {
    resetConnectionErrorStats();
  });

  it("should detect PostgreSQL error codes", () => {
    const pgErrors = [
      new Error("08P01: protocol violation"),
      new Error("Error code 08000: connection_exception"),
      new Error("08003: connection_does_not_exist"),
      new Error("57P01: admin_shutdown"),
    ];

    for (const error of pgErrors) {
      expect(isConnectionError(error)).toBe(true);
    }
    console.log("✅ PostgreSQL error codes detected correctly");
  });

  it("should detect common connection error messages", () => {
    const connectionErrors = [
      new Error("server conn crashed"),
      new Error("Cannot use a pool after calling end on the pool"),
      new Error("Connection terminated unexpectedly"),
      new Error("ECONNRESET"),
      new Error("Socket hang up"),
    ];

    for (const error of connectionErrors) {
      expect(isConnectionError(error)).toBe(true);
    }
    console.log("✅ Connection error messages detected correctly");
  });

  it("should NOT flag non-connection errors", () => {
    const otherErrors = [
      new Error("Unique constraint violation"),
      new Error("Invalid input syntax"),
      new Error("Permission denied"),
      new Error("Not found"),
    ];

    for (const error of otherErrors) {
      expect(isConnectionError(error)).toBe(false);
    }
    console.log("✅ Non-connection errors correctly excluded");
  });
});

// ============================================================================
// TEST 4: Retry Logic
// ============================================================================

describe("Retry Logic (withDbRetry)", () => {
  it("should succeed on first attempt without retry", async () => {
    let attempts = 0;

    const result = await withDbRetry(async () => {
      attempts++;
      return "success";
    });

    expect(result).toBe("success");
    expect(attempts).toBe(1);
    console.log("✅ Succeeded on first attempt");
  });

  it("should retry on connection error and succeed", async () => {
    let attempts = 0;

    const result = await withDbRetry(
      async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error("server conn crashed");
        }
        return "recovered";
      },
      { maxRetries: 3, baseDelayMs: 10, label: "[Test]" }
    );

    expect(result).toBe("recovered");
    expect(attempts).toBe(2);
    console.log("✅ Retried on connection error and recovered");
  });

  it("should NOT retry on non-connection errors", async () => {
    let attempts = 0;

    await expect(
      withDbRetry(async () => {
        attempts++;
        throw new Error("Unique constraint violation");
      })
    ).rejects.toThrow("Unique constraint violation");

    expect(attempts).toBe(1);
    console.log("✅ Did not retry on non-connection error (fail fast)");
  });

  it("should exhaust retries and throw last error", async () => {
    let attempts = 0;

    await expect(
      withDbRetry(
        async () => {
          attempts++;
          throw new Error("Connection refused");
        },
        { maxRetries: 2, baseDelayMs: 10 }
      )
    ).rejects.toThrow("Connection refused");

    expect(attempts).toBe(3); // 1 initial + 2 retries
    console.log("✅ Exhausted retries correctly (3 attempts)");
  });
});

// ============================================================================
// TEST 5: Error Tracking (Rate Limiting)
// ============================================================================

describe("Error Tracking", () => {
  beforeAll(() => {
    resetConnectionErrorStats();
  });

  it("should track connection errors", () => {
    const testError = new Error("Test connection error");

    trackConnectionError(testError, "[Test]");

    const stats = getConnectionErrorStats();
    expect(stats.count).toBe(1);
    expect(stats.lastError).toContain("Test connection error");
    console.log("✅ Error tracked correctly");
  });

  it("should reset stats correctly", () => {
    resetConnectionErrorStats();

    const stats = getConnectionErrorStats();
    expect(stats.count).toBe(0);
    expect(stats.lastError).toBe("");
    console.log("✅ Stats reset correctly");
  });
});

// ============================================================================
// TEST 6: Simulate Character Update Flow (End-to-End)
// ============================================================================

describe("Character Update Flow (E2E)", () => {
  let runtime: TestRuntime;
  let testUser: TestUserContext;

  beforeAll(setupEnvironment);
  afterAll(cleanupEnvironment);

  it("Step 1: Create runtime and send initial message", async () => {
    const userContext = buildUserContext(testData, {
      agentMode: AgentMode.CHAT,
      webSearchEnabled: false,
    });

    runtime = await runtimeFactory.createRuntimeForUser(userContext);
    testUser = await createTestUser(runtime, "E2ETestUser");

    const result = await sendTestMessage(
      runtime,
      testUser,
      "Hi! This is before the update.",
      testData,
      { timeoutMs: 60000 }
    );

    expect(result.didRespond).toBe(true);
    console.log("✅ Step 1: Initial message sent");
  }, 120000);

  it("Step 2: Simulate character update (invalidate runtime)", async () => {
    // This simulates what happens when a user updates their character
    const wasInvalidated = await invalidateRuntime(runtime.agentId as string);

    expect(wasInvalidated).toBe(true);
    console.log("✅ Step 2: Runtime invalidated (simulating character update)");
  }, 30000);

  it("Step 3: Continue chatting after update (should work!)", async () => {
    // THIS IS THE CRITICAL E2E TEST
    // Before the fix: This would fail because the pool was terminated
    // After the fix: This should work because invalidation preserves the pool

    const userContext = buildUserContext(testData, {
      agentMode: AgentMode.CHAT,
      webSearchEnabled: false,
    });

    // Create new runtime (simulates next request after character update)
    runtime = await runtimeFactory.createRuntimeForUser(userContext);
    testUser = await createTestUser(runtime, "E2ETestUser2");

    const result = await sendTestMessage(
      runtime,
      testUser,
      "Hi! This is after the update. Can you still respond?",
      testData,
      { timeoutMs: 60000 }
    );

    expect(result.didRespond).toBe(true);
    console.log(
      "✅ Step 3: Message sent AFTER invalidation - Pool is healthy!"
    );
    console.log(`   Response: ${result.response?.text?.substring(0, 50)}...`);

    // Cleanup
    await invalidateRuntime(runtime.agentId as string);
  }, 120000);
});
