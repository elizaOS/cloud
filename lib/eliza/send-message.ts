/**
 * Unified sendMessage helper for cloud-v2
 *
 * Uses runtime.emitEvent(MESSAGE_RECEIVED) to trigger plugin-specific handlers.
 * This preserves the granular control of mode-specific plugins:
 * - plugin-assistant: Actions, image generation, affiliate handling
 * - plugin-character-builder: BUILD mode character editing
 * - plugin-chat-playground: Simple chat mode
 */

import { v4 as uuidv4 } from "uuid";
import {
  EventType,
  elizaLogger,
  createUniqueUuid,
  type UUID,
  type Content,
  type Memory,
  type Media,
  type IAgentRuntime,
} from "@elizaos/core";
import type { UserContext } from "./user-context";
import type { AgentModeConfig } from "./agent-mode-types";
import { executeSideEffects } from "./side-effects";

/**
 * Result from sending a message through the plugin event system
 */
export interface SendMessageResult {
  messageId: UUID;
  userMessage: Memory;
  responseMessageId?: UUID;
  result?: {
    responseContent?: Content;
  };
}

/**
 * Send a message using runtime.emitEvent(MESSAGE_RECEIVED) with cloud-specific side effects.
 *
 * This function:
 * 1. Creates user message Memory
 * 2. Emits MESSAGE_RECEIVED event to trigger plugin handlers
 * 3. Captures response via callback
 * 4. Stores response memory
 * 5. Executes side effects (Discord, room title, anonymous tracking)
 *
 * Using emitEvent ensures plugin-specific handlers are triggered:
 * - CHAT mode → plugin-chat-playground handler
 * - BUILD mode → plugin-character-builder handler
 * - ASSISTANT mode → plugin-assistant handler (with actions, image gen, etc.)
 *
 * @param runtime - The agent runtime (with plugins loaded for the correct mode)
 * @param roomId - Room ID for the conversation
 * @param entityId - Entity ID of the user
 * @param content - Message content (text, attachments, etc.)
 * @param userContext - User context for side effects and mode configuration
 * @param characterId - Optional character ID for Discord integration
 * @param agentModeConfig - Optional mode config override (defaults to userContext.agentMode)
 */
export async function sendMessageWithSideEffects(
  runtime: IAgentRuntime,
  roomId: UUID,
  entityId: UUID,
  content: Content,
  userContext: UserContext,
  characterId?: string,
  agentModeConfig?: AgentModeConfig,
): Promise<SendMessageResult> {
  elizaLogger.info(
    `[sendMessage] Sending message to room ${roomId} from entity ${entityId} (mode: ${userContext.agentMode})`,
  );

  // Use provided mode config or build from userContext
  const modeConfig: AgentModeConfig = agentModeConfig ?? {
    mode: userContext.agentMode,
  };

  // Create user message Memory
  const userMessage = createUserMessage(runtime, roomId, entityId, content);

  // Track response from plugin handlers
  let responseContent: Content | undefined;
  let responseMessageId: UUID | undefined;

  // Emit MESSAGE_RECEIVED to trigger plugin-specific handlers
  // The appropriate plugin (assistant, chat-playground, character-builder) will handle it
  await runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
    runtime,
    message: userMessage,
    agentModeConfig: modeConfig,
    callback: async (callbackContent: Content) => {
      elizaLogger.info(
        "[sendMessage] Callback invoked with content:",
        JSON.stringify(callbackContent).substring(0, 200),
      );

      if (callbackContent.text) {
        responseContent = callbackContent;
        elizaLogger.info(
          `[sendMessage] Captured response (${callbackContent.text.length} chars): ${callbackContent.text.substring(0, 100)}...`,
        );

        // Store response memory (plugins may also do this, but we ensure it's done)
        const responseMemory: Memory = {
          id: createUniqueUuid(runtime, (userMessage.id ?? uuidv4()) as UUID),
          entityId: runtime.agentId,
          agentId: runtime.agentId,
          roomId: roomId,
          content: {
            ...callbackContent,
            source: callbackContent.source || "agent",
            inReplyTo: userMessage.id,
          },
          metadata: {
            type: "agent_response_message",
          },
        };

        await runtime.createMemory(responseMemory, "messages");
        responseMessageId = responseMemory.id as UUID;
        elizaLogger.info(`[sendMessage] Stored response memory: ${responseMemory.id}`);
      } else {
        elizaLogger.warn("[sendMessage] Callback received but no text in content");
      }

      return [];
    },
  });

  elizaLogger.info(
    `[sendMessage] After emitEvent - responseText: ${responseContent?.text ? `"${responseContent.text.substring(0, 100)}..."` : "EMPTY/UNDEFINED"}`,
  );

  // Execute cloud-specific side effects (fire-and-forget)
  const userText = content.text || "";
  const responseText = responseContent?.text || "";
  executeSideEffects(roomId, userText, responseText, userContext, characterId);

  return {
    messageId: userMessage.id as UUID,
    userMessage,
    responseMessageId,
    result: {
      responseContent: responseContent || { text: "", source: "agent" },
    },
  };
}

/**
 * Create a user message Memory object
 */
function createUserMessage(
  runtime: IAgentRuntime,
  roomId: UUID,
  entityId: UUID,
  content: Content,
): Memory {
  return {
    id: uuidv4() as UUID,
    roomId: roomId,
    entityId: entityId,
    agentId: runtime.agentId as UUID,
    createdAt: Date.now(),
    content: {
      text: content.text || "",
      source: content.source || "user",
      ...(content.attachments && Array.isArray(content.attachments) && content.attachments.length > 0
        ? {
            attachments: content.attachments.filter(
              (att): att is Media =>
                typeof att === "object" &&
                att !== null &&
                ("url" in att || "mimeType" in att || "data" in att),
            ) as Media[],
          }
        : {}),
    },
    metadata: {
      type: "user_message",
    },
  };
}
