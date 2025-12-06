/**
 * Helper Utilities
 *
 * Common helper functions used across workflows.
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
import type { ParsedResponse } from "./parsers";
import type { ParsedPlan } from "./parsers";

// Constants
export const MAX_RESPONSE_RETRIES = 3;
export const EVALUATOR_TIMEOUT_MS = 30000;

// Track attachments collected during action execution per-room
const actionAttachmentCache = new Map<string, unknown[]>();

// Track whether an action already sent a complete response (text + optional attachments)
// This prevents handler from generating duplicate responses
const actionResponseSentCache = new Map<string, boolean>();

/**
 * Checks if an action has already sent a response for this room.
 *
 * @param roomId - Room ID.
 * @returns True if action has sent a response.
 */
export function hasActionSentResponse(roomId: string): boolean {
  return actionResponseSentCache.get(roomId) === true;
}

/**
 * Clears the action response flag for a room.
 *
 * @param roomId - Room ID.
 */
export function clearActionResponseFlag(roomId: string): void {
  actionResponseSentCache.delete(roomId);
}

/**
 * Check if a URL is a base64 data URL (which would bloat token count)
 */
function isBase64DataUrl(url: string): boolean {
  return typeof url === "string" && url.startsWith("data:");
}

/**
 * Gets cached attachments for a room and clears the cache.
 *
 * @param roomId - Room ID.
 * @returns Array of cached attachments.
 */
export function getAndClearCachedAttachments(roomId: string): unknown[] {
  const attachments = actionAttachmentCache.get(roomId) || [];
  actionAttachmentCache.delete(roomId);
  return attachments;
}

/**
 * Clears cached attachments for a room.
 *
 * @param roomId - Room ID.
 */
export function clearCachedAttachments(roomId: string): void {
  actionAttachmentCache.delete(roomId);
}

/**
 * Cleans up prompt by removing excessive empty lines.
 * Reduces multiple consecutive empty lines to a single empty line.
 * Removes leading and trailing empty lines.
 *
 * @param prompt - Prompt string to clean.
 * @returns Cleaned prompt string.
 */
export function cleanPrompt(prompt: string): string {
  return (
    prompt
      // Replace 3+ consecutive newlines with 2 newlines (1 empty line)
      .replace(/\n{3,}/g, "\n\n")
      // Remove leading empty lines
      .replace(/^\n+/, "")
      // Remove trailing empty lines
      .replace(/\n+$/, "\n")
      // Trim any trailing whitespace on lines
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
  );
}

/**
 * Extracts attachments from action results.
 * IMPORTANT: Sanitizes attachments to prevent base64 data from bloating context.
 *
 * @param actionResults - Array of action results with optional attachments.
 * @returns Array of sanitized attachments.
 */
interface Attachment {
  url?: string;
  id?: string;
  [key: string]: unknown;
}

interface ActionResult {
  data?: {
    attachments?: Attachment[];
    [key: string]: unknown;
  };
}

export function extractAttachments(actionResults: ActionResult[]): Attachment[] {
  return actionResults
    .flatMap((result) => result.data?.attachments ?? [])
    .filter((att): att is Attachment => {
      if (!att || typeof att !== "object") return false;
      const attachment = att as Attachment;
      // Skip base64 URLs to prevent token bloat
      if (attachment.url && isBase64DataUrl(attachment.url)) {
        logger.warn(
          "[extractAttachments] Skipping base64 attachment to prevent token bloat",
        );
        return false;
      }
      // Skip invalid URLs
      if (
        attachment.url &&
        (attachment.url.startsWith("[") ||
          attachment.url === "" ||
          !attachment.url.startsWith("http"))
      ) {
        logger.warn("[extractAttachments] Skipping invalid URL attachment");
        return false;
      }
      return true;
    });
}

/**
 * Executes planned providers and updates state.
 *
 * @param runtime - Agent runtime instance.
 * @param message - Current message.
 * @param plannedProviders - Array of provider names to execute.
 * @param currentState - Current state object.
 * @returns Updated state with provider results.
 */
export async function executeProviders(
  runtime: IAgentRuntime,
  message: Memory,
  plannedProviders: string[],
  currentState: State,
): Promise<State> {
  if (plannedProviders.length === 0) {
    return currentState;
  }

  logger.debug(
    "[executeProviders] Executing providers:",
    JSON.stringify(plannedProviders),
  );
  const providerState = await runtime.composeState(message, [
    ...plannedProviders,
    "CHARACTER",
  ]);

  return { ...currentState, ...providerState };
}

