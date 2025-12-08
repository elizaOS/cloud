/**
 * Agent Runtime Manager - Simplified facade
 * Now delegates to RuntimeFactory and MessageHandler for cleaner architecture
 */

import { AgentRuntime, type Media } from "@elizaos/core";
import { runtimeFactory } from "./runtime-factory";
import { createMessageHandler, type MessageResult } from "./message-handler";
import { userContextService, type UserContext } from "./user-context";
import { AgentMode } from "./agent-mode-types";
import { logger } from "@/lib/utils/logger";
class AgentRuntimeManager {
  private static instance: AgentRuntimeManager;

  // Cache for the default system runtime to avoid expensive re-initialization
  private cachedSystemRuntime: AgentRuntime | null = null;
  private systemRuntimePromise: Promise<AgentRuntime> | null = null;

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
   * Get default runtime
   * Creates a system context runtime with CHAT mode - CACHED to avoid expensive re-initialization
   */
  async getRuntime(): Promise<AgentRuntime> {
    // Return cached runtime if available
    if (this.cachedSystemRuntime) {
      return this.cachedSystemRuntime;
    }

    // If already creating, wait for that promise
    if (this.systemRuntimePromise) {
      return this.systemRuntimePromise;
    }

    // Create new runtime and cache it
    logger.info(
      "[AgentRuntime] Creating default runtime with system context (will be cached)",
    );
    this.systemRuntimePromise = (async () => {
      const systemContext = userContextService.createSystemContext(
        AgentMode.CHAT,
      );
      const runtime = await runtimeFactory.createRuntimeForUser(systemContext);
      this.cachedSystemRuntime = runtime;
      this.systemRuntimePromise = null;
      return runtime;
    })();

    return this.systemRuntimePromise;
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
   * Handle message - Main entry point for processing messages
   * Uses CHAT mode by default
   * Note: entityId is now derived from userContext.userId inside MessageHandler
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
    logger.info("[AgentRuntime] Processing message via new architecture", {
      roomId,
      hasUserSettings: !!userSettings,
    });

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
