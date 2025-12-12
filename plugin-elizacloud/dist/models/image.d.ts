import type { IAgentRuntime, ImageDescriptionParams } from "@elizaos/core";
import type { ImageDescriptionResult } from "../types";
/**
 * IMAGE model handler - generates images from text prompts
 * Uses ElizaOS Cloud's custom /generate-image endpoint (not OpenAI-compatible)
 */
export declare function handleImageGeneration(runtime: IAgentRuntime, params: {
    prompt: string;
    n?: number;
    size?: string;
}): Promise<{
    url: string;
}[]>;
/**
 * IMAGE_DESCRIPTION model handler - analyzes images and provides descriptions
 */
export declare function handleImageDescription(runtime: IAgentRuntime, params: ImageDescriptionParams | string): Promise<ImageDescriptionResult | string>;
