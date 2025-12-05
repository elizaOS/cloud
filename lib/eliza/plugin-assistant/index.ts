import {
  composePromptFromState,
  createUniqueUuid,
  EventType,
  logger,
  ModelType,
  parseKeyValueXml,
  type IAgentRuntime,
  type Memory,
  type MessagePayload,
  type Plugin,
  type State,
  type UUID,
  type HandlerCallback,
} from "@elizaos/core";
import { v4 } from "uuid";
import { providersProvider } from "./providers/providers";
import { actionsProvider } from "./providers/actions";
import { characterProvider } from "./providers/character";
import { generateImageAction } from "./actions/image-generation";
import { actionStateProvider } from "./providers/actionState";
import { recentMessagesProvider } from "./providers/recent-messages";
import { affiliateContextProvider } from "./providers/affiliate-context";

const MAX_RESPONSE_RETRIES = 3;
const EVALUATOR_TIMEOUT_MS = 30000;

/**
 * Message handler parameters
 */
interface MessageReceivedHandlerParams {
  runtime: IAgentRuntime;
  message: Memory;
  callback: HandlerCallback;
}

interface ParsedPlan {
  canRespondNow?: string;
  thought?: string;
  text?: string;
  providers?: string | string[];
  actions?: string | string[];
}

interface ParsedResponse {
  thought?: string;
  text?: string;
}

const systemPrompt = `
# Character
{{bio}}
{{system}}
{{messageDirections}}

# Planning Rules
- canRespondNow=YES: Simple chat, no tools needed
- canRespondNow=NO: Need actions/providers

# Output Format
<plan>
  <thought>Brief reasoning</thought>
  <canRespondNow>YES or NO</canRespondNow>
  <text>Response if YES</text>
  <providers>If needed</providers>
  <actions>If needed</actions>
</plan>
`;

/**
 * Planning template - decides if we can respond immediately and generates response if possible
 */
export const planningTemplate = `
{{receivedMessageHeader}}
{{recentMessages}}
{{affiliateContext}}
{{actionsWithDescriptions}}
`;

const finalMessageSystemPrompt = `
# Character Identity
{{system}}

# Core Behavioral Rules
{{messageDirections}}

<instructions>
Respond to the user's message thoroughly and helpfully.
Be concise, clear, and friendly.
Use the provided context and memories to personalize your response.

</instructions>

<keys>
"text" should be the text of the next message for {{agentName}} which they will send to the conversation.
</keys>

<output>
Respond using XML format like this:
<response>
  <thought>Your internal reasoning</thought>
  <text>Your response text here</text>
</response>

Your response must ONLY include the <response></response> XML block.
</output>
`;

/**
 * Final response template - generates the actual response
 */
export const messageHandlerTemplate = `
{{receivedMessageHeader}}
{{recentMessages}}
{{fullActionState}}
{{affiliateContext}}

Keep response SHORT (1-2 sentences) if image was generated.
`;

// Helper functions for response ID tracking
async function getLatestResponseId(
  runtime: IAgentRuntime,
  roomId: string
): Promise<string | null> {
  const key = buildResponseCacheKey(runtime.agentId, roomId);
  return (await runtime.getCache<string>(key)) ?? null;
}

