import type { IAgentRuntime } from "@elizaos/core";
/**
 * Create an OpenAI-compatible client configured for ElizaOS Cloud
 *
 * @param runtime The runtime context
 * @returns Configured OpenAI-compatible client for ElizaOS Cloud
 */
export declare function createOpenAIClient(runtime: IAgentRuntime): import("@ai-sdk/openai").OpenAIProvider;
