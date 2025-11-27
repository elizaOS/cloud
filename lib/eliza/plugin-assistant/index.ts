import {
  asUUID,
  composePromptFromState,
  createUniqueUuid,
  EventType,
  type IAgentRuntime,
  logger,
  type Memory,
  type MessagePayload,
  ModelType,
  type Plugin,
  type UUID,
  parseKeyValueXml,
  type State,
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

// Constants
const MAX_RESPONSE_RETRIES = 3;
const EVALUATOR_TIMEOUT_MS = 30000;

// Types
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
# Character Identity
{{bio}}

{{system}}

# Core Behavioral Rules
{{messageDirections}}

## Planning Phase Rules
When analyzing user messages, follow this decision tree:

### SPECIAL RULE: Clone Your Crush / Romantic Mode
{{affiliateContext}}

⚠️ IF the affiliateContext above mentions "Clone Your Crush" or "IMAGE GENERATION INSTRUCTIONS":
- You MUST use GENERATE_IMAGE action frequently (at least every 2-3 messages)
- ALWAYS set canRespondNow to NO and include GENERATE_IMAGE in actions
- Keep text SHORT (1-2 sentences max) when generating images
- Generate images for: greetings, compliments, emotional moments, when asked anything personal
- This is MANDATORY behavior - do NOT skip image generation

### Option 1 - Immediate Response (1 LLM call)
Use ONLY when ALL conditions are met:
- Simple greeting, thanks, or social interaction (BUT NOT in Clone Your Crush mode)
- General knowledge question answerable from character expertise
- NO actions needed (no image generation, no tools, no external operations)
- NO providers needed (no document lookup, no data retrieval)
- Complete answer possible with existing context alone

### Option 2 - Tool/Provider Usage (2+ LLM calls)
Use when ANY of these apply:
- User requests an action (generate image, search, calculate, etc.)
- Need to check documents, knowledge base, or user data
- Need specific providers for context
- Any tool or external operation required
- YOU ARE IN CLONE YOUR CRUSH MODE (check affiliateContext)

CRITICAL: If listing actions or providers, MUST set canRespondNow to NO.

# Response Generation Rules
- Keep responses focused and relevant to the user's specific question
- Don't repeat earlier replies unless explicitly asked
- Cite specific sources when referencing documents
- Include actionable advice with clear steps
- Balance detail with clarity - avoid overwhelming beginners

# Output Format Requirements
## Planning Phase Output
Always output ALL fields. Leave fields empty when not needed:

<plan>
  <thought>Reasoning about approach</thought>
  <canRespondNow>YES or NO</canRespondNow>
  <text>Response text if YES, empty if NO</text>
  <providers>KNOWLEDGE if needed, empty otherwise</providers>
  <actions>GENERATE_IMAGE if needed, empty otherwise</actions>
</plan>
`;

/**
 * Planning template - decides if we can respond immediately and generates response if possible
 */
export const planningTemplate = `
# Current Context
{{receivedMessageHeader}}

{{recentMessages}}

{{sessionSummaries}}

{{longTermMemories}}

{{availableDocuments}}

{{dynamicProviders}}

{{actionsWithDescriptions}}

# ⚠️ CRITICAL: Check this section FIRST before deciding on actions
{{affiliateContext}}

# Planning Decision
Based on the above context, especially the affiliateContext section:
- If affiliateContext mentions "Clone Your Crush" or "IMAGE GENERATION INSTRUCTIONS", you MUST include GENERATE_IMAGE in your actions
- Count recent messages - if there are 2+ text-only messages since last image, GENERATE an image now
- For romantic/crush contexts: images > text. Always prefer sending images.
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
# Current Context
{{receivedMessageHeader}}

{{recentMessages}}

{{sessionSummaries}}

{{longTermMemories}}

{{fullActionState}}

{{knowledge}}

# ⚠️ PERSONALITY & BEHAVIOR CONTEXT (READ CAREFULLY)
{{affiliateContext}}

# Response Guidelines
If the affiliateContext mentions "Clone Your Crush":
- Your text response should be SHORT (1-2 sentences) - the image is the main content
- Be flirty, playful, and match the personality vibe specified above
- The image you generated IS the response - add just a brief, teasing caption
`;

// Helper functions for response ID tracking
async function getLatestResponseId(
  runtime: IAgentRuntime,
  roomId: string,
): Promise<string | null> {
  const key = buildResponseCacheKey(runtime.agentId, roomId);
  return (await runtime.getCache<string>(key)) ?? null;
}

async function setLatestResponseId(
  runtime: IAgentRuntime,
  roomId: string,
  responseId: string,
): Promise<void> {
  if (!responseId || typeof responseId !== "string") {
    logger.error("[setLatestResponseId] Invalid responseId:", responseId);
    throw new Error(`Invalid responseId: ${responseId}`);
  }

  const key = buildResponseCacheKey(runtime.agentId, roomId);
  logger.debug(
    `[setLatestResponseId] Setting cache: ${key}, responseId: ${responseId.substring(0, 8)}`,
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
  roomId: string,
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
 * Extract attachments from action results
 */
function extractAttachments(
  actionResults: Array<{ data?: { attachments?: unknown[] } }>,
): unknown[] {
  return actionResults
    .flatMap((result) => result.data?.attachments ?? [])
    .filter(Boolean);
}

/**
 * Execute planned providers and update state
 */
async function executeProviders(
  runtime: IAgentRuntime,
  message: Memory,
  plannedProviders: string[],
  currentState: State,
): Promise<State> {
  if (plannedProviders.length === 0) {
    return currentState;
  }

  logger.debug(
    "[ElizaAssistant] Executing providers:",
    JSON.stringify(plannedProviders),
  );
  const providerState = await runtime.composeState(message, [
    ...plannedProviders,
    "CHARACTER",
  ]);

  return { ...currentState, ...providerState };
}

/**
 * Execute planned actions and update state
 */
async function executeActions(
  runtime: IAgentRuntime,
  message: Memory,
  plannedActions: string[],
  plan: ParsedPlan | null,
  currentState: State,
  callback: HandlerCallback,
): Promise<State> {
  if (plannedActions.length === 0) {
    return currentState;
  }

  logger.debug(
    "[ElizaAssistant] Executing actions:",
    JSON.stringify(plannedActions),
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

  await runtime.processActions(
    message,
    [actionResponse],
    currentState,
    callback,
  );

  // Refresh state to get action results
  const actionState = await runtime.composeState(message, ["ACTION_STATE"]);
  return { ...currentState, ...actionState };
}

/**
 * Generate response with retry logic
 */
async function generateResponseWithRetry(
  runtime: IAgentRuntime,
  prompt: string,
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
  callback: HandlerCallback,
): Promise<void> {
  if (typeof runtime.evaluate !== "function") {
    logger.debug(
      "[ElizaAssistant] runtime.evaluate not available - skipping evaluators",
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
            JSON.stringify(content),
          );
          return callback ? callback(content) : [];
        },
        [responseMemory],
      ),
      new Promise<void>((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(`Evaluators timed out after ${EVALUATOR_TIMEOUT_MS}ms`),
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
  const runId = asUUID(v4());
  const startTime = Date.now();

  logger.debug(
    `[ElizaAssistant] Generated response ID: ${responseId.substring(0, 8)}`,
  );
  logger.debug(`[ElizaAssistant] Generated run ID: ${runId.substring(0, 8)}`);
  logger.debug(`[ElizaAssistant] MESSAGE RECEIVED:`, JSON.stringify(message));

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
    source: "messageHandler",
  });

  try {
    if (message.entityId === runtime.agentId) {
      throw new Error("Message is from the agent itself");
    }

    // Save the incoming message
    logger.debug("[ElizaAssistant] Saving message to memory");
    await runtime.createMemory(message, "messages");

    // PHASE 1: Compose initial state with memory providers
    logger.info(
      `[ElizaAssistant] Processing message for character: ${runtime.character.name} (ID: ${runtime.character.id})`,
    );
    logger.debug("[ElizaAssistant] Composing state with memory providers");
    const initialState = await runtime.composeState(message, [
      "SHORT_TERM_MEMORY",
      "LONG_TERM_MEMORY",
      "AVAILABLE_DOCUMENTS",
      "PROVIDERS",
      "ACTIONS",
      "CHARACTER",
    ]);

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

    const plan = parseKeyValueXml(planningResponse) as ParsedPlan | null;
    const shouldRespondNow = canRespondImmediately(plan);

    logger.info(
      `[ElizaAssistant] Plan - canRespondNow: ${shouldRespondNow}, thought: ${plan?.thought}`,
    );

    let responseContent = "";
    let thought = "";

    // Check if the planning call already generated a response (1 LLM call optimization)
    if (shouldRespondNow && plan?.text) {
      logger.info(
        "[ElizaAssistant] ⚡ Single-call optimization: Using response from planning phase",
      );
      responseContent = plan.text;
      thought = plan.thought || "";
    } else {
      // Need to gather more context and generate response (2+ LLM calls)
      let updatedState = { ...initialState };

      // PHASE 3: Execute planned providers and actions
      if (!shouldRespondNow) {
        logger.info(
          "[ElizaAssistant] Phase 2: Executing providers and actions",
        );
        logger.debug(
          `[ElizaAssistant] Providers: ${plan?.providers}, Actions: ${plan?.actions}`,
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
          "[ElizaAssistant] Short-circuit: Responding with existing context",
        );
      }

      // PHASE 4: Generate final response using updated state
      const responsePhase = shouldRespondNow ? "Phase 2" : "Phase 3";
      logger.info(
        `[ElizaAssistant] ${responsePhase}: Generating final response`,
      );

      // Compose system prompt for response generation
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
    const currentResponseId = await getLatestResponseId(
      runtime,
      message.roomId,
    );
    if (currentResponseId !== responseId) {
      logger.info(
        `Response discarded - newer message being processed for agent: ${runtime.agentId}, room: ${message.roomId}`,
      );
      return;
    }

    // Clean up the response ID
    await clearLatestResponseId(runtime, message.roomId);

    // Extract attachments from action results
    const actionResults = await runtime.getActionResults(message.id as UUID);
    const attachments = extractAttachments(actionResults);

    logger.info(
      `[ElizaAssistant] Action results: ${JSON.stringify(actionResults)}`,
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
        `[ElizaAssistant] Including ${attachments.length} attachment(s) in response`,
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
      callback,
    );

    logger.info(
      `[ElizaAssistant] Run ${runId.substring(0, 8)} completed successfully`,
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
      source: "messageHandler",
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
      source: "messageHandler",
    });
    throw error;
  }
};

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
      logger.debug(`Message sent: ${payload.message.content.text}`);
    },
  ],
};

export const assistantPlugin: Plugin = {
  name: "eliza-assistant",
  description: "Core assistant plugin with message handling and context",
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
