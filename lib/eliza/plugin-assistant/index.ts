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
} from "@elizaos/core";
import { v4 } from "uuid";
import { providersProvider } from "./providers/providers";
import { actionsProvider } from "./providers/actions";
import { characterProvider } from "./providers/character";
import { generateImageAction } from "./actions/image-generation";
import { actionStateProvider } from "./providers/actionState";

// Track usage per message for credit deduction
const messageUsageMap = new Map<
  string,
  { inputTokens: number; outputTokens: number; model: string }
>();

interface MessageReceivedHandlerParams {
  runtime: IAgentRuntime;
  message: Memory;
  callback: (result: {
    text?: string;
    usage?: { inputTokens: number; outputTokens: number; model: string };
  }) => Promise<Memory[]>;
}

/**
 * Planning template - decides if we can respond immediately and generates response if possible
 */
export const planningTemplate = `
<providers>
{{providers}}
</providers>

<instructions>
You are analyzing the user's message to determine the best approach.

**CRITICAL RULE: If you need ANY actions or providers, you MUST select Option 2.**

**Option 1 - Respond Immediately (1 LLM call):**
ONLY use this if ALL of these are true:
- Simple greeting, thanks, or social interaction
- General knowledge question answerable from memory
- NO actions needed (no image generation, no tools, no external operations)
- NO providers needed (no document lookup, no data retrieval)
- You can give a complete answer with existing context alone

**Option 2 - Use Actions/Providers (2+ LLM calls):**
Use this if ANY of these apply:
- User requests an action (generate image, search, calculate, etc.)
- Need to check documents, knowledge base, or user data
- Need specific providers for context
- ANY tool or external operation required

IMPORTANT: If listing actions or providers, set canRespondNow to NO.
</instructions>

<output>
Respond using XML format:

**If you can respond immediately (NO actions/providers needed):**
<plan>
  <thought>Brief reasoning why you can respond now</thought>
  <canRespondNow>YES</canRespondNow>
  <text>Your complete response to the user here</text>
</plan>

**If you need actions or providers:**
<plan>
  <thought>Reasoning about what you need</thought>
  <canRespondNow>NO</canRespondNow>
  <providers>PROVIDER_1,PROVIDER_2</providers>
  <actions>ACTION_1,ACTION_2</actions>
</plan>
</output>`;

/**
 * Final response template - generates the actual response
 */
export const messageHandlerTemplate = `
<providers>
{{providers}}
</providers>

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
</output>`;

