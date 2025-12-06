import { modelPricingRepository } from "@/db/repositories";

// Re-export constants from pricing-constants (safe for client components)
export {
  API_KEY_PREFIX_LENGTH,
  IMAGE_GENERATION_COST,
  VIDEO_GENERATION_COST,
  VIDEO_GENERATION_FALLBACK_COST,
  MONTHLY_CREDIT_CAP,
} from "@/lib/pricing-constants";

// =============================================================================
// COST CALCULATION INTERFACES & FUNCTIONS
// =============================================================================

/**
 * Breakdown of costs for a model request.
 */
export interface CostBreakdown {
  /** Cost for input tokens in USD. */
  inputCost: number;
  /** Cost for output tokens in USD. */
  outputCost: number;
  /** Total cost (input + output) in USD. */
  totalCost: number;
}

/**
 * Calculates the cost for a model request based on token usage.
 *
 * @param model - Model identifier (e.g., "gpt-4o-mini").
 * @param provider - Provider name (e.g., "openai").
 * @param inputTokens - Number of input tokens.
 * @param outputTokens - Number of output tokens.
 * @returns Cost breakdown with input, output, and total costs.
 */
export async function calculateCost(
  model: string,
  provider: string,
  inputTokens: number,
  outputTokens: number,
): Promise<CostBreakdown> {
  const pricing = await modelPricingRepository.findByModelAndProvider(
    model,
    provider,
  );

  if (!pricing) {
    const fallbackCosts = getFallbackPricing(model, inputTokens, outputTokens);
    return fallbackCosts;
  }

  const inputCostCents = Math.ceil(
    (inputTokens / 1000) *
      parseFloat(pricing.input_cost_per_1k.toString()) *
      100,
  );
  const outputCostCents = Math.ceil(
    (outputTokens / 1000) *
      parseFloat(pricing.output_cost_per_1k.toString()) *
      100,
  );

  const inputCost = Math.round(inputCostCents) / 100;
  const outputCost = Math.round(outputCostCents) / 100;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

/**
 * Gets fallback pricing when model pricing is not found in database.
 *
 * @param model - Model identifier.
 * @param inputTokens - Number of input tokens.
 * @param outputTokens - Number of output tokens.
 * @returns Cost breakdown using fallback pricing.
 */
function getFallbackPricing(
  model: string,
  inputTokens: number,
  outputTokens: number,
): CostBreakdown {
  // Pricing per 1k tokens (to match database pricing format)
  const pricingMap: Record<string, { input: number; output: number }> = {
    "gpt-4o": { input: 0.0025, output: 0.01 },
    "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
    "gpt-4-turbo": { input: 0.01, output: 0.03 },
    "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
    "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },
    "claude-3-5-haiku-20241022": { input: 0.001, output: 0.005 },
  };

  const pricing = pricingMap[model] || { input: 0.0025, output: 0.01 };

  const inputCostCents = Math.ceil((inputTokens / 1000) * pricing.input * 100);
  const outputCostCents = Math.ceil(
    (outputTokens / 1000) * pricing.output * 100,
  );

  const inputCost = Math.round(inputCostCents) / 100;
  const outputCost = Math.round(outputCostCents) / 100;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

/**
 * Extracts the provider name from a model identifier.
 *
 * Supports both prefixed format ("openai/gpt-4o-mini") and non-prefixed format ("gpt-4o-mini").
 *
 * @param model - Model identifier.
 * @returns Provider name (defaults to "openai" if unknown).
 */
export function getProviderFromModel(model: string): string {
  // Handle provider-prefixed format: "openai/gpt-4o-mini" or "anthropic/claude-3"
  if (model.includes("/")) {
    const [provider] = model.split("/");
    return provider;
  }

  // Handle non-prefixed format: "gpt-4o-mini"
  if (model.startsWith("gpt-")) return "openai";
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gemini-")) return "google";
  if (model.startsWith("llama")) return "meta";
  return "openai";
}

/**
 * Normalizes a model name by removing the provider prefix if present.
 *
 * @param model - Model identifier (e.g., "openai/gpt-4o-mini" or "gpt-4o-mini").
 * @returns Model name without provider prefix (e.g., "gpt-4o-mini").
 */
export function normalizeModelName(model: string): string {
  if (model.includes("/")) {
    const [, modelName] = model.split("/");
    return modelName;
  }
  return model;
}

/**
 * Estimates token count from text using a rough approximation.
 *
 * Uses the average ratio of 1 token ≈ 4 characters.
 *
 * @param text - Text to estimate tokens for.
 * @returns Estimated number of tokens.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimates the cost for a chat request before making the API call.
 *
 * Used for pre-flight credit checking. Handles both string and multimodal content.
 *
 * @param model - Model identifier.
 * @param messages - Array of messages with role and content (string or multimodal object).
 * @returns Estimated cost in USD with a 50% safety buffer.
 */
export async function estimateRequestCost(
  model: string,
  messages: Array<{ role: string; content: string | object }>,
): Promise<number> {
  const provider = getProviderFromModel(model);
  const normalizedModel = normalizeModelName(model);

  // Estimate input tokens from messages
  // Handle both string content and multimodal content
  const messageText = messages
    .map((m) => {
      if (typeof m.content === "string") {
        return m.content;
      } else if (m.content && typeof m.content === "object") {
        // For multimodal content, stringify and estimate
        // This is a rough approximation
        return JSON.stringify(m.content);
      }
      return "";
    })
    .join(" ");

  const estimatedInputTokens = estimateTokens(messageText);

  // Estimate output tokens (conservative estimate: 500 tokens)
  const estimatedOutputTokens = 500;

  const { totalCost } = await calculateCost(
    normalizedModel,
    provider,
    estimatedInputTokens,
    estimatedOutputTokens,
  );

  // Add 50% buffer for safety (increased from 20% to handle usage spikes)
  return Math.ceil(totalCost * 1.5);
}
