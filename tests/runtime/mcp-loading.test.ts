/**
 * MCP Plugin Loading Tests
 *
 * Tests the full production flow for loading a character with MCP plugin.
 */

// All imports at the top
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  startPostgres,
  stopPostgres,
  runCloudMigrations,
  runAgentMigrations,
  createTestDataSet,
  cleanupTestData,
  createTestRuntime,
  createTestUser,
  sendTestMessage,
  getMcpService,
  waitForMcpReady,
  startTimer,
  endTimer,
  logTimings,
  type TestRuntimeResult,
  type TestUserContext,
  type TestDataSet,
} from "../infrastructure";
import { mcpTestCharacter } from "../fixtures/mcp-test-character";

// Test state
let connectionString: string;
let testData: TestDataSet;
let testRuntimeResult: TestRuntimeResult;
let testUserContext: TestUserContext;
const timings: Record<string, number> = {};

// Setup function
async function setupTestEnvironment(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 SETTING UP TEST ENVIRONMENT");
  console.log("=".repeat(60));

  // Step 1: Start PostgreSQL container
  console.log("\n📦 Step 1: Starting PostgreSQL container...");
  connectionString = await startPostgres();
  process.env.DATABASE_URL = connectionString;
  process.env.POSTGRES_URL = connectionString;
  console.log(`✅ PostgreSQL running: ${connectionString}`);

  // Step 2: Run cloud migrations
  console.log("\n📊 Step 2: Running cloud database migrations...");
  await runCloudMigrations(connectionString);
  console.log("✅ Cloud migrations complete");

  // Step 3: Run ElizaOS agent migrations
  console.log("\n🤖 Step 3: Running ElizaOS agent migrations...");
  await runAgentMigrations(connectionString);
  console.log("✅ Agent migrations complete");

  // Step 4: Create test data
  console.log("\n👤 Step 4: Creating test data...");
  testData = await createTestDataSet(connectionString, {
    organizationName: "Test Organization",
    userName: "Test User",
    userEmail: "test@eliza.test",
    creditBalance: 1000.0,
    includeCharacter: true,
    characterName: "Mira",
    characterData: mcpTestCharacter as unknown as Record<string, unknown>,
    characterSettings: mcpTestCharacter.settings as Record<string, unknown>,
  });
  console.log("✅ Test data created");

  console.log("\n" + "=".repeat(60));
  console.log("✅ ENVIRONMENT READY");
  console.log("=".repeat(60) + "\n");
}

// Cleanup function
async function cleanupTestEnvironment(): Promise<void> {
  console.log("\n🧹 CLEANING UP...");
  if (testRuntimeResult) {
    await testRuntimeResult.cleanup();
  }
  if (testData && connectionString) {
    await cleanupTestData(connectionString, testData.organization.id).catch(() => {});
  }
  await stopPostgres().catch(() => {});
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  logTimings("MCP Loading Tests", timings);
  console.log("✅ Cleanup complete\n");
}

describe("MCP Plugin Loading - Production Flow", () => {
  // Use setup/cleanup functions in hooks
  // Note: Bun test doesn't support timeout as second arg to beforeAll
  beforeAll(setupTestEnvironment);
  afterAll(cleanupTestEnvironment);

  it("should create runtime with MCP plugin using RuntimeFactory", async () => {
    startTimer("runtime_creation");

    testRuntimeResult = await createTestRuntime({
      testData,
      characterId: testData.character?.id,
      agentMode: "ASSISTANT",
      webSearchEnabled: false,
    });

    timings.runtimeCreation = endTimer("runtime_creation");

    expect(testRuntimeResult).toBeDefined();
    expect(testRuntimeResult.runtime).toBeDefined();
    expect(testRuntimeResult.runtime.agentId).toBeDefined();

    console.log(`\n✅ Runtime created in ${timings.runtimeCreation}ms`);
    console.log(`   Agent ID: ${testRuntimeResult.runtime.agentId}`);
    console.log(`   Character: ${testRuntimeResult.runtime.character?.name}`);
  }, 120000);

  it("should have MCP service available", async () => {
    startTimer("mcp_service_check");

    const mcpService = getMcpService(testRuntimeResult.runtime);

    timings.mcpServiceCheck = endTimer("mcp_service_check");

    expect(mcpService).toBeDefined();
    console.log(`\n✅ MCP service found in ${timings.mcpServiceCheck}ms`);

    if (mcpService?.getServers) {
      const servers = mcpService.getServers();
      console.log(`   Servers: ${servers?.length || 0}`);
    }
  }, 10000);

  it("should wait for MCP initialization", async () => {
    startTimer("mcp_init_wait");

    const isReady = await waitForMcpReady(testRuntimeResult.runtime, 15000);

    timings.mcpInitWait = endTimer("mcp_init_wait");

    expect(isReady).toBe(true);
    console.log(`\n✅ MCP initialized in ${timings.mcpInitWait}ms`);

    const mcpService = getMcpService(testRuntimeResult.runtime);
    if (mcpService?.getTools) {
      const tools = mcpService.getTools();
      console.log(`   Tools available: ${tools?.length || 0}`);
    }
  }, 30000);

  it("should create test user with ElizaOS entities", async () => {
    startTimer("user_creation");

    testUserContext = await createTestUser(testRuntimeResult.runtime, "MCPTestUser");

    timings.userCreation = endTimer("user_creation");

    expect(testUserContext).toBeDefined();
    expect(testUserContext.entityId).toBeDefined();
    expect(testUserContext.roomId).toBeDefined();
    expect(testUserContext.worldId).toBeDefined();

    console.log(`\n✅ Test user created in ${timings.userCreation}ms`);
    console.log(`   Entity ID: ${testUserContext.entityId}`);
    console.log(`   Room ID: ${testUserContext.roomId}`);
  }, 30000);

  it("should process a message through the runtime", async () => {
    startTimer("message_processing");

    const result = await sendTestMessage(
      testRuntimeResult.runtime,
      testUserContext,
      "Hello! What can you help me with?",
      {
        useMultiStep: false,
        timeoutMs: 60000,
      }
    );

    timings.messageProcessing = endTimer("message_processing");

    console.log(`\n📨 Message processed in ${result.duration}ms`);
    console.log(`   Did respond: ${result.didRespond}`);
    if (result.response) {
      console.log(`   Response: ${result.response.text?.substring(0, 100)}...`);
    }
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }

    expect(result.didRespond).toBe(true);
    expect(result.response).toBeDefined();
    expect(result.error).toBeUndefined();
  }, 120000);
});
