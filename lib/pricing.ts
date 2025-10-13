import { db, schema, eq, and } from "@/lib/db";

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

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  totalCost: number;
}

export async function calculateCost(
  model: string,
  provider: string,
  inputTokens: number,
  outputTokens: number,
): Promise<CostBreakdown> {
  const pricing = await db.query.modelPricing.findFirst({
    where: and(
      eq(schema.modelPricing.model, model),
      eq(schema.modelPricing.provider, provider),
      eq(schema.modelPricing.is_active, true),
    ),
  });

  if (!pricing) {
    const fallbackCosts = getFallbackPricing(model, inputTokens, outputTokens);
    return fallbackCosts;
  }

  const inputCost = Math.ceil(
    (inputTokens / 1000) *
      parseFloat(pricing.input_cost_per_1k.toString()) *
      100,
  );
  const outputCost = Math.ceil(
    (outputTokens / 1000) *
      parseFloat(pricing.output_cost_per_1k.toString()) *
      100,
  );

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

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

  const inputCost = Math.ceil((inputTokens / 1000) * pricing.input * 100);
  const outputCost = Math.ceil((outputTokens / 1000) * pricing.output * 100);

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

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
 * Normalize model name by removing provider prefix if present
 * "openai/gpt-4o-mini" -> "gpt-4o-mini"
 */
export function normalizeModelName(model: string): string {
  if (model.includes("/")) {
    const [, modelName] = model.split("/");
    return modelName;
  }
  return model;
}

/**
 * Estimate token count from text (rough approximation)
 * Average: 1 token ≈ 4 characters
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate cost for a chat request before making the API call
 * Used for pre-flight credit checking
 */
export async function estimateRequestCost(
  model: string,
  messages: Array<{ role: string; content: string }>,
): Promise<number> {
  const provider = getProviderFromModel(model);
  const normalizedModel = normalizeModelName(model);
  
  // Estimate input tokens from messages
  const messageText = messages.map(m => m.content).join(" ");
  const estimatedInputTokens = estimateTokens(messageText);
  
  // Estimate output tokens (conservative estimate: 500 tokens)
  const estimatedOutputTokens = 500;
  
  const { totalCost } = await calculateCost(
    normalizedModel,
    provider,
    estimatedInputTokens,
    estimatedOutputTokens,
  );
  
  // Add 20% buffer for safety
  return Math.ceil(totalCost * 1.2);
}
