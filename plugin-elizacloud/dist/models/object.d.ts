import type { IAgentRuntime, ObjectGenerationParams } from "@elizaos/core";
import { type JSONValue } from "ai";
/**
 * OBJECT_SMALL model handler
 */
export declare function handleObjectSmall(runtime: IAgentRuntime, params: ObjectGenerationParams): Promise<JSONValue>;
/**
 * OBJECT_LARGE model handler
 */
export declare function handleObjectLarge(runtime: IAgentRuntime, params: ObjectGenerationParams): Promise<JSONValue>;
