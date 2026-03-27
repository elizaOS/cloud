import type { JSONObject } from "@ai-sdk/provider";

/**
 * Matches AI SDK v3 `SharedV3ProviderOptions` (`Record<string, JSONObject>`).
 * Used for merged `providerOptions` on gateway / `streamText` / forwarded chat payloads.
 */
export type CloudMergedProviderOptions = Record<string, JSONObject>;
