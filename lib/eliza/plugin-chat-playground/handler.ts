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
  runWithStreamingContext,
  XmlTagExtractor,
  type UUID,
  type Action,
  type IAgentRuntime,
  type State,
  type HandlerCallback,
} from "@elizaos/core";
import type { DialogueMetadata } from "@/lib/types/message-content";
import { extractErrorMessage } from "@/lib/utils/error-handling";
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

  // Wrap processing with streaming context for automatic streaming in useModel calls
  // Use XmlTagExtractor to extract and stream <text> content from responses
  let streamingContext: { onStreamChunk: (chunk: string, messageId?: UUID) => Promise<void>; messageId?: UUID } | undefined;
  if (onStreamChunk) {
    const extractor = new XmlTagExtractor('text');
    streamingContext = {
      onStreamChunk: async (chunk: string, msgId?: UUID) => {
        if (extractor.done) return;
        const textToStream = extractor.push(chunk);
        if (textToStream) {
          await onStreamChunk(textToStream, msgId);
        }
      },
      messageId: responseId as UUID,
    };
  }

  try {
    await runWithStreamingContext(streamingContext, async () => {
      await runtime.createMemory(message, "messages");

      // Wait for MCP if available
      const mcpService = runtime.getService("mcp") as
        | { waitForInitialization?: () => Promise<void> }
        | undefined;
      if (mcpService?.waitForInitialization) {
        await mcpService.waitForInitialization();
      }

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

      // Generate response - streaming is automatic via context
      const response = await runtime.useModel(ModelType.TEXT_LARGE, { prompt });

      runtime.character.system = originalSystemPrompt;

      const parsedResponse = parseKeyValueXml(response) as ParsedResponse | null;
      if (!parsedResponse?.text) {
        throw new Error("Failed to generate valid response");
      }

      if (!(await isResponseStillValid(runtime, message.roomId, responseId)))
        return;
      await clearLatestResponseId(runtime, message.roomId);

      // Post-process response to remove AI-speak and track openings
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

      await runEvaluatorsWithTimeout(
        runtime,
        message,
        state,
        responseMemory,
        callback,
      );

      await runtime.emitEvent(EventType.RUN_ENDED, {
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
      });
    });
  } catch (error) {
    runtime.character.system = originalSystemPrompt;
    // @ts-expect-error - RUN_ENDED status should include "error" for proper analytics tracking
    await runtime.emitEvent(EventType.RUN_ENDED, {
      runtime,
      source: "chatPlaygroundWorkflow",
      runId,
      messageId: message.id || asUUID(v4()),
      roomId: message.roomId,
      entityId: message.entityId,
      startTime,
      status: "error",
      endTime: Date.now(),
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
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
    logger.error(
      "[ChatPlayground] Error checking/running MCP action",
      extractErrorMessage(error),
    );
    return false;
  }
}
