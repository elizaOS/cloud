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
  type State,
  type Content,
  parseKeyValueXml,
} from "@elizaos/core";
import { v4 } from "uuid";

// Track usage per message for credit deduction
const messageUsageMap = new Map<
  string,
  { inputTokens: number; outputTokens: number; model: string }
>();

/**
 * Multi-step workflow execution result
 */
interface MultiStepActionResult {
  data: { actionName: string };
  success: boolean;
  text?: string;
  error?: string | Error;
  values?: Record<string, unknown>;
}

/**
 * Multi-step workflow state
 */
interface MultiStepState extends State {
  data: {
    actionResults: MultiStepActionResult[];
    [key: string]: unknown;
  };
}

/**
 * Message processing options
 */
interface MessageProcessingOptions {
  useMultiStep?: boolean;
  maxMultiStepIterations?: number;
  maxRetries?: number;
}

interface MessageReceivedHandlerParams {
  runtime: IAgentRuntime;
  message: Memory;
  callback: (result: {
    text?: string;
    usage?: { inputTokens: number; outputTokens: number; model: string };
  }) => Promise<Memory[]>;
}

/**
 * Extracts the text content from within a <response> XML tag.
 */
function extractResponseText(text: string): string | null {
  if (!text) return null;

  const responseMatch = text.match(/<response>([\s\S]*?)<\/response>/);

  if (!responseMatch || responseMatch[1] === undefined) {
    logger.warn("Could not find <response> tag, using raw text");
    return text.trim() || null;
  }

  const responseContent = responseMatch[1].trim();

  if (!responseContent) {
    logger.warn("Found <response> tag, but its content is empty");
    return null;
  }

  // Basic unescaping for common XML entities
  const unescapedContent = responseContent
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  return unescapedContent;
}

export const messageHandlerTemplate = `
<providers>
{{providers}}
</providers>

<instructions>
You are a friendly companion and assistant. Your goal is to build a genuine connection with the user.

Response Guidelines:
- Keep your responses SHORT and CONVERSATIONAL (1-3 sentences typically)
- Ask thoughtful questions to understand the user and their needs better
- Show genuine curiosity about the user's situation, goals, and challenges
- Listen actively before offering solutions
- Only provide detailed/longer responses if the user asks a complex question or explicitly requests more detail
- Match the user's message length and tone - if they write long, you can elaborate more; if they write short, keep it brief
- Be warm, authentic, and supportive like a trusted friend

Think of yourself as a companion first, helper second. Build rapport before diving into solutions.
</instructions>

<keys>
"text" should be the text of the next message for {{agentName}} which they will send to the conversation.
</keys>

<output>
Respond using XML format like this:
<response>
    Your response text here
</response>

Your response must ONLY include the <response></response> XML block.
</output>`;

/**
 * Multi-step decision template - used for each iteration in multi-step workflow
 */
export const multiStepDecisionTemplate = `<task>
Determine the next step the assistant should take in this conversation to help the user reach their goal.
</task>

{{recentMessages}}

# Multi-Step Workflow

In each step, decide:

1. **Which providers (if any)** should be called to gather necessary data.
2. **Which action (if any)** should be executed after providers return.
3. Decide whether the task is complete. If so, set \`isFinish: true\`. Do not select the \`REPLY\` action; replies are handled separately after task completion.

You can select **multiple providers** and at most **one action** per step.

If the task is fully resolved and no further steps are needed, mark the step as \`isFinish: true\`.

---

{{actionsWithDescriptions}}

{{providersWithDescriptions}}

These are the actions or data provider calls that have already been used in this run. Use this to avoid redundancy and guide your next move.

{{actionResults}}

<keys>
"thought" Clearly explain your reasoning for the selected providers and/or action, and how this step contributes to resolving the user's request.
"action"  Name of the action to execute after providers return (can be empty if no action is needed).
"providers" List of provider names to call in this step (can be empty if none are needed).
"isFinish" Set to true only if the task is fully complete.
</keys>

IMPORTANT: 
- Do **not** mark the task as \`isFinish: true\` immediately after calling an action. Wait for the action to complete before deciding the task is finished.
- If a provider was called but returned NO results or failed, it means that information is NOT AVAILABLE in the system. This is a limitation. Do NOT call the same provider again. Instead, set \`isFinish: true\` and provide the best answer you can with available information.
- Avoid redundant provider calls - if you've already called a provider and it didn't have the information, calling it again won't help.

<output>
<response>
  <thought>Your thought here</thought>
  <action>ACTION</action>
  <providers>PROVIDER1,PROVIDER2</providers>
  <isFinish>true | false</isFinish>
</response>
</output>`;