async function setLatestResponseId(
  runtime: IAgentRuntime,
  roomId: string,
  responseId: string
): Promise<void> {
  if (!responseId || typeof responseId !== "string") {
    logger.error("[setLatestResponseId] Invalid responseId:", responseId);
    throw new Error(`Invalid responseId: ${responseId}`);
  }

  const key = buildResponseCacheKey(runtime.agentId, roomId);
  logger.debug(
    `[setLatestResponseId] Setting cache: ${key}, responseId: ${responseId.substring(0, 8)}`
  );

  try {
    await runtime.setCache(key, responseId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[setLatestResponseId] Error setting cache: ${errorMessage}`);
    throw error;
  }
}

async function clearLatestResponseId(
  runtime: IAgentRuntime,
  roomId: string
): Promise<void> {
  const key = buildResponseCacheKey(runtime.agentId, roomId);
  logger.debug(`[clearLatestResponseId] Deleting cache key: ${key}`);
  await runtime.deleteCache(key);
}

/**
 * Build cache key for response tracking
 */
function buildResponseCacheKey(agentId: UUID, roomId: string): string {
  return `response_id:${agentId}:${roomId}`;
}

/**
 * Parse planned items (providers or actions) from XML response
 * Handles both array and comma-separated string formats
 */
function parsePlannedItems(items: string | string[] | undefined): string[] {
  if (!items) return [];

  const itemArray = Array.isArray(items)
    ? items
    : items.split(",").map((item) => item.trim());

  return itemArray.filter((item) => item && item !== "");
}

/**
 * Check if plan indicates immediate response capability
 */
function canRespondImmediately(plan: ParsedPlan | null): boolean {
  return (
    plan?.canRespondNow?.toUpperCase() === "YES" ||
    plan?.canRespondNow === "true"
  );
}

/**
 * Check if a string is a base64 data URL (which would bloat token count)
 */
function isBase64DataUrl(url: string): boolean {
  return typeof url === "string" && url.startsWith("data:");
}

/**
 * Sanitize attachment to remove base64 data URLs
 * This is CRITICAL for preventing token limit exhaustion
 */
function sanitizeAttachment(
  attachment: Record<string, unknown>
): Record<string, unknown> | null {
  if (!attachment) return null;

  const url = attachment.url as string;

  // If URL is base64, skip the attachment entirely
  // The image was already shown to the user via the callback
  // We don't want to store base64 in memory as it bloats tokens
  if (url && isBase64DataUrl(url)) {
    logger.warn(
      "[ElizaAssistant] ⚠️ Base64 URL detected in attachment - skipping to prevent token bloat"
    );
    // Return null to skip this attachment - it was already displayed to user
    return null;
  }

  // Also skip placeholder URLs that aren't valid
  if (url && (url.startsWith("[") || url === "" || !url.startsWith("http"))) {
    logger.warn(
      "[ElizaAssistant] ⚠️ Invalid URL detected in attachment - skipping"
    );
    return null;
  }

  return attachment;
}

/**
 * Extract attachments from action results
 * IMPORTANT: Sanitizes attachments to prevent base64 data from bloating context
 */
function extractAttachments(
  actionResults: Array<{ data?: { attachments?: unknown[] } }>
): unknown[] {
  return actionResults
    .flatMap((result) => result.data?.attachments ?? [])
    .filter(Boolean)
    .map((att) => sanitizeAttachment(att as Record<string, unknown>))
    .filter(Boolean);
}

/**
 * Execute planned providers and update state
 */
async function executeProviders(
  runtime: IAgentRuntime,
  message: Memory,
  plannedProviders: string[],
  currentState: State
): Promise<State> {
  if (plannedProviders.length === 0) {
    return currentState;
  }

  logger.debug(
    "[ElizaAssistant] Executing providers:",
    JSON.stringify(plannedProviders)
  );
  const providerState = await runtime.composeState(message, [
    ...plannedProviders,
    "CHARACTER",
  ]);

  return { ...currentState, ...providerState };
}

// Track attachments collected during action execution
// This is stored per-room to handle concurrent messages
const actionAttachmentCache = new Map<string, unknown[]>();

/**
 * Execute planned actions and update state
 * Wraps the callback to capture attachments for later storage
 */
async function executeActions(
  runtime: IAgentRuntime,
  message: Memory,
  plannedActions: string[],
  plan: ParsedPlan | null,
  currentState: State,
  callback: HandlerCallback
): Promise<State> {
  if (plannedActions.length === 0) {
    return currentState;
  }

  logger.debug(
    "[ElizaAssistant] Executing actions:",
    JSON.stringify(plannedActions)
  );

  const actionResponse: Memory = {
    id: createUniqueUuid(runtime, v4() as UUID),
    entityId: runtime.agentId,
    roomId: message.roomId,
    worldId: message.worldId,
    content: {
      text: plan?.thought || "Executing actions",
      actions: plannedActions,
      source: "agent",
    },
  };

  // Clear any previous attachments for this room
  actionAttachmentCache.set(message.roomId as string, []);

  // Wrap the callback to capture attachments as they come in
  const wrappedCallback: HandlerCallback = async (content) => {
    // Capture attachments from action callbacks
    if (content.attachments && Array.isArray(content.attachments)) {
      const existingAttachments =
        actionAttachmentCache.get(message.roomId as string) || [];

      // Only add attachments with valid HTTP URLs (not base64)
      for (const att of content.attachments) {
        const attachment = att as {
          url?: string;
          rawUrl?: string;
          id?: string;
          title?: string;
          contentType?: string;
        };
        const url = attachment.url;

        logger.info(
          `[ElizaAssistant] 📎 Processing attachment: id=${attachment.id}, url=${url?.substring(0, 50)}...`
        );

        if (url && typeof url === "string" && url.startsWith("http")) {
          // Create a clean attachment object for storage (remove rawUrl to save space)
          const cleanAttachment = {
            id: attachment.id,
            url: url,
            title: attachment.title,
            contentType: attachment.contentType,
          };
          existingAttachments.push(cleanAttachment);
          logger.info(
            `[ElizaAssistant] ✅ Captured valid attachment for storage: ${url.substring(0, 80)}...`
          );
        } else {
          logger.info(
            `[ElizaAssistant] ⏭️ Skipping non-HTTP attachment (likely base64)`
          );
        }
      }

      actionAttachmentCache.set(message.roomId as string, existingAttachments);
      logger.info(
        `[ElizaAssistant] 📊 Total cached attachments for room: ${existingAttachments.length}`
      );
    }

    // Pass through to the original callback for real-time display
    return callback(content);
  };

  await runtime.processActions(
    message,
    [actionResponse],
    currentState,
    wrappedCallback
  );

  // Refresh state to get action results
  const actionState = await runtime.composeState(message, ["ACTION_STATE"]);
  return { ...currentState, ...actionState };
}

/**
 * Get cached attachments for a room and clear the cache
 */
function getAndClearCachedAttachments(roomId: string): unknown[] {
  const attachments = actionAttachmentCache.get(roomId) || [];
  actionAttachmentCache.delete(roomId);
  return attachments;
}

/**
 * Generate response with retry logic
 */
async function generateResponseWithRetry(
  runtime: IAgentRuntime,
  prompt: string
): Promise<{ text: string; thought: string }> {
  let retries = 0;
  let responseContent = "";
  let thought = "";

  while (retries < MAX_RESPONSE_RETRIES && !responseContent) {
    const response = await runtime.useModel(ModelType.TEXT_LARGE, { prompt });

    logger.debug("*** RAW LLM RESPONSE ***\n", response);

    const parsedResponse = parseKeyValueXml(response) as ParsedResponse | null;

    if (!parsedResponse?.text) {
      logger.warn("*** Missing response text, retrying... ***");
      retries++;
    } else {
      responseContent = parsedResponse.text;
      thought = parsedResponse.thought || "";
      break;
    }
  }

  return { text: responseContent, thought };
}

/**
 * Run evaluators with timeout to prevent hanging
 */
async function runEvaluatorsWithTimeout(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  responseMemory: Memory,
  callback: HandlerCallback
): Promise<void> {
  if (typeof runtime.evaluate !== "function") {
    logger.debug(
      "[ElizaAssistant] runtime.evaluate not available - skipping evaluators"
    );
    return;
  }

  logger.debug("[ElizaAssistant] Running evaluators");

  try {
    await Promise.race([
      runtime.evaluate(
        message,
        { ...state },
        true, // shouldRespondToMessage
        async (content) => {
          logger.debug(
            "[ElizaAssistant] Evaluator callback:",
            JSON.stringify(content)
          );
          return callback ? callback(content) : [];
        },
        [responseMemory]
      ),
      new Promise<void>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(`Evaluators timed out after ${EVALUATOR_TIMEOUT_MS}ms`)
          );
        }, EVALUATOR_TIMEOUT_MS);
      }),
    ]);
    logger.debug("[ElizaAssistant] Evaluators completed successfully");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[ElizaAssistant] Error in evaluators: ${errorMessage}`);
  }
}

