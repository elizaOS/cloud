/**
 * ElizaOS Database Schema Re-exports
 *
 * Re-exports database schema tables from @elizaos/plugin-sql for use in cloud platform.
 * This allows cloud consumers to import schema from plugin-elizacloud without directly
 * depending on plugin-sql.
 */
import pluginSql from "@elizaos/plugin-sql/node";
export { pluginSql };
export declare const agentTable: any, roomTable: any, participantTable: any, memoryTable: any, embeddingTable: any, entityTable: any, relationshipTable: any, componentTable: any, taskTable: any, logTable: any, cacheTable: any, worldTable: any, serverTable: any, messageTable: any, messageServerTable: any, messageServerAgentsTable: any, channelTable: any, channelParticipantsTable: any;
export declare const serverAgentsTable: any;