/**
 * Multi-step summary template - used to generate final user-facing response
 */
export const multiStepSummaryTemplate = `<task>
Summarize what the assistant has done so far and provide a final response to the user based on the completed steps.
</task>

# Context Information
{{bio}}

---

{{system}}

---

{{messageDirections}}

# Conversation Summary
Below is the user's original request and conversation so far:
{{recentMessages}}

# Execution Trace
Here are the actions taken by the assistant to fulfill the request:
{{actionResults}}

# Assistant's Last Reasoning Step
{{recentMessage}}

# Instructions

 - Review the execution trace and last reasoning step carefully

 - Your final output MUST be in this XML format:
<output>
<response>
  <thought>Your thought here</thought>
  <text>Your final message to the user</text>
</response>
</output>
`;

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
    console.error("[setLatestResponseId] Invalid responseId:", responseId);
    throw new Error(`Invalid responseId: ${responseId}`);
  }
  const key = `response_id:${runtime.agentId}:${roomId}`;
  console.log("[setLatestResponseId] Setting cache:", {
    key,
    responseId: responseId.substring(0, 8),
  });
  try {
    await runtime.setCache(key, responseId);
  } catch (error) {
    console.error("[setLatestResponseId] Error setting cache:", error);
    throw error;
  }
}

async function clearLatestResponseId(
  runtime: IAgentRuntime,
  roomId: string,
): Promise<void> {
  const key = `response_id:${runtime.agentId}:${roomId}`;
  console.log("[clearLatestResponseId] Deleting cache key:", key);
  await runtime.deleteCache(key);
}

/**
 * Estimate token count from text (rough approximation: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Multi-step workflow: iterative action execution with final summary
 */
