import { type IAgentRuntime, type ModelTypeName } from "@elizaos/core";
import type { LanguageModelUsage } from "ai";
/**
 * Emits a model usage event
 * @param runtime The runtime context
 * @param type The model type
 * @param prompt The prompt used
 * @param usage The LLM usage data
 */
export declare function emitModelUsageEvent(runtime: IAgentRuntime, type: ModelTypeName, prompt: string, usage: LanguageModelUsage): void;
