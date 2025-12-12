import type { DetokenizeTextParams, IAgentRuntime, TokenizeTextParams } from "@elizaos/core";
/**
 * TEXT_TOKENIZER_ENCODE handler
 */
export declare function handleTokenizerEncode(_runtime: IAgentRuntime, { prompt, modelType }: TokenizeTextParams): Promise<number[]>;
/**
 * TEXT_TOKENIZER_DECODE handler
 */
export declare function handleTokenizerDecode(_runtime: IAgentRuntime, { tokens, modelType }: DetokenizeTextParams): Promise<string>;
