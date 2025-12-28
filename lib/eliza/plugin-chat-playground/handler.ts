import {
  asUUID,
  composePromptFromState,
  createUniqueUuid,
  EventType,
  logger,
  MemoryType,
  ModelType,
  type Memory,
  parseKeyValueXml,
  type UUID,
  type Action,
  type IAgentRuntime,
  type State,
  type HandlerCallback,
} from "@elizaos/core";
import type { DialogueMetadata } from "@/lib/types/message-content";
import { v4 } from "uuid";
import {
  chatPlaygroundSystemPrompt,
  chatPlaygroundTemplate,
} from "./prompts/chat-playground-prompts";
import {
  setLatestResponseId,
  clearLatestResponseId,
  isResponseStillValid,
} from "../shared/utils/response-tracking";
import {
  cleanPrompt,
  runEvaluatorsWithTimeout,
  postProcessResponse,
} from "../shared/utils/helpers";
import type { ParsedResponse } from "../shared/utils/parsers";
import type { MessageReceivedHandlerParams, RunEndedEventPayload } from "../shared/types";

/**
 * Simple chat handler with MCP tool support and optional streaming.
 */
export async function handleMessage({
  runtime,
  message,
  callback,
  onStreamChunk,
}: MessageReceivedHandlerParams): Promise<void> {
  const responseId = v4();
  const runId = asUUID(v4());
  const startTime = Date.now();

  if (message.entityId === runtime.agentId) {
    throw new Error("Message is from the agent itself");
  }

  await setLatestResponseId(runtime, message.roomId, responseId);
  await runtime.emitEvent(EventType.RUN_STARTED, {
    runtime,
    source: "chatPlaygroundWorkflow",
    runId,
    messageId: message.id || asUUID(v4()),
    roomId: message.roomId,
    entityId: message.entityId,
    startTime,
    status: "started",
  });

  const originalSystemPrompt = runtime.character.system;

  try {
    runtime.createMemory(message, "messages").catch((e) => {
      logger.warn(`[ChatPlayground] Failed to create memory: ${e}`);
    });

    const state = await runtime.composeState(message, [
      "SUMMARIZED_CONTEXT",
      "RECENT_MESSAGES",
      "LONG_TERM_MEMORY",
      "CHARACTER",
      "MCP",
      "APP_CONFIG",
    ]);

    // Try MCP action first
    if (await checkAndRunMcpAction(runtime, message, state, callback)) {
      await clearLatestResponseId(runtime, message.roomId);
      await runtime.emitEvent(EventType.RUN_ENDED, {
        runtime,
        runId,
        messageId: message.id || asUUID(v4()),
        roomId: message.roomId,
        entityId: message.entityId,
        startTime,
        status: "completed",
        endTime: Date.now(),
        duration: Date.now() - startTime,
        source: "chatPlaygroundWorkflow",
      });
      return;
    }

    runtime.character.system = cleanPrompt(
      composePromptFromState({ state, template: chatPlaygroundSystemPrompt }),
    );

    const prompt = cleanPrompt(
      composePromptFromState({
        state,
        template:
          runtime.character.templates?.chatPlaygroundTemplate ||
          chatPlaygroundTemplate,
      }),
    );

    const response = await runtime.useModel(ModelType.TEXT_LARGE, { 
      prompt,
      ...(onStreamChunk && {
        stream: true,
        onStreamChunk: async (chunk: string) => {
          await onStreamChunk(chunk, responseId as UUID);
        },
      }),
    });

    const parsedResponse = parseKeyValueXml(response) as ParsedResponse | null;
    if (!parsedResponse?.text) {
      throw new Error("Failed to generate valid response");
    }

    if (!(await isResponseStillValid(runtime, message.roomId, responseId)))
      return;
    await clearLatestResponseId(runtime, message.roomId);

    const processedResponse = postProcessResponse(
      parsedResponse.text,
      message.roomId as string,
    );
    const finalText = processedResponse.text;

    if (callback) {
      await callback({
        text: finalText,
        thought: parsedResponse.thought || "",
        source: "agent",
        inReplyTo: message.id,
      });
    }

    const responseMemory: Memory = {
      id: createUniqueUuid(runtime, (message.id ?? v4()) as UUID),
      entityId: runtime.agentId,
      roomId: message.roomId,
      worldId: message.worldId,
      content: {
        text: finalText,
        thought: parsedResponse.thought || "",
        source: "agent",
        inReplyTo: message.id,
      },
      metadata: {
        type: MemoryType.MESSAGE,
        role: "agent",
        dialogueType: "message",
        visibility: "visible",
        agentMode: "chat",
      } as DialogueMetadata,
    };

    runEvaluatorsWithTimeout(
      runtime,
      message,
      state,
      responseMemory,
      callback,
    ).catch((e) => {
      logger.warn(`[ChatPlayground] Evaluators failed: ${e}`);
    });

    runtime.emitEvent(EventType.RUN_ENDED, {
      runtime,
      source: "chatPlaygroundWorkflow",
      runId,
      messageId: message.id || asUUID(v4()),
      roomId: message.roomId,
      entityId: message.entityId,
      startTime,
      status: "completed",
      endTime: Date.now(),
      duration: Date.now() - startTime,
    }).catch((e) => logger.debug(`[ChatPlayground] RUN_ENDED emit failed: ${e}`));
  } catch (error) {
    const errorPayload: RunEndedEventPayload = {
      runtime,
      runId,
      messageId: (message.id || asUUID(v4())) as UUID,
      roomId: message.roomId as UUID,
      entityId: message.entityId as UUID,
      startTime,
      status: "error",
      endTime: Date.now(),
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
      source: "chatPlaygroundWorkflow",
    };
    await runtime.emitEvent(EventType.RUN_ENDED, errorPayload as never);
    throw error;
  } finally {
    // Always restore original system prompt, even on early returns or errors
    runtime.character.system = originalSystemPrompt;
  }
}

