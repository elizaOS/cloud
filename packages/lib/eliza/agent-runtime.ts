/**
 * Agent Runtime Utilities - Backward compatibility layer for non-streaming routes.
 * New code should use RuntimeFactory and MessageHandler directly.
 */

import { AgentRuntime, type Media } from "@elizaos/core";
import { AgentMode } from "./agent-mode-types";
import { createMessageHandler, type MessageResult } from "./message-handler";
import { runtimeFactory } from "./runtime-factory";
import { type UserContext, userContextService } from "./user-context";

/**
 * Get default system runtime.
 * @deprecated Use runtimeFactory.createRuntimeForUser() with proper UserContext
 */
export async function getRuntime(): Promise<AgentRuntime> {
  const systemContext = userContextService.createSystemContext(AgentMode.CHAT);
  return runtimeFactory.createRuntimeForUser(systemContext);
}

/**
 * Get runtime for a specific character.
 * @deprecated Use runtimeFactory.createRuntimeForUser() with proper UserContext
 */
export async function getRuntimeForCharacter(characterId?: string): Promise<AgentRuntime> {
  const systemContext = userContextService.createSystemContext(AgentMode.CHAT);
  if (characterId) {
    systemContext.characterId = characterId;
  }
  return runtimeFactory.createRuntimeForUser(systemContext);
}

/**
 * Handle message - Backward compatibility entry point for non-streaming routes.
 * @deprecated Use MessageHandler directly with proper UserContext from auth
 */
export async function handleMessage(
  roomId: string,
  content: { text?: string; attachments?: Media[] },
  characterId?: string,
  userSettings?: {
    userId?: string;
    apiKey?: string;
    modelPreferences?: {
      nanoModel?: string;
      miniModel?: string;
      smallModel?: string;
      largeModel?: string;
      megaModel?: string;
      responseHandlerModel?: string;
      shouldRespondModel?: string;
      actionPlannerModel?: string;
      plannerModel?: string;
      responseModel?: string;
      mediaDescriptionModel?: string;
    };
  },
): Promise<MessageResult> {
  let userContext: UserContext;

  if (userSettings?.userId && userSettings?.apiKey) {
    userContext = {
      userId: userSettings.userId,
      entityId: userSettings.userId,
      organizationId: "default",
      agentMode: AgentMode.CHAT,
      apiKey: userSettings.apiKey,
      modelPreferences: userSettings.modelPreferences,
      characterId,
      isAnonymous: false,
    };
  } else {
    userContext = userContextService.createSystemContext(AgentMode.CHAT);
    if (characterId) {
      userContext.characterId = characterId;
    }
  }

  const runtime = await runtimeFactory.createRuntimeForUser(userContext);
  const messageHandler = createMessageHandler(runtime, userContext);

  // PERF: Use single-shot mode for backward-compat handlers (primarily messaging app webhooks).
  // These are conversational and don't need multi-step tool use.
  return messageHandler.process({
    roomId,
    text: content.text || "",
    attachments: content.attachments,
    characterId,
    model: userSettings?.modelPreferences?.largeModel,
  });
}

// Legacy export for backward compatibility
export const agentRuntime = {
  getRuntime,
  getRuntimeForCharacter,
  handleMessage,
};
