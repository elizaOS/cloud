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
import { runEvaluatorsWithTimeout } from "../shared/utils/helpers";
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

    // Compose state with providers including MCP for tool access
    logger.info(
      `[ChatPlayground] Processing message for character: ${runtime.character.name} (ID: ${runtime.character.id})`,
    );
    logger.debug(
      "[ChatPlayground] Composing state with providers including MCP",
    );
    const state = await runtime.composeState(message, [
      "SHORT_TERM_MEMORY", // Recent conversation
      "LONG_TERM_MEMORY", // User facts and knowledge
      "CHARACTER",
      "MCP", // MCP tools and resources
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

    logger.debug("*** CHAT PLAYGROUND STATE ***", JSON.stringify(state));

    // Compose system prompt
    const originalSystemPrompt = runtime.character.system;
    const composedSystemPrompt = composePromptFromState({
      state,
      template: chatPlaygroundSystemPrompt,
    });
    runtime.character.system = composedSystemPrompt;

    // Compose user prompt
    const prompt = composePromptFromState({
      state,
      template:
        runtime.character.templates?.chatPlaygroundTemplate ||
        chatPlaygroundTemplate,
    });

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
    // Try to get the MCP service and wait for its initialization
    const mcpService = runtime.getService("mcp") as
      | {
          waitForInitialization?: () => Promise<void>;
          getProviderData?: () => unknown;
        }
      | undefined;
    if (mcpService?.waitForInitialization) {
      logger.debug(
        "[ChatPlayground] Waiting for MCP service initialization...",
      );
      await mcpService.waitForInitialization();
      logger.debug("[ChatPlayground] MCP service initialization complete");
    }

    // Check if MCP data is available in state
    const stateData = state.data as Record<string, unknown> | undefined;
    const mcpData = stateData?.providers as Record<string, unknown> | undefined;
    const mcpProvider = mcpData?.MCP as
      | { data?: { mcp?: Record<string, unknown> } }
      | undefined;

    // Also check directly from the service in case state wasn't composed after init
    let hasMcpServers =
      mcpProvider?.data?.mcp && Object.keys(mcpProvider.data.mcp).length > 0;

    if (!hasMcpServers && mcpService?.getProviderData) {
      const serviceData = mcpService.getProviderData() as {
        data?: { mcp?: Record<string, unknown> };
      };
      hasMcpServers =
        serviceData?.data?.mcp && Object.keys(serviceData.data.mcp).length > 0;
      if (hasMcpServers) {
        logger.info(
          "[ChatPlayground] MCP servers found via service (state was stale)",
        );
      }
    }

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
      "[ChatPlayground] Error checking/running MCP action:",
      String(error),
    );
    return false;
  }
}
