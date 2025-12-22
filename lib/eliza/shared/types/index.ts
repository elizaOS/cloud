/**
 * Shared Types for Eliza Plugin System
 */

import type { IAgentRuntime, Memory, HandlerCallback, UUID } from "@elizaos/core";

/**
 * Callback for streaming text chunks.
 * Called for each chunk of text as it's generated.
 * @param chunk - The text chunk
 * @param messageId - Optional message ID for coordination
 */
export type StreamChunkCallback = (
  chunk: string,
  messageId?: UUID,
) => Promise<void>;

/**
 * Parameters for message received handler.
 */
export interface MessageReceivedHandlerParams {
  runtime: IAgentRuntime;
  message: Memory;
  callback: HandlerCallback;
  /**
   * Optional callback for streaming text chunks in real-time.
   * When provided, the handler should stream the response chunk-by-chunk.
   */
  onStreamChunk?: StreamChunkCallback;
}