// Helper functions for response ID tracking
async function getLatestResponseId(
  runtime: IAgentRuntime,
  roomId: string,
): Promise<string | null> {
  return (
    (await runtime.getCache<string>(
      `response_id:${runtime.agentId}:${roomId}`,
    )) ?? null
  );
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
  const key = `response_id:${runtime.agentId}:${roomId}`;
  logger.debug(
    `[setLatestResponseId] Setting cache: ${key}, responseId: ${responseId.substring(0, 8)}`,
  );
  try {
    await runtime.setCache(key, responseId);
  } catch (error) {
    logger.error(
      `[setLatestResponseId] Error setting cache: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

async function clearLatestResponseId(
  runtime: IAgentRuntime,
  roomId: string,
): Promise<void> {
  const key = `response_id:${runtime.agentId}:${roomId}`;
  logger.debug("[clearLatestResponseId] Deleting cache key:", key);
  await runtime.deleteCache(key);
}

/**
 * Estimate token count from text (rough approximation: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Handles incoming messages using single-shot approach with planning
 */
const messageReceivedHandler = async ({
  runtime,
  message,
  callback,
}: MessageReceivedHandlerParams): Promise<void> => {
  // Generate a new response ID
  const responseId = v4();
  logger.debug(
    "[ElizaAssistant] Generated response ID:",
    responseId.substring(0, 8),
  );

  // Set this as the latest response ID for this room
  await setLatestResponseId(runtime, message.roomId, responseId);

  // Generate a unique run ID for tracking
  const runId = asUUID(v4());
  const startTime = Date.now();

  // Track usage for this message
  const messageKey = message.id || v4();
  const modelUsed = "gpt-4o"; // Default model used by ElizaOS
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

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

    // Note: Message streaming is now handled by the API route
    // No need to emit events here - the streaming POST endpoint handles it directly

    // PHASE 1: Compose initial state with memory providers
    logger.debug("[ElizaAssistant] Composing state with memory providers");
    const initialState = await runtime.composeState(message, [
      "SHORT_TERM_MEMORY",
      "LONG_TERM_MEMORY",
      "AVAILABLE_DOCUMENTS",
    ]);

    logger.debug("*** INITIAL STATE ***\n", JSON.stringify(initialState));

    // PHASE 2: Planning - Determine which providers/actions to use
    logger.info("[ElizaAssistant] Phase 1: Planning");
    const planningPrompt = composePromptFromState({
      state: initialState,
      template:
        runtime.character.templates?.planningTemplate || planningTemplate,
    });

    logger.debug("*** PLANNING PROMPT ***\n", planningPrompt);
    const planningInputTokens = estimateTokens(planningPrompt);
    totalInputTokens += planningInputTokens;

    const planningResponse = await runtime.useModel(ModelType.TEXT_LARGE, {
      prompt: planningPrompt,
    });

    logger.debug("*** PLANNING RESPONSE ***\n", planningResponse);
    const planningOutputTokens = estimateTokens(planningResponse);
    totalOutputTokens += planningOutputTokens;

    const plan = parseKeyValueXml(planningResponse);
    const canRespondNow =
      plan?.canRespondNow?.toUpperCase() === "YES" ||
      plan?.canRespondNow === "true";

    logger.info(
      `[ElizaAssistant] Plan - canRespondNow: ${canRespondNow}, thought: ${plan?.thought}`,
    );

    let responseContent = "";
    let thought = "";

    // Check if the planning call already generated a response (1 LLM call optimization)
    if (canRespondNow && plan?.text) {
      logger.info(
        "[ElizaAssistant] ⚡ Single-call optimization: Using response from planning phase",
      );
      responseContent = plan.text;
      thought = plan.thought || "";
    } else {
      // Need to gather more context and generate response (2+ LLM calls)
      let updatedState = { ...initialState };

      // PHASE 3: Execute planned providers and actions
      if (!canRespondNow) {
        logger.info(
          "[ElizaAssistant] Phase 2: Executing providers and actions",
        );
        logger.debug(
          `[ElizaAssistant] Providers: ${plan?.providers}, Actions: ${plan?.actions}`,
        );

        // Execute providers if any were planned
        const plannedProviders = plan?.providers
          ? (Array.isArray(plan.providers)
              ? plan.providers
              : plan.providers.split(",").map((p: string) => p.trim())
            ).filter((p: string) => p && p !== "")
          : [];

        if (plannedProviders.length > 0) {
          logger.debug(
            "[ElizaAssistant] Executing providers:",
            plannedProviders,
          );
          const providerState = await runtime.composeState(message, [
            ...plannedProviders,
            "CHARACTER",
          ]);
          updatedState = { ...updatedState, ...providerState };
        }

        // Execute actions if any were planned
        const plannedActions = plan?.actions
          ? (Array.isArray(plan.actions)
              ? plan.actions
              : plan.actions.split(",").map((a: string) => a.trim())
            ).filter((a: string) => a && a !== "")
          : [];

        if (plannedActions.length > 0) {
          logger.debug("[ElizaAssistant] Executing actions:", plannedActions);
          
          // Create response memory with actions for processActions
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

          // Execute actions via processActions
          // The action results will be stored in state by processActions
          await runtime.processActions(
            message,
            [actionResponse],
            updatedState,
            callback
          );

          // Refresh state to get action results
          const actionState = await runtime.composeState(message, ["ACTION_STATE"]);
          updatedState = { ...updatedState, ...actionState };
        }
      } else {
        logger.info(
          "[ElizaAssistant] Short-circuit: Responding with existing context",
        );
      }

      // PHASE 4: Generate final response using updated state
      const responsePhase = canRespondNow ? "Phase 2" : "Phase 3";
      logger.info(
        `[ElizaAssistant] ${responsePhase}: Generating final response`,
      );
      const responsePrompt = composePromptFromState({
        state: updatedState,
        template:
          runtime.character.templates?.messageHandlerTemplate ||
          messageHandlerTemplate,
      });

      logger.debug("*** RESPONSE PROMPT ***\n", responsePrompt);
      const responseInputTokens = estimateTokens(responsePrompt);
      totalInputTokens += responseInputTokens;

      // Retry if missing required fields
      let retries = 0;
      const maxRetries = 3;

      while (retries < maxRetries && !responseContent) {
        const response = await runtime.useModel(ModelType.TEXT_LARGE, {
          prompt: responsePrompt,
        });

        logger.debug("*** RAW LLM RESPONSE ***\n", response);
        const responseOutputTokens = estimateTokens(response);
        if (retries === 0) {
          totalOutputTokens += responseOutputTokens;
        }

        const parsedResponse = parseKeyValueXml(response);

        if (!parsedResponse?.text) {
          logger.warn("*** Missing response text, retrying... ***");
          responseContent = "";
        } else {
          responseContent = parsedResponse.text;
          thought = parsedResponse.thought || "";
          break;
        }
        retries++;
      }
    }

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

    // Extract attachments from action results in state
    const actionResults = await runtime.getActionResults(message.id as UUID);

  
    logger.info(`[ElizaAssistant] Action results: ${JSON.stringify(actionResults)}`);

    
    const attachments = actionResults
      .flatMap((result) => {
        // Check if action result has attachments in its callback data
        if (result.data?.attachments) {
          return result.data.attachments;
        }
        return [];
      })
      .filter(Boolean);

    // Create response memory with attachments if any
    const content: Record<string, unknown> = {
      text: responseContent,
      thought,
      source: "agent",
      inReplyTo: message.id,
    };
    
    if (attachments.length > 0) {
      content.attachments = attachments;
      logger.info(`[ElizaAssistant] Including ${attachments.length} attachment(s) in response`);
    }

    const responseMemory: Memory = {
      id: createUniqueUuid(runtime, (message.id ?? v4()) as UUID),
      entityId: runtime.agentId,
      roomId: message.roomId,
      worldId: message.worldId,
      content: content as Memory['content'],
    };

    // Save response
    logger.debug("[ElizaAssistant] Saving response to memory");
    await runtime.createMemory(responseMemory, "messages");

    // Note: Response streaming is handled by the API route
    // The streaming POST endpoint sends events directly to the client

    // Store usage in map for retrieval by API endpoint
    messageUsageMap.set(messageKey, {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      model: modelUsed,
    });

    logger.info(
      `[ElizaAssistant] Token usage - input: ${totalInputTokens}, output: ${totalOutputTokens}, model: ${modelUsed}`,
    );

    // Trigger callback if provided
    if (callback) {
      await callback({
        text: responseContent,
        ...(attachments.length > 0 && { attachments }),
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          model: modelUsed,
        },
      });
    }

    // Emit run ended event (before evaluators to not delay response)
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
      source: "messageHandler",
      metadata: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        model: modelUsed,
      },
    });

    // Run evaluators (with timeout to prevent hanging)
    if (typeof runtime.evaluate === "function") {
      logger.debug("[ElizaAssistant] Running evaluators");

      try {
        // Run evaluators with a 30-second timeout
        await Promise.race([
          runtime.evaluate(
            message,
            { ...initialState }, // Use the initial state for evaluators
            true, // shouldRespondToMessage
            async (content) => {
              logger.debug(
                "[ElizaAssistant] Evaluator callback:",
                JSON.stringify(content),
              );
              // Evaluator callbacks can be used for side effects
              if (callback) {
                return callback(content);
              }
              return [];
            },
            [responseMemory],
          ),
          // Timeout after 30 seconds to prevent function from hanging
          new Promise<void>((_, reject) => {
            setTimeout(() => {
              reject(new Error("Evaluators timed out after 30 seconds"));
            }, 30000);
          }),
        ]);
        logger.debug("[ElizaAssistant] Evaluators completed successfully");
      } catch (error) {
        logger.error(
          "[ElizaAssistant] Error in evaluators:",
          error instanceof Error ? error.message : String(error),
        );
      }
    } else {
      logger.debug(
        "[ElizaAssistant] runtime.evaluate not available - skipping evaluators",
      );
    }
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
  providers: [providersProvider, actionsProvider, characterProvider, actionStateProvider],
  actions: [generateImageAction],
  services: [],
};

export default assistantPlugin;

// Export helper to retrieve usage data
export function getMessageUsage(
  messageId: string,
): { inputTokens: number; outputTokens: number; model: string } | undefined {
  const usage = messageUsageMap.get(messageId);
  if (usage) {
    // Clean up after retrieval to prevent memory leaks
    messageUsageMap.delete(messageId);
  }
  return usage;
}
