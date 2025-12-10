import {
  asUUID,
  composePromptFromState,
  createUniqueUuid,
  EventType,
  logger,
  type IAgentRuntime,
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
import {
  cleanPrompt,
  runEvaluatorsWithTimeout,
  isCreatorMode,
  DEFAULT_ELIZA_ID,
} from "../shared/utils/helpers";
import type { MessageReceivedHandlerParams } from "../shared/types";
import { roomTitleTemplate } from "../shared/evaluators/room-title";

function parsePlanningResponse(response: string): { thought: string; actions: string } | null {
  const parsed = parseKeyValueXml(response) as { thought?: string; actions?: string } | null;
  if (!parsed?.actions) return null;
  return { thought: parsed.thought || "", actions: parsed.actions };
}

/**
 * Temp: Generate room title on first message since evaluators don't run in this flow
 */
async function maybeGenerateRoomTitle(runtime: IAgentRuntime, message: Memory): Promise<void> {
  const existingMessages = await runtime.getMemories({
    tableName: "messages",
    roomId: message.roomId,
    count: 1,
    unique: false,
  });
  if (existingMessages.length > 0) return;

  const room = await runtime.getRoom(message.roomId);
  if (!room || (room.name && room.name !== "New Chat")) return;

  const state = await runtime.composeState(message, ["RECENT_MESSAGES"]);
  const prompt = composePromptFromState({ state, template: roomTitleTemplate });

  const response = await runtime.useModel(ModelType.TEXT_SMALL, { prompt });
  if (!response) return;

  const parsed = parseKeyValueXml(response) as { title?: string } | null;
  if (!parsed?.title) return;

  let title = parsed.title
    .trim()
    .replace(/^["']|["']$/g, "")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  if (title.length > 60) title = title.substring(0, 57) + "...";

  await runtime.updateRoom({ ...room, name: title });
  await runtime.setCache<boolean>(`room-title-generated-${message.roomId}`, true);
  logger.info(`[BuildMode] Generated room title: "${title}"`);
}

/**
 * Build mode handler for character creation/editing.
 *
 * Two distinct flows:
 * - Creator Mode: runtime.character.id === DEFAULT_ELIZA_ID (building new character)
 * - Build Mode: runtime.character.id !== DEFAULT_ELIZA_ID (editing existing character)
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

  const creatorMode = isCreatorMode(runtime);
  const modeLabel = creatorMode ? "Creator" : "Build";

  logger.info(`[${modeLabel}] Processing message in room ${message.roomId}`);

  await setLatestResponseId(runtime, message.roomId, responseId);
  await runtime.emitEvent(EventType.RUN_STARTED, {
    runtime,
    runId,
    messageId: message.id,
    roomId: message.roomId,
    entityId: message.entityId,
    startTime,
    status: "started",
    source: "build-mode",
    mode: modeLabel,
  });

  try {
    await maybeGenerateRoomTitle(runtime, message);
    await runtime.createMemory(message, "messages");

    // Compose state with all providers including actions
    const state = await runtime.composeState(message, [
      "SUMMARIZED_CONTEXT",
      "RECENT_MESSAGES",
      "LONG_TERM_MEMORY",
      "ACTIONS",
    ]);

    // Inject mode context for planning phase
    state.values = {
      ...state.values,
      isCreatorMode: creatorMode,
      modeLabel,
      characterId: runtime.character.id || DEFAULT_ELIZA_ID,
      characterName: runtime.character.name,
    };

    // Planning phase - let the model decide the best action
    runtime.character.system = cleanPrompt(
      composePromptFromState({ state, template: buildModeSystemPrompt }),
    );
  
    const planningPrompt = cleanPrompt(composePromptFromState({ state, template: buildModePlanningTemplate }));

    const planningResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
      prompt: planningPrompt,
    });

    runtime.character.system = originalSystemPrompt;

    const plan = parsePlanningResponse(planningResponse);
    const selectedAction = parsePlannedItems(plan?.actions)[0] || "BUILDER_CHAT";
    
    logger.debug(`[${modeLabel}] Executing action: ${selectedAction}`);

    // Create action response with thought and mode context
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
        metadata: {
          isCreatorMode: creatorMode,
          modeLabel,
        },
      },
    };

    // Add planning thought to state for action access
    state.values = {
      ...state.values,
      planningThought: plan?.thought || "",
    };

    await runtime.processActions(message, [actionResponse], state, callback);

    if (!(await isResponseStillValid(runtime, message.roomId, responseId))) return;
    await clearLatestResponseId(runtime, message.roomId);

    // Run evaluators asynchronously in background
    await runEvaluatorsWithTimeout(runtime, message, state, actionResponse, callback);

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
      source: "build-mode",
      selectedAction,
      mode: modeLabel,
    });
  } catch (error) {
    runtime.character.system = originalSystemPrompt;
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
      error: error instanceof Error ? error.message : String(error),
      source: "build-mode",
    });
    throw error;
  }
}
