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
  type State,
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
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * 1. Single composeState call - reuse initial state instead of calling 3 times
 * 2. Parallel createMemory - runs alongside state composition
 * 3. Fire-and-forget evaluators - don't block response
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

  // OPTIMIZATION: Run these in parallel
  const [, initialState] = await Promise.all([
    setLatestResponseId(runtime, message.roomId, responseId),
    runtime.emitEvent(EventType.RUN_STARTED, {
      runtime,
      runId,
      messageId: message.id || asUUID(v4()),
      roomId: message.roomId,
      entityId: message.entityId,
      startTime,
      status: "started",
      source: "chatAssistantWorkflow",
    }).then(() => {}), // void return
    // OPTIMIZATION: Compose state ONCE with all needed providers
    runtime.composeState(message, [
      "SUMMARIZED_CONTEXT",
      "RECENT_MESSAGES",
      "LONG_TERM_MEMORY",
      "AVAILABLE_DOCUMENTS",
      "PROVIDERS",
      "MCP",
      "ACTIONS",
      "CHARACTER",
      "CURRENT_RUN_CONTEXT", // Include this upfront - avoids 3rd composeState call
    ]),
  ]).then(([_, __, state]) => [_, state as State]);

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
    runtime.createMemory(message, "messages").catch(() => {});

    const planningPrompt = cleanPrompt(
      composePromptFromState({
        state: initialState,
        template: runtime.character.templates?.planningTemplate || chatAssistantPlanningTemplate,
      }),
    );

    runtime.character.system = composePromptFromState({
      state: initialState,
      template: chatAssistantSystemPrompt,
    });

    const planningResponse = await runWithStreamingContext(
      createPlanningStreamContext(),
      () => runtime.useModel(ModelType.TEXT_LARGE, { prompt: planningPrompt }),
    );
    runtime.character.system = originalSystemPrompt;

    const plan = parseKeyValueXml(planningResponse) as ParsedPlan | null;
    const shouldRespondNow = canRespondImmediately(plan);

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
      // OPTIMIZATION: Reuse initialState instead of calling composeState again
      // The state already has all providers we need from the initial call
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
        );
      }

      if (thought) {
        updatedState.planningThought = `# Planning Reasoning\n${thought}`;
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

    // OPTIMIZATION: Fire-and-forget evaluators - don't block response
    // Evaluators handle things like room title updates which aren't critical path
    runEvaluatorsWithTimeout(
      runtime,
      message,
      initialState,
      responseMemory,
      callback,
    ).catch((e) => {
      logger.warn(`[ChatAssistant] Evaluators failed: ${e}`);
    });

    const endTime = Date.now();
    logger.info(`[ChatAssistant] Response generated in ${endTime - startTime}ms`);
    
    // Fire-and-forget event emission
    runtime.emitEvent(EventType.RUN_ENDED, {
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
    }).catch(() => {});
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
