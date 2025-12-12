import type { GenerateTextParams, IAgentRuntime } from "@elizaos/core";
/**
 * TEXT_SMALL model handler
 */
export declare function handleTextSmall(runtime: IAgentRuntime, { prompt, stopSequences, maxTokens, temperature, frequencyPenalty, presencePenalty, }: GenerateTextParams): Promise<string>;
/**
 * TEXT_LARGE model handler
 */
export declare function handleTextLarge(runtime: IAgentRuntime, { prompt, stopSequences, maxTokens, temperature, frequencyPenalty, presencePenalty, }: GenerateTextParams): Promise<string>;
