/**
 * Model tier definitions and utilities for AI model selection.
 */

/**
 * Available model tiers.
 */
export type ModelTier = "fast" | "pro" | "ultra";

/**
 * Configuration for a model tier.
 */
export interface ModelTierConfig {
  id: ModelTier;
  name: string;
  description: string;
  modelId: string;
  icon: "zap" | "sparkles" | "crown";
}

export const MODEL_TIERS: Record<ModelTier, ModelTierConfig> = {
  fast: {
    id: "fast",
    name: "Fast",
    description: "Quick responses, lower cost",
    modelId: "google/gemini-2.5-flash-lite",
    icon: "zap",
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "Balanced speed and quality",
    modelId: "anthropic/claude-sonnet-4.5",
    icon: "sparkles",
  },
  ultra: {
    id: "ultra",
    name: "Ultra",
    description: "Best quality, complex tasks",
    modelId: "anthropic/claude-opus-4.1",
    icon: "crown",
  },
} as const;

export const MODEL_TIER_LIST: ModelTierConfig[] = [
  MODEL_TIERS.fast,
  MODEL_TIERS.pro,
  MODEL_TIERS.ultra,
];

export const DEFAULT_MODEL_TIER: ModelTier = "pro";

/**
 * Gets the model ID for a given tier.
 *
 * @param tier - Model tier.
 * @returns Model ID string.
 */
export function getModelIdFromTier(tier: ModelTier): string {
  return MODEL_TIERS[tier]?.modelId ?? MODEL_TIERS[DEFAULT_MODEL_TIER].modelId;
}

/**
 * Gets the tier for a given model ID.
 *
 * @param modelId - Model ID string.
 * @returns Model tier or null if not found.
 */
export function getTierFromModelId(modelId: string): ModelTier | null {
  for (const [tier, config] of Object.entries(MODEL_TIERS)) {
    if (config.modelId === modelId) {
      return tier as ModelTier;
    }
  }
  return null;
}

/**
 * Type guard to check if a string is a valid model tier.
 *
 * @param tier - String to check.
 * @returns True if the string is a valid model tier.
 */
export function isValidModelTier(tier: string): tier is ModelTier {
  return tier in MODEL_TIERS;
}

export const STORAGE_KEY = "eliza-model-tier";

