/**
 * Deploy-wide **ANTHROPIC_COT_BUDGET** → `providerOptions.anthropic.thinking` (AI SDK / gateway JSON).
 *
 * **Why env-only budget (not per-request):** Thinking increases token usage and cost; exposing budgets
 * only via environment keeps policy operator-controlled and avoids untrusted clients enabling expensive
 * behavior. **Why merge helpers:** Routes already set `gateway` or `google` keys; shallow merge would
 * drop nested keys, so we deep-merge known top-level fragments before spreading into SDK calls.
 *
 * **Spread helpers** (pick one per call site):
 * - {@link mergeAnthropicCotProviderOptions} — plain `streamText` / `generateText` (no base `providerOptions`).
 * - {@link mergeGoogleImageModalitiesWithAnthropicCot} — Gemini-style image (`google.responseModalities`).
 * - {@link mergeGatewayGroqPreferenceWithAnthropicCot} — forwarded chat body + `gateway.order: ['groq']` (e.g. `/responses`).
 *
 * Lower-level: {@link mergeProviderOptions}, {@link anthropicThinkingProviderOptions}, {@link parseAnthropicCotBudgetFromEnv}.
 *
 * @see docs/anthropic-cot-budget.md
 */

import type { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import type { JSONObject } from "@ai-sdk/provider";
import { getProviderFromModel } from "@/lib/pricing";
import type { CloudMergedProviderOptions } from "./cloud-provider-options";

const ENV_KEY = "ANTHROPIC_COT_BUDGET";

/** Subset of env used for tests and callers that only pass a few keys. */
export type AnthropicCotEnv = Record<string, string | undefined>;

export type { CloudMergedProviderOptions } from "./cloud-provider-options";

function parsePositiveIntStrict(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw new Error(`${ENV_KEY} is non-empty but whitespace-only`);
  }
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${ENV_KEY} must be a non-negative integer string, got: ${JSON.stringify(raw)}`);
  }
  const n = Number.parseInt(trimmed, 10);
  if (n > Number.MAX_SAFE_INTEGER) {
    throw new Error(`${ENV_KEY} exceeds safe integer range`);
  }
  return n;
}

/**
 * Reads ANTHROPIC_COT_BUDGET from env.
 * - unset / empty → null (off)
 * - "0" or negative as string not possible with strict digit regex; 0 from digits → null
 * - invalid non-empty → throws
 */
export function parseAnthropicCotBudgetFromEnv(
  env: AnthropicCotEnv = process.env,
): number | null {
  const raw = env[ENV_KEY];
  if (raw === undefined || raw === "") {
    return null;
  }
  const n = parsePositiveIntStrict(raw);
  if (n <= 0) {
    return null;
  }
  return n;
}

const anthropicThinkingOptions = (budgetTokens: number): AnthropicProviderOptions => ({
  thinking: { type: "enabled", budgetTokens },
});

/**
 * AI SDK / gateway fragment when budget is active and model is Anthropic.
 */
export function anthropicThinkingProviderOptions(
  modelId: string,
  env: AnthropicCotEnv = process.env,
): { providerOptions: CloudMergedProviderOptions } | Record<string, never> {
  if (getProviderFromModel(modelId) !== "anthropic") {
    return {};
  }
  const budget = parseAnthropicCotBudgetFromEnv(env);
  if (budget === null) {
    return {};
  }
  const anthropic = anthropicThinkingOptions(budget);
  return {
    providerOptions: {
      anthropic,
    },
  };
}

/**
 * Deep-merge nested provider keys so gateway order / google / anthropic are preserved.
 */
export function mergeProviderOptions(
  base?: { providerOptions?: CloudMergedProviderOptions },
  extra?: { providerOptions?: CloudMergedProviderOptions },
): { providerOptions: CloudMergedProviderOptions } | Record<string, never> {
  const a = base?.providerOptions;
  const b = extra?.providerOptions;
  if (!a && !b) {
    return {};
  }
  const out: CloudMergedProviderOptions = { ...a, ...b };
  if (a?.gateway && b?.gateway) {
    out.gateway = { ...a.gateway, ...b.gateway };
  }
  if (a?.anthropic && b?.anthropic) {
    out.anthropic = { ...a.anthropic, ...b.anthropic };
  }
  if (a?.google && b?.google) {
    out.google = { ...a.google, ...b.google };
  }
  return { providerOptions: out };
}

/**
 * Spread into `streamText` / `generateText` after model and messages.
 * Equivalent to `mergeProviderOptions(undefined, anthropicThinkingProviderOptions(modelId))`.
 */
export function mergeAnthropicCotProviderOptions(
  modelId: string,
  env: AnthropicCotEnv = process.env,
): { providerOptions: CloudMergedProviderOptions } | Record<string, never> {
  return mergeProviderOptions(undefined, anthropicThinkingProviderOptions(modelId, env));
}

const GOOGLE_IMAGE_MODALITIES: JSONObject = { responseModalities: ["TEXT", "IMAGE"] };

/**
 * Gemini (and similar) image generation: `google.responseModalities` plus optional COT merge.
 * For non-Anthropic `modelId`, the COT fragment is empty (no-op).
 */
export function mergeGoogleImageModalitiesWithAnthropicCot(
  modelId: string,
  env: AnthropicCotEnv = process.env,
): { providerOptions: CloudMergedProviderOptions } | Record<string, never> {
  return mergeProviderOptions(
    { providerOptions: { google: GOOGLE_IMAGE_MODALITIES } },
    anthropicThinkingProviderOptions(modelId, env),
  );
}

/**
 * Chat-completions-shaped forwards (e.g. `/responses`): prefer Groq in gateway order plus optional COT.
 */
export function mergeGatewayGroqPreferenceWithAnthropicCot(
  modelId: string,
  env: AnthropicCotEnv = process.env,
): { providerOptions: CloudMergedProviderOptions } | Record<string, never> {
  return mergeProviderOptions(
    { providerOptions: { gateway: { order: ["groq"] } } },
    anthropicThinkingProviderOptions(modelId, env),
  );
}
