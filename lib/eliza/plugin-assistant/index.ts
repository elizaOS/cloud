import {
  EventType,
  logger,
  type MessagePayload,
  type Plugin,
} from "@elizaos/core";
import { providersProvider } from "./providers/providers";
import { actionsProvider } from "./providers/actions";
import { characterProvider, recentMessagesProvider, appConfigProvider } from "../shared/providers";
import { generateImageAction } from "./actions/image-generation";
import { affiliateContextProvider } from "./providers/affiliate-context";
import { currentRunContextProvider } from "./providers/current-run-context";
import { handleMessage } from "./handler";
import { roomTitleEvaluator } from "../shared/evaluators";

export const assistantPlugin: Plugin = {
  name: "eliza-assistant",
  description: "Planning-based assistant with action execution capabilities",
  events: {
    [EventType.MESSAGE_RECEIVED]: [
      async (payload: MessagePayload) => {
        if (!payload.callback) return;
        logger.info(`[Assistant] Message received in room ${payload.message.roomId}`);
        await handleMessage({
          runtime: payload.runtime,
          message: payload.message,
          callback: payload.callback,
        });
      },
    ],
  },
  providers: [
    providersProvider,
    actionsProvider,
    characterProvider,
    affiliateContextProvider,
    currentRunContextProvider,
    recentMessagesProvider,
    characterProvider,
  ],
  actions: [generateImageAction],
  evaluators: [roomTitleEvaluator],
};

export default assistantPlugin;
