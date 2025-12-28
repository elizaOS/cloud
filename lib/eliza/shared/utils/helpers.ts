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
export const EVALUATOR_TIMEOUT_MS = 30000;

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
 * Track recent response openings to detect repetition
 */
const recentOpenings = new Map<string, string[]>();
const MAX_TRACKED_OPENINGS = 5;

/**
 * Get the opening of a response (first ~50 chars or first sentence)
 */
function getResponseOpening(text: string): string {
  const firstSentence = text.split(/[.!?]/)[0].trim();
  return firstSentence.substring(0, 50).toLowerCase();
}

/**
 * Check if this opening was used recently in this room
 */
export function isRepeatedOpening(roomId: string, text: string): boolean {
  const opening = getResponseOpening(text);
  const recent = recentOpenings.get(roomId) || [];
  return recent.includes(opening);
}

/**
 * Track an opening for a room
 */
export function trackOpening(roomId: string, text: string): void {
  const opening = getResponseOpening(text);
  const recent = recentOpenings.get(roomId) || [];

  // Add new opening and keep only recent ones
  recent.push(opening);
  if (recent.length > MAX_TRACKED_OPENINGS) {
    recent.shift();
  }

  recentOpenings.set(roomId, recent);
}

/**
 * Post-process a response to ensure quality
 * - Removes AI-speak
 * - Flags repetitive openings
 * - Returns processing metadata
 */
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

const actionAttachmentCache = new Map<string, CachedAttachment[]>();
const actionResponseSentCache = new Map<string, boolean>();

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
  onReasoningChunk?: (chunk: string, phase: "planning" | "actions" | "response", messageId?: UUID) => Promise<void>;
  /** Message ID for streaming coordination */
  messageId?: UUID;
}

/**
 * Options for streaming planning generation
 */
interface StreamingPlanOptions {
  /** Callback for streaming reasoning/thought chunks in real-time */
  onReasoningChunk?: (chunk: string, phase: "planning" | "actions" | "response", messageId?: UUID) => Promise<void>;
  /** Message ID for streaming coordination */
  messageId?: UUID;
}

/**
 * Creates a streaming filter for planning responses that extracts <thought> content in real-time.
 * This allows the chain-of-thought to stream as the LLM generates it, rather than waiting
 * for the entire planning response.
 * 
 * The LLM outputs XML like: <plan><thought>reasoning</thought><canRespondNow>YES/NO</canRespondNow>...</plan>
 * We stream the <thought> content as it arrives so users see the reasoning in real-time.
 * 
 * Note: Frontend handles the typewriter animation. Backend just streams chunks immediately.
 */
function createPlanningStreamFilter(
  onThoughtChunk: (chunk: string, phase: "planning" | "actions" | "response", messageId?: UUID) => Promise<void>,
  phase: "planning" | "actions" | "response",
  messageId?: UUID,
) {
  let insideThought = false;
  let insideTag = false;
  let tagBuffer = "";
  let pendingContent = "";
  
  return {
    processChunk: async (chunk: string) => {
      for (const char of chunk) {
        if (char === "<") {
          insideTag = true;
          tagBuffer = "<";
          continue;
        }
        
        if (insideTag) {
          tagBuffer += char;
          
          if (char === ">") {
            insideTag = false;
            const tag = tagBuffer.toLowerCase();
            
            if (tag === "<thought>") {
              insideThought = true;
            } else if (tag === "</thought>") {
              insideThought = false;
              // Flush any pending content
              if (pendingContent) {
                await onThoughtChunk(pendingContent, phase, messageId);
                pendingContent = "";
              }
            }
            tagBuffer = "";
            continue;
          }
          continue;
        }
        
        // We're outside of tags
        if (insideThought) {
          pendingContent += char;
          
          // Stream frequently for smooth display - every few chars or word boundary
          if (pendingContent.length >= 4 || char === " " || char === "\n" || char === "," || char === ".") {
            await onThoughtChunk(pendingContent, phase, messageId);
            pendingContent = "";
          }
        }
      }
    },
    flush: async () => {
      if (pendingContent) {
        await onThoughtChunk(pendingContent, phase, messageId);
        pendingContent = "";
      }
    },
  };
}

/**
 * Generate a planning response with real-time streaming of the <thought> content.
 * This allows chain-of-thought to appear immediately as the LLM generates it,
 * rather than waiting for the entire response.
 * 
 * @returns The complete planning response text (for XML parsing after)
 */
export async function generatePlanningWithStreaming(
  runtime: IAgentRuntime,
  prompt: string,
  options?: StreamingPlanOptions,
): Promise<string> {
  const { onReasoningChunk, messageId } = options || {};
  
  // When streaming callback is provided, stream the thought content in real-time
  let streamFilter: ReturnType<typeof createPlanningStreamFilter> | null = null;
  
  if (onReasoningChunk) {
    streamFilter = createPlanningStreamFilter(onReasoningChunk, "planning", messageId);
  }
  
  const response = await runtime.useModel(ModelType.TEXT_LARGE, {
    prompt,
    ...(onReasoningChunk && streamFilter && {
      stream: true,
      onStreamChunk: async (chunk: string) => {
        await streamFilter!.processChunk(chunk);
      },
    }),
  });
  
  // Flush any remaining buffered content
  if (streamFilter) {
    await streamFilter.flush();
  }
  
  return typeof response === "string" ? response : JSON.stringify(response);
}

