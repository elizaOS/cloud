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
  runWithStreamingContext,
  XmlTagExtractor,
  type UUID,
} from "@elizaos/core";
import type { DialogueMetadata } from "@/lib/types/message-content";
import { v4 } from "uuid";
import {
  chatAssistantSystemPrompt,
  chatAssistantPlanningTemplate,
  chatAssistantFinalSystemPrompt,
  chatAssistantResponseTemplate,
  affiliateSystemPrompt,
  affiliatePlanningTemplate,
  affiliateFinalSystemPrompt,
  affiliateResponseTemplate,
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
  postProcessResponse,
} from "../shared/utils/helpers";
import {
  parsePlannedItems,
  canRespondImmediately,
  type ParsedPlan,
} from "../shared/utils/parsers";
import type { MessageReceivedHandlerParams } from "../shared/types";
import { MIN_IMAGE_INTERVAL_MS } from "@/lib/constants/image-generation";

// Rate limiting for auto-image generation (prevents cost abuse)
const imageGenerationTimestamps = new Map<string, number>();

function canGenerateImage(roomId: string): boolean {
  const lastGenerated = imageGenerationTimestamps.get(roomId);
  const now = Date.now();

  if (!lastGenerated || now - lastGenerated > MIN_IMAGE_INTERVAL_MS) {
    imageGenerationTimestamps.set(roomId, now);
    return true;
  }

  return false;
}

// Intent detection for explicit image requests
function hasImageIntent(userMessage: string): boolean {
  const imageKeywords = [
    "pic",
    "picture",
    "photo",
    "image",
    "selfie",
    "show me",
    "send me",
    "what do you look like",
    "appearance",
    "wearing",
  ];

  const lowerMessage = userMessage.toLowerCase();
  return imageKeywords.some((keyword) => lowerMessage.includes(keyword));
}

/**
 * Planning-based message handler with action execution.
 */
