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
  type Action,
  type IAgentRuntime,
  type State,
  type HandlerCallback,
} from "@elizaos/core";
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
import { cleanPrompt, runEvaluatorsWithTimeout } from "../shared/utils/helpers";
import type { ParsedResponse } from "../shared/utils/parsers";
import type { MessageReceivedHandlerParams } from "../shared/types";

/**
 * Simple chat handler with MCP tool support.
 */
export async function handleMessage({
  runtime,
  message,
  callback,
}: MessageReceivedHandlerParams): Promise<void> {
  const responseId = v4();
  const runId = asUUID(v4());
  const startTime = Date.now();

  if (message.entityId === runtime.agentId) {
    throw new Error("Message is from the agent itself");
  }

  await setLatestResponseId(runtime, message.roomId, responseId);
  await runtime.emitEvent(EventType.RUN_STARTED, {
    runtime, runId, messageId: message.id, roomId: message.roomId, entityId: message.entityId,
    startTime, status: "started", source: "chatPlaygroundWorkflow",
  });

  const originalSystemPrompt = runtime.character.system;

  try {
    await runtime.createMemory(message, "messages");

    // Wait for MCP if available
    const mcpService = runtime.getService("mcp") as { waitForInitialization?: () => Promise<void> } | undefined;
    if (mcpService?.waitForInitialization) {
      await mcpService.waitForInitialization();
    }

    const state = await runtime.composeState(message, [
      "SUMMARIZED_CONTEXT", "RECENT_MESSAGES", "LONG_TERM_MEMORY", "CHARACTER", "MCP",
    ]);

    // Try MCP action first
    if (await checkAndRunMcpAction(runtime, message, state, callback)) {
      await clearLatestResponseId(runtime, message.roomId);
      await runtime.emitEvent(EventType.RUN_ENDED, {
        runtime, runId, messageId: message.id, roomId: message.roomId, entityId: message.entityId,
        startTime, status: "completed", endTime: Date.now(), duration: Date.now() - startTime,
        source: "chatPlaygroundWorkflow",
      });
      return;
    }

    runtime.character.system = cleanPrompt(composePromptFromState({ state, template: chatPlaygroundSystemPrompt }));

    const prompt = cleanPrompt(composePromptFromState({
      state,
      template: runtime.character.templates?.chatPlaygroundTemplate || chatPlaygroundTemplate,
    }));

    const response = await runtime.useModel(ModelType.TEXT_LARGE, { prompt });
    runtime.character.system = originalSystemPrompt;

    const parsedResponse = parseKeyValueXml(response) as ParsedResponse | null;
    if (!parsedResponse?.text) {
      throw new Error("Failed to generate valid response");
    }

    if (!(await isResponseStillValid(runtime, message.roomId, responseId))) return;
    await clearLatestResponseId(runtime, message.roomId);

    if (callback) {
      await callback({
        text: parsedResponse.text,
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
      content: { text: parsedResponse.text, thought: parsedResponse.thought || "", source: "agent", inReplyTo: message.id },
    };

    await runEvaluatorsWithTimeout(runtime, message, state, responseMemory, callback);

    await runtime.emitEvent(EventType.RUN_ENDED, {
      runtime, runId, messageId: message.id, roomId: message.roomId, entityId: message.entityId,
      startTime, status: "completed", endTime: Date.now(), duration: Date.now() - startTime,
      source: "chatPlaygroundWorkflow",
    });
  } catch (error) {
    runtime.character.system = originalSystemPrompt;
    await runtime.emitEvent(EventType.RUN_ENDED, {
      runtime, runId, messageId: message.id, roomId: message.roomId, entityId: message.entityId,
      startTime, status: "error", endTime: Date.now(), duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
      source: "chatPlaygroundWorkflow",
    });
    throw error;
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
    logger.error("[ChatPlayground] Error checking/running MCP action", error instanceof Error ? error.message : String(error));
    return false;
  }
}