/**
 * Creates a streaming filter that strips XML tags and extracts content.
 * Handles partial tags that span multiple chunks.
 * 
 * The LLM outputs XML like: <response><thought>...</thought><text>content</text></response>
 * We want to stream only the content inside <text>...</text> to the user.
 * 
 * Note: Frontend handles the typewriter animation. Backend just streams chunks immediately.
 */
function createStreamingXmlFilter(
  onFilteredChunk: (chunk: string, messageId?: UUID) => Promise<void>,
  messageId?: UUID,
  onThoughtChunk?: (chunk: string, phase: "planning" | "actions" | "response", messageId?: UUID) => Promise<void>,
) {
  // State for incremental XML parsing
  let buffer = "";
  let insideText = false;
  let insideThought = false;
  let insideTag = false;
  let tagBuffer = "";
  let pendingTextContent = "";
  let pendingThoughtContent = "";
  let isFirstTextChunk = true;
  let isFirstThoughtChunk = true;
  
  return {
    processChunk: async (chunk: string) => {
      buffer += chunk;
      
      // Process buffer character by character for streaming
      while (buffer.length > 0) {
        const char = buffer[0];
        buffer = buffer.slice(1);
        
        if (char === "<") {
          insideTag = true;
          tagBuffer = "<";
          continue;
        }
        
        if (insideTag) {
          tagBuffer += char;
          
          if (char === ">") {
            insideTag = false;
            const tag = tagBuffer.toLowerCase();
            
            if (tag === "<text>") {
              insideText = true;
              isFirstTextChunk = true;
            } else if (tag === "</text>") {
              insideText = false;
              if (pendingTextContent) {
                await onFilteredChunk(pendingTextContent, messageId);
                pendingTextContent = "";
              }
            } else if (tag === "<thought>") {
              insideThought = true;
              isFirstThoughtChunk = true;
            } else if (tag === "</thought>") {
              insideThought = false;
              if (pendingThoughtContent && onThoughtChunk) {
                await onThoughtChunk(pendingThoughtContent, "response", messageId);
                pendingThoughtContent = "";
              }
            }
            tagBuffer = "";
            continue;
          }
          continue;
        }
        
        // Stream <text> content for main response
        if (insideText) {
          pendingTextContent += char;
          
          const shouldEmit = isFirstTextChunk || 
            pendingTextContent.length >= 3 || 
            char === " " || char === "\n" || char === "." || 
            char === "," || char === "!" || char === "?";
            
          if (shouldEmit && pendingTextContent.length > 0) {
            await onFilteredChunk(pendingTextContent, messageId);
            pendingTextContent = "";
            isFirstTextChunk = false;
          }
        }
        
        // Stream <thought> content for reasoning display (if callback provided)
        if (insideThought && onThoughtChunk) {
          pendingThoughtContent += char;
          
          const shouldEmit = isFirstThoughtChunk ||
            pendingThoughtContent.length >= 4 || 
            char === " " || char === "\n" || char === "," || char === ".";
            
          if (shouldEmit && pendingThoughtContent.length > 0) {
            await onThoughtChunk(pendingThoughtContent, "response", messageId);
            pendingThoughtContent = "";
            isFirstThoughtChunk = false;
          }
        }
      }
    },
    flush: async () => {
      if (pendingTextContent) {
        await onFilteredChunk(pendingTextContent, messageId);
        pendingTextContent = "";
      }
      if (pendingThoughtContent && onThoughtChunk) {
        await onThoughtChunk(pendingThoughtContent, "response", messageId);
        pendingThoughtContent = "";
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

  for (let i = 0; i < MAX_RESPONSE_RETRIES; i++) {
    try {
      // When streaming callback is provided, enable streaming mode with XML filtering
      // The filter extracts content from <text>...</text> AND <thought>...</thought> tags
      // Text goes to main response, thought goes to reasoning display
      let streamFilter: ReturnType<typeof createStreamingXmlFilter> | null = null;
      
      if (onStreamChunk) {
        streamFilter = createStreamingXmlFilter(onStreamChunk, messageId, onReasoningChunk);
      }
      
      const response = await runtime.useModel(ModelType.TEXT_LARGE, {
        prompt,
        ...(onStreamChunk && streamFilter && {
          stream: true,
          onStreamChunk: async (chunk: string) => {
            await streamFilter!.processChunk(chunk);
          },
        }),
      });
      
      // Flush any remaining buffered content
      if (streamFilter) {
        await streamFilter.flush();
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

  if (lastRawResponse && lastRawResponse.length > 10) {
    const cleanedResponse = lastRawResponse
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (cleanedResponse.length > 20) {
      logger.info(
        `[generateResponseWithRetry] Using cleaned raw response as fallback`,
      );
      return { text: cleanedResponse, thought: "" };
    }
  }

  logger.error(
    `[generateResponseWithRetry] All ${MAX_RESPONSE_RETRIES} attempts failed. Last error: ${lastError?.message || "Unknown"}`,
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
