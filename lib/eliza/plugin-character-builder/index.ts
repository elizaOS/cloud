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
import { roomTitleEvaluator } from "../shared/evaluators";
import { recentMessagesProvider } from "../shared/providers";

export const characterBuilderPlugin: Plugin = {
  name: "eliza-character-builder",
  description: "Character creation and editing assistant",
  events: {
    [EventType.MESSAGE_RECEIVED]: [
      async (payload: MessagePayload) => {
        if (!payload.callback) return;
        logger.info(`[Builder] Message received in room ${payload.message.roomId}`);
        await handleMessage({
          runtime: payload.runtime,
          message: payload.message,
          callback: payload.callback,
        });
      },
    ],
    [EventType.MESSAGE_SENT]: [
      async (payload: MessagePayload) => {
        logger.debug(
          `[Builder] Message sent: ${payload.message.content.text}`,
        );
      },
    ],
  },
  providers: [actionsProvider, characterGuideProvider, currentCharacterProvider, recentMessagesProvider],
  actions: [generateImageAction, proposeCharacterChangesAction, applyCharacterChangesAction, buildChatAction],
  evaluators: [roomTitleEvaluator],
};

export default characterBuilderPlugin;
