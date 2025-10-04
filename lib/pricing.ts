import { db, schema, eq, and } from '@/lib/db';

// =============================================================================
// PRICING & CONFIGURATION CONSTANTS
// =============================================================================

/**
 * API Key Configuration
 */
export const API_KEY_PREFIX_LENGTH = 12;

/**
 * Credit Costs (in credits, not dollars)
 */
export const IMAGE_GENERATION_COST = 100;
export const VIDEO_GENERATION_COST = 500;
export const VIDEO_GENERATION_FALLBACK_COST = 250;

/**
 * Credit Limits
 */
export const MONTHLY_CREDIT_CAP = 240;

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
  outputTokens: number
): Promise<CostBreakdown> {
  const pricing = await db.query.modelPricing.findFirst({
    where: and(
      eq(schema.modelPricing.model, model),
      eq(schema.modelPricing.provider, provider),
      eq(schema.modelPricing.is_active, true)
    ),
  });

  if (!pricing) {
    const fallbackCosts = getFallbackPricing(model, inputTokens, outputTokens);
    return fallbackCosts;
  }

  const inputCost = Math.ceil(
    (inputTokens / 1000) * parseFloat(pricing.input_cost_per_1k.toString()) * 100
  );
  const outputCost = Math.ceil(
    (outputTokens / 1000) * parseFloat(pricing.output_cost_per_1k.toString()) * 100
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
  outputTokens: number
): CostBreakdown {
  // Pricing per 1k tokens (to match database pricing format)
  const pricingMap: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 0.0025, output: 0.01 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
    'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
    'claude-3-5-haiku-20241022': { input: 0.001, output: 0.005 },
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
  if (model.startsWith('gpt-')) return 'openai';
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gemini-')) return 'google';
  if (model.startsWith('llama')) return 'meta';
  return 'openai';
}
