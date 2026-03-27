/**
 * ANTHROPIC_COT_BUDGET → AI SDK / gateway-forward providerOptions (plugin-anthropic parity).
 */

import type { AnthropicProviderOptions } from "@ai-sdk/anthropic";
import type { JSONObject } from "@ai-sdk/provider";
import { getProviderFromModel } from "@/lib/pricing";

const ENV_KEY = "ANTHROPIC_COT_BUDGET";

/** Subset of env used for tests and callers that only pass a few keys. */
export type AnthropicCotEnv = Record<string, string | undefined>;

/**
 * AI SDK v3 `providerOptions` is `Record<string, JSONObject>` (see SharedV3ProviderOptions).
 * We merge gateway / anthropic / google under that contract.
 */
export type CloudMergedProviderOptions = Record<string, JSONObject>;

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
): { providerOptions: { anthropic: AnthropicProviderOptions } } | Record<string, never> {
  if (getProviderFromModel(modelId) !== "anthropic") {
    return {};
  }
  const budget = parseAnthropicCotBudgetFromEnv(env);
  if (budget === null) {
    return {};
  }
  return {
    providerOptions: {
      anthropic: anthropicThinkingOptions(budget),
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
