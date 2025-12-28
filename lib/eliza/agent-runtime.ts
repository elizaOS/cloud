/**
 * Agent Runtime Manager - Simplified facade for backward compatibility
 * Delegates to RuntimeFactory which handles all caching centrally
 */

import { AgentRuntime, type Media } from "@elizaos/core";
import { runtimeFactory } from "./runtime-factory";
import { createMessageHandler, type MessageResult } from "./message-handler";
import { userContextService, type UserContext } from "./user-context";
import { AgentMode } from "./agent-mode-types";

class AgentRuntimeManager {
  private static instance: AgentRuntimeManager;

  private constructor() {}

  public static getInstance(): AgentRuntimeManager {
    if (!AgentRuntimeManager.instance) {
      AgentRuntimeManager.instance = new AgentRuntimeManager();
    }
    return AgentRuntimeManager.instance;
  }

  /**
   * Get default system runtime
   * Delegates to RuntimeFactory which handles caching centrally
   */
  async getRuntime(): Promise<AgentRuntime> {
    const systemContext = userContextService.createSystemContext(AgentMode.CHAT);
    return runtimeFactory.createRuntimeForUser(systemContext);
  }

  /**
   * Get runtime for a specific character
   * Uses CHAT mode by default
   */
  async getRuntimeForCharacter(characterId?: string): Promise<AgentRuntime> {
    const systemContext = userContextService.createSystemContext(
      AgentMode.CHAT,
    );

    if (characterId) {
      systemContext.characterId = characterId;
    }

    return runtimeFactory.createRuntimeForUser(systemContext);
  }

  /**
   * Handle message - Backward compatibility entry point for non-streaming routes
   * Uses CHAT mode by default
   * Note: entityId is derived from userContext.userId inside MessageHandler
   */
  public async handleMessage(
    roomId: string,
    content: { text?: string; attachments?: Media[] },
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
    // Build user context from settings
    let userContext: UserContext;

    if (userSettings?.userId && userSettings?.apiKey) {
      // Use provided user settings
      userContext = {
        userId: userSettings.userId,
        entityId: userSettings.userId, // entityId === userId
        organizationId: "default", // This would need to be passed in real usage
        agentMode: AgentMode.CHAT, // Default to CHAT mode
        apiKey: userSettings.apiKey,
        modelPreferences: userSettings.modelPreferences,
        characterId,
        isAnonymous: false,
      };
    } else {
      // Create system context as fallback
      userContext = userContextService.createSystemContext(AgentMode.CHAT);
      if (characterId) {
        userContext.characterId = characterId;
      }
    }

    // Create runtime with user context
    const runtime = await runtimeFactory.createRuntimeForUser(userContext);

    // Create message handler
    const messageHandler = createMessageHandler(runtime, userContext);

    // Process message (entityId is derived from userContext.userId inside the handler)
    const result = await messageHandler.process({
      roomId,
      text: content.text || "",
      attachments: content.attachments,
      characterId,
      model: userSettings?.modelPreferences?.largeModel,
    });

    return result;
  }
}

// Export singleton instance
export const agentRuntime = AgentRuntimeManager.getInstance();
