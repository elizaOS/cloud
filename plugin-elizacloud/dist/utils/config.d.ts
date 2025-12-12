import type { IAgentRuntime } from "@elizaos/core";
/**
 * Retrieves a configuration setting from the runtime, falling back to environment variables or a default value if not found.
 *
 * @param key - The name of the setting to retrieve.
 * @param defaultValue - The value to return if the setting is not found in the runtime or environment.
 * @returns The resolved setting value, or {@link defaultValue} if not found.
 */
export declare function getSetting(runtime: IAgentRuntime, key: string, defaultValue?: string): string | undefined;
export declare function isBrowser(): boolean;
/**
 * Determines whether we're running in a browser with a server-hosted proxy configured.
 * In this mode, we do not require a real API key on the client and rely on the proxy to inject it.
 */
export declare function isProxyMode(runtime: IAgentRuntime): boolean;
export declare function getAuthHeader(runtime: IAgentRuntime, forEmbedding?: boolean): Record<string, string>;
/**
 * Retrieves the ElizaOS Cloud API base URL from runtime settings, environment variables, or defaults.
 *
 * @returns The resolved base URL for ElizaOS Cloud API requests.
 */
export declare function getBaseURL(runtime: IAgentRuntime): string;
/**
 * Retrieves the ElizaOS Cloud API base URL for embeddings, falling back to the general base URL.
 *
 * @returns The resolved base URL for ElizaOS Cloud embedding requests.
 */
export declare function getEmbeddingBaseURL(runtime: IAgentRuntime): string;
/**
 * Helper function to get the API key for ElizaOS Cloud
 * Expected format: eliza_<random_32_chars>
 *
 * @param runtime The runtime context
 * @returns The configured API key
 */
export declare function getApiKey(runtime: IAgentRuntime): string | undefined;
/**
 * Helper function to get the embedding API key for ElizaOS Cloud, falling back to the general API key if not set.
 *
 * @param runtime The runtime context
 * @returns The configured API key
 */
export declare function getEmbeddingApiKey(runtime: IAgentRuntime): string | undefined;
/**
 * Helper function to get the small model name with fallbacks
 * Available models on ElizaOS Cloud: gpt-4o-mini, gpt-4o, claude-3-5-sonnet, gemini-2.0-flash
 *
 * @param runtime The runtime context
 * @returns The configured small model name
 */
export declare function getSmallModel(runtime: IAgentRuntime): string;
/**
 * Helper function to get the large model name with fallbacks
 * Available models on ElizaOS Cloud: gpt-4o-mini, gpt-4o, claude-3-5-sonnet, gemini-2.0-flash
 *
 * @param runtime The runtime context
 * @returns The configured large model name
 */
export declare function getLargeModel(runtime: IAgentRuntime): string;
/**
 * Helper function to get the image description model name with fallbacks
 *
 * @param runtime The runtime context
 * @returns The configured image description model name
 */
export declare function getImageDescriptionModel(runtime: IAgentRuntime): string;
/**
 * Helper function to get the image generation model name with fallbacks
 *
 * @param runtime The runtime context
 * @returns The configured image generation model name
 */
export declare function getImageGenerationModel(runtime: IAgentRuntime): string;
/**
 * Helper function to get experimental telemetry setting
 *
 * @param runtime The runtime context
 * @returns Whether experimental telemetry is enabled
 */
export declare function getExperimentalTelemetry(runtime: IAgentRuntime): boolean;
