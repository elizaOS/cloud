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

// Extension methods (Eliza Cloud specific)
export const A2A_EXTENSION_METHODS = [
  "a2a.chatCompletion",
  "a2a.generateImage",
  "a2a.getBalance",
  "a2a.getUsage",
  "a2a.listAgents",
  "a2a.chatWithAgent",
  "a2a.saveMemory",
  "a2a.retrieveMemories",
  "a2a.createConversation",
  "a2a.listContainers",
] as const;

