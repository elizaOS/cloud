/**
 * User Database Service
 *
 * High-level business logic for managing user app databases.
 * Coordinates between Neon API and our apps database.
 */

import { logger } from "@/lib/utils/logger";
import { getNeonClient, NeonClientError } from "./neon-client";
import { appsRepository } from "@/db/repositories/apps";
import type { UserDatabaseStatus } from "@/db/schemas/apps";

/**
 * Result from provisioning a user database.
 */
export interface ProvisionResult {
  /** Whether provisioning succeeded */
  success: boolean;

  /** Connection URI (only if success=true) */
  connectionUri?: string;

  /** Neon project ID (only if success=true) */
  projectId?: string;

  /** Neon branch ID (only if success=true) */
  branchId?: string;

  /** AWS region where database was created */
  region?: string;

  /** Error message (only if success=false) */
  error?: string;

  /** Error code for programmatic handling */
  errorCode?: "RATE_LIMITED" | "QUOTA_EXCEEDED" | "API_ERROR" | "UNKNOWN";
}

/**
 * Database status information for an app.
 */
export interface DatabaseStatus {
  /** Whether a database exists for this app */
  hasDatabase: boolean;

  /** Current status */
  status: UserDatabaseStatus;

  /** AWS region (if database exists) */
  region?: string;

  /** Error message (if status is "error") */
  error?: string;

  /** Connection URI (only returned for authorized callers) */
  connectionUri?: string;
}

export class UserDatabaseService {
  /**
   * Provision a new database for an app.
   *
   * Flow:
   * 1. Check if app already has a database
   * 2. Update app status to "provisioning"
   * 3. Create Neon project
   * 4. Store credentials and update status to "ready"
   *
   * @param appId App ID
   * @param appName App name (used for Neon project name)
   * @param region Optional AWS region
   * @returns Provision result with connection URI
   */
  async provisionDatabase(
    appId: string,
    appName: string,
    region = "aws-us-east-1",
  ): Promise<ProvisionResult> {
    logger.info("Provisioning database for app", { appId, appName, region });

    // Check current status
    const app = await appsRepository.findById(appId);
    if (!app) {
      return {
        success: false,
        error: "App not found",
        errorCode: "UNKNOWN",
      };
    }

    // Already has a database?
    if (app.user_database_status === "ready" && app.user_database_uri) {
      logger.info("App already has database", { appId });
      return {
        success: true,
        connectionUri: app.user_database_uri,
        projectId: app.user_database_project_id || undefined,
        branchId: app.user_database_branch_id || undefined,
        region: app.user_database_region || region,
      };
    }

    // Currently provisioning?
    if (app.user_database_status === "provisioning") {
      logger.warn("Database provisioning already in progress", { appId });
      return {
        success: false,
        error: "Database provisioning already in progress",
        errorCode: "UNKNOWN",
      };
    }

    // Update status to provisioning
    await appsRepository.update(appId, {
      user_database_status: "provisioning",
      user_database_error: null,
      user_database_region: region,
    });

    try {
      // Create Neon project
      const neonClient = getNeonClient();
      const projectName = `${appName.substring(0, 30)}-${appId.substring(0, 8)}`;
      const result = await neonClient.createProject({
        name: projectName,
        region,
      });

      // Store credentials
      await appsRepository.update(appId, {
        user_database_uri: result.connectionUri,
        user_database_project_id: result.projectId,
        user_database_branch_id: result.branchId,
        user_database_status: "ready",
        user_database_error: null,
      });

      logger.info("Database provisioned successfully", {
        appId,
        projectId: result.projectId,
      });

      return {
        success: true,
        connectionUri: result.connectionUri,
        projectId: result.projectId,
        branchId: result.branchId,
        region,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      let errorCode: ProvisionResult["errorCode"] = "UNKNOWN";

      if (error instanceof NeonClientError) {
        if (error.statusCode === 429) {
          errorCode = "RATE_LIMITED";
        } else if (error.code === "QUOTA_EXCEEDED") {
          errorCode = "QUOTA_EXCEEDED";
        } else {
          errorCode = "API_ERROR";
        }
      }

      logger.error("Database provisioning failed", {
        appId,
        error: errorMessage,
        errorCode,
      });

      // Update status to error
      await appsRepository.update(appId, {
        user_database_status: "error",
        user_database_error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
        errorCode,
      };
    }
  }

  /**
   * Clean up database when app is deleted.
   *
   * @param appId App ID
   */
  async cleanupDatabase(appId: string): Promise<void> {
    logger.info("Cleaning up database for app", { appId });

    const app = await appsRepository.findById(appId);
    if (!app || !app.user_database_project_id) {
      logger.debug("No database to clean up", { appId });
      return;
    }

    try {
      const neonClient = getNeonClient();
      await neonClient.deleteProject(app.user_database_project_id);
      logger.info("Database cleaned up successfully", {
        appId,
        projectId: app.user_database_project_id,
      });
    } catch (error) {
      // Log but don't fail - database might already be deleted
      logger.warn("Failed to delete Neon project (may already be deleted)", {
        appId,
        projectId: app.user_database_project_id,
        error: error instanceof Error ? error.message : "Unknown",
      });
    }
  }

  /**
   * Get connection URI for an app.
   *
   * @param appId App ID
   * @returns Connection URI or null if no database
   */
  async getConnectionUri(appId: string): Promise<string | null> {
    const app = await appsRepository.findById(appId);

    if (!app || app.user_database_status !== "ready") {
      return null;
    }

    return app.user_database_uri || null;
  }

  /**
   * Get database status for an app.
   *
   * @param appId App ID
   * @param includeUri Whether to include connection URI (requires authorization)
   * @returns Database status
   */
  async getStatus(appId: string, includeUri = false): Promise<DatabaseStatus> {
    const app = await appsRepository.findById(appId);

    if (!app) {
      return {
        hasDatabase: false,
        status: "none",
      };
    }

    const status: DatabaseStatus = {
      hasDatabase: app.user_database_status === "ready",
      status: app.user_database_status as UserDatabaseStatus,
      region: app.user_database_region || undefined,
      error: app.user_database_error || undefined,
    };

    if (includeUri && app.user_database_uri) {
      status.connectionUri = app.user_database_uri;
    }

    return status;
  }

  /**
   * Retry provisioning for an app that previously failed.
   *
   * @param appId App ID
   * @param appName App name (used for Neon project name)
   * @param region Optional AWS region
   * @returns Provision result
   */
  async retryProvisioning(
    appId: string,
    appName: string,
    region?: string,
  ): Promise<ProvisionResult> {
    const app = await appsRepository.findById(appId);

    if (!app) {
      return {
        success: false,
        error: "App not found",
        errorCode: "UNKNOWN",
      };
    }

    // Only retry if in error state
    if (app.user_database_status !== "error") {
      if (app.user_database_status === "ready") {
        return {
          success: true,
          connectionUri: app.user_database_uri || undefined,
          projectId: app.user_database_project_id || undefined,
          branchId: app.user_database_branch_id || undefined,
          region: app.user_database_region || region,
        };
      }

      return {
        success: false,
        error: `Cannot retry provisioning: current status is "${app.user_database_status}"`,
        errorCode: "UNKNOWN",
      };
    }

    // Clear error and retry
    await appsRepository.update(appId, {
      user_database_status: "none",
      user_database_error: null,
    });

    return this.provisionDatabase(
      appId,
      appName,
      region || app.user_database_region || "aws-us-east-1",
    );
  }
}

// Singleton export
export const userDatabaseService = new UserDatabaseService();