/**
 * Check for and execute MCP action if available.
 */
async function checkAndRunMcpAction(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  callback?: HandlerCallback,
): Promise<boolean> {
  try {
    // Check if MCP data is available in state
    const stateData = state.data as Record<string, unknown> | undefined;
    const mcpData = stateData?.providers as Record<string, unknown> | undefined;
    const mcpProvider = mcpData?.MCP as
      | { data?: { mcp?: Record<string, unknown> } }
      | undefined;

    const hasMcpServers =
      mcpProvider?.data?.mcp && Object.keys(mcpProvider.data.mcp).length > 0;

    if (!hasMcpServers) {
      logger.debug(
        "[ChatPlayground] No MCP servers connected, skipping MCP action check",
      );
      return false;
    }

    logger.info(
      "[ChatPlayground] MCP servers available, checking for CALL_MCP_TOOL action",
    );

    // Find the CALL_MCP_TOOL action from registered actions
    const mcpAction = runtime.actions?.find(
      (action: Action) =>
        action.name === "CALL_MCP_TOOL" ||
        action.similes?.includes("CALL_MCP_TOOL"),
    );

    if (!mcpAction) {
      logger.debug(
        "[ChatPlayground] CALL_MCP_TOOL action not found in runtime",
      );
      return false;
    }

    // Validate if the action can run (checks if MCP servers are connected with tools)
    const isValid = await mcpAction.validate(runtime, message, state);
    if (!isValid) {
      logger.debug(
        "[ChatPlayground] CALL_MCP_TOOL action validation failed (no connected servers with tools)",
      );
      return false;
    }

    logger.info("[ChatPlayground] CALL_MCP_TOOL action is valid, executing...");

    // Execute the MCP action
    const result = await mcpAction.handler(
      runtime,
      message,
      state,
      {},
      callback,
    );

    // Check result for success
    const actionResult = result as
      | { success?: boolean; data?: { toolName?: string; serverName?: string } }
      | undefined;
    if (actionResult?.success) {
      logger.info(
        `[ChatPlayground] MCP action executed successfully - tool: ${actionResult.data?.toolName ?? "unknown"}, server: ${actionResult.data?.serverName ?? "unknown"}`,
      );
      return true;
    }

    logger.debug(
      "[ChatPlayground] MCP action did not succeed, falling back to regular response",
    );
    return false;
  } catch (error) {
    logger.error(
      "[ChatPlayground] Error checking/running MCP action",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}
