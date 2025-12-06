/**
 * User Context Service - Single source of truth for user-related data
 * Handles authentication context, API keys, and user preferences
 */

import { apiKeysService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";
import type { AgentMode } from "./agent-mode-types";
import type { UserWithOrganization, ApiKey } from "@/lib/types";
import type { AnonymousSession } from "@/db/schemas";

export interface UserContext {
  // Core identity
  userId: string;
  entityId: string; // Always equals userId in your system
  organizationId: string;

  // Agent configuration
  agentMode: AgentMode;

  // Runtime configuration
  apiKey: string;
  modelPreferences?: {
    smallModel?: string;
    largeModel?: string;
  };

  // Character overrides
  characterId?: string;

  // Session metadata
  isAnonymous: boolean;
  sessionToken?: string;

  // User details
  name?: string;
  email?: string;

  // App monetization context (for miniapp billing)
  appId?: string;
}

export class UserContextService {
  private static instance: UserContextService;

  static getInstance(): UserContextService {
    if (!this.instance) {
      this.instance = new UserContextService();
    }
    return this.instance;
  }

  /**
   * Build complete user context from authentication result
   * Single point for all user-related data retrieval
   */
  async buildContext(authResult: {
    user: UserWithOrganization;
    apiKey?: ApiKey;
    isAnonymous?: boolean;
    anonymousSession?: AnonymousSession;
    agentMode: AgentMode;
    appId?: string;
  }): Promise<UserContext> {
    if (authResult.isAnonymous && authResult.anonymousSession) {
      return this.buildAnonymousContext(
        authResult.user,
        authResult.anonymousSession,
        authResult.agentMode,
        authResult.appId,
      );
    }

    // For authenticated users, entityId === userId (clear mapping)
    const entityId = authResult.user.id;

    // Get API key once, here (no more fetching at route level)
    const apiKey = await this.getUserApiKey(
      authResult.user.id,
      authResult.user.organization_id,
    );

    if (!apiKey) {
      logger.error(
        `[UserContext] No API key found for user ${authResult.user.id}`,
      );
      throw new Error(
        "No API key found for your account. Please contact support or try logging out and back in.",
      );
    }

    logger.info(
      `[UserContext] Built context for user ${authResult.user.id} (mode: ${authResult.agentMode}): ${apiKey.substring(0, 12)}...`,
    );

    return {
      userId: authResult.user.id,
      entityId: entityId,
      organizationId: authResult.user.organization_id,
      agentMode: authResult.agentMode,
      apiKey,
      isAnonymous: false,
      modelPreferences: authResult.user.model_preferences,
      name: authResult.user.name,
      email: authResult.user.email,
      appId: authResult.appId,
    };
  }

  /**
   * Get user's ElizaOS Cloud API key from database
   * Centralized API key retrieval - no more scattered getUserElizaCloudApiKey calls
   */
  private async getUserApiKey(
    userId: string,
    orgId: string,
  ): Promise<string | null> {
    // Validate inputs
    if (!userId || userId.trim() === "") {
      logger.error("[UserContext] Invalid userId provided");
      return null;
    }

    if (!orgId || orgId.trim() === "") {
      logger.error(`[UserContext] Invalid organizationId for user ${userId}`);
      return null;
    }

    try {
      const apiKeys = await apiKeysService.listByOrganization(orgId);

      // Find user's first active API key
      const userKey = apiKeys.find(
        (key) => key.user_id === userId && key.is_active,
      );

      if (!userKey) {
        logger.warn(`[UserContext] No API key found for user ${userId}`);
        return null;
      }

      // Return the full key from the database
      logger.info(
        `[UserContext] Retrieved key for user ${userId}: ${userKey.key_prefix}***`,
      );
      return userKey.key;
    } catch (error) {
      logger.error(
        `[UserContext] Error getting API key for user ${userId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Build context for anonymous users
   * Uses a shared runtime with limited capabilities
   */
  private buildAnonymousContext(
    user: UserWithOrganization,
    session: AnonymousSession,
    agentMode: AgentMode,
    appId?: string,
  ): UserContext {
    const entityId = session.id || user.id;

    logger.info(
      `[UserContext] Built anonymous context for session ${session.session_token} (mode: ${agentMode})`,
    );

    return {
      userId: user.id || "anonymous",
      entityId: entityId,
      organizationId: user.organization_id || "public",
      agentMode,
      apiKey: process.env.SHARED_ELIZAOS_API_KEY || "",
      isAnonymous: true,
      sessionToken: session.session_token,
      name: user.name || "Anonymous",
      email: user.email,
      appId,
    };
  }

  /**
   * Create context for system/internal operations
   * Used when the system needs to perform operations without a user
   */
  createSystemContext(agentMode: AgentMode): UserContext {
    return {
      userId: "system",
      entityId: "system",
      organizationId: "system",
      agentMode,
      apiKey:
        process.env.SYSTEM_ELIZAOS_API_KEY ||
        process.env.SHARED_ELIZAOS_API_KEY ||
        "",
      isAnonymous: false,
      name: "System",
    };
  }
}

// Export singleton instance for convenience
export const userContextService = UserContextService.getInstance();
