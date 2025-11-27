import {
  EventType,
  logger,
  type MessagePayload,
  type Plugin,
} from "@elizaos/core";
import { actionsProvider } from "./providers/actions";
import { characterGuideProvider } from "./providers/character-guide";
import { currentCharacterProvider } from "./providers/current-character";
import { generateImageAction } from "./actions/image-generation";
import { proposeCharacterChangesAction } from "./actions/propose-character-changes";
import { applyCharacterChangesAction } from "./actions/apply-character-changes";
import { buildChatAction } from "./actions/build-chat";
import { handleMessage } from "./handler";
import type { IAgentRuntime, Memory, HandlerCallback } from "@elizaos/core";

/**
 * Message handler parameters
 */
interface MessageReceivedHandlerParams {
  runtime: IAgentRuntime;
  message: Memory;
  callback: HandlerCallback;
}

/**
 * Main message received handler
 * Routes messages to the appropriate workflow based on configuration
 */
const messageReceivedHandler = async ({
  runtime,
  message,
  callback,
}: MessageReceivedHandlerParams): Promise<void> => {
  logger.info(
    `[Builder] Handling message for agent: ${runtime.agentId}, room: ${message.roomId}`,
  );
  logger.debug(`[Builder] MESSAGE RECEIVED:`, JSON.stringify(message));

  // ============================================================================
  // WORKFLOW ROUTING - Route to appropriate message processing workflow
  // ============================================================================

  try {
    await handleMessage({
      runtime,
      message,
      callback,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[CharacterBuilderPlugin] Error in message received handler: ${errorMessage}`);
    throw error;
  }
};

/**
 * Event handlers
 */
const events = {
  [EventType.MESSAGE_RECEIVED]: [
    async (payload: MessagePayload) => {
      if (payload.callback) {
        await messageReceivedHandler({
          runtime: payload.runtime,
          message: payload.message,
          callback: payload.callback,
        });
      }
    },
  ],

  [EventType.MESSAGE_SENT]: [
    async (payload: MessagePayload) => {
      logger.debug(`[AssistantPlugin] Message sent: ${payload.message.content.text}`);
    },
  ],
};

/**
 * Assistant Plugin Export
 */
export const characterBuilderPlugin: Plugin = {
  name: "eliza-assistant",
  description: "Core assistant plugin with message handling and workflow routing",
  events,
    providers: [
    actionsProvider,
    characterGuideProvider,
    currentCharacterProvider,
  ],
  actions: [
    generateImageAction,
    proposeCharacterChangesAction,
    applyCharacterChangesAction,
    buildChatAction,
  ],
  services: [],
};

export default characterBuilderPlugin;
