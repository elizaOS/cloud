/**
 * Direct Database Adapter
 *
 * Creates a database adapter from a direct PostgreSQL connection URL.
 * This is used by the ElizaOS Cloud platform itself which already has
 * database access and doesn't need to provision via API.
 *
 * For users who want managed database provisioning, use createCloudDatabaseAdapter instead.
 */
import type { UUID, IDatabaseAdapter } from "@elizaos/core";
export interface DirectDatabaseConfig {
    postgresUrl: string;
}
/**
 * Creates a database adapter from a direct PostgreSQL connection URL (sync version).
 * This is the primary method for cloud platform use.
 *
 * @param config - Configuration with postgresUrl
 * @param agentId - UUID of the agent
 * @returns Database adapter from plugin-sql
 */
export declare function createDatabaseAdapter(config: DirectDatabaseConfig, agentId: UUID): IDatabaseAdapter;
/**
 * Creates a database adapter from a direct PostgreSQL connection URL (async version).
 * Kept for backwards compatibility with existing code.
 *
 * @param config - Configuration with postgresUrl
 * @param agentId - UUID of the agent
 * @returns Database adapter from plugin-sql
 */
export declare function createDirectDatabaseAdapter(config: DirectDatabaseConfig, agentId: UUID): Promise<IDatabaseAdapter>;
