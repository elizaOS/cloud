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
  chatAssistantSystemPrompt,
  chatAssistantPlanningTemplate,
  chatAssistantFinalSystemPrompt,
  chatAssistantResponseTemplate,
} from "./prompts/chat-assistant-prompts";
import {
  setLatestResponseId,
  clearLatestResponseId,
  isResponseStillValid,
} from "../shared/utils/response-tracking";
import {
  generateResponseWithRetry,
  runEvaluatorsWithTimeout,
  extractAttachments,
  executeProviders,
  executeActions,
  getAndClearCachedAttachments,
  hasActionSentResponse,
  clearActionResponseFlag,
} from "../shared/utils/helpers";
import {
  parsePlannedItems,
  canRespondImmediately,
  type ParsedPlan,
} from "../shared/utils/parsers";
import type { MessageReceivedHandlerParams } from "../shared/types";

/**
 * Chat Assistant Workflow Handler
 *
 * Planning-based approach with action execution capabilities.
 * Optimized for complex tasks requiring tools and context gathering.
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

    // PHASE 1: Check if this is an affiliate character BEFORE composing state
    const characterSettings = runtime.character.settings;
    const earlyAffiliateData = characterSettings?.affiliateData as
      | Record<string, unknown>
      | undefined;
    const isAffiliateChat = !!(
      earlyAffiliateData && Object.keys(earlyAffiliateData).length > 0
    );

    // Debug: Log full affiliate detection info
    logger.info(
      `[ChatAssistant] 🔍 Affiliate Detection: char=${runtime.character.name}, hasSettings=${!!characterSettings}, hasAffiliateData=${!!earlyAffiliateData}, affiliateKeys=${earlyAffiliateData ? Object.keys(earlyAffiliateData).join(",") : "none"}, isAffiliateChat=${isAffiliateChat}`,
    );
    if (earlyAffiliateData) {
      logger.info(
        `[ChatAssistant] 📋 Affiliate data: vibe=${earlyAffiliateData.vibe}, source=${earlyAffiliateData.source}, imageUrls=${Array.isArray(earlyAffiliateData.imageUrls) ? earlyAffiliateData.imageUrls.length : 0}`,
      );
    }

    logger.info(
      `[ChatAssistant] Processing message for character: ${runtime.character.name} (ID: ${runtime.character.id}), isAffiliate: ${isAffiliateChat}`,
    );

    // Use MINIMAL providers for affiliate chats to avoid token overflow
    // Affiliate chats focus on generating images + short text
    const providers = isAffiliateChat
      ? ["CHARACTER", "ACTIONS", "affiliateContext"]
      : [
          "SHORT_TERM_MEMORY",
          "LONG_TERM_MEMORY",
          "AVAILABLE_DOCUMENTS",
          "PROVIDERS",
          "ACTIONS",
          "CHARACTER",
          "affiliateContext",
        ];

    logger.debug(
      `[ChatAssistant] Composing state with providers: ${providers.join(", ")}`,
    );
    const initialState = await runtime.composeState(message, providers);

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

    const planningResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
      prompt: planningPrompt,
    });

    // Reset the system prompt to the original
    runtime.character.system = originalSystemPrompt;

    logger.debug("*** PLANNING RESPONSE ***\n", planningResponse);

    let plan = parseKeyValueXml(planningResponse) as ParsedPlan | null;
    let shouldRespondNow = canRespondImmediately(plan);

    // For affiliate chats, ensure GENERATE_IMAGE action is included
    if (isAffiliateChat && plan) {
      logger.info(
        "[ChatAssistant] AFFILIATE - Ensuring image generation action",
      );
      shouldRespondNow = false;
      // Add GENERATE_IMAGE to actions if not already present
      const existingActions = plan.actions || "";
      if (!existingActions.includes("GENERATE_IMAGE")) {
        plan.actions = existingActions
          ? `${existingActions}, GENERATE_IMAGE`
          : "GENERATE_IMAGE";
      }
      plan.canRespondNow = "NO";
    } else if (isAffiliateChat && !plan) {
      plan = {
        thought: "Generating image for user",
        canRespondNow: "NO",
        actions: "GENERATE_IMAGE",
      };
      shouldRespondNow = false;
    }

    logger.info(
      `[ChatAssistant] Plan - canRespondNow: ${shouldRespondNow}, thought: ${plan?.thought}, isAffiliate: ${isAffiliateChat}`,
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

        // Check if an action already sent a complete response
        // If so, skip generating another response to avoid duplicates
        const actionAlreadyResponded = hasActionSentResponse(message.roomId as string);
        if (actionAlreadyResponded) {
          logger.info(
            "[ChatAssistant] ⏭️ Action already sent response - skipping final response generation",
          );
          clearActionResponseFlag(message.roomId as string);

          // Get cached attachments for the response memory (even though we're not generating new text)
          const actionResultAttachments = extractAttachments(
            await runtime.getActionResults(message.id as UUID),
          );
          const cachedAttachments = getAndClearCachedAttachments(message.roomId as string);

          // Merge attachments
          const attachmentMap = new Map<string, unknown>();
          for (const att of actionResultAttachments) {
            const attachment = att as { id?: string };
            if (attachment.id) attachmentMap.set(attachment.id, att);
          }
          for (const att of cachedAttachments) {
            const attachment = att as { id?: string };
            if (attachment.id) attachmentMap.set(attachment.id, att);
          }

          // Clean up response ID
          await clearLatestResponseId(runtime, message.roomId);
          runtime.character.system = originalSystemPrompt;

          logger.info(
            `[ChatAssistant] Run ${runId.substring(0, 8)} completed (action-handled response)`,
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

          return; // Exit early - action already handled the response
        }
      } else {
        logger.info(
          "[ChatAssistant] Short-circuit: Responding with existing context",
        );
      }

      // PHASE 4: Generate final response using updated state
      const responsePhase = shouldRespondNow ? "Phase 2" : "Phase 3";
      logger.info(
        `[ChatAssistant] ${responsePhase}: Generating final response`,
      );

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

    // Extract attachments from multiple sources:
    // 1. Action results (stored by runtime)
    // 2. Cached attachments (captured from action callbacks)
    const actionResults = await runtime.getActionResults(message.id as UUID);
    const actionResultAttachments = extractAttachments(actionResults);
    const cachedAttachments = getAndClearCachedAttachments(
      message.roomId as string,
    );

    logger.info(
      `[ChatAssistant] Attachment sources: actionResults=${actionResults?.length || 0}, extracted=${actionResultAttachments.length}, cached=${cachedAttachments.length}`,
    );

    // Merge attachments, preferring cached ones (which have already been validated)
    // Use a Map to dedupe by attachment ID
    const attachmentMap = new Map<string, unknown>();

    // First add action result attachments
    for (const att of actionResultAttachments) {
      const attachment = att as { id?: string; url?: string };
      if (attachment.id) {
        attachmentMap.set(attachment.id, att);
      }
    }

    // Then add/override with cached attachments (these are validated HTTP URLs)
    for (const att of cachedAttachments) {
      const attachment = att as { id?: string; url?: string };
      if (attachment.id) {
        attachmentMap.set(attachment.id, att);
      }
    }

    const attachments = Array.from(attachmentMap.values());
    logger.info(`[ChatAssistant] Final attachments count: ${attachments.length}`);

    // Build response content
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

    // Trigger callback with response content
    // Memory storage is handled by the MessageHandler callback
    if (callback) {
      await callback(content as Memory["content"]);
    }

    // Create memory reference for evaluators (without re-saving)
    const responseMemory: Memory = {
      id: createUniqueUuid(runtime, (message.id ?? v4()) as UUID),
      entityId: runtime.agentId,
      roomId: message.roomId,
      worldId: message.worldId,
      content: content as Memory["content"],
    };

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
