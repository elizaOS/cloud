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
    'pic', 'picture', 'photo', 'image', 'selfie', 'show me',
    'send me', 'what do you look like', 'appearance', 'wearing'
  ];
  
  const lowerMessage = userMessage.toLowerCase();
  return imageKeywords.some(keyword => lowerMessage.includes(keyword));
}

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
    const affiliateData = runtime.character.settings?.affiliateData as
      | {
          vibe?: string;
          affiliateId?: string;
          autoImage?: boolean;
          imageUrls?: string[];
          [key: string]: unknown;
        }
      | undefined;
    const isAffiliateChat = !!(
      affiliateData && Object.keys(affiliateData).length > 0
    );
    // Auto-generate images on every response if autoImage is enabled
    // Reference images are optional - without them, images are generated based on character bio
    const shouldAutoGenerateImages = affiliateData?.autoImage === true;

    logger.info(
      `[Assistant] Processing for ${runtime.character.name}, affiliate: ${isAffiliateChat}, autoImage: ${shouldAutoGenerateImages}`
    );

    const providers = isAffiliateChat
      ? ["CHARACTER", "ACTIONS", "affiliateContext", "APP_CONFIG"]
      : [
          "SUMMARIZED_CONTEXT",
          "RECENT_MESSAGES",
          "LONG_TERM_MEMORY",
          "AVAILABLE_DOCUMENTS",
          "PROVIDERS",
          "MCP",
          "ACTIONS",
          "CHARACTER",
          "affiliateContext",
          "APP_CONFIG",
        ];

    const initialState = await runtime.composeState(message, providers);

    // Planning phase
    const planningPrompt = cleanPrompt(
      composePromptFromState({
        state: initialState,
        template:
          runtime.character.templates?.planningTemplate ||
          chatAssistantPlanningTemplate,
      })
    );

    runtime.character.system = composePromptFromState({
      state: initialState,
      template: chatAssistantSystemPrompt,
    });

    const planningResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
      prompt: planningPrompt,
    });
    runtime.character.system = originalSystemPrompt;

    let plan = parseKeyValueXml(planningResponse) as ParsedPlan | null;
    let shouldRespondNow = canRespondImmediately(plan);

    // Auto-generate images when autoImage is enabled
    // Rate limited to prevent cost abuse (1 image per minute OR explicit user request)
    if (shouldAutoGenerateImages) {
      const userText = (message.content?.text || "").trim();
      const hasExplicitRequest = hasImageIntent(userText);
      const rateLimitAllows = canGenerateImage(message.roomId.toString());
      
      // Only force image generation if:
      // 1. User explicitly requested an image, OR
      // 2. Rate limit allows it (hasn't generated in last minute)
      if (hasExplicitRequest || rateLimitAllows) {
        logger.info(
          `[Assistant] Auto-generating image - explicit: ${hasExplicitRequest}, rateLimit: ${rateLimitAllows}`
        );
        
        shouldRespondNow = false;
        if (!plan) {
          plan = {
            thought: "Generating image with character appearance",
            canRespondNow: "NO",
            actions: "GENERATE_IMAGE",
          };
        } else {
          const existingActions = plan.actions || "";
          if (!existingActions.includes("GENERATE_IMAGE")) {
            plan.actions = existingActions
              ? `${existingActions}, GENERATE_IMAGE`
              : "GENERATE_IMAGE";
          }
          plan.canRespondNow = "NO";
        }
      } else {
        logger.info(
          `[Assistant] Skipping auto-image (rate limited) - last generated < 1 min ago`
        );
      }
    }

    logger.info(
      `[Assistant] Plan: canRespondNow=${shouldRespondNow}, thought=${plan?.thought?.substring(0, 50)}`
    );

    let responseContent = "";
    let thought = "";

    // Single-call optimization: use planning response if available
    if (shouldRespondNow && plan?.text) {
      responseContent = plan.text;
      thought = plan.thought || "";
    } else {
      let updatedState = await runtime.composeState(message, [
        "SUMMARIZED_CONTEXT",
        "RECENT_MESSAGES",
        "LONG_TERM_MEMORY",
        "PROVIDERS",
        "MCP",
        "ACTIONS",
        "CHARACTER",
        "APP_CONFIG",
      ]);

      if (!shouldRespondNow) {
        const plannedProviders = parsePlannedItems(plan?.providers);
        const plannedActions = parsePlannedItems(plan?.actions);

        updatedState = await executeProviders(
          runtime,
          message,
          plannedProviders,
          updatedState
        );
        updatedState = await executeActions(
          runtime,
          message,
          plannedActions,
          plan,
          updatedState,
          callback
        );

        // Exit early if action already sent response
        if (hasActionSentResponse(message.roomId as string)) {
          clearActionResponseFlag(message.roomId as string);
          getAndClearCachedAttachments(message.roomId as string);
          await clearLatestResponseId(runtime, message.roomId);

          await runtime.emitEvent(EventType.RUN_ENDED, {
            runtime,
            runId,
            messageId: message.id,
            roomId: message.roomId,
            entityId: message.entityId,
            startTime,
            status: "completed",
            endTime: Date.now(),
            duration: Date.now() - startTime,
            source: "chatAssistantWorkflow",
          });
          return;
        }
      }

      // Generate final response
      updatedState = await runtime.composeState(message, [
        "CURRENT_RUN_CONTEXT",
        "APP_CONFIG",
      ]);

      runtime.character.system = cleanPrompt(
        composePromptFromState({
          state: updatedState,
          template: chatAssistantFinalSystemPrompt,
        })
      );

      const responsePrompt = cleanPrompt(
        composePromptFromState({
          state: updatedState,
          template:
            runtime.character.templates?.messageHandlerTemplate ||
            chatAssistantResponseTemplate,
        })
      );

      const responseResult = await generateResponseWithRetry(
        runtime,
        responsePrompt
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
      message.roomId as string
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
      logger.warn("[Assistant] Response generation failed - using fallback response");
      responseContent = mediaAttachments.length > 0
        ? "Here you go! 😊"
        : "I'm having trouble thinking right now. Could you try asking that again?";
    }

    // Post-process response to remove AI-speak and track openings
    const processedResponse = postProcessResponse(
      responseContent,
      message.roomId as string
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
      callback
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
    runtime.character.system = originalSystemPrompt;
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
