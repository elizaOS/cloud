import type { IAgentRuntime } from "@elizaos/core";
import type { OpenAITranscriptionParams } from "../types";
/**
 * TRANSCRIPTION model handler
 */
export declare function handleTranscription(runtime: IAgentRuntime, input: Blob | File | Buffer | OpenAITranscriptionParams): Promise<string>;
