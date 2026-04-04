import type { JSONObject } from "@ai-sdk/provider";

/**
 * Shape of merged `providerOptions` passed into AI SDK calls (gateway, `streamText`, forwarded bodies).
 *
 * **Why `Record<string, JSONObject>`:** Aligns with AI SDK shared provider options so nested
 * `anthropic`, `google`, and `gateway` fragments stay JSON-serializable and assignable without `any`.
 * **Why a dedicated type:** `anthropic-thinking.ts` merges fragments from several routes; one alias
 * keeps merges consistent and documents intent at call sites.
 */
export type CloudMergedProviderOptions = Record<string, JSONObject>;
