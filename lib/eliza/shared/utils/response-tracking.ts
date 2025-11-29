/**
 * Response Tracking Utilities
 * 
 * Manages response ID tracking to prevent race conditions when multiple
 * messages are being processed simultaneously.
 */

import { logger, type IAgentRuntime, type UUID } from "@elizaos/core";

/**
 * Build cache key for response tracking
 */
export function buildResponseCacheKey(agentId: UUID, roomId: string): string {
  return `response_id:${agentId}:${roomId}`;
}

/**
 * Get the latest response ID for a room
 */
export async function getLatestResponseId(
  runtime: IAgentRuntime,
  roomId: string,
): Promise<string | null> {
  const key = buildResponseCacheKey(runtime.agentId, roomId);
  return (await runtime.getCache<string>(key)) ?? null;
}

/**
 * Set the latest response ID for a room
 */
export async function setLatestResponseId(
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

/**
 * Clear the latest response ID for a room
 */
export async function clearLatestResponseId(
  runtime: IAgentRuntime,
  roomId: string,
): Promise<void> {
  const key = buildResponseCacheKey(runtime.agentId, roomId);
  logger.debug(`[clearLatestResponseId] Deleting cache key: ${key}`);
  await runtime.deleteCache(key);
}

/**
 * Check if a response is still valid (not superseded by a newer message)
 */
export async function isResponseStillValid(
  runtime: IAgentRuntime,
  roomId: string,
  responseId: string,
): Promise<boolean> {
  const currentResponseId = await getLatestResponseId(runtime, roomId);
  return currentResponseId === responseId;
}

