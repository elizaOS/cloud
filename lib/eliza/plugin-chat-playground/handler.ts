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
 * Chat Playground Workflow Handler
 *
 * Supports MCP tool calling for external data access.
 * Checks for available MCP actions before generating responses.
 */
export async function handleMessage({
  runtime,
  message,
  callback,
}: MessageReceivedHandlerParams): Promise<void> {
  const responseId = v4();
  const runId = asUUID(v4());
  const startTime = Date.now();

  logger.debug(
    `[ChatPlayground] Generated response ID: ${responseId.substring(0, 8)}`,
  );
  logger.debug(`[ChatPlayground] Generated run ID: ${runId.substring(0, 8)}`);
  logger.debug(`[ChatPlayground] MESSAGE RECEIVED:`, JSON.stringify(message));

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
    source: "chatPlaygroundWorkflow",
  });

  try {
    if (message.entityId === runtime.agentId) {
      throw new Error("Message is from the agent itself");
    }

    // Save the incoming message
    logger.debug("[ChatPlayground] Saving message to memory");
    await runtime.createMemory(message, "messages");

    // RACE CONDITION FIX: Wait for MCP initialization BEFORE composing state
    // This ensures the MCP provider data is fresh and not stale
    const mcpService = runtime.getService("mcp") as
      | {
          waitForInitialization?: () => Promise<void>;
          getProviderData?: () => unknown;
        }
      | undefined;

    if (mcpService?.waitForInitialization) {
      logger.debug(
        "[ChatPlayground] Waiting for MCP service initialization before state composition...",
      );
      await mcpService.waitForInitialization();
      logger.debug(
        "[ChatPlayground] MCP service initialization complete, proceeding with state composition",
      );
    }

    // Compose state with providers including MCP for tool access
    logger.info(
      `[ChatPlayground] Processing message for character: ${runtime.character.name} (ID: ${runtime.character.id})`,
    );
    logger.debug(
      "[ChatPlayground] Composing state with providers including MCP",
    );
    const state = await runtime.composeState(message, [
      "SUMMARIZED_CONTEXT",
      "RECENT_MESSAGES",
      "LONG_TERM_MEMORY", // User facts and knowledge
      "CHARACTER",
      "MCP", // MCP tools and resources - now guaranteed to be fresh
    ]);

    // Check if MCP action should be triggered
    const mcpAction = await checkAndRunMcpAction(
      runtime,
      message,
      state,
      callback,
    );
    if (mcpAction) {
      logger.info(
        "[ChatPlayground] MCP action executed, using tool result for response",
      );
      // MCP action already called callback with response
      await clearLatestResponseId(runtime, message.roomId);

      const endTime = Date.now();
      await runtime.emitEvent(EventType.RUN_ENDED, {
        runtime,
        runId,
        messageId: message.id,
        roomId: message.roomId,
        entityId: message.entityId,
        startTime,
        status: "completed",
        endTime,
        duration: endTime - startTime,
        source: "chatPlaygroundWorkflow",
      });
      return;
    }

    // Compose system prompt
    const originalSystemPrompt = runtime.character.system;
    const composedSystemPromptRaw = composePromptFromState({
      state,
      template: chatPlaygroundSystemPrompt,
    });
    const composedSystemPrompt = cleanPrompt(composedSystemPromptRaw);
    runtime.character.system = composedSystemPrompt;

    // Compose user prompt
    const promptRaw = composePromptFromState({
      state,
      template:
        runtime.character.templates?.chatPlaygroundTemplate ||
        chatPlaygroundTemplate,
    });
    const prompt = cleanPrompt(promptRaw);
    logger.debug(
      "*** CHAT PLAYGROUND SYSTEM PROMPT ***\n",
      runtime.character.system,
    );
    logger.debug("*** CHAT PLAYGROUND PROMPT ***\n", prompt);

    // Single LLM call to get response
    const response = await runtime.useModel(ModelType.TEXT_LARGE, { prompt });
    logger.debug("*** CHAT PLAYGROUND RESPONSE ***\n", response);

    const parsedResponse = parseKeyValueXml(response) as ParsedResponse | null;

    if (!parsedResponse?.text) {
      throw new Error("Failed to generate valid response");
    }

    const responseContent = parsedResponse.text;
    const thought = parsedResponse.thought || "";

    // Restore original system prompt
    runtime.character.system = originalSystemPrompt;

    // Check if this is still the latest response ID for this room
    if (!(await isResponseStillValid(runtime, message.roomId, responseId))) {
      logger.info(
        `[ChatPlayground] Response discarded - newer message being processed for agent: ${runtime.agentId}, room: ${message.roomId}`,
      );
      return;
    }

    // Clean up the response ID
    await clearLatestResponseId(runtime, message.roomId);

    // Trigger callback with response content
    // Memory storage is handled by the MessageHandler callback
    if (callback) {
      await callback({
        text: responseContent,
        thought,
        source: "agent",
        inReplyTo: message.id,
      });
    }

    // Create memory reference for evaluators (without re-saving)
    const responseMemory: Memory = {
      id: createUniqueUuid(runtime, (message.id ?? v4()) as UUID),
      entityId: runtime.agentId,
      roomId: message.roomId,
      worldId: message.worldId,
      content: {
        text: responseContent,
        thought,
        source: "agent",
        inReplyTo: message.id,
      },
    };

    // Run evaluators asynchronously in background
    await runEvaluatorsWithTimeout(
      runtime,
      message,
      state,
      responseMemory,
      callback,
    );

    logger.info(
      `[ChatPlayground] Run ${runId.substring(0, 8)} completed successfully`,
    );

    const endTime = Date.now();
    await runtime.emitEvent(EventType.RUN_ENDED, {
      runtime,
      runId,
      messageId: message.id,
      roomId: message.roomId,
      entityId: message.entityId,
      startTime,
      status: "completed",
      endTime,
      duration: endTime - startTime,
      source: "chatPlaygroundWorkflow",
    });
  } catch (error) {
    // Emit run ended event with error
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
      source: "chatPlaygroundWorkflow",
    });
    throw error;
  }
}

/**
 * Check if an MCP action should be triggered and run it
 * Returns true if an MCP action was executed
 */
async function checkAndRunMcpAction(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  callback?: HandlerCallback,
): Promise<boolean> {
  try {
    // RACE CONDITION FIX: Since we now wait for MCP initialization before
    // composing state (see handleMessage), we can rely on state data being fresh
    // and don't need to re-check the service directly

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
    logger.error("[ChatPlayground] Error checking/running MCP action", error);
    return false;
  }
}
