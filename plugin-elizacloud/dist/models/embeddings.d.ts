import type { IAgentRuntime, TextEmbeddingParams } from "@elizaos/core";
/**
 * TEXT_EMBEDDING model handler
 */
export declare function handleTextEmbedding(runtime: IAgentRuntime, params: TextEmbeddingParams | string | null): Promise<number[]>;
