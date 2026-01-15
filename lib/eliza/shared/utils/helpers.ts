/**
 * Common helper functions for workflow handlers.
 */

import {
  logger,
  type IAgentRuntime,
  type Memory,
  type State,
  type HandlerCallback,
  ModelType,
  parseKeyValueXml,
  createUniqueUuid,
  type UUID,
} from "@elizaos/core";
import { v4 } from "uuid";
import type { ParsedResponse, ParsedPlan } from "./parsers";
import { filterModelParams } from "./model-utils";

/**
 * Default Eliza agent ID - used to detect creator mode
 */
export const DEFAULT_ELIZA_ID = "b850bc30-45f8-0041-a00a-83df46d8555d";

/**
 * Check if runtime is in creator mode (chatting with default Eliza to create new character)
 * vs build mode (editing existing character)
 */
export function isCreatorMode(runtime: IAgentRuntime): boolean {
  const characterId = runtime.character.id;
  return !characterId || characterId === DEFAULT_ELIZA_ID;
}

export const MAX_RESPONSE_RETRIES = 3;

/**
 * Timeout for evaluator execution (60 seconds).
 * Increased from 30s to accommodate HTTP-based Neon driver latency
 * when evaluators make multiple sequential database calls.
 */
export const EVALUATOR_TIMEOUT_MS = 60000;

/**
 * Timeout for AI model requests (30 seconds).
 * Prevents hanging requests that cause AI_NoOutputGeneratedError.
 */
export const AI_MODEL_TIMEOUT_MS = 30000;

/**
 * Maximum buffer size for streaming XML filter (100KB).
 * Prevents memory exhaustion from unbounded buffer growth
 * when XML tags span multiple streaming chunks.
 */
const MAX_STREAM_BUFFER_SIZE = 100000;

/**
 * Wraps a promise with a timeout.
 * Throws an error if the promise doesn't resolve within the specified time.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string,
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

// =============================================================================
// Response Post-Processing Utilities
// =============================================================================

/**
 * Patterns that indicate AI-speak that should be avoided
 */
const AI_SPEAK_PATTERNS = [
  /\bAs an AI\b/gi,
  /\bI'm an AI\b/gi,
  /\bI am an AI\b/gi,
  /\bAs a language model\b/gi,
  /\bAs an artificial intelligence\b/gi,
  /\bI don't have feelings\b/gi,
  /\bI cannot feel\b/gi,
  /\bI'm just a program\b/gi,
  /\bI'm programmed to\b/gi,
  /\bMy programming\b/gi,
  /\bI was trained\b/gi,
  /\bMy training data\b/gi,
];

/**
 * Repetitive greeting patterns to detect
 */
const REPETITIVE_GREETINGS = [
  /^Hey!?\s*$/i,
  /^Hello!?\s*$/i,
  /^Hi!?\s*$/i,
  /^Hi there!?\s*$/i,
  /^Hey there!?\s*$/i,
  /^Hello there!?\s*$/i,
  /^Greetings!?\s*$/i,
];

/**
 * Check if response contains AI-speak patterns
 */
