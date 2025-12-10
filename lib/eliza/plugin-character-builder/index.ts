import {
  EventType,
  logger,
  type MessagePayload,
  type Plugin,
} from "@elizaos/core";
import { actionsProvider } from "./providers/actions";
import { assistantGuideProvider } from "./providers/assistant-guide";
import { characterGuideProvider } from "./providers/character-guide";
import { currentCharacterProvider } from "./providers/current-character";
import { generateImageAction } from "./actions/image-generation";
import { suggestChangesAction } from "./actions/suggest-changes";
import { createCharacterAction } from "./actions/create-character";
import { saveChangesAction } from "./actions/save-changes";
import { testResponseAction } from "./actions/test-response";
import { builderChatAction } from "./actions/builder-chat";
import { guideOnboardingAction } from "./actions/guide-onboarding";
import { handleMessage } from "./handler";
import { roomTitleEvaluator } from "../shared/evaluators";
import { characterProvider,recentMessagesProvider } from "../shared/providers";

/**
 * Character Builder Plugin
 *
 * Provides AI-assisted character creation and editing.
 *
 * Two modes:
 * - CREATOR MODE: Chat with Eliza to create new characters/assistants
 * - BUILD MODE: Edit existing characters with the character itself
 *
 * Actions:
 * - GUIDE_ONBOARDING: Initial setup, determine build type (creator mode only)
 * - SUGGEST_CHANGES: Expert guidance with optional character JSON preview
 * - CREATE_CHARACTER: Finalize and save new character (creator mode only)
 * - SAVE_CHANGES: Save changes to existing character (build mode only)
 * - TEST_RESPONSE: Simulate character response (build mode only)
 * - BUILDER_CHAT: General conversation (both modes)
 * - GENERATE_IMAGE: Generate images for character
 */
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
        logger.debug(`[Builder] Message sent: ${payload.message.content.text}`);
      },
    ],
  },
  providers: [
    actionsProvider,
    assistantGuideProvider,
    characterGuideProvider,
    currentCharacterProvider,
    recentMessagesProvider,
    characterProvider,
  ],
  actions: [
    // Creator mode actions
    guideOnboardingAction,
    createCharacterAction,
    // Build mode actions
    saveChangesAction,
    testResponseAction,
    // Shared actions (both modes)
    suggestChangesAction,
    builderChatAction,
    generateImageAction,
  ],
  evaluators: [roomTitleEvaluator],
};

export default characterBuilderPlugin;
