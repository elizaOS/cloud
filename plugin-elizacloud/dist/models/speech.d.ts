import type { IAgentRuntime } from "@elizaos/core";
import type { OpenAITextToSpeechParams } from "../types";
import type { Readable } from "node:stream";
/**
 * function for text-to-speech
 */
declare function fetchTextToSpeech(runtime: IAgentRuntime, options: OpenAITextToSpeechParams): Promise<ReadableStream<Uint8Array> | Readable>;
/**
 * TEXT_TO_SPEECH model handler
 */
export declare function handleTextToSpeech(runtime: IAgentRuntime, input: string | OpenAITextToSpeechParams): Promise<ReadableStream<Uint8Array> | Readable>;
export { fetchTextToSpeech };
