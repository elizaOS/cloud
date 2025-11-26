/**
 * Agent Runtime Manager - Simplified facade for backward compatibility
 * Now delegates to RuntimeFactory and MessageHandler for cleaner architecture
 */

import { AgentRuntime, type Memory, type UUID } from "@elizaos/core";
import { runtimeFactory } from "./runtime-factory";
import { createMessageHandler, type MessageResult } from "./message-handler";
import { userContextService, type UserContext } from "./user-context";
import { logger } from "@/lib/utils/logger";

// Legacy compatibility layer
class AgentRuntimeManager {
  private static instance: AgentRuntimeManager;

  private constructor() {
    logger.info("[AgentRuntime] Initialized simplified runtime manager");
  }

  public static getInstance(): AgentRuntimeManager {
    if (!AgentRuntimeManager.instance) {
      AgentRuntimeManager.instance = new AgentRuntimeManager();
    }
    return AgentRuntimeManager.instance;
  }

  public isReady(): boolean {
    return true;
  }

  /**
   * Get default runtime (for backward compatibility)
   * Creates a system context runtime
   */
  async getRuntime(): Promise<AgentRuntime> {
    logger.info("[AgentRuntime] Creating default runtime with system context");
    const systemContext = userContextService.createSystemContext();
    return runtimeFactory.createRuntimeForUser(systemContext);
  }

  /**
   * Get runtime for a specific character (for backward compatibility)
   */
  async getRuntimeForCharacter(characterId?: string): Promise<AgentRuntime> {
    const systemContext = userContextService.createSystemContext();

    if (characterId) {
      systemContext.characterId = characterId;
    }

    return runtimeFactory.createRuntimeForUser(systemContext);
  }

  /**
   * Handle message - Main entry point for processing messages
   * This method maintains backward compatibility while using the new architecture
   */
  public async handleMessage(
    roomId: string,
    entityId: string,
    content: { text?: string; attachments?: unknown[] },
    characterId?: string,
    userSettings?: {
      userId?: string;
      apiKey?: string;
      modelPreferences?: {
        smallModel?: string;
        largeModel?: string;
      };
    },
  ): Promise<MessageResult> {
    logger.info("[AgentRuntime] Processing message via new architecture", {
      roomId,
      entityId,
      hasUserSettings: !!userSettings,
    });

    // Build user context from settings (backward compatibility)
    let userContext: UserContext;

    if (userSettings?.userId && userSettings?.apiKey) {
      // Use provided user settings
      userContext = {
        userId: userSettings.userId,
        entityId: userSettings.userId, // entityId === userId
        organizationId: "default", // This would need to be passed in real usage
        apiKey: userSettings.apiKey,
        modelPreferences: userSettings.modelPreferences,
        characterId,
        isAnonymous: false,
      };
    } else {
      // Create system context as fallback
      userContext = userContextService.createSystemContext();
      if (characterId) {
        userContext.characterId = characterId;
      }
    }

    // Create runtime with user context
    const runtime = await runtimeFactory.createRuntimeForUser(userContext);

    // Create message handler
    const messageHandler = createMessageHandler(runtime, userContext);

    // Process message
    const result = await messageHandler.process({
      roomId,
      entityId,
      text: content.text || "",
      attachments: content.attachments,
      characterId,
      model: userSettings?.modelPreferences?.largeModel,
    });

    return result;
  }
}

// Export singleton instance for backward compatibility
export const agentRuntime = AgentRuntimeManager.getInstance();
