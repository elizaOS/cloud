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
import { cleanPrompt, runEvaluatorsWithTimeout } from "../shared/utils/helpers";
import type { MessageReceivedHandlerParams } from "../shared/types";

function parsePlanningResponse(response: string): { thought: string; actions: string } | null {
  const parsed = parseKeyValueXml(response) as { thought?: string; actions?: string } | null;
  if (!parsed?.actions) return null;
  return { thought: parsed.thought || "", actions: parsed.actions };
}

/**
 * Build mode handler for character creation/editing.
 */
export async function handleMessage({
  runtime,
  message,
  callback,
}: MessageReceivedHandlerParams): Promise<void> {
  const responseId = v4();
  const runId = asUUID(v4());
  const startTime = Date.now();
  const originalSystemPrompt = runtime.character.system;

  if (message.entityId === runtime.agentId) {
    throw new Error("Message is from the agent itself");
  }

  await setLatestResponseId(runtime, message.roomId, responseId);
  await runtime.emitEvent(EventType.RUN_STARTED, {
    runtime, runId, messageId: message.id, roomId: message.roomId, entityId: message.entityId,
    startTime, status: "started", source: "buildModeWorkflow",
  });

  try {
    await runtime.createMemory(message, "messages");

    const state = await runtime.composeState(message, [
      "SUMMARIZED_CONTEXT", "RECENT_MESSAGES", "LONG_TERM_MEMORY", "ACTIONS",
    ]);

    runtime.character.system = cleanPrompt(composePromptFromState({ state, template: buildModeSystemPrompt }));
    const planningResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
      prompt: cleanPrompt(composePromptFromState({ state, template: buildModePlanningTemplate })),
    });
    runtime.character.system = originalSystemPrompt;

    const plan = parsePlanningResponse(planningResponse);
    const selectedAction = parsePlannedItems(plan?.actions)[0] || "BUILD_CHAT";

    logger.info(`[Builder] Executing action: ${selectedAction}`);

    const actionResponse: Memory = {
      id: createUniqueUuid(runtime, v4() as UUID),
      entityId: runtime.agentId,
      agentId: runtime.agentId,
      roomId: message.roomId,
      worldId: message.worldId,
      content: { thought: plan?.thought, actions: [selectedAction], source: "agent" },
    };

    await runtime.processActions(message, [actionResponse], state, callback);

    if (!(await isResponseStillValid(runtime, message.roomId, responseId))) return;
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
      runtime, runId, messageId: message.id, roomId: message.roomId, entityId: message.entityId,
      startTime, status: "completed", endTime: Date.now(), duration: Date.now() - startTime,
      source: "buildModeWorkflow", selectedAction,
    });
  } catch (error) {
    runtime.character.system = originalSystemPrompt;
    await runtime.emitEvent(EventType.RUN_ENDED, {
      runtime, runId, messageId: message.id, roomId: message.roomId, entityId: message.entityId,
      startTime, status: "error", endTime: Date.now(), duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
      source: "buildModeWorkflow",
    });
    throw error;
  }
}
