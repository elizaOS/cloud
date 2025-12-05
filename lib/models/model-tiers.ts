export type ModelTier = "fast" | "pro" | "ultra";

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

export function getModelIdFromTier(tier: ModelTier): string {
  return MODEL_TIERS[tier]?.modelId ?? MODEL_TIERS[DEFAULT_MODEL_TIER].modelId;
}

export function getTierFromModelId(modelId: string): ModelTier | null {
  for (const [tier, config] of Object.entries(MODEL_TIERS)) {
    if (config.modelId === modelId) {
      return tier as ModelTier;
    }
  }
  return null;
}

export function isValidModelTier(tier: string): tier is ModelTier {
  return tier in MODEL_TIERS;
}

export const STORAGE_KEY = "eliza-model-tier";

