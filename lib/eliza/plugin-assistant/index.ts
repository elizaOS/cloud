/**
 * Eliza Assistant Plugin
 * 
 * Core assistant plugin with message handling and workflow routing.
 * Supports multiple conversation workflows with different capabilities.
 * 
 * Workflows:
 * - CHAT: Simple, fast single-shot responses (playground mode)
 * - ASSISTANT: Advanced planning-based with action execution
 * - BUILD: Character self-upgrade assistance (coming soon)
 */

import {
  EventType,
  logger,
  type MessagePayload,
  type Plugin,
} from "@elizaos/core";
import { providersProvider } from "./providers/providers";
import { actionsProvider } from "./providers/actions";
import { characterProvider } from "./providers/character";
import { characterGuideProvider } from "./providers/character-guide";
import { currentCharacterProvider } from "./providers/current-character";
import { generateImageAction } from "./actions/image-generation";
import { proposeCharacterChangesAction } from "./actions/propose-character-changes";
import { applyCharacterChangesAction } from "./actions/apply-character-changes";
import { buildChatAction } from "./actions/build-chat";
import { actionStateProvider } from "./providers/actionState";
import {
  WorkflowMode,
  isChatMode,
  isAssistantMode,
  isBuildMode,
  type WorkflowConfig,
} from "../workflow-types";
import { handleChatPlaygroundWorkflow } from "./workflows/chat-playground";
import { handleChatAssistantWorkflow } from "./workflows/chat-assistant";
import { handleBuildModeWorkflow } from "./workflows/build";
import type { IAgentRuntime, Memory, HandlerCallback } from "@elizaos/core";

/**
 * Message handler parameters
 */
interface MessageReceivedHandlerParams {
  runtime: IAgentRuntime;
  message: Memory;
  callback: HandlerCallback;
  workflow?: WorkflowConfig;
}

/**
 * Main message received handler
 * Routes messages to the appropriate workflow based on configuration
 */
const messageReceivedHandler = async ({
  runtime,
  message,
  callback,
  workflow,
}: MessageReceivedHandlerParams): Promise<void> => {
  // Default to CHAT mode if no workflow specified
  const workflowMode = workflow?.mode || WorkflowMode.CHAT;

  logger.info(
    `[AssistantPlugin] Workflow mode: ${workflowMode} for agent: ${runtime.agentId}, room: ${message.roomId}`,
  );
  logger.debug(`[AssistantPlugin] MESSAGE RECEIVED:`, JSON.stringify(message));

  // ============================================================================
  // WORKFLOW ROUTING - Route to appropriate message processing workflow
  // ============================================================================

  try {
    if (workflow && isBuildMode(workflow)) {
      // BUILD MODE: Agent helps user modify/upgrade the character file
      logger.info("[AssistantPlugin] 🔧 Routing to BUILD workflow");
      await handleBuildModeWorkflow({
        runtime,
        message,
        callback,
        workflow,
      });
    } else if (workflow && isAssistantMode(workflow)) {
      // ASSISTANT MODE: Planning-based with action execution
      logger.info("[AssistantPlugin] 🤖 Routing to ASSISTANT workflow");
      await handleChatAssistantWorkflow({
        runtime,
        message,
        callback,
      });
    } else {
      // CHAT MODE (default): Simple, fast single-shot responses
      logger.info("[AssistantPlugin] 💬 Routing to CHAT workflow (default)");
      await handleChatPlaygroundWorkflow({
        runtime,
        message,
        callback,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[AssistantPlugin] Error in workflow handler: ${errorMessage}`);
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
          workflow: (payload as { workflow?: WorkflowConfig }).workflow,
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
export const assistantPlugin: Plugin = {
  name: "eliza-assistant",
  description: "Core assistant plugin with message handling and workflow routing",
  events,
  providers: [
    providersProvider,
    actionsProvider,
    characterProvider,
    characterGuideProvider,      // Build mode: Character design documentation
    currentCharacterProvider,     // Build mode: Current character state
    actionStateProvider,
  ],
  actions: [
    generateImageAction,
    proposeCharacterChangesAction,  // Build mode: Conversational proposal
    applyCharacterChangesAction,    // Build mode: Extract & save changes
    buildChatAction,                // Build mode: Natural conversation
  ],
  services: [],
};

export default assistantPlugin;

// Re-export workflow types for convenience
export { WorkflowMode, type WorkflowConfig } from "../workflow-types";
