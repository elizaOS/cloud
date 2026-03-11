import {
  EventType,
  logger,
  type MessagePayload,
  type Plugin,
} from "@elizaos/core";
import { providersProvider } from "./providers/providers";
import { actionsProvider } from "./providers/actions";
import { characterProvider } from "../shared/providers/character";
import { recentMessagesProvider } from "../shared/providers/recent-messages";
import { appConfigProvider } from "../shared/providers/app-config";
import { generateImageAction } from "./actions/image-generation";
import { currentRunContextProvider } from "./providers/current-run-context";
import { handleMessage } from "./handler";
import { roomTitleEvaluator } from "../shared/evaluators/room-title";
import type {
  StreamChunkCallback,
  ReasoningChunkCallback,
} from "../shared/types";

export const assistantPlugin: Plugin = {
  name: "eliza-assistant",
  description: "Planning-based assistant with action execution capabilities",
  events: {
    [EventType.MESSAGE_RECEIVED]: [
      async (payload: MessagePayload) => {
        if (!payload.callback) return;
        // Extract streaming callbacks if present (added by eliza-cloud message handler)
        const extendedPayload = payload as MessagePayload & {
          onStreamChunk?: StreamChunkCallback;
          onReasoningChunk?: ReasoningChunkCallback;
        };
        const onStreamChunk = extendedPayload.onStreamChunk;
        const onReasoningChunk = extendedPayload.onReasoningChunk;
        logger.info(
          `[Assistant] Message received in room ${payload.message.roomId}, streaming=${!!onStreamChunk}, reasoning=${!!onReasoningChunk}`,
        );
        await handleMessage({
          runtime: payload.runtime,
          message: payload.message,
          callback: payload.callback,
          onStreamChunk,
          onReasoningChunk,
        });
      },
    ],
  },
  providers: [
    providersProvider,
    actionsProvider,
    characterProvider,
    currentRunContextProvider,
    recentMessagesProvider,
    appConfigProvider,
  ],
  actions: [generateImageAction],
  evaluators: [roomTitleEvaluator],
};

export default assistantPlugin;
