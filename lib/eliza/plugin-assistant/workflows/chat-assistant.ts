/**
 * Chat Assistant Workflow
 * 
 * Advanced conversation mode with planning and action execution.
 * Uses a multi-phase approach: planning -> execution -> response.
 * 
 * Flow:
 * 1. Compose initial state with memory providers
 * 2. Planning phase - determine if actions/providers are needed
 * 3. Execute planned providers and actions (if needed)
 * 4. Generate final response with all context
 * 5. Return response with attachments
 * 6. Run evaluators in background
 */

import {
  asUUID,
  composePromptFromState,
  createUniqueUuid,
  EventType,
  type IAgentRuntime,
  logger,
  type Memory,
  ModelType,
  parseKeyValueXml,
  type HandlerCallback,
  type UUID,
} from "@elizaos/core";
import { v4 } from "uuid";
import {
  chatAssistantSystemPrompt,
  chatAssistantPlanningTemplate,
  chatAssistantFinalSystemPrompt,
  chatAssistantResponseTemplate,
} from "../prompts/chat-assistant-prompts";
import {
  getLatestResponseId,
  setLatestResponseId,
  clearLatestResponseId,
  isResponseStillValid,
} from "../utils/response-tracking";
import {
  generateResponseWithRetry,
  runEvaluatorsWithTimeout,
  extractAttachments,
  executeProviders,
  executeActions,
} from "../utils/helpers";
import {
  parsePlannedItems,
  canRespondImmediately,
  type ParsedPlan,
} from "../utils/parsers";

/**
 * Workflow parameters
 */
export interface ChatAssistantParams {
  runtime: IAgentRuntime;
  message: Memory;
  callback: HandlerCallback;
}

/**
 * Chat Assistant Workflow Handler
 * 
 * Planning-based approach with action execution capabilities.
 * Optimized for complex tasks requiring tools and context gathering.
 */
