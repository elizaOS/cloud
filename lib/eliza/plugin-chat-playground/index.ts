import {
  EventType,
  logger,
  type MessagePayload,
  type Plugin,
} from "@elizaos/core";
import { characterProvider } from "./providers/character";
import { handleMessage } from "./handler";
import { roomTitleEvaluator } from "../shared/evaluators";

export const chatPlaygroundPlugin: Plugin = {
  name: "eliza-chat-playground",
  description: "Simple chat mode with MCP tool support",
  events: {
    [EventType.MESSAGE_RECEIVED]: [
      async (payload: MessagePayload) => {
        if (!payload.callback) return;
        logger.info(`[Playground] Message received in room ${payload.message.roomId}`);
        await handleMessage({
          runtime: payload.runtime,
          message: payload.message,
          callback: payload.callback,
        });
      },
    ],
  },
  providers: [characterProvider],
  actions: [],
  evaluators: [roomTitleEvaluator],
};

export default chatPlaygroundPlugin;
