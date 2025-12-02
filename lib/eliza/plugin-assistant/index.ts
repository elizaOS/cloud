import {
  EventType,
  logger,
  type MessagePayload,
  type Plugin,
} from "@elizaos/core";
import { providersProvider } from "./providers/providers";
import { actionsProvider } from "./providers/actions";
import { characterProvider } from "./providers/character";
import { generateImageAction } from "./actions/image-generation";
import { actionStateProvider } from "./providers/actionState";
import { recentMessagesProvider } from "./providers/recent-messages";
import { affiliateContextProvider } from "./providers/affiliate-context";
import { handleMessage } from "./handler";
import type { MessageReceivedHandlerParams } from "../shared/types";

const messageReceivedHandler = async ({
  runtime,
  message,
  callback,
}: MessageReceivedHandlerParams): Promise<void> => {
  logger.info(
    `[AssistantPlugin] Handling message for agent: ${runtime.agentId}, room: ${message.roomId}`,
  );
  logger.debug("[AssistantPlugin] MESSAGE RECEIVED:", JSON.stringify(message));

  try {
    await handleMessage({
      runtime,
      message,
      callback,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `[AssistantPlugin] Error in workflow handler: ${errorMessage}`,
    );
    throw error;
  }
};

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
        `[AssistantPlugin] Message sent: ${payload.message.content.text}`,
      );
    },
  ],
};

export const assistantPlugin: Plugin = {
  name: "eliza-assistant",
  description:
    "Core assistant plugin with message handling and workflow routing",
  events,
  providers: [
    providersProvider,
    actionsProvider,
    characterProvider,
    actionStateProvider,
    recentMessagesProvider,
    affiliateContextProvider,
  ],
  actions: [generateImageAction],
  services: [],
};

export default assistantPlugin;
