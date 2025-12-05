/**
 * Shared Types for Eliza Plugin System
 */

import type {
  IAgentRuntime,
  Memory,
  HandlerCallback,
} from "@elizaos/core";

/**
 * Parameters for message received handler
 */
export interface MessageReceivedHandlerParams {
  runtime: IAgentRuntime;
  message: Memory;
  callback: HandlerCallback;
}