export async function handleChatAssistantWorkflow({
  runtime,
  message,
  callback,
}: ChatAssistantParams): Promise<void> {
  const responseId = v4();
  const runId = asUUID(v4());
  const startTime = Date.now();

  logger.debug(
    `[ChatAssistant] Generated response ID: ${responseId.substring(0, 8)}`,
  );
  logger.debug(`[ChatAssistant] Generated run ID: ${runId.substring(0, 8)}`);
  logger.debug(`[ChatAssistant] MESSAGE RECEIVED:`, JSON.stringify(message));

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
    source: "chatAssistantWorkflow",
  });

  try {
    if (message.entityId === runtime.agentId) {
      throw new Error("Message is from the agent itself");
    }

    // Save the incoming message
    logger.debug("[ChatAssistant] Saving message to memory");
    await runtime.createMemory(message, "messages");

    // PHASE 1: Compose initial state with memory providers
    logger.info(
      `[ChatAssistant] Processing message for character: ${runtime.character.name} (ID: ${runtime.character.id})`,
    );
    logger.debug("[ChatAssistant] Composing state with memory providers");
    const initialState = await runtime.composeState(message, [
      "SHORT_TERM_MEMORY",
      "LONG_TERM_MEMORY",
      "AVAILABLE_DOCUMENTS",
      "PROVIDERS",
      "ACTIONS",
      "CHARACTER",
    ]);

    console.log("*** CHAT ASSISTANT INITIAL STATE ***\n", initialState);

    // PHASE 2: Planning - Determine which providers/actions to use
    logger.info("[ChatAssistant] Phase 1: Planning");
    const planningPrompt = composePromptFromState({
      state: initialState,
      template:
        runtime.character.templates?.planningTemplate ||
        chatAssistantPlanningTemplate,
    });

    logger.debug("*** PLANNING PROMPT ***\n", planningPrompt);

    const originalSystemPrompt = runtime.character.system;

    const composedSystemPrompt = composePromptFromState({
      state: initialState,
      template: chatAssistantSystemPrompt,
    });

    runtime.character.system = composedSystemPrompt;

    console.log("*** SYSTEM PROMPT ***\n", runtime.character.system);
    console.log("*** PLANNING PROMPT ***\n", planningPrompt);

    const planningResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
      prompt: planningPrompt,
    });

    // Reset the system prompt to the original
    runtime.character.system = originalSystemPrompt;

    logger.debug("*** PLANNING RESPONSE ***\n", planningResponse);

    const plan = parseKeyValueXml(planningResponse) as ParsedPlan | null;
    const shouldRespondNow = canRespondImmediately(plan);

    logger.info(
      `[ChatAssistant] Plan - canRespondNow: ${shouldRespondNow}, thought: ${plan?.thought}`,
    );

    let responseContent = "";
    let thought = "";

    // Check if the planning call already generated a response (1 LLM call optimization)
    if (shouldRespondNow && plan?.text) {
      logger.info(
        "[ChatAssistant] ⚡ Single-call optimization: Using response from planning phase",
      );
      responseContent = plan.text;
      thought = plan.thought || "";
    } else {
      // Need to gather more context and generate response (2+ LLM calls)
      let updatedState = { ...initialState };

      // PHASE 3: Execute planned providers and actions
      if (!shouldRespondNow) {
        logger.info("[ChatAssistant] Phase 2: Executing providers and actions");
        logger.debug(
          `[ChatAssistant] Providers: ${plan?.providers}, Actions: ${plan?.actions}`,
        );

        const plannedProviders = parsePlannedItems(plan?.providers);
        const plannedActions = parsePlannedItems(plan?.actions);

        updatedState = await executeProviders(
          runtime,
          message,
          plannedProviders,
          updatedState,
        );

        updatedState = await executeActions(
          runtime,
          message,
          plannedActions,
          plan,
          updatedState,
          callback,
        );
      } else {
        logger.info(
          "[ChatAssistant] Short-circuit: Responding with existing context",
        );
      }

      // PHASE 4: Generate final response using updated state
      const responsePhase = shouldRespondNow ? "Phase 2" : "Phase 3";
      logger.info(`[ChatAssistant] ${responsePhase}: Generating final response`);

      // Compose system prompt for response generation
      const finalSystemPrompt = composePromptFromState({
        state: updatedState,
        template: chatAssistantFinalSystemPrompt,
      });
      runtime.character.system = finalSystemPrompt;

      const responsePrompt = composePromptFromState({
        state: updatedState,
        template:
          runtime.character.templates?.messageHandlerTemplate ||
          chatAssistantResponseTemplate,
      });

      logger.debug("*** FINAL SYSTEM PROMPT ***\n", runtime.character.system);
      logger.debug("*** RESPONSE PROMPT ***\n", responsePrompt);

      const responseResult = await generateResponseWithRetry(
        runtime,
        responsePrompt,
      );
      responseContent = responseResult.text;
      thought = responseResult.thought;
    }

    // restore the system prompt to the original
    runtime.character.system = originalSystemPrompt;

    // Check if this is still the latest response ID for this room
    if (!(await isResponseStillValid(runtime, message.roomId, responseId))) {
      logger.info(
        `[ChatAssistant] Response discarded - newer message being processed for agent: ${runtime.agentId}, room: ${message.roomId}`,
      );
      return;
    }

    // Clean up the response ID
    await clearLatestResponseId(runtime, message.roomId);

    // Extract attachments from action results
    const actionResults = await runtime.getActionResults(message.id as UUID);
    const attachments = extractAttachments(actionResults);

    logger.info(
      `[ChatAssistant] Action results: ${JSON.stringify(actionResults)}`,
    );

    // Create response memory with attachments if any
    const content: Record<string, unknown> = {
      text: responseContent,
      thought,
      source: "agent",
      inReplyTo: message.id,
    };

    if (attachments.length > 0) {
      content.attachments = attachments;
      logger.info(
        `[ChatAssistant] Including ${attachments.length} attachment(s) in response`,
      );
    }

    const responseMemory: Memory = {
      id: createUniqueUuid(runtime, (message.id ?? v4()) as UUID),
      entityId: runtime.agentId,
      roomId: message.roomId,
      worldId: message.worldId,
      content: content as Memory["content"],
    };

    // Save response
    logger.debug("[ChatAssistant] Saving response to memory");
    await runtime.createMemory(responseMemory, "messages");

    // Trigger callback immediately with response (don't wait for evaluators)
    // This ensures fast response to the client
    if (callback) {
      const callbackContent = {
        text: responseContent,
        ...(attachments.length > 0 && { attachments: attachments as never }),
      };
      await callback(callbackContent);
    }

    // Run evaluators asynchronously (for future context enrichment)
    // Evaluators update long-term memory, session summaries, etc. for FUTURE conversations
    await runEvaluatorsWithTimeout(
      runtime,
      message,
      initialState,
      responseMemory,
      callback,
    );

    logger.info(
      `[ChatAssistant] Run ${runId.substring(0, 8)} completed successfully`,
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
      source: "chatAssistantWorkflow",
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
      source: "chatAssistantWorkflow",
    });
    throw error;
  }
}
