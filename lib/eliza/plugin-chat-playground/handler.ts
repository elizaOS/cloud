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
   * Single-shot response without planning or actions.
   * Optimized for speed and simplicity.
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
  
      // Compose state with basic providers (no actions, no dynamic providers)
      logger.info(
        `[ChatPlayground] Processing message for character: ${runtime.character.name} (ID: ${runtime.character.id})`,
      );
      logger.debug("[ChatPlayground] Composing state with basic providers");
      const state = await runtime.composeState(message, [
        "SHORT_TERM_MEMORY", // Recent conversation
        "LONG_TERM_MEMORY", // User facts and knowledge
        "CHARACTER",
      ]);
  
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
  
      logger.debug("*** CHAT PLAYGROUND SYSTEM PROMPT ***\n", runtime.character.system);
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
      await runEvaluatorsWithTimeout(runtime, message, state, responseMemory, callback);
  
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
  