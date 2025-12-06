import {
  EventType,
  logger,
  type MessagePayload,
  type Plugin,
} from "@elizaos/core";
import { characterProvider } from "./providers/character";
import { handleMessage } from "./handler";
import { roomTitleEvaluator } from "../shared/evaluators";
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
  // Default to CHAT mode if no workflow specified

  logger.info(
    `[ChatPlayground] Handling message for agent: ${runtime.agentId}, room: ${message.roomId}`,
  );
  logger.debug(`[ChatPlayground] MESSAGE RECEIVED:`, JSON.stringify(message));

  try {
    await handleMessage({
      runtime,
      message,
      callback,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `[ChatPlaygroundPlugin] Error in message received handler: ${errorMessage}`,
    );
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
      logger.debug(
        `[ChatPlaygroundPlugin] Message sent: ${payload.message.content.text}`,
      );
    },
  ],
};

/**
 * Assistant Plugin Export
 */
export const chatPlaygroundPlugin: Plugin = {
  name: "eliza-chat-playground",
  description:
    "Chat playground plugin with message handling and workflow routing",
  events,
  providers: [characterProvider],
  actions: [],
  evaluators: [roomTitleEvaluator],
  services: [],
};

export default chatPlaygroundPlugin;
