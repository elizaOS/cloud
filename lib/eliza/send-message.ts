/**
 * Unified sendMessage helper for cloud-v2
 *
 * Uses ElizaOS.sendMessage() from core with cloud-specific side effects.
 * This provides iso behavior between server (persistent) and serverless (ephemeral) modes.
 */

import {
  ElizaOS,
  elizaLogger,
  type UUID,
  type Content,
  type IAgentRuntime,
  type SendMessageResult,
} from "@elizaos/core";
import type { UserContext } from "./user-context";
import { executeSideEffects } from "./side-effects";

/**
 * Send a message using the core ElizaOS.sendMessage() with cloud-specific side effects.
 *
 * This function:
 * 1. Calls elizaOS.sendMessage(runtime, ...)
 * 2. Executes side effects (Discord, room title, anonymous tracking)
 * 3. Returns the core SendMessageResult
 *
 * @param elizaOS - The ElizaOS instance
 * @param runtime - The agent runtime
 * @param roomId - Room ID for the conversation
 * @param entityId - Entity ID of the user
 * @param content - Message content (text, attachments, etc.)
 * @param userContext - User context for side effects
 * @param characterId - Optional character ID for Discord integration
 */
export async function sendMessageWithSideEffects(
  elizaOS: ElizaOS,
  runtime: IAgentRuntime,
  roomId: UUID,
  entityId: UUID,
  content: Content,
  userContext: UserContext,
  characterId?: string,
): Promise<SendMessageResult> {
  elizaLogger.info(
    `[sendMessage] Sending message to room ${roomId} from entity ${entityId}`,
  );

  const result = await elizaOS.sendMessage(runtime, {
    entityId,
    roomId,
    content: {
      ...content,
      source: content.source || "cloud",
    },
  });

  const responseText = result.result?.responseContent?.text || "";
  const userText = content.text || "";

  elizaLogger.info(
    `[sendMessage] Got response (${responseText.length} chars): ${responseText.substring(0, 100)}...`,
  );

  executeSideEffects(roomId, userText, responseText, userContext, characterId);

  return result;
}