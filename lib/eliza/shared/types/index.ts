import type { IAgentRuntime, Memory, HandlerCallback } from "@elizaos/core";

/**
 * Message handler parameters
 * Shared interface for all plugin message handlers
 */
export interface MessageReceivedHandlerParams {
  runtime: IAgentRuntime;
  message: Memory;
  callback: HandlerCallback;
}