/**
 * Executes planned actions and updates state.
 * Wraps the callback to capture attachments and track if action sent a response.
 *
 * @param runtime - Agent runtime instance.
 * @param message - Current message.
 * @param plannedActions - Array of action names to execute.
 * @param plan - Parsed plan with thought and text.
 * @param currentState - Current state object.
 * @param callback - Optional callback for real-time updates.
 * @returns Updated state with action results.
 */
export async function executeActions(
  runtime: IAgentRuntime,
  message: Memory,
  plannedActions: string[],
  plan: ParsedPlan | null,
  currentState: State,
  callback?: HandlerCallback,
): Promise<State> {
  if (plannedActions.length === 0) {
    return currentState;
  }

  logger.debug(
    "[executeActions] Executing actions:",
    JSON.stringify(plannedActions),
  );

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

  // Clear any previous attachments and response flag for this room
  actionAttachmentCache.set(message.roomId as string, []);
  actionResponseSentCache.set(message.roomId as string, false);

  // Wrap the callback to capture attachments and track if action sent response
  const wrappedCallback: HandlerCallback = async (content) => {
    // Track that an action has sent a response (text content)
    if (content.text && content.text.trim().length > 0) {
      actionResponseSentCache.set(message.roomId as string, true);
      logger.info(
        `[executeActions] Action sent response with text: "${content.text.substring(0, 50)}..."`,
      );
    }

    // Capture attachments from action callbacks
    if (content.attachments && Array.isArray(content.attachments)) {
      const existingAttachments =
        actionAttachmentCache.get(message.roomId as string) || [];

      // Only add attachments with valid HTTP URLs (not base64)
      interface AttachmentWithMetadata {
        url?: string;
        id?: string;
        title?: string;
        contentType?: string;
      }

      for (const att of content.attachments) {
        if (
          !att ||
          typeof att !== "object" ||
          !("url" in att) ||
          typeof (att as AttachmentWithMetadata).url !== "string"
        ) {
          continue;
        }
        const attachment = att as AttachmentWithMetadata;
        const url = attachment.url;

        logger.info(
          `[executeActions] Processing attachment: id=${attachment.id}, url=${url?.substring(0, 50)}...`,
        );

        if (url && typeof url === "string" && url.startsWith("http")) {
          // Create a clean attachment object for storage
          const cleanAttachment = {
            id: attachment.id,
            url: url,
            title: attachment.title,
            contentType: attachment.contentType,
          };
          existingAttachments.push(cleanAttachment);
          logger.info(
            `[executeActions] Captured valid attachment: ${url.substring(0, 80)}...`,
          );
        } else {
          logger.info(
            `[executeActions] Skipping non-HTTP attachment (likely base64)`,
          );
        }
      }

      actionAttachmentCache.set(message.roomId as string, existingAttachments);
      logger.info(
        `[executeActions] Total cached attachments: ${existingAttachments.length}`,
      );
    }

    // Pass through to the original callback for real-time display
    if (callback) {
      return callback(content);
    }
    return [];
  };

  // Process actions with wrapped callback
  await runtime.processActions(
    message,
    [actionResponse],
    currentState,
    wrappedCallback,
  );

  // Refresh state to get action results
  const actionState = await runtime.composeState(message, [
    "CURRENT_RUN_CONTEXT",
  ]);
  return { ...currentState, ...actionState };
}

/**
 * Generates response with retry logic.
 *
 * @param runtime - Agent runtime instance.
 * @param prompt - Prompt to send to the model.
 * @returns Object with text and thought.
 */
export async function generateResponseWithRetry(
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
 * Runs evaluators with timeout to prevent hanging.
 *
 * @param runtime - Agent runtime instance.
 * @param message - Current message.
 * @param state - Current state.
 * @param responseMemory - Response memory to evaluate.
 * @param callback - Callback for evaluator results.
 */
export async function runEvaluatorsWithTimeout(
  runtime: IAgentRuntime,
  message: Memory,
  state: State,
  responseMemory: Memory,
  callback: HandlerCallback,
): Promise<void> {
  if (typeof runtime.evaluate !== "function") {
    logger.debug(
      "[runEvaluatorsWithTimeout] runtime.evaluate not available - skipping evaluators",
    );
    return;
  }

  logger.debug("[runEvaluatorsWithTimeout] Running evaluators");

  await Promise.race([
    runtime.evaluate(
      message,
      { ...state },
      true, // shouldRespondToMessage
      async (content) => {
        logger.debug(
          "[runEvaluatorsWithTimeout] Evaluator callback:",
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
  logger.debug(
    "[runEvaluatorsWithTimeout] Evaluators completed successfully",
  );
}
