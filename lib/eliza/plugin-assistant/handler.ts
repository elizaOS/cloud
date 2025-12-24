import {
  asUUID,
  composePromptFromState,
  type Content,
  ContentType,
  createUniqueUuid,
  EventType,
  logger,
  type Media,
  type Memory,
  ModelType,
  parseKeyValueXml,
  runWithStreamingContext,
  XmlTagExtractor,
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
  getAndClearCachedAttachments,
  executeProviders,
  executeActions,
  cleanPrompt,
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
    runId,
    messageId: message.id || asUUID(v4()),
    roomId: message.roomId,
    entityId: message.entityId,
    startTime,
    status: "started",
    source: "chatAssistantWorkflow",
  });

  const originalSystemPrompt = runtime.character.system;

  // Helper to create fresh streaming context for response generation
  const createStreamingContext = () => {
    if (!onStreamChunk) return undefined;
    const extractor = new XmlTagExtractor("text");
    return {
      onStreamChunk: async (chunk: string, msgId?: UUID) => {
        if (extractor.done) return;
        const textToStream = extractor.push(chunk);
        if (textToStream) {
          await onStreamChunk(textToStream, msgId);
        }
      },
      messageId: responseId as UUID,
    };
  };

  try {
    await runtime.createMemory(message, "messages");

    logger.info(
      `[ChatAssistant] Processing message for character: ${runtime.character.name}`,
    );

    const initialState = await runtime.composeState(message, [
      "SUMMARIZED_CONTEXT",
      "RECENT_MESSAGES",
      "LONG_TERM_MEMORY",
      "AVAILABLE_DOCUMENTS",
      "PROVIDERS",
      "MCP",
      "ACTIONS",
      "CHARACTER",
    ]);

    // Planning phase
    const planningPrompt = cleanPrompt(
      composePromptFromState({
        state: initialState,
        template:
          runtime.character.templates?.planningTemplate ||
          chatAssistantPlanningTemplate,
      }),
    );

    runtime.character.system = composePromptFromState({
      state: initialState,
      template: chatAssistantSystemPrompt,
    });

    const planningResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
      prompt: planningPrompt,
    });

    runtime.character.system = originalSystemPrompt;

    const plan = parseKeyValueXml(planningResponse) as ParsedPlan | null;
    const shouldRespondNow = canRespondImmediately(plan);

    logger.info(
      `[ChatAssistant] Plan - canRespondNow: ${shouldRespondNow}, thought: ${plan?.thought}`,
    );

    let responseContent = "";
    let thought = "";
    const planningThought = plan?.thought || "";

    // Single-call optimization: use planning response if available
    if (shouldRespondNow && plan?.text) {
      responseContent = plan.text;
      thought = plan.thought || "";
      
      // Stream the planning response text to client for real-time display
      // Even though we already have the full text, we stream it in chunks
      // so the user sees text appearing incrementally
      if (onStreamChunk && responseContent) {
        const chunkSize = 8; // Characters per chunk - small for smooth streaming
        for (let i = 0; i < responseContent.length; i += chunkSize) {
          const chunk = responseContent.slice(i, i + chunkSize);
          await onStreamChunk(chunk, responseId as UUID);
          // Small delay between chunks for natural streaming effect
          if (i + chunkSize < responseContent.length) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }
      }
    } else {
      let updatedState = await runtime.composeState(message, [
        "SUMMARIZED_CONTEXT",
        "RECENT_MESSAGES",
        "LONG_TERM_MEMORY",
        "PROVIDERS",
        "MCP",
        "ACTIONS",
        "CHARACTER",
      ]);

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
        );
      }

      // Generate final response - include planning thought for context
      updatedState = await runtime.composeState(message, [
        "CURRENT_RUN_CONTEXT",
      ]);

      // Add planning thought to state for the final response template
      if (planningThought) {
        updatedState.planningThought = `# Planning Reasoning\n${planningThought}`;
      } else {
        updatedState.planningThought = "";
      }

      runtime.character.system = cleanPrompt(
        composePromptFromState({
          state: updatedState,
          template: chatAssistantFinalSystemPrompt,
        }),
      );

      const responsePrompt = cleanPrompt(
        composePromptFromState({
          state: updatedState,
          template:
            runtime.character.templates?.messageHandlerTemplate ||
            chatAssistantResponseTemplate,
        }),
      );

      // Wrap response generation with streaming context
      const streamingContext = createStreamingContext();
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
      logger.info(`[ChatAssistant] Response discarded - superseded`);
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
      { id: string; url: string; title?: string; contentType?: string }
    >();
    for (const att of [...actionResultAttachments, ...cachedAttachments]) {
      if (att && typeof att === "object" && "id" in att && "url" in att) {
        const { id, url, title, contentType } = att as {
          id?: string;
          url?: string;
          title?: string;
          contentType?: string;
        };
        if (id && url) attachmentMap.set(id, { id, url, title, contentType });
      }
    }

    const mediaAttachments: Media[] = Array.from(attachmentMap.values())
      .filter((att) => att.url.length > 0)
      .map((att) => {
        const contentType = att.contentType?.toUpperCase() as keyof typeof ContentType;
        return {
          id: att.id,
          url: att.url,
          ...(att.title && { title: att.title }),
          ...(contentType && ContentType[contentType] && { contentType: ContentType[contentType] }),
        };
      });

    const content: Content = {
      text: responseContent,
      thought,
      source: "agent",
      inReplyTo: message.id,
      ...(mediaAttachments.length > 0 && { attachments: mediaAttachments }),
    };

    if (callback) {
      await callback(content);
    }

    const responseMemory: Memory = {
      id: createUniqueUuid(runtime, (message.id ?? v4()) as UUID),
      entityId: runtime.agentId,
      roomId: message.roomId,
      worldId: message.worldId,
      content,
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
      runId,
      messageId: message.id || asUUID(v4()),
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
    // @ts-expect-error - RUN_ENDED status should include "error" for proper analytics tracking
    await runtime.emitEvent(EventType.RUN_ENDED, {
      runtime,
      runId,
      messageId: message.id || asUUID(v4()),
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