/**
 * Handles incoming messages using single-shot approach with planning
 */
const messageReceivedHandler = async ({
  runtime,
  message,
  callback,
}: MessageReceivedHandlerParams): Promise<void> => {
  const responseId = v4();

  logger.info(
    `[AssistantPlugin] Handling message for agent: ${runtime.agentId}, room: ${message.roomId}`
  );
  logger.debug(`[AssistantPlugin] MESSAGE RECEIVED:`, JSON.stringify(message));

  // Set the latest response ID for this room
  await setLatestResponseId(runtime, message.roomId, responseId);

  try {
    if (message.entityId === runtime.agentId) {
      throw new Error("Message is from the agent itself");
    }

    // Save the incoming message
    logger.debug("[ElizaAssistant] Saving message to memory");
    await runtime.createMemory(message, "messages");

    // PHASE 1: Check if this is an affiliate character BEFORE composing state
    const characterSettings = runtime.character.settings;
    const earlyAffiliateData = characterSettings?.affiliateData as
      | Record<string, unknown>
      | undefined;
    const isAffiliateChat = !!(
      earlyAffiliateData && Object.keys(earlyAffiliateData).length > 0
    );

    // Debug: Log what we found for affiliate detection
    logger.info(
      `[ElizaAssistant] 🔍 Affiliate Detection: char=${runtime.character.name}, hasSettings=${!!characterSettings}, hasAffiliateData=${!!earlyAffiliateData}, affiliateKeys=${earlyAffiliateData ? Object.keys(earlyAffiliateData).join(",") : "none"}, isAffiliateChat=${isAffiliateChat}`
    );

    logger.info(
      `[ElizaAssistant] Processing message for ${runtime.character.name}, isAffiliate: ${isAffiliateChat}`
    );

    // Use MINIMAL providers for affiliate chats to avoid token overflow
    // Affiliate chats don't need conversation history - just generate image + short text
    const providers = isAffiliateChat
      ? ["CHARACTER", "ACTIONS"] // Minimal for affiliate - no history!
      : ["SHORT_TERM_MEMORY", "ACTIONS", "CHARACTER", "affiliateContext"];

    logger.debug(
      `[ElizaAssistant] Composing state with providers: ${providers.join(", ")}`
    );
    const initialState = await runtime.composeState(message, providers);

    console.log("*** INITIAL STATE ***\n", initialState);

    // PHASE 2: Planning - Determine which providers/actions to use
    logger.info("[ElizaAssistant] Phase 1: Planning");
    const planningPrompt = composePromptFromState({
      state: initialState,
      template:
        runtime.character.templates?.planningTemplate || planningTemplate,
    });

    logger.debug("*** PLANNING PROMPT ***\n", planningPrompt);

    const originalSystemPrompt = runtime.character.system;

    const composedSystemPrompt = composePromptFromState({
      state: initialState,
      template: systemPrompt,
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

    let plan = parseKeyValueXml(planningResponse) as ParsedPlan | null;
    let shouldRespondNow = canRespondImmediately(plan);

    // For affiliate chats, ensure GENERATE_IMAGE action is included but keep the original plan text
    if (isAffiliateChat && plan) {
      logger.info("[ElizaAssistant] 🔴 AFFILIATE - Ensuring image generation");
      shouldRespondNow = false;
      // Add GENERATE_IMAGE to actions if not already present, but preserve other plan data
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
      `[ElizaAssistant] Plan - respond: ${shouldRespondNow}, affiliate: ${isAffiliateChat}`
    );

    let responseContent = "";
    let thought = "";

    // Response generation
    if (shouldRespondNow && plan?.text) {
      logger.info("[ElizaAssistant] ⚡ Single-call optimization");
      responseContent = plan.text;
      thought = plan.thought || "";
    } else {
      let updatedState = { ...initialState };

      if (!shouldRespondNow) {
        logger.info("[ElizaAssistant] Executing providers and actions");
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
      }

      // Generate final response
      logger.info("[ElizaAssistant] Generating final response");
      const finalSystemPrompt = composePromptFromState({
        state: updatedState,
        template: finalMessageSystemPrompt,
      });
      runtime.character.system = finalSystemPrompt;

      const responsePrompt = composePromptFromState({
        state: updatedState,
        template:
          runtime.character.templates?.messageHandlerTemplate ||
          messageHandlerTemplate,
      });

      const responseResult = await generateResponseWithRetry(
        runtime,
        responsePrompt
      );
      responseContent = responseResult.text;
      thought = responseResult.thought;
    }

    // restore the system prompt to the original
    runtime.character.system = originalSystemPrompt;

    // Check if this is still the latest response ID for this room
    const currentResponseId = await getLatestResponseId(
      runtime,
      message.roomId
    );
    if (currentResponseId !== responseId) {
      logger.info(
        `Response discarded - newer message being processed for agent: ${runtime.agentId}, room: ${message.roomId}`
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
      message.roomId as string
    );

    logger.info(
      `[ElizaAssistant] 📊 Raw attachment sources: actionResults=${actionResults?.length || 0}, extracted=${actionResultAttachments.length}, cached=${cachedAttachments.length}`
    );

    // Merge attachments, preferring cached ones (which have already been validated)
    // Use a Map to dedupe by attachment ID
    const attachmentMap = new Map<string, unknown>();

    // First add action result attachments
    for (const att of actionResultAttachments) {
      const attachment = att as { id?: string; url?: string };
      if (attachment.id) {
        attachmentMap.set(attachment.id, att);
        logger.info(
          `[ElizaAssistant] 📎 Added action result attachment: ${attachment.id}, url=${attachment.url?.substring(0, 50)}...`
        );
      }
    }

    // Then add/override with cached attachments (these are validated HTTP URLs)
    for (const att of cachedAttachments) {
      const attachment = att as { id?: string; url?: string };
      if (attachment.id) {
        attachmentMap.set(attachment.id, att);
        logger.info(
          `[ElizaAssistant] 📎 Added/overrode with cached attachment: ${attachment.id}, url=${attachment.url?.substring(0, 50)}...`
        );
      }
    }

    const attachments = Array.from(attachmentMap.values());

    logger.info(
      `[ElizaAssistant] ✅ Final attachments count: ${attachments.length}`
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
        `[ElizaAssistant] ✅ Including ${attachments.length} attachment(s) in response`
      );
      // Log each attachment for debugging
      for (const att of attachments) {
        const a = att as { id?: string; url?: string; contentType?: string };
        logger.info(
          `[ElizaAssistant] 📎 Attachment: id=${a.id}, url=${a.url?.substring(0, 80)}..., type=${a.contentType}`
        );
      }
    } else {
      logger.info(`[ElizaAssistant] ⚠️ No attachments to include in response`);
    }

    const responseMemory: Memory = {
      id: createUniqueUuid(runtime, (message.id ?? v4()) as UUID),
      entityId: runtime.agentId,
      roomId: message.roomId,
      worldId: message.worldId,
      content: content as Memory["content"],
    };

    // Save response
    logger.debug("[ElizaAssistant] Saving response to memory");
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
      callback
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `[AssistantPlugin] Error in workflow handler: ${errorMessage}`
    );
    throw error;
  }
};

/**
 * Event handlers
 */
const events = {
  [EventType.MESSAGE_RECEIVED]: [
    async (payload: MessagePayload) => {
      if (payload.callback) {
        await messageReceivedHandler({
          runtime: payload.runtime,
          message: payload.message,
          callback: payload.callback,
        });
      }
    },
  ],

  [EventType.MESSAGE_SENT]: [
    async (payload: MessagePayload) => {
      logger.debug(
        `[AssistantPlugin] Message sent: ${payload.message.content.text}`
      );
    },
  ],
};

/**
 * Assistant Plugin Export
 */
export const assistantPlugin: Plugin = {
  name: "eliza-assistant",
  description:
    "Core assistant plugin with message handling and workflow routing",
  events,
  providers: [
    providersProvider,
    actionsProvider,
    characterProvider,
    actionStateProvider,
    recentMessagesProvider,
    affiliateContextProvider,
  ],
  actions: [generateImageAction],
  services: [],
};

export default assistantPlugin;
