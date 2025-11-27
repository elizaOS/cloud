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

/**
 * Extract attachments from action results
 */
export function extractAttachments(
  actionResults: Array<{ data?: { attachments?: unknown[] } }>,
): unknown[] {
  return actionResults
    .flatMap((result) => result.data?.attachments ?? [])
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
    roomId: message.roomId,
    worldId: message.worldId,
    content: {
      text: plan?.thought || "Executing actions",
      actions: plannedActions,
      source: "agent",
    },
  };

  await runtime.processActions(message, [actionResponse], currentState, callback);

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
          reject(new Error(`Evaluators timed out after ${EVALUATOR_TIMEOUT_MS}ms`));
        }, EVALUATOR_TIMEOUT_MS);
      }),
    ]);
    logger.debug("[runEvaluatorsWithTimeout] Evaluators completed successfully");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[runEvaluatorsWithTimeout] Error in evaluators: ${errorMessage}`);
  }
}
