import {
  asUUID,
  composePromptFromState,
  createUniqueUuid,
  EventType,
  logger,
  MemoryType,
  type Memory,
  type Content,
  type Media,
  ModelType,
  parseKeyValueXml,
  type UUID,
} from "@elizaos/core";
import type { DialogueMetadata } from "@/lib/types/message-content";
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
  cleanPrompt,
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
 * Planning-based message handler with action execution.
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
    runtime,
    runId,
    messageId: message.id,
    roomId: message.roomId,
    entityId: message.entityId,
    startTime,
    status: "started",
    source: "chatAssistantWorkflow",
  });

  const originalSystemPrompt = runtime.character.system;

  try {
    await runtime.createMemory(message, "messages");

    // Check for affiliate character (uses minimal providers to save tokens)
    const affiliateData = runtime.character.settings?.affiliateData as {
      vibe?: string;
      affiliateId?: string;
      [key: string]: unknown;
    } | undefined;
    const isAffiliateChat = !!(affiliateData && Object.keys(affiliateData).length > 0);

    logger.info(`[Assistant] Processing for ${runtime.character.name}, affiliate: ${isAffiliateChat}`);

    const providers = isAffiliateChat
      ? ["CHARACTER", "ACTIONS", "affiliateContext"]
      : ["SUMMARIZED_CONTEXT", "RECENT_MESSAGES", "LONG_TERM_MEMORY", "AVAILABLE_DOCUMENTS", "PROVIDERS", "MCP", "ACTIONS", "CHARACTER", "affiliateContext"];

    const initialState = await runtime.composeState(message, providers);

    // Planning phase
    const planningPrompt = cleanPrompt(composePromptFromState({
      state: initialState,
      template: runtime.character.templates?.planningTemplate || chatAssistantPlanningTemplate,
    }));

    runtime.character.system = composePromptFromState({
      state: initialState,
      template: chatAssistantSystemPrompt,
    });

    const planningResponse = await runtime.useModel(ModelType.TEXT_LARGE, { prompt: planningPrompt });
    runtime.character.system = originalSystemPrompt;

    let plan = parseKeyValueXml(planningResponse) as ParsedPlan | null;
    let shouldRespondNow = canRespondImmediately(plan);

    // Affiliate chats always generate images
    if (isAffiliateChat) {
      shouldRespondNow = false;
      if (!plan) {
        plan = { thought: "Generating image", canRespondNow: "NO", actions: "GENERATE_IMAGE" };
      } else {
        const existingActions = plan.actions || "";
        if (!existingActions.includes("GENERATE_IMAGE")) {
          plan.actions = existingActions ? `${existingActions}, GENERATE_IMAGE` : "GENERATE_IMAGE";
        }
        plan.canRespondNow = "NO";
      }
    }

    logger.info(`[Assistant] Plan: canRespondNow=${shouldRespondNow}, thought=${plan?.thought?.substring(0, 50)}`);

    let responseContent = "";
    let thought = "";

    // Single-call optimization: use planning response if available
    if (shouldRespondNow && plan?.text) {
      responseContent = plan.text;
      thought = plan.thought || "";
    } else {
      let updatedState = await runtime.composeState(message, [
        "SUMMARIZED_CONTEXT", "RECENT_MESSAGES", "LONG_TERM_MEMORY", "PROVIDERS", "MCP", "ACTIONS", "CHARACTER",
      ]);

      if (!shouldRespondNow) {
        const plannedProviders = parsePlannedItems(plan?.providers);
        const plannedActions = parsePlannedItems(plan?.actions);

        updatedState = await executeProviders(runtime, message, plannedProviders, updatedState);
        updatedState = await executeActions(runtime, message, plannedActions, plan, updatedState, callback);

        // Exit early if action already sent response
        if (hasActionSentResponse(message.roomId as string)) {
          clearActionResponseFlag(message.roomId as string);
          getAndClearCachedAttachments(message.roomId as string);
          await clearLatestResponseId(runtime, message.roomId);

          await runtime.emitEvent(EventType.RUN_ENDED, {
            runtime, runId, messageId: message.id, roomId: message.roomId, entityId: message.entityId,
            startTime, status: "completed", endTime: Date.now(), duration: Date.now() - startTime,
            source: "chatAssistantWorkflow",
          });
          return;
        }
      }

      // Generate final response
      updatedState = await runtime.composeState(message, ["CURRENT_RUN_CONTEXT"]);

      runtime.character.system = cleanPrompt(composePromptFromState({
        state: updatedState,
        template: chatAssistantFinalSystemPrompt,
      }));

      const responsePrompt = cleanPrompt(composePromptFromState({
        state: updatedState,
        template: runtime.character.templates?.messageHandlerTemplate || chatAssistantResponseTemplate,
      }));

      const responseResult = await generateResponseWithRetry(runtime, responsePrompt);
      responseContent = responseResult.text;
      thought = responseResult.thought;
    }

    runtime.character.system = originalSystemPrompt;

    // Discard if superseded by newer message
    if (!(await isResponseStillValid(runtime, message.roomId, responseId))) {
      logger.info(`[Assistant] Response discarded - superseded`);
      return;
    }

    await clearLatestResponseId(runtime, message.roomId);

    // Collect attachments from action results and cache
    const actionResults = await runtime.getActionResults(message.id as UUID);
    const actionResultAttachments = extractAttachments(actionResults);
    const cachedAttachments = getAndClearCachedAttachments(message.roomId as string);

    // Dedupe attachments by ID, preferring cached (validated HTTP URLs)
    const attachmentMap = new Map<string, { id: string; url: string; contentType?: string }>();
    for (const att of [...actionResultAttachments, ...cachedAttachments]) {
      if (att && typeof att === "object" && "id" in att && "url" in att) {
        const { id, url, contentType } = att as { id?: string; url?: string; contentType?: string };
        if (id && url) attachmentMap.set(id, { id, url, contentType });
      }
    }

    const mediaAttachments: Media[] = Array.from(attachmentMap.values())
      .filter((att) => att.url.length > 0)
      .map((att) => ({
        id: att.id,
        url: att.url,
        ...(att.contentType && { mimeType: att.contentType }),
      }));

    const content: Content = {
      text: responseContent,
      thought,
      source: "agent",
      inReplyTo: message.id,
      ...(mediaAttachments.length > 0 && { attachments: mediaAttachments }),
    };

    if (callback) await callback(content);

    const responseMemory: Memory = {
      id: createUniqueUuid(runtime, (message.id ?? v4()) as UUID),
      entityId: runtime.agentId,
      roomId: message.roomId,
      worldId: message.worldId,
      content,
      metadata: {
        type: MemoryType.MESSAGE,
        role: 'agent',
        dialogueType: 'message',
        visibility: 'visible',
        agentMode: 'assistant',
      } as DialogueMetadata,
    };

    await runEvaluatorsWithTimeout(runtime, message, initialState, responseMemory, callback);

    const endTime = Date.now();
    await runtime.emitEvent(EventType.RUN_ENDED, {
      runtime, runId, messageId: message.id, roomId: message.roomId, entityId: message.entityId,
      startTime, status: "completed", endTime, duration: endTime - startTime,
      source: "chatAssistantWorkflow",
    });
  } catch (error) {
    runtime.character.system = originalSystemPrompt;
    await runtime.emitEvent(EventType.RUN_ENDED, {
      runtime, runId, messageId: message.id, roomId: message.roomId, entityId: message.entityId,
      startTime, status: "error", endTime: Date.now(), duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
      source: "chatAssistantWorkflow",
    });
    throw error;
  }
}
