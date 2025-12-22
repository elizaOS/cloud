import { modelPricingRepository } from "@/db/repositories";
import { logger } from "@/lib/utils/logger";

export {
  API_KEY_PREFIX_LENGTH,
  IMAGE_GENERATION_COST,
  VIDEO_GENERATION_COST,
  VIDEO_GENERATION_FALLBACK_COST,
  MONTHLY_CREDIT_CAP,
} from "@/lib/pricing-constants";

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
  const pricing = await modelPricingRepository.findByModelAndProvider(
    model,
    provider,
  );

  if (!pricing) {
    logger.debug("pricing", "No DB pricing found, using fallback", {
      model,
      provider,
    });
    return getFallbackPricing(model, inputTokens, outputTokens);
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

// Fallback pricing per 1k tokens when not in database
function getFallbackPricing(
  model: string,
  inputTokens: number,
  outputTokens: number,
): CostBreakdown {
  const pricingMap: Record<string, { input: number; output: number }> = {
    // OpenAI
    "gpt-4o": { input: 0.005, output: 0.015 },
    "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
    "gpt-4-turbo": { input: 0.01, output: 0.03 },
    // Anthropic
    "claude-sonnet-4": { input: 0.003, output: 0.015 },
    "claude-haiku-4": { input: 0.001, output: 0.005 },
    "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },
    "claude-3-5-haiku-20241022": { input: 0.001, output: 0.005 },
    // Google
    "gemini-2.0-flash": { input: 0.0001, output: 0.0004 },
    "gemini-1.5-pro": { input: 0.00125, output: 0.005 },
    "gemini-1.5-flash": { input: 0.000075, output: 0.0003 },
    // xAI
    "grok-4.1-fast": { input: 0.0002, output: 0.0005 },
    "grok-4.1": { input: 0.003, output: 0.015 },
    // DeepSeek
    "deepseek-v3.2": { input: 0.00027, output: 0.0011 },
    "deepseek-r1": { input: 0.00055, output: 0.00219 },
    // Cohere
    "command-r-plus": { input: 0.003, output: 0.015 },
    "command-r": { input: 0.0005, output: 0.0015 },
    // Meta
    "llama-3.1-70b": { input: 0.0006, output: 0.0006 },
    "llama-3.1-8b": { input: 0.0001, output: 0.0001 },
  };

  const normalizedModel = model.includes("/") ? model.split("/")[1] : model;

  const knownPricing = pricingMap[normalizedModel];
  if (!knownPricing) {
    logger.warn("pricing", "Unknown model using default pricing", {
      model,
      normalizedModel,
      defaultPricing: { input: 0.003, output: 0.015 },
    });
  }
  const pricing = knownPricing || { input: 0.003, output: 0.015 };

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

export function getProviderFromModel(model: string): string {
  if (model.includes("/")) return model.split("/")[0];
  if (model.startsWith("gpt-")) return "openai";
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gemini-")) return "google";
  if (model.startsWith("grok-")) return "xai";
  if (model.startsWith("command-")) return "cohere";
  if (model.startsWith("deepseek-")) return "deepseek";
  if (model.startsWith("llama")) return "meta";
  return "openai";
}

export function normalizeModelName(model: string): string {
  return model.includes("/") ? model.split("/")[1] : model;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function estimateRequestCost(
  model: string,
  messages: Array<{ role: string; content: string | object }>,
): Promise<number> {
  const provider = getProviderFromModel(model);
  const normalizedModel = normalizeModelName(model);

  const messageText = messages
    .map((m) =>
      typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    )
    .join(" ");

  const { totalCost } = await calculateCost(
    normalizedModel,
    provider,
    estimateTokens(messageText),
    500,
  );

  // Add 50% buffer for safety (increased from 20% to handle usage spikes)
  // Round to nearest cent (2 decimal places), minimum $0.01
  const bufferedCost = totalCost * 1.5;
  return Math.max(0.01, Math.ceil(bufferedCost * 100) / 100);
}
