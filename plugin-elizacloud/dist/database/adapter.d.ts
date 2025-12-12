/**
 * Cloud Database Adapter
 *
 * Connects to ElizaOS Cloud's managed PostgreSQL database.
 * This adapter requests a database connection URL from the cloud service
 * and uses the standard PostgreSQL adapter from plugin-sql.
 */
import type { IDatabaseAdapter } from "@elizaos/core";
import type { CloudDatabaseConfig } from "./types";
/**
 * Creates a cloud database adapter that connects to ElizaOS Cloud's managed database.
 *
 * @param config - Cloud database configuration
 * @returns Database adapter or null if cloud database is not available
 */
export declare function createCloudDatabaseAdapter(config: CloudDatabaseConfig): Promise<IDatabaseAdapter | null>;
/**
 * Cloud Database Adapter class
 * Wraps the provisioning logic for use in plugin initialization
 */
export declare class CloudDatabaseAdapter {
    private config;
    private adapter;
    constructor(config: CloudDatabaseConfig);
    initialize(): Promise<IDatabaseAdapter | null>;
    getAdapter(): IDatabaseAdapter | null;
}