async function runMultiStepWorkflow(
  runtime: IAgentRuntime,
  message: Memory,
  callback:
    | ((result: {
        text?: string;
        usage?: { inputTokens: number; outputTokens: number; model: string };
      }) => Promise<Memory[]>)
    | undefined,
  opts: Required<MessageProcessingOptions>,
): Promise<{
  responseContent: string;
  totalInputTokens: number;
  totalOutputTokens: number;
}> {
  const traceActionResult: MultiStepActionResult[] = [];
  const executedProviders = new Set<string>(); // Track which providers were used
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let iterationCount = 0;

  logger.info(`[MultiStep] Starting multi-step workflow (max ${opts.maxMultiStepIterations} iterations)`);

  while (iterationCount < opts.maxMultiStepIterations) {
    iterationCount++;
    logger.debug(`[MultiStep] Starting iteration ${iterationCount}/${opts.maxMultiStepIterations}`);

    // Compose state with action results from previous iterations
    const accumulatedState = (await runtime.composeState(message, [
      "RECENT_MESSAGES",
      "ACTIONS",
    ])) as MultiStepState;

    // Add action results to state
    if (!accumulatedState.data) {
      accumulatedState.data = { actionResults: [] };
    }
    accumulatedState.data.actionResults = traceActionResult;

    // Format action results for the prompt
    const actionResultsText =
      traceActionResult.length > 0
        ? traceActionResult
            .map(
              (r) =>
                `- ${r.data.actionName}: ${r.success ? "✓ " + (r.text || "Success") : "✗ " + (r.error || "Failed")}`,
            )
            .join("\n")
        : "No actions executed yet";

    // Format actions with descriptions
    const actionsWithDescriptions = (runtime.actions || [])
      .map((a: { name: string; description?: string }) => 
        `- ${a.name}${a.description ? `: ${a.description}` : ""}`
      )
      .join("\n");

    // Format providers with descriptions
    const providersWithDescriptions = (runtime.providers || [])
      .map((p: { name: string; description?: string }) => 
        `- ${p.name}${p.description ? `: ${p.description}` : ""}`
      )
      .join("\n");

    // Prepare state for template
    const stateForTemplate = {
      ...accumulatedState,
      values: {
        ...accumulatedState.values,
        actionResults: actionResultsText,
        actionsWithDescriptions: actionsWithDescriptions || "No actions available",
        providersWithDescriptions: providersWithDescriptions || "No providers available",
      },
    };

    const prompt = composePromptFromState({
      state: stateForTemplate,
      template:
        runtime.character.templates?.multiStepDecisionTemplate ||
        multiStepDecisionTemplate,
    });

    logger.debug(`[MultiStep] Iteration ${iterationCount} prompt length: ${prompt.length} chars`);
    totalInputTokens += estimateTokens(prompt);

    const stepResultRaw = await runtime.useModel(ModelType.TEXT_LARGE, {
      prompt,
    });
    totalOutputTokens += estimateTokens(stepResultRaw);

    logger.debug(`[MultiStep] Raw LLM response:\n${stepResultRaw}`);

    const parsedStep = parseKeyValueXml(stepResultRaw);

    if (!parsedStep) {
      logger.warn(`[MultiStep] Failed to parse step result at iteration ${iterationCount}`);
      traceActionResult.push({
        data: { actionName: "parse_error" },
        success: false,
        error: "Failed to parse step result",
      });
      break;
    }

    const { thought, providers = [], action, isFinish } = parsedStep;
    logger.debug(
      `[MultiStep] Step decision: thought="${thought}", providers=${JSON.stringify(providers)}, action=${action}, isFinish=${isFinish}`,
    );

    // Notify user of progress
    if (callback && thought) {
      await callback({
        text: thought,
      });
    }

    // Check for completion condition
    if (isFinish === "true" || isFinish === true) {
      logger.info(`[MultiStep] Task marked as complete at iteration ${iterationCount}`);
      break;
    }

    // Validate that we have something to do
    if ((!providers || providers.length === 0) && !action) {
      logger.warn(
        `[MultiStep] No providers or action specified at iteration ${iterationCount}, forcing completion`,
      );
      break;
    }

    try {
      // Execute providers if specified
      if (providers && providers.length > 0) {
        const providerList = Array.isArray(providers)
          ? providers
          : String(providers).split(",").map((s) => s.trim());

        for (const providerName of providerList) {
          const provider = runtime.providers.find((p: { name: string }) => p.name === providerName);
          if (!provider) {
            logger.warn(`[MultiStep] Provider not found: ${providerName}`);
            traceActionResult.push({
              data: { actionName: providerName },
              success: false,
              error: `Provider not found: ${providerName}`,
            });
            continue;
          }

          logger.debug(`[MultiStep] Executing provider: ${providerName}`);
          const providerResult = await (provider as { get: (runtime: IAgentRuntime, message: Memory, state: State) => Promise<{ text?: string }> }).get(runtime, message, accumulatedState);
          
          if (!providerResult) {
            logger.warn(`[MultiStep] Provider returned no result: ${providerName}`);
            traceActionResult.push({
              data: { actionName: providerName },
              success: false,
              error: "Provider returned no result",
            });
            continue;
          }

          const success = !!providerResult.text;

          // Track successful provider executions
          if (success) {
            executedProviders.add(providerName);
          }

          traceActionResult.push({
            data: { actionName: providerName },
            success,
            text: success ? providerResult.text : undefined,
            error: success ? undefined : "Provider returned no result",
          });

          if (callback) {
            await callback({
              text: `Searched ${providerName}`,
            });
          }

          logger.debug(`[MultiStep] Provider ${providerName} result: ${success ? "success" : "failed"}`);
        }
      }

      // Execute action if specified
      if (action) {
        logger.debug(`[MultiStep] Executing action: ${action}`);
        
        const actionContent: Content = {
          text: `Executing action: ${action}`,
          actions: [action],
          thought: thought ?? "",
        };

        await runtime.processActions(
          message,
          [
            {
              id: v4() as UUID,
              entityId: runtime.agentId,
              roomId: message.roomId,
              createdAt: Date.now(),
              content: actionContent,
            },
          ],
          accumulatedState,
          async () => {
            return [];
          },
        );

        // Get cached action results from runtime
        const cachedState = runtime.stateCache?.get(`${message.id}_action_results`);
        const actionResults = cachedState?.values?.actionResults || [];
        const result = actionResults.length > 0 ? actionResults[0] : null;
        const success = result?.success ?? false;

        traceActionResult.push({
          data: { actionName: action },
          success,
          text: result?.text,
          values: result?.values,
          error: success ? undefined : result?.text,
        });

        if (callback) {
          await callback({
            text: `Executed ${action}`,
          });
        }

        logger.debug(`[MultiStep] Action ${action} result: ${success ? "success" : "failed"}`);
      }
    } catch (err) {
      logger.error({ err }, "[MultiStep] Error executing step");
      traceActionResult.push({
        data: { actionName: action || "unknown" },
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (iterationCount >= opts.maxMultiStepIterations) {
    logger.warn(
      `[MultiStep] Reached maximum iterations (${opts.maxMultiStepIterations}), forcing completion`,
    );
  }

  logger.info(`[MultiStep] Workflow complete after ${iterationCount} iterations. Generating summary...`);

  // Generate final summary with dynamic providers
  // Always include SHORT_TERM_MEMORY, LONG_TERM_MEMORY, RECENT_MESSAGES, and ACTION_STATE
  // Plus any providers that were executed during the workflow
  const providersForSummary = [
    "SHORT_TERM_MEMORY",
    "LONG_TERM_MEMORY",
    // "ACTION_STATE", TODO: Add action state when needed.
    ...Array.from(executedProviders),
  ];

  logger.debug(`[MultiStep] Composing final state with providers: ${providersForSummary.join(", ")}`);

  const finalState = await runtime.composeState(message, providersForSummary);

  // Add action results to final state for summary
  const actionResultsText =
    traceActionResult.length > 0
      ? traceActionResult
          .map(
            (r) =>
              `- ${r.data.actionName}: ${r.success ? (r.text || "Success") : (r.error || "Failed")}`,
          )
          .join("\n")
      : "No actions were needed";

  const stateForSummary = {
    ...finalState,
    values: {
      ...finalState.values,
      actionResults: actionResultsText,
    },
  };

  const summaryPrompt = composePromptFromState({
    state: stateForSummary,
    template:
      runtime.character.templates?.multiStepSummaryTemplate ||
      multiStepSummaryTemplate,
  });

  totalInputTokens += estimateTokens(summaryPrompt);

  const finalOutput = await runtime.useModel(ModelType.TEXT_LARGE, {
    prompt: summaryPrompt,
  });
  totalOutputTokens += estimateTokens(finalOutput);

  logger.debug(`[MultiStep] Summary response:\n${finalOutput}`);

  const summary = parseKeyValueXml(finalOutput);

  let responseContent = "";
  if (summary?.text) {
    responseContent = summary.text;
    logger.info(`[MultiStep] Generated final response: ${responseContent.substring(0, 100)}...`);
  } else {
    logger.warn("[MultiStep] Failed to parse summary, using fallback");
    responseContent = "I've completed the task, but encountered an issue generating the summary.";
  }

  return {
    responseContent,
    totalInputTokens,
    totalOutputTokens,
  };
}

/**
 * Handles incoming messages using the full ElizaOS pipeline
 */
const messageReceivedHandler = async ({
  runtime,
  message,
  callback,
}: MessageReceivedHandlerParams): Promise<void> => {
  // Configuration options - can be overridden via character settings
  const useMultiStep = 
    runtime.character.settings?.USE_MULTI_STEP === true ||
    runtime.character.settings?.USE_MULTI_STEP === "true";
  
  const opts: Required<MessageProcessingOptions> = {
    useMultiStep,
    maxMultiStepIterations: 
      (runtime.character.settings?.MAX_MULTISTEP_ITERATIONS as number) || 6,
    maxRetries: 3,
  };

  logger.info(
    `[ElizaAssistant] Processing mode: ${useMultiStep ? "MULTI-STEP" : "SINGLE-SHOT"}`,
  );

  // Generate a new response ID
  const responseId = v4();
  console.log(
    "[ElizaAssistant] Generated response ID:",
    responseId.substring(0, 8),
  );

  // Set this as the latest response ID for this room
  await setLatestResponseId(runtime, message.roomId, responseId);

  // Generate a unique run ID for tracking
  const runId = asUUID(v4());
  const startTime = Date.now();

  // Track usage for this message - we'll estimate based on text length
  const messageKey = message.id || v4();
  const modelUsed = "gpt-4o"; // Default model used by ElizaOS

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
    await runtime.createMemory(message, "messages");

    let responseContent: string = "";
    let estimatedInputTokens = 0;
    let estimatedOutputTokens = 0;

    // Choose processing mode
    if (opts.useMultiStep) {
      // Multi-step workflow
      logger.info("[ElizaAssistant] Using multi-step workflow");
      
      const multiStepResult = await runMultiStepWorkflow(
        runtime,
        message,
        callback,
        opts,
      );

      responseContent = multiStepResult.responseContent;
      estimatedInputTokens = multiStepResult.totalInputTokens;
      estimatedOutputTokens = multiStepResult.totalOutputTokens;
    } else {
      // Single-shot mode (original behavior)
      logger.info("[ElizaAssistant] Using single-shot mode");

      // Compose state using providers
      const state = await runtime.composeState(message, [
        "SHORT_TERM_MEMORY",
        "LONG_TERM_MEMORY",
      ]);

      const prompt = composePromptFromState({
        state,
        template:
          runtime.character.templates?.messageHandlerTemplate ||
          messageHandlerTemplate,
      });

      console.log("*** PROMPT ***\n", prompt);

      // Estimate input tokens from prompt
      estimatedInputTokens = estimateTokens(prompt);

      // Retry if missing required fields
      let retries = 0;

      while (retries < opts.maxRetries && !responseContent) {
        const response = await runtime.useModel(ModelType.TEXT_LARGE, {
          prompt,
        });

        logger.debug(`*** Raw LLM Response ***\n${response}`);

        // Attempt to parse the XML response
        const extractedContent = extractResponseText(response);

        if (!extractedContent) {
          logger.warn("*** Missing response content, retrying... ***");
          responseContent = "";
        } else {
          responseContent = extractedContent;
          break;
        }
        retries++;
      }

      // Estimate output tokens from response
      estimatedOutputTokens = estimateTokens(responseContent);
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

    // Create response memory
    const responseMemory: Memory = {
      id: createUniqueUuid(runtime, (message.id ?? v4()) as UUID),
      entityId: runtime.agentId,
      roomId: message.roomId,
      worldId: message.worldId,
      content: {
        text: responseContent,
        source: "agent",
        inReplyTo: message.id,
      },
    };

    // Save response and trigger callback
    await runtime.createMemory(responseMemory, "messages");

    // Store usage in map for retrieval by API endpoint
    messageUsageMap.set(messageKey, {
      inputTokens: estimatedInputTokens,
      outputTokens: estimatedOutputTokens,
      model: modelUsed,
    });

    // Trigger callback if provided (returns empty array as we already saved the message)
    if (callback) {
      await callback({
        text: responseContent,
        usage: {
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
          model: modelUsed,
        },
      });
    }

    const responseMessages: Memory[] = [];
    responseMessages.push(responseMemory);

    // Compose state for evaluators
    const evalState = await runtime.composeState(message, [
      "SHORT_TERM_MEMORY",
      "LONG_TERM_MEMORY",
    ]);

    // Run evaluators
    await runtime.evaluate(
      message,
      evalState,
      true,
      async (content) => {
        if (callback) {
          return callback(content);
        }
        return [];
      },
      responseMessages
    );

    // Emit run ended event
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
  providers: [],
  actions: [],
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