export function containsAISpeak(text: string): boolean {
  return AI_SPEAK_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Remove AI-speak patterns from response
 * Returns cleaned text
 */
export function removeAISpeak(text: string): string {
  let cleaned = text;

  // Remove sentences containing AI-speak
  AI_SPEAK_PATTERNS.forEach((pattern) => {
    // Find and remove sentences containing the pattern
    const sentencePattern = new RegExp(
      `[^.!?]*${pattern.source}[^.!?]*[.!?]?\\s*`,
      pattern.flags,
    );
    cleaned = cleaned.replace(sentencePattern, "");
  });

  return cleaned.trim();
}

/**
 * Check if the opening is a repetitive/generic greeting
 */
export function isRepetitiveGreeting(text: string): boolean {
  const firstLine = text.split("\n")[0].trim();
  const firstSentence = text.split(/[.!?]/)[0].trim();

  return REPETITIVE_GREETINGS.some(
    (pattern) => pattern.test(firstLine) || pattern.test(firstSentence),
  );
}

/**
 * Simple LRU cache implementation.
 * When a key is accessed, it's moved to the end (most recently used).
 * When capacity is exceeded, the oldest (least recently used) entry is evicted.
 */
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // Delete first to ensure it goes to end
    this.cache.delete(key);
    this.cache.set(key, value);

    // Evict oldest (first entry) if over capacity
    if (this.cache.size > this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  get size(): number {
    return this.cache.size;
  }
}

const recentOpenings = new LRUCache<string, string[]>(1000);
const MAX_TRACKED_OPENINGS = 5;

function getResponseOpening(text: string): string {
  const firstSentence = text.split(/[.!?]/)[0].trim();
  return firstSentence.substring(0, 50).toLowerCase();
}

export function isRepeatedOpening(roomId: string, text: string): boolean {
  const opening = getResponseOpening(text);
  const recent = recentOpenings.get(roomId) || [];
  return recent.includes(opening);
}

export function trackOpening(roomId: string, text: string): void {
  const opening = getResponseOpening(text);
  const recent = recentOpenings.get(roomId) || [];

  recent.push(opening);
  if (recent.length > MAX_TRACKED_OPENINGS) recent.shift();
  recentOpenings.set(roomId, recent);
}

export interface ProcessedResponse {
  text: string;
  wasModified: boolean;
  hadAISpeak: boolean;
  isRepetitive: boolean;
  warnings: string[];
}

export function postProcessResponse(
  text: string,
  roomId?: string,
): ProcessedResponse {
  const warnings: string[] = [];
  let processed = text;
  let wasModified = false;

  // Check for AI-speak
  const hadAISpeak = containsAISpeak(text);
  if (hadAISpeak) {
    processed = removeAISpeak(processed);
    wasModified = true;
    warnings.push("Removed AI-speak patterns");
    logger.warn("[Response Post-Process] Removed AI-speak from response");
  }

  // Check for repetitive greeting
  const isRepetitive =
    isRepetitiveGreeting(processed) ||
    (roomId ? isRepeatedOpening(roomId, processed) : false);

  if (isRepetitive) {
    warnings.push("Response starts with repetitive greeting");
    logger.warn("[Response Post-Process] Detected repetitive opening");
  }

  // Track this opening if room provided
  if (roomId && processed.trim()) {
    trackOpening(roomId, processed);
  }

  return {
    text: processed,
    wasModified,
    hadAISpeak,
    isRepetitive,
    warnings,
  };
}

/**
 * Cached attachment from action results.
 */
export interface CachedAttachment {
  url?: string;
  id?: string;
  title?: string;
  contentType?: string;
}

const actionAttachmentCache = new LRUCache<string, CachedAttachment[]>(500);
const actionResponseSentCache = new LRUCache<string, boolean>(500);

export function hasActionSentResponse(roomId: string): boolean {
  return actionResponseSentCache.get(roomId) === true;
}

export function clearActionResponseFlag(roomId: string): void {
  actionResponseSentCache.delete(roomId);
}

function isBase64DataUrl(url: string): boolean {
  return url.startsWith("data:");
}

export function getAndClearCachedAttachments(
  roomId: string,
): CachedAttachment[] {
  const attachments = actionAttachmentCache.get(roomId) || [];
  actionAttachmentCache.delete(roomId);
  return attachments;
}

export function cleanPrompt(prompt: string): string {
  return prompt
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

interface Attachment {
  url?: string;
  id?: string;
  title?: string;
  contentType?: string;
  [key: string]: unknown;
}

interface ActionResult {
  data?: { attachments?: Attachment[] };
}

export function extractAttachments(
  actionResults: ActionResult[],
): Attachment[] {
  return actionResults
    .flatMap((result) => result.data?.attachments ?? [])
    .filter((att): att is Attachment => {
      if (!att?.url) return false;
      if (isBase64DataUrl(att.url)) return false;
      if (
        att.url.startsWith("[") ||
        att.url === "" ||
        !att.url.startsWith("http")
      )
        return false;
      return true;
    });
}

export async function executeProviders(
  runtime: IAgentRuntime,
  message: Memory,
  plannedProviders: string[],
  currentState: State,
): Promise<State> {
  if (plannedProviders.length === 0) return currentState;

  const providerState = await runtime.composeState(message, [
    ...plannedProviders,
    "CHARACTER",
  ]);
  return { ...currentState, ...providerState };
}

export async function executeActions(
  runtime: IAgentRuntime,
  message: Memory,
  plannedActions: string[],
  plan: ParsedPlan | null,
  currentState: State,
  callback?: HandlerCallback,
  onStreamChunk?: (chunk: string, messageId?: UUID) => Promise<void>,
): Promise<State> {
  if (plannedActions.length === 0) return currentState;

  const actionResponse: Memory = {
    id: createUniqueUuid(runtime, v4() as UUID),
    entityId: runtime.agentId,
    agentId: runtime.agentId,
    roomId: message.roomId,
    worldId: message.worldId,
    content: {
      text: plan?.thought || "Executing actions",
      actions: plannedActions,
      source: "agent",
    },
  };

  actionAttachmentCache.set(message.roomId as string, []);
  actionResponseSentCache.set(message.roomId as string, false);

  const wrappedCallback: HandlerCallback = async (content) => {
    if (content.text?.trim()) {
      actionResponseSentCache.set(message.roomId as string, true);
    }

    if (content.attachments?.length) {
      const existing =
        actionAttachmentCache.get(message.roomId as string) || [];
      for (const att of content.attachments) {
        const a = att as Attachment;
        if (a.url?.startsWith("http")) {
          existing.push({
            id: a.id,
            url: a.url,
            title: a.title,
            contentType: a.contentType,
          });
        }
      }
      actionAttachmentCache.set(message.roomId as string, existing);
    }

    return callback ? callback(content) : [];
  };

  // Pass onStreamChunk to processActions so each action can manage its own streaming context
  await runtime.processActions(
    message,
    [actionResponse],
    currentState,
    wrappedCallback,
    onStreamChunk ? { onStreamChunk } : undefined,
  );
  const actionState = await runtime.composeState(message, [
    "CURRENT_RUN_CONTEXT",
  ]);
  return { ...currentState, ...actionState };
}

/**
 * Options for generateResponseWithRetry
 */
interface GenerateResponseOptions {
  /** Callback for streaming text chunks in real-time */
  onStreamChunk?: (chunk: string, messageId?: UUID) => Promise<void>;
  /** Callback for streaming thought/reasoning chunks from response */
  onReasoningChunk?: (
    chunk: string,
    phase: "planning" | "actions" | "response",
    messageId?: UUID,
  ) => Promise<void>;
  /** Message ID for streaming coordination */
  messageId?: UUID;
}

/**
 * Options for streaming planning generation
 */
interface StreamingPlanOptions {
  /** Callback for streaming reasoning/thought chunks in real-time */
  onReasoningChunk?: (
    chunk: string,
    phase: "planning" | "actions" | "response",
    messageId?: UUID,
  ) => Promise<void>;
  /** Message ID for streaming coordination */
  messageId?: UUID;
}

function createPlanningStreamFilter(
  onThoughtChunk: (
    chunk: string,
    phase: "planning" | "actions" | "response",
    messageId?: UUID,
  ) => Promise<void>,
  phase: "planning" | "actions" | "response",
  messageId?: UUID,
) {
  let insideThought = false;
  let buffer = "";

  return {
    processChunk: async (chunk: string) => {
      buffer += chunk;

      while (buffer.length > 0) {
        if (!insideThought) {
          const tagStart = buffer.indexOf("<thought>");
          if (tagStart === -1) {
            if (buffer.length > 8) buffer = buffer.slice(-8);
            break;
          }
          buffer = buffer.slice(tagStart + 9);
          insideThought = true;
        }

        if (insideThought) {
          const tagEnd = buffer.indexOf("</thought>");
          if (tagEnd === -1) {
            if (buffer.length > 10) {
              await onThoughtChunk(buffer.slice(0, -10), phase, messageId);
              buffer = buffer.slice(-10);
            }
            break;
          }
          const content = buffer.slice(0, tagEnd);
          if (content) await onThoughtChunk(content, phase, messageId);
          buffer = buffer.slice(tagEnd + 10);
          insideThought = false;
        }
      }
    },
    flush: async () => {
      if (insideThought && buffer) {
        await onThoughtChunk(buffer, phase, messageId);
        buffer = "";
      }
    },
  };
}

export async function generatePlanningWithStreaming(
  runtime: IAgentRuntime,
  prompt: string,
  options?: StreamingPlanOptions,
): Promise<string> {
  const { onReasoningChunk, messageId } = options || {};
  let streamFilter: ReturnType<typeof createPlanningStreamFilter> | null = null;

  if (onReasoningChunk) {
    streamFilter = createPlanningStreamFilter(
      onReasoningChunk,
      "planning",
      messageId,
    );
  }

  const response = await withTimeout(
    runtime.useModel(ModelType.TEXT_LARGE, {
      prompt,
      ...(onReasoningChunk &&
        streamFilter && {
          stream: true,
          onStreamChunk: async (chunk: string) => {
            await streamFilter!.processChunk(chunk);
          },
        }),
    }),
    AI_MODEL_TIMEOUT_MS,
    "AI model request timed out after 30 seconds (planning)",
  );

  if (streamFilter) {
    await streamFilter.flush();
  }

  return typeof response === "string" ? response : JSON.stringify(response);
}

/**
 * Creates a streaming XML filter that extracts content from <text> and <thought> tags.
 * Each tag has its own independent state machine to handle interleaved content.
 */
function createStreamingXmlFilter(
  onFilteredChunk: (chunk: string, messageId?: UUID) => Promise<void>,
  messageId?: UUID,
  onThoughtChunk?: (
    chunk: string,
    phase: "planning" | "actions" | "response",
    messageId?: UUID,
  ) => Promise<void>,
) {
  // Separate state machines for each tag type to prevent interference
  const textState = { buffer: "", inside: false };
  const thoughtState = { buffer: "", inside: false };

  /**
   * Process a single tag type from a buffer.
   * Returns remaining unprocessed content.
   */
  const processTag = async (
    input: string,
    startTag: string,
    endTag: string,
    onContent: (content: string) => Promise<void>,
    state: { buffer: string; inside: boolean },
  ): Promise<string> => {
    state.buffer += input;

    // CRITICAL: Prevent unbounded buffer growth (Fix 9 - Memory Management)
    // If buffer exceeds limit, flush it to prevent OOM crashes
    if (state.buffer.length > MAX_STREAM_BUFFER_SIZE) {
      logger.warn(
        `[StreamFilter] Buffer exceeded ${MAX_STREAM_BUFFER_SIZE} bytes, flushing to prevent OOM`,
      );
      if (state.inside && state.buffer) {
        await onContent(state.buffer);
      }
      state.buffer = "";
      state.inside = false;
      return "";
    }

    while (state.buffer.length > 0) {
      if (!state.inside) {
        const tagStart = state.buffer.indexOf(startTag);
        if (tagStart === -1) {
          // Keep minimum buffer for partial tag detection
          if (state.buffer.length > startTag.length) {
            state.buffer = state.buffer.slice(-(startTag.length - 1));
          }
          break;
        }
        // Found start tag, enter content mode
        state.buffer = state.buffer.slice(tagStart + startTag.length);
        state.inside = true;
      }

      if (state.inside) {
        const tagEnd = state.buffer.indexOf(endTag);
        if (tagEnd === -1) {
          // No end tag yet - stream what we can safely emit
          if (state.buffer.length > endTag.length) {
            const safeContent = state.buffer.slice(0, -(endTag.length - 1));
            if (safeContent) await onContent(safeContent);
            state.buffer = state.buffer.slice(-(endTag.length - 1));
          }
          break;
        }
        // Found end tag - emit content and exit content mode
        const content = state.buffer.slice(0, tagEnd);
        if (content) await onContent(content);
        state.buffer = state.buffer.slice(tagEnd + endTag.length);
        state.inside = false;
      }
    }

    return state.buffer;
  };

  return {
    processChunk: async (chunk: string) => {
      // Process text tag with its own state
      await processTag(
        chunk,
        "<text>",
        "</text>",
        async (content) => onFilteredChunk(content, messageId),
        textState,
      );

      // Process thought tag with its own state (if callback provided)
      if (onThoughtChunk) {
        await processTag(
          chunk,
          "<thought>",
          "</thought>",
          async (content) => onThoughtChunk(content, "response", messageId),
          thoughtState,
        );
      }
    },
    flush: async () => {
      // Emit any remaining buffered content
      if (textState.inside && textState.buffer) {
        await onFilteredChunk(textState.buffer, messageId);
        textState.buffer = "";
      }
      if (thoughtState.inside && thoughtState.buffer && onThoughtChunk) {
        await onThoughtChunk(thoughtState.buffer, "response", messageId);
        thoughtState.buffer = "";
      }
    },
  };
}

/**
 * Generate a response with retry logic and optional real-time streaming.
 *
 * When onStreamChunk is provided, the response is streamed in real-time
 * as it's generated by the model. The XML structure is parsed incrementally
 * so only the actual response text (inside <text>...</text>) is streamed to
 * the user - no XML tags appear in the stream.
 */
export async function generateResponseWithRetry(
  runtime: IAgentRuntime,
  prompt: string,
  options?: GenerateResponseOptions,
): Promise<{ text: string; thought: string }> {
  let lastRawResponse = "";
  let lastError: Error | null = null;
  const { onStreamChunk, onReasoningChunk, messageId } = options || {};

  // Fix 6: Get model name for parameter filtering (reasoning models don't support temperature, etc.)
  const rawModel = runtime.character?.settings?.model;
  const modelName: string =
    (typeof rawModel === "string" ? rawModel : null) ||
    process.env.ELIZAOS_CLOUD_LARGE_MODEL ||
    "claude-3-5-sonnet";

  for (let i = 0; i < MAX_RESPONSE_RETRIES; i++) {
    try {
      // When streaming callback is provided, enable streaming mode with XML filtering
      // The filter extracts content from <text>...</text> AND <thought>...</thought> tags
      // Text goes to main response, thought goes to reasoning display
      let streamFilter: ReturnType<typeof createStreamingXmlFilter> | null =
        null;

      // Fix 8: Track streamed content separately to avoid false retry on empty response variable
      let streamedTextContent = "";
      let streamedThoughtContent = "";

      if (onStreamChunk) {
        streamFilter = createStreamingXmlFilter(
          async (chunk: string, msgId?: UUID) => {
            streamedTextContent += chunk; // Track what we've streamed
            await onStreamChunk(chunk, msgId);
          },
          messageId,
          onReasoningChunk
            ? async (
                chunk: string,
                phase: "planning" | "actions" | "response",
                msgId?: UUID,
              ) => {
                if (phase === "response") {
                  streamedThoughtContent += chunk;
                }
                await onReasoningChunk(chunk, phase, msgId);
              }
            : undefined,
        );
      }

      // Fix 6: Filter out unsupported params for reasoning models (o1, o3, deepseek-r1)
      const modelParams = filterModelParams(
        {
          prompt,
          ...(onStreamChunk &&
            streamFilter && {
              stream: true,
              onStreamChunk: async (chunk: string) => {
                await streamFilter!.processChunk(chunk);
              },
            }),
        },
        modelName,
      );

      const response = await withTimeout(
        runtime.useModel(ModelType.TEXT_LARGE, modelParams),
        AI_MODEL_TIMEOUT_MS,
        "AI model request timed out after 30 seconds",
      );

      // Flush any remaining buffered content
      if (streamFilter) {
        await streamFilter.flush();
      }

      // Fix 8: If we successfully streamed content, return it instead of checking response variable
      // This prevents false "empty response" retries when streaming worked but response var is empty
      if (streamedTextContent.length > 0) {
        logger.info(
          `[generateResponseWithRetry] Returning streamed content (${streamedTextContent.length} chars)`,
        );
        return { text: streamedTextContent, thought: streamedThoughtContent };
      }

      if (
        !response ||
        (typeof response === "string" && response.trim() === "")
      ) {
        logger.warn(
          `[generateResponseWithRetry] Attempt ${i + 1}: Empty response from model`,
        );
        continue;
      }

      lastRawResponse =
        typeof response === "string" ? response : JSON.stringify(response);
      const parsed = parseKeyValueXml(response) as ParsedResponse | null;

      if (parsed?.text) {
        return { text: parsed.text, thought: parsed.thought || "" };
      }

      logger.warn(
        `[generateResponseWithRetry] Attempt ${i + 1}: Failed to parse XML, raw: "${lastRawResponse.substring(0, 100)}..."`,
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.error(
        `[generateResponseWithRetry] Attempt ${i + 1} failed:`,
        lastError.message,
      );
    }
  }

  // Fix 13: Improved XML fallback with regex extraction and lower thresholds
  if (lastRawResponse && lastRawResponse.length > 0) {
    // Try regex extraction for <text> tag even if full XML parse failed
    const textMatch = lastRawResponse.match(/<text>([\s\S]*?)<\/text>/i);
    if (textMatch?.[1]?.trim()) {
      logger.info(
        `[generateResponseWithRetry] Extracted text via regex fallback (${textMatch[1].trim().length} chars)`,
      );
      return { text: textMatch[1].trim(), thought: "" };
    }

    // Strip XML tags and use raw content with lower threshold
    const cleanedResponse = lastRawResponse
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // Lowered threshold from 20 to 5 chars - any meaningful response is better than none
    if (cleanedResponse.length > 5) {
      logger.info(
        `[generateResponseWithRetry] Using cleaned response as fallback (${cleanedResponse.length} chars)`,
      );
      return { text: cleanedResponse, thought: "" };
    }
  }

  logger.error(
    `[generateResponseWithRetry] All ${MAX_RESPONSE_RETRIES} attempts failed. ` +
      `Last raw response: "${lastRawResponse?.substring(0, 100) || "empty"}". ` +
      `Last error: ${lastError?.message || "Unknown"}`,
  );
  return { text: "", thought: "" };
}

export async function runEvaluatorsWithTimeout(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  responseMemory: Memory,
  callback: HandlerCallback,
): Promise<void> {
  if (typeof runtime.evaluate !== "function") return;

  await Promise.race([
    runtime.evaluate(
      message,
      { ...state },
      true,
      async (content) => {
        const result = await callback?.(content);
        return result ?? [];
      },
      [responseMemory],
    ),
    new Promise<void>((_, reject) =>
      setTimeout(
        () => reject(new Error("Evaluators timeout")),
        EVALUATOR_TIMEOUT_MS,
      ),
    ),
  ]);
}
