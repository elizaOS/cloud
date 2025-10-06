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
} from "@elizaos/core";
import { v4 } from "uuid";
import { recentMessagesProvider } from "./providers/recentMessages";

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
Respond to the user's message and answer their question thoroughly and helpfully.
Be concise, clear, and friendly.
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
 * Handles incoming messages using the full ElizaOS pipeline
 */
const messageReceivedHandler = async ({
  runtime,
  message,
  callback,
}: MessageReceivedHandlerParams): Promise<void> => {
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

    // Compose state using providers (this is the key difference from manual approach!)
    const state = await runtime.composeState(message, ["RECENT_MESSAGES"]);

    const prompt = composePromptFromState({
      state,
      template:
        runtime.character.templates?.messageHandlerTemplate ||
        messageHandlerTemplate,
    });

    console.log("*** PROMPT ***\n", prompt);

    // Estimate input tokens from prompt
    const estimatedInputTokens = estimateTokens(prompt);

    let responseContent: string = "";

    // Retry if missing required fields
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries && !responseContent) {
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
    const estimatedOutputTokens = estimateTokens(responseContent);

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
  providers: [recentMessagesProvider],
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
