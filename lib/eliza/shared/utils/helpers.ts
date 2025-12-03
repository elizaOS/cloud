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

/**
 * Check if a URL is a base64 data URL (which would bloat token count)
 */
function isBase64DataUrl(url: string): boolean {
  return typeof url === "string" && url.startsWith("data:");
}

/**
 * Get cached attachments for a room and clear the cache
 */
export function getAndClearCachedAttachments(roomId: string): unknown[] {
  const attachments = actionAttachmentCache.get(roomId) || [];
  actionAttachmentCache.delete(roomId);
  return attachments;
}

/**
 * Clear cached attachments for a room
 */
export function clearCachedAttachments(roomId: string): void {
  actionAttachmentCache.delete(roomId);
}

/**
 * Extract attachments from action results
 * IMPORTANT: Sanitizes attachments to prevent base64 data from bloating context
 */
export function extractAttachments(
  actionResults: Array<{ data?: { attachments?: unknown[] } }>,
): unknown[] {
  return actionResults
    .flatMap((result) => result.data?.attachments ?? [])
    .filter(Boolean)
    .map((att) => {
      const attachment = att as { url?: string; id?: string };
      // Skip base64 URLs to prevent token bloat
      if (attachment.url && isBase64DataUrl(attachment.url)) {
        logger.warn(
          "[extractAttachments] Skipping base64 attachment to prevent token bloat",
        );
        return null;
      }
      // Skip invalid URLs
      if (
        attachment.url &&
        (attachment.url.startsWith("[") ||
          attachment.url === "" ||
          !attachment.url.startsWith("http"))
      ) {
        logger.warn("[extractAttachments] Skipping invalid URL attachment");
        return null;
      }
      return att;
    })
    .filter(Boolean);
}

/**
 * Execute planned providers and update state
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
 * Execute planned actions and update state
 */
export async function executeActions(
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
          `[executeActions] Processing attachment: id=${attachment.id}, url=${url?.substring(0, 50)}...`,
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
            `[executeActions] Captured valid attachment for storage: ${url.substring(0, 80)}...`,
          );
        } else {
          logger.info(
            `[executeActions] Skipping non-HTTP attachment (likely base64)`,
          );
        }
      }

      actionAttachmentCache.set(message.roomId as string, existingAttachments);
      logger.info(
        `[executeActions] Total cached attachments for room: ${existingAttachments.length}`,
      );
    }

    // Pass through to the original callback for real-time display
    return callback(content);
  };

  await runtime.processActions(
    message,
    [actionResponse],
    currentState,
    wrappedCallback,
  );

  // Refresh state to get action results
  const actionState = await runtime.composeState(message, ["ACTION_STATE"]);
  return { ...currentState, ...actionState };
}

/**
 * Generate response with retry logic
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
 * Run evaluators with timeout to prevent hanging
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

  try {
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      `[runEvaluatorsWithTimeout] Error in evaluators: ${errorMessage}`,
    );
  }
}
