/**
 * Performance Tests
 *
 * Measures runtime performance for serverless optimization.
 * Focuses on latency analysis, n+1 detection, and cold start times.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  globalSetup,
  globalTeardown,
} from "../setup-runtime";
import {
  createTestRuntime,
  createTestUser,
  sendTestMessage,
  type TestRuntimeResult,
  type TestUserContext,
} from "../infrastructure";
import { simpleTestCharacter, miraCharacter } from "../fixtures/mcp-test-character";
import { Timer, TimingCollector, HRTimer } from "../infrastructure/timing";
import mcpPlugin from "@elizaos/plugin-mcp";

describe("Runtime Creation Performance", () => {
  let connectionString: string;
  const runtimes: TestRuntimeResult[] = [];
  const collector = new TimingCollector();

  beforeAll(async () => {
    connectionString = await globalSetup();
  }, 60000);

  afterAll(async () => {
    collector.printSummary();
    for (const rt of runtimes) {
      await rt.cleanup();
    }
    await globalTeardown();
  });

  test("should measure simple runtime creation (no plugins)", async () => {
    const runs = 3;
    const times: number[] = [];

    for (let i = 0; i < runs; i++) {
      const timer = new HRTimer(`simpleRuntime-${i}`);
      const runtime = await createTestRuntime({
        character: { ...simpleTestCharacter, id: `perf-simple-${i}-${Date.now()}` },
        plugins: [],
        postgresUrl: connectionString,
        collectTimings: true,
      });
      const result = timer.stop();
      times.push(result.durationMs);
      runtimes.push(runtime);
      collector.start("simpleRuntime");
      collector.stop("simpleRuntime", { run: i, durationMs: result.durationMs });
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    console.log("\n📊 Simple Runtime Creation (no plugins):");
    console.log(`   Runs: ${runs}`);
    console.log(`   Average: ${avg.toFixed(1)}ms`);
    console.log(`   Min: ${min.toFixed(1)}ms`);
    console.log(`   Max: ${max.toFixed(1)}ms`);

    // Target: <1000ms for simple runtime
    if (avg > 1000) {
      console.warn(`⚠️ Simple runtime avg (${avg.toFixed(0)}ms) exceeds 1s target`);
    }

    expect(avg).toBeGreaterThan(0);
  }, 60000);

  test("should measure MCP runtime creation", async () => {
    const runs = 3;
    const times: number[] = [];
    const mcpWaitTimes: number[] = [];

    for (let i = 0; i < runs; i++) {
      const timer = new HRTimer(`mcpRuntime-${i}`);
      const runtime = await createTestRuntime({
        character: { ...miraCharacter, id: `perf-mcp-${i}-${Date.now()}` },
        plugins: [mcpPlugin],
        postgresUrl: connectionString,
        collectTimings: true,
      });
      const result = timer.stop();
      times.push(result.durationMs);
      if (runtime.timings?.mcpWait) {
        mcpWaitTimes.push(runtime.timings.mcpWait);
      }
      runtimes.push(runtime);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const avgMcpWait = mcpWaitTimes.length > 0
      ? mcpWaitTimes.reduce((a, b) => a + b, 0) / mcpWaitTimes.length
      : 0;

    console.log("\n📊 MCP Runtime Creation:");
    console.log(`   Runs: ${runs}`);
    console.log(`   Average: ${avg.toFixed(1)}ms`);
    console.log(`   Min: ${min.toFixed(1)}ms`);
    console.log(`   Max: ${max.toFixed(1)}ms`);
    console.log(`   Avg MCP Wait: ${avgMcpWait.toFixed(1)}ms`);

    // Target: <3000ms for MCP runtime
    if (avg > 3000) {
      console.warn(`⚠️ MCP runtime avg (${avg.toFixed(0)}ms) exceeds 3s target`);
    }

    // Target: <2500ms for MCP wait
    if (avgMcpWait > 2500) {
      console.warn(`⚠️ MCP wait avg (${avgMcpWait.toFixed(0)}ms) exceeds 2.5s target`);
    }

    expect(avg).toBeGreaterThan(0);
  }, 120000);

  test("should compare runtime creation with detailed breakdown", async () => {
    const timer = new HRTimer("detailedMcpRuntime");
    const runtime = await createTestRuntime({
      character: { ...miraCharacter, id: `perf-detailed-${Date.now()}` },
      plugins: [mcpPlugin],
      postgresUrl: connectionString,
      collectTimings: true,
    });
    const totalResult = timer.stop();
    runtimes.push(runtime);

    console.log("\n📊 Runtime Creation Breakdown:");
    console.log(`   Total: ${totalResult.durationMs.toFixed(1)}ms`);

    if (runtime.timings) {
      const timings = runtime.timings;
      console.log(`   ├── Adapter Create: ${timings.adapterCreate}ms`);
      console.log(`   ├── Runtime Create: ${timings.runtimeCreate}ms`);
      console.log(`   ├── Initialize: ${timings.initialize}ms`);
      console.log(`   └── MCP Wait: ${timings.mcpWait}ms`);

      // Calculate percentage of time spent in each phase
      const total = timings.total || totalResult.durationMs;
      console.log("\n📊 Time Distribution:");
      console.log(`   Adapter: ${((timings.adapterCreate / total) * 100).toFixed(1)}%`);
      console.log(`   Runtime: ${((timings.runtimeCreate / total) * 100).toFixed(1)}%`);
      console.log(`   Initialize: ${((timings.initialize / total) * 100).toFixed(1)}%`);
      console.log(`   MCP Wait: ${((timings.mcpWait / total) * 100).toFixed(1)}%`);
    }

    expect(runtime.timings).toBeDefined();
  }, 60000);
});

describe("Database Query Performance", () => {
  let connectionString: string;
  let testRuntime: TestRuntimeResult;
  let testUser: TestUserContext;

  beforeAll(async () => {
    connectionString = await globalSetup();
    testRuntime = await createTestRuntime({
      character: simpleTestCharacter,
      plugins: [],
      postgresUrl: connectionString,
    });
    testUser = await createTestUser(testRuntime.runtime, "PerfTestUser");
  }, 60000);

  afterAll(async () => {
    if (testRuntime) {
      await testRuntime.cleanup();
    }
    await globalTeardown();
  });

  test("should measure entity creation time", async () => {
    const runs = 5;
    const times: number[] = [];

    for (let i = 0; i < runs; i++) {
      const timer = new HRTimer(`entityCreate-${i}`);
      try {
        await testRuntime.runtime.createEntity({
          id: `perf-entity-${i}-${Date.now()}` as `${string}-${string}-${string}-${string}-${string}`,
          agentId: testRuntime.agentId,
          names: [`PerfEntity${i}`],
          metadata: { type: "test", index: i },
        });
      } catch (e) {
        // Ignore duplicate errors
      }
      const result = timer.stop();
      times.push(result.durationMs);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`\n📊 Entity Creation: avg ${avg.toFixed(1)}ms (${runs} runs)`);

    expect(avg).toBeGreaterThan(0);
    expect(avg).toBeLessThan(500); // Entity creation should be fast
  });

  test("should measure memory creation time", async () => {
    const runs = 5;
    const times: number[] = [];

    for (let i = 0; i < runs; i++) {
      const timer = new HRTimer(`memoryCreate-${i}`);
      await testRuntime.runtime.createMemory(
        {
          id: `perf-memory-${i}-${Date.now()}` as `${string}-${string}-${string}-${string}-${string}`,
          entityId: testUser.entityId,
          agentId: testRuntime.agentId,
          roomId: testUser.roomId,
          content: { text: `Performance test message ${i}` },
          createdAt: Date.now(),
        },
        "messages"
      );
      const result = timer.stop();
      times.push(result.durationMs);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`\n📊 Memory Creation: avg ${avg.toFixed(1)}ms (${runs} runs)`);

    expect(avg).toBeGreaterThan(0);
    expect(avg).toBeLessThan(500);
  });

  test("should measure memory retrieval time", async () => {
    // Create some memories first
    for (let i = 0; i < 10; i++) {
      await testRuntime.runtime.createMemory(
        {
          id: `perf-retrieve-${i}-${Date.now()}` as `${string}-${string}-${string}-${string}-${string}`,
          entityId: testUser.entityId,
          agentId: testRuntime.agentId,
          roomId: testUser.roomId,
          content: { text: `Retrieval test message ${i}` },
          createdAt: Date.now(),
        },
        "messages"
      );
    }

    const runs = 5;
    const times: number[] = [];

    for (let i = 0; i < runs; i++) {
      const timer = new HRTimer(`memoryRetrieve-${i}`);
      await testRuntime.runtime.getMemories({
        roomId: testUser.roomId,
        count: 10,
      });
      const result = timer.stop();
      times.push(result.durationMs);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`\n📊 Memory Retrieval (10 items): avg ${avg.toFixed(1)}ms (${runs} runs)`);

    expect(avg).toBeGreaterThan(0);
    expect(avg).toBeLessThan(200); // Retrieval should be very fast
  });
});

describe("Connection Pool Efficiency", () => {
  let connectionString: string;
  const runtimes: TestRuntimeResult[] = [];

  beforeAll(async () => {
    connectionString = await globalSetup();
  }, 60000);

  afterAll(async () => {
    for (const rt of runtimes) {
      await rt.cleanup();
    }
    await globalTeardown();
  });

  test("should efficiently create multiple runtimes sharing pool", async () => {
    const count = 3;
    const timer = new Timer("multiRuntimeCreation");

    for (let i = 0; i < count; i++) {
      const rt = await createTestRuntime({
        character: { ...simpleTestCharacter, id: `pool-test-${i}-${Date.now()}` },
        plugins: [],
        postgresUrl: connectionString,
      });
      runtimes.push(rt);
    }

    const result = timer.stop();
    const avgPerRuntime = result.durationMs / count;

    console.log(`\n📊 Multiple Runtime Creation (${count} runtimes):`);
    console.log(`   Total: ${result.durationMs}ms`);
    console.log(`   Average per runtime: ${avgPerRuntime.toFixed(1)}ms`);

    // Runtimes should share connection pool efficiently
    // Later runtimes should be faster due to warm pool
    expect(avgPerRuntime).toBeLessThan(2000);
  }, 60000);
});

describe("Serverless Cold Start Simulation", () => {
  let connectionString: string;

  beforeAll(async () => {
    connectionString = await globalSetup();
  }, 60000);

  afterAll(async () => {
    await globalTeardown();
  });

  test("should measure complete cold start scenario", async () => {
    // Simulate a serverless cold start:
    // 1. Create runtime
    // 2. Create user context
    // 3. Process first message

    const coldStartTimer = new Timer("coldStart");

    // Step 1: Create runtime
    const step1Timer = new Timer("step1-runtimeCreate");
    const runtime = await createTestRuntime({
      character: { ...simpleTestCharacter, id: `coldstart-${Date.now()}` },
      plugins: [],
      postgresUrl: connectionString,
      collectTimings: true,
    });
    const step1 = step1Timer.stop();

    // Step 2: Create user context
    const step2Timer = new Timer("step2-userCreate");
    const user = await createTestUser(runtime.runtime, "ColdStartUser");
    const step2 = step2Timer.stop();

    // Step 3: First message (would include LLM call in real scenario)
    const step3Timer = new Timer("step3-firstMessage");
    // We just measure the message creation overhead, not LLM response
    await runtime.runtime.createMemory(
      {
        id: `coldstart-msg-${Date.now()}` as `${string}-${string}-${string}-${string}-${string}`,
        entityId: user.entityId,
        agentId: runtime.agentId,
        roomId: user.roomId,
        content: { text: "Hello, this is a cold start test" },
        createdAt: Date.now(),
      },
      "messages"
    );
    const step3 = step3Timer.stop();

    const coldStartResult = coldStartTimer.stop();

    console.log("\n📊 Cold Start Simulation (without LLM):");
    console.log(`   Total: ${coldStartResult.durationMs}ms`);
    console.log(`   ├── Runtime Creation: ${step1.durationMs}ms`);
    console.log(`   ├── User Context: ${step2.durationMs}ms`);
    console.log(`   └── First Message: ${step3.durationMs}ms`);

    // Target: Complete cold start under 2 seconds (without LLM)
    if (coldStartResult.durationMs > 2000) {
      console.warn(
        `⚠️ Cold start (${coldStartResult.durationMs}ms) exceeds 2s target`
      );
    }

    await runtime.cleanup();

    expect(coldStartResult.durationMs).toBeGreaterThan(0);
  }, 60000);
});
