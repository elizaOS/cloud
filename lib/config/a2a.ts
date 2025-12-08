/**
 * A2A Protocol Configuration
 *
 * Configuration constants for the A2A (Agent-to-Agent) protocol
 * @see https://google.github.io/a2a-spec/
 */

// Protocol version we implement
export const A2A_PROTOCOL_VERSION = "0.3.0";

// JSON-RPC endpoint path
export const A2A_JSONRPC_ENDPOINT = "/api/a2a";

// Agent Card endpoint
export const A2A_AGENT_CARD_ENDPOINT = "/.well-known/agent-card.json";

// Request timeout (ms)
export const A2A_REQUEST_TIMEOUT = 60000;

// Task store TTL (ms) - 1 hour
export const A2A_TASK_STORE_TTL = 3600000;

// Clean up interval (ms) - 5 minutes
export const A2A_TASK_CLEANUP_INTERVAL = 300000;

// Rate limiting defaults per trust level (requests per minute)
export const A2A_RATE_LIMITS = {
  untrusted: 5,
  low: 20,
  neutral: 50,
  trusted: 100,
  verified: 200,
} as const;

// Supported content types
export const A2A_SUPPORTED_CONTENT_TYPES = [
  "application/json",
  "text/event-stream",
] as const;

// Standard A2A methods
export const A2A_STANDARD_METHODS = [
  "message/send",
  "message/stream",
  "tasks/get",
  "tasks/cancel",
  "tasks/resubscribe",
  "tasks/pushNotificationConfig/set",
  "tasks/pushNotificationConfig/get",
  "tasks/pushNotificationConfig/delete",
  "agent/getAuthenticatedExtendedCard",
] as const;

// Extension methods (Eliza Cloud specific) - 60 total
export const A2A_EXTENSION_METHODS = [
  // Generation (5)
  "a2a.chatCompletion",
  "a2a.generateImage",
  "a2a.generateVideo",
  "a2a.generateEmbeddings",
  "a2a.generatePrompts",
  // Credits & Billing (6)
  "a2a.getBalance",
  "a2a.getUsage",
  "a2a.getCreditSummary",
  "a2a.listCreditTransactions",
  "a2a.listCreditPacks",
  "a2a.getBillingUsage",
  // Memory (3)
  "a2a.saveMemory",
  "a2a.retrieveMemories",
  "a2a.deleteMemory",
  // Knowledge (2)
  "a2a.queryKnowledge",
  "a2a.uploadKnowledge",
  // Conversation (2)
  "a2a.createConversation",
  "a2a.getConversationContext",
  // Agents (5)
  "a2a.listAgents",
  "a2a.chatWithAgent",
  "a2a.createAgent",
  "a2a.updateAgent",
  "a2a.deleteAgent",
  // Containers (10)
  "a2a.listContainers",
  "a2a.getContainer",
  "a2a.getContainerHealth",
  "a2a.getContainerLogs",
  "a2a.createContainer",
  "a2a.deleteContainer",
  "a2a.getContainerMetrics",
  "a2a.getContainerQuota",
  "a2a.createCheckoutSession",
  "a2a.getEcrCredentials",
  // Infrastructure (3)
  "a2a.listModels",
  "a2a.listGallery",
  "a2a.getAnalytics",
  // Voice (2)
  "a2a.textToSpeech",
  "a2a.listVoices",
  // API Keys (3)
  "a2a.listApiKeys",
  "a2a.createApiKey",
  "a2a.deleteApiKey",
  // Redemptions (2)
  "a2a.getRedemptionBalance",
  "a2a.getRedemptionQuote",
  // MCPs (3)
  "a2a.listMcps",
  "a2a.createMcp",
  "a2a.deleteMcp",
  // Rooms (2)
  "a2a.listRooms",
  "a2a.createRoom",
  // User (2)
  "a2a.getUserProfile",
  "a2a.updateUserProfile",
  // ERC-8004 Discovery (4)
  "a2a.discoverServices",
  "a2a.getServiceDetails",
  "a2a.findMcpTools",
  "a2a.findA2aSkills",
] as const;

