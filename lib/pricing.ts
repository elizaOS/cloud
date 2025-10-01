import { db, schema, eq, and } from '@/lib/db';

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
  const pricingMap: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
    'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
    'claude-3-5-haiku-20241022': { input: 1.00, output: 5.00 },
  };

  const pricing = pricingMap[model] || { input: 2.50, output: 10.00 };

  const inputCost = Math.ceil((inputTokens / 1000000) * pricing.input * 100);
  const outputCost = Math.ceil((outputTokens / 1000000) * pricing.output * 100);

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
