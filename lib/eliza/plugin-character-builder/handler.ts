import {
  asUUID,
  composePromptFromState,
  createUniqueUuid,
  EventType,
  logger,
  type Memory,
  ModelType,
  parseKeyValueXml,
  type UUID,
} from "@elizaos/core";
import { v4 } from "uuid";
import {
  setLatestResponseId,
  clearLatestResponseId,
  isResponseStillValid,
} from "../shared/utils/response-tracking";
import {
  buildModeSystemPrompt,
  buildModePlanningTemplate,
} from "./prompts/build-mode-prompts";
import { parsePlannedItems } from "../shared/utils/parsers";
import { runEvaluatorsWithTimeout } from "../shared/utils/helpers";
import type { MessageReceivedHandlerParams } from "../shared/types";

/**
 * Parse planning response to extract thought and selected action
 */
function parsePlanningResponse(response: string): {
  thought: string;
  actions: string;
} | null {
  const parsed = parseKeyValueXml(response) as {
    thought?: string;
    actions?: string;
  } | null;

  if (!parsed || !parsed.actions) {
    return null;
  }

  return {
    thought: parsed.thought || "",
    actions: parsed.actions || "",
  };
}

/**
 * Build Mode Workflow Handler
 */
export async function handleMessage({
  runtime,
  message,
  callback,
}: MessageReceivedHandlerParams): Promise<void> {
  const responseId = v4();
  const runId = asUUID(v4());
  const startTime = Date.now();

  logger.info("[BuildMode] 🔧 BUILD MODE WORKFLOW - Starting");
  logger.debug(
    `[BuildMode] Character: ${runtime.character.name} (ID: ${runtime.character.id})`,
  );

  await setLatestResponseId(runtime, message.roomId, responseId);

  // Emit run started event
  await runtime.emitEvent(EventType.RUN_STARTED, {
    runtime,
    runId,
    messageId: message.id,
    roomId: message.roomId,
    entityId: message.entityId,
    startTime,
    status: "started",
    source: "buildModeWorkflow",
  });

  const originalSystemPrompt = runtime.character.system;

  try {
    if (message.entityId === runtime.agentId) {
      throw new Error("Message is from the agent itself");
    }

    // Save user message.
    await runtime.createMemory(message, "messages");

    // ========================================
    // PHASE 1: Compose State with Providers
    // ========================================
    logger.info("[BuildMode] Phase 1: Composing state");

    const state = await runtime.composeState(message, [
      "SUMMARIZED_CONTEXT",
      "RECENT_MESSAGES",
      "LONG_TERM_MEMORY",
      "ACTIONS",
    ]);

    // ========================================
    // PHASE 2: PLANNING - Analyze & Select Action
    // ========================================

    // Set build mode system prompt
    const composedSystemPrompt = composePromptFromState({
      state,
      template: buildModeSystemPrompt,
    });
    runtime.character.system = composedSystemPrompt;

    const planningPrompt = composePromptFromState({
      state,
      template: buildModePlanningTemplate,
    });

    const planningResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
      prompt: planningPrompt,
    });

    // Reset the system prompt to the original
    runtime.character.system = originalSystemPrompt;

    const plan = parsePlanningResponse(planningResponse);
    if (!plan) {
      logger.warn("[BuildMode] Failed to parse plan, defaulting to BUILD_CHAT");
    }

    // Parse the selected actions
    const plannedActions = parsePlannedItems(plan?.actions);
    const selectedAction = plannedActions[0] || "BUILD_CHAT";

    logger.info(`[BuildMode] Selected Action: ${selectedAction}`);
    logger.debug(
      `[BuildMode] Thought: ${plan?.thought?.substring(0, 200) || ""}...`,
    );

    // ========================================
    // PHASE 3: Update State with Reasoning Trace
    // ========================================
    // TODO: save agent plan to memory.

    // ========================================
    // PHASE 4: Execute Selected Action
    // ========================================
    logger.info(`[BuildMode] Phase 4: Executing action - ${selectedAction}`);

    // Create action response memory for processing
    const actionResponse: Memory = {
      id: createUniqueUuid(runtime, v4() as UUID),
      entityId: runtime.agentId,
      agentId: runtime.agentId,
      roomId: message.roomId,
      worldId: message.worldId,
      content: {
        thought: plan?.thought,
        actions: [selectedAction],
        source: "agent",
      },
    };

    // Process the selected action - it will handle its own prompts and callback
    await runtime.processActions(message, [actionResponse], state, callback);

    // Restore original system prompt
    runtime.character.system = originalSystemPrompt;

    logger.info(`[BuildMode] Action execution completed`);

    // ========================================
    // PHASE 5: Cleanup
    // ========================================

    // Check if this is still the latest response
    if (!(await isResponseStillValid(runtime, message.roomId, responseId))) {
      logger.info(
        "[BuildMode] Response discarded - newer message being processed",
      );
      return;
    }

    await clearLatestResponseId(runtime, message.roomId);

    // Run evaluators asynchronously in background (e.g., room title generation)
    await runEvaluatorsWithTimeout(
      runtime,
      message,
      state,
      actionResponse,
      callback,
    );

    await runtime.emitEvent(EventType.RUN_ENDED, {
      runtime,
      runId,
      messageId: message.id,
      roomId: message.roomId,
      entityId: message.entityId,
      startTime,
      status: "completed",
      endTime: Date.now(),
      duration: Date.now() - startTime,
      source: "buildModeWorkflow",
      selectedAction,
    });
  } catch (error) {
    // Restore system prompt on error
    runtime.character.system = originalSystemPrompt;

    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error("[BuildMode] Workflow error:", errorMsg);

    await runtime.emitEvent(EventType.RUN_ENDED, {
      runtime,
      runId,
      messageId: message.id,
      roomId: message.roomId,
      entityId: message.entityId,
      startTime,
      status: "error",
      endTime: Date.now(),
      duration: Date.now() - startTime,
      error: errorMsg,
      source: "buildModeWorkflow",
    });
    throw error;
  }
}