export async function handleMessage({
  runtime,
  message,
  callback,
  onStreamChunk,
  onReasoningChunk,
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
    source: "chatAssistantWorkflow",
    runId,
    messageId: message.id || asUUID(v4()),
    roomId: message.roomId,
    entityId: message.entityId,
    startTime,
    status: "started",
  });

  const originalSystemPrompt = runtime.character.system;

  const createPlanningStreamContext = () => {
    if (!onReasoningChunk) return undefined;
    const extractor = new XmlTagExtractor("thought");
    return {
      onStreamChunk: async (chunk: string) => {
        if (extractor.done) return;
        const text = extractor.push(chunk);
        if (text) await onReasoningChunk(text, "planning", responseId as UUID);
      },
      messageId: responseId as UUID,
    };
  };

  const createResponseStreamContext = () => {
    if (!onStreamChunk) return undefined;
    const extractor = new XmlTagExtractor("text");
    return {
      onStreamChunk: async (chunk: string, msgId?: UUID) => {
        if (extractor.done) return;
        const text = extractor.push(chunk);
        if (text) await onStreamChunk(text, msgId);
      },
      messageId: responseId as UUID,
    };
  };

  try {
    await runtime.createMemory(message, "messages");

    const affiliateData = runtime.character.settings?.affiliateData as
      | { vibe?: string; affiliateId?: string; autoImage?: boolean; imageUrls?: string[]; [key: string]: unknown }
      | undefined;
    const isAffiliateChat = !!(affiliateData && Object.keys(affiliateData).length > 0);
    const shouldAutoGenerateImages = affiliateData?.autoImage === true;

    const providers = isAffiliateChat
      ? ["CHARACTER", "ACTIONS", "affiliateContext", "APP_CONFIG"]
      : ["SUMMARIZED_CONTEXT", "RECENT_MESSAGES", "LONG_TERM_MEMORY", "AVAILABLE_DOCUMENTS", "PROVIDERS", "MCP", "ACTIONS", "CHARACTER", "affiliateContext", "APP_CONFIG"];

    const initialState = await runtime.composeState(message, providers);

    const systemPromptTemplate = isAffiliateChat ? affiliateSystemPrompt : chatAssistantSystemPrompt;
    const planningTemplate = isAffiliateChat ? affiliatePlanningTemplate : chatAssistantPlanningTemplate;

    const planningPrompt = cleanPrompt(
      composePromptFromState({
        state: initialState,
        template: runtime.character.templates?.planningTemplate || planningTemplate,
      }),
    );

    runtime.character.system = composePromptFromState({
      state: initialState,
      template: systemPromptTemplate,
    });

    const planningResponse = await runWithStreamingContext(
      createPlanningStreamContext(),
      () => runtime.useModel(ModelType.TEXT_LARGE, { prompt: planningPrompt }),
    );
    runtime.character.system = originalSystemPrompt;

    let plan = parseKeyValueXml(planningResponse) as ParsedPlan | null;
    let shouldRespondNow = canRespondImmediately(plan);

    // Auto-generate images (rate limited)
    if (shouldAutoGenerateImages) {
      const userText = (message.content?.text || "").trim();
      const hasExplicitRequest = hasImageIntent(userText);
      const rateLimitAllows = canGenerateImage(message.roomId.toString());

      if (hasExplicitRequest || rateLimitAllows) {
        shouldRespondNow = false;
        if (!plan) {
          plan = { thought: "Generating image", canRespondNow: "NO", actions: "GENERATE_IMAGE" };
        } else {
          if (!plan.actions?.includes("GENERATE_IMAGE")) {
            plan.actions = plan.actions ? `${plan.actions}, GENERATE_IMAGE` : "GENERATE_IMAGE";
          }
          plan.canRespondNow = "NO";
        }
      }
    }

    let responseContent = "";
    let thought = plan?.thought || "";

    if (shouldRespondNow && plan?.text) {
      responseContent = plan.text;
      if (onStreamChunk) {
        for (let i = 0; i < responseContent.length; i += 15) {
          await onStreamChunk(responseContent.slice(i, i + 15), responseId as UUID);
        }
      }
    } else {
      let updatedState = { ...initialState };

      if (!shouldRespondNow) {
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
          onStreamChunk,
        );

        // Exit early if action already sent response
        if (hasActionSentResponse(message.roomId as string)) {
          clearActionResponseFlag(message.roomId as string);
          getAndClearCachedAttachments(message.roomId as string);
          await clearLatestResponseId(runtime, message.roomId);

          await runtime.emitEvent(EventType.RUN_ENDED, {
            runtime,
            source: "chatAssistantWorkflow",
            runId,
            messageId: message.id || asUUID(v4()),
            roomId: message.roomId,
            entityId: message.entityId,
            startTime,
            status: "completed",
            endTime: Date.now(),
            duration: Date.now() - startTime,
          });
          return;
        }
      }

      // PERFORMANCE OPTIMIZATION: No need to call composeState again
      // Just add CURRENT_RUN_CONTEXT inline if needed (it's typically just the plan thought)

      // Select final prompts based on affiliate mode
      const finalSystemTemplate = isAffiliateChat
        ? affiliateFinalSystemPrompt
        : chatAssistantFinalSystemPrompt;
      const responseTemplate = isAffiliateChat
        ? affiliateResponseTemplate
        : chatAssistantResponseTemplate;

      runtime.character.system = cleanPrompt(
        composePromptFromState({
          state: updatedState,
          template: finalSystemTemplate,
        }),
      );

      const responsePrompt = cleanPrompt(
        composePromptFromState({
          state: updatedState,
          template:
            runtime.character.templates?.messageHandlerTemplate ||
            responseTemplate,
        }),
      );

      const streamingContext = createResponseStreamContext();
      const responseResult = await runWithStreamingContext(
        streamingContext,
        () => generateResponseWithRetry(runtime, responsePrompt),
      );
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
    const cachedAttachments = getAndClearCachedAttachments(
      message.roomId as string,
    );

    // Dedupe attachments by ID, preferring cached (validated HTTP URLs)
    const attachmentMap = new Map<
      string,
      { id: string; url: string; contentType?: string }
    >();
    for (const att of [...actionResultAttachments, ...cachedAttachments]) {
      if (att && typeof att === "object" && "id" in att && "url" in att) {
        const { id, url, contentType } = att as {
          id?: string;
          url?: string;
          contentType?: string;
        };
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

    // Ensure we have a response - if generation failed, provide a fallback
    if (!responseContent || responseContent.trim() === "") {
      logger.warn(
        "[Assistant] Response generation failed - using fallback response",
      );
      responseContent =
        mediaAttachments.length > 0
          ? "Here you go! 😊"
          : "I'm having trouble thinking right now. Could you try asking that again?";
    }

    // Post-process response to remove AI-speak and track openings
    const processedResponse = postProcessResponse(
      responseContent,
      message.roomId as string,
    );
    const finalText = processedResponse.text;

    const content: Content = {
      text: finalText,
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
      content: { ...content, text: finalText },
      metadata: {
        type: MemoryType.MESSAGE,
        role: "agent",
        dialogueType: "message",
        visibility: "visible",
        agentMode: "assistant",
      } as DialogueMetadata,
    };

    await runEvaluatorsWithTimeout(
      runtime,
      message,
      initialState,
      responseMemory,
      callback,
    );

    const endTime = Date.now();
    await runtime.emitEvent(EventType.RUN_ENDED, {
      runtime,
      source: "chatAssistantWorkflow",
      runId,
      messageId: message.id || asUUID(v4()),
      roomId: message.roomId,
      entityId: message.entityId,
      startTime,
      status: "completed",
      endTime,
      duration: endTime - startTime,
    });
  } catch (error) {
    runtime.character.system = originalSystemPrompt;
    // @ts-expect-error - RUN_ENDED status should include "error" for proper analytics tracking
    await runtime.emitEvent(EventType.RUN_ENDED, {
      runtime,
      source: "chatAssistantWorkflow",
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
