import type { Plugin } from "@elizaos/core";
import { CloudStorageService } from "./storage/service";
export type { OpenAITranscriptionParams, OpenAITextToSpeechParams, } from "./types";
export { CloudDatabaseAdapter, createCloudDatabaseAdapter, createDirectDatabaseAdapter, createDatabaseAdapter, agentTable, roomTable, participantTable, memoryTable, embeddingTable, entityTable, relationshipTable, componentTable, taskTable, logTable, cacheTable, worldTable, serverTable, serverAgentsTable, // Alias for serverTable (backwards compat)
messageTable, messageServerTable, messageServerAgentsTable, channelTable, channelParticipantsTable, pluginSql, } from "./database";
export type { CloudDatabaseConfig, CloudDatabaseStatus } from "./database/types";
export { CloudStorageService, createCloudStorageService } from "./storage";
export type { CloudStorageConfig, StorageUploadResult, StorageListResult, StorageItem, } from "./storage/types";
/**
 * Get the cloud storage service instance
 * Available after plugin initialization
 */
export declare function getCloudStorage(): CloudStorageService | null;
/**
 * Defines the ElizaOS Cloud plugin with its name, description, and configuration options.
 *
 * Configuration:
 * - ELIZAOS_CLOUD_API_KEY: Your ElizaOS Cloud API key (format: eliza_xxxxx)
 *   Get it from: https://www.elizacloud.ai/dashboard/api-keys
 *
 * - ELIZAOS_CLOUD_BASE_URL: ElizaOS Cloud API base URL
 *   Default: https://www.elizacloud.ai/api/v1
 *
 * - ELIZAOS_CLOUD_SMALL_MODEL: Small/fast model for quick tasks
 *   Available: gpt-4o-mini, gpt-4o, claude-3-5-sonnet, gemini-2.0-flash
 *   Default: gpt-4o-mini
 *
 * - ELIZAOS_CLOUD_LARGE_MODEL: Large/powerful model for complex tasks
 *   Available: gpt-4o-mini, gpt-4o, claude-3-5-sonnet, gemini-2.0-flash
 *   Default: gpt-4o
 *
 * - ELIZAOS_CLOUD_EMBEDDING_MODEL: Model for text embeddings
 * - ELIZAOS_CLOUD_EMBEDDING_API_KEY: Separate API key for embeddings (optional)
 * - ELIZAOS_CLOUD_EMBEDDING_URL: Separate URL for embeddings (optional)
 * - ELIZAOS_CLOUD_IMAGE_DESCRIPTION_MODEL: Model for image description (default: gpt-4o-mini)
 *
 * @type {Plugin}
 */
export declare const elizaOSCloudPlugin: Plugin;
export default elizaOSCloudPlugin;
