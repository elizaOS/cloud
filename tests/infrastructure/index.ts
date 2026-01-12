/**
 * Test Infrastructure Exports
 */

// Docker PostgreSQL management
export {
  startPostgres,
  stopPostgres,
  getConnectionString,
  isRunning,
  getContainerInfo,
  cleanupStaleContainers,
  runCloudMigrations,
  runAgentMigrations,
} from "./docker-postgres";

// Test data factory
export {
  createTestDataSet,
  createTestRoom,
  createAnonymousSession,
  cleanupTestData,
  type TestOrganization,
  type TestUser,
  type TestApiKey,
  type TestCharacter,
  type TestDataSet,
} from "./test-data-factory";

// Test runtime - direct access to production RuntimeFactory
export {
  // Production RuntimeFactory exports
  runtimeFactory,
  invalidateRuntime,
  isRuntimeCached,
  getRuntimeCacheStats,
  AgentMode,
  // Test helpers
  createTestRuntime,
  buildUserContext,
  createTestUser,
  sendTestMessage,
  getMcpService,
  waitForMcpReady,
  // Types
  type UserContext,
  type TestRuntime,
  type TestRuntimeResult,
  type TestUserContext,
  type TestMessageResult,
  type SendTestMessageOptions,
} from "./test-runtime";

// Timing utilities
export {
  startTimer,
  endTimer,
  logTimings,
  createScopedTimer,
} from "./timing";

// HTTP/SSE test utilities
export {
  parseSSEStream,
  collectSSEEvents,
  parseStreamingResponse,
  createTestApiClient,
  TestApiClient,
  StreamingError,
  assertStreamingSuccess,
  assertStreamingOrder,
  getFullTextFromChunks,
  type SSEEvent,
  type StreamingMessageEvents,
  type TestApiClientOptions,
  type RequestOptions,
} from "./http-client";
