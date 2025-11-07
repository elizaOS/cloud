// Export ElizaOS plugin-sql schema for integration with Drizzle migrations
import plugin from "@elizaos/plugin-sql/node";
import {
  longTermMemories,
  sessionSummaries,
  memoryAccessLogs,
} from "@elizaos/plugin-memory/node";

// Re-export all tables from plugin-sql schema for unified database
export const {
  agentTable,
  roomTable,
  participantTable,
  memoryTable,
  embeddingTable,
  entityTable,
  relationshipTable,
  componentTable,
  taskTable,
  logTable,
  cacheTable,
  worldTable,
  serverAgentsTable,
  messageTable,
  messageServerTable,
  channelTable,
  channelParticipantsTable,
} = plugin.schema;

// Re-export memory plugin tables
export { longTermMemories, sessionSummaries, memoryAccessLogs };
