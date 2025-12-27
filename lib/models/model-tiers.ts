// Model tier configuration. Override via MODEL_TIER_FAST_ID, MODEL_TIER_PRO_ID, MODEL_TIER_ULTRA_ID

export type ModelTier = "fast" | "pro" | "ultra";

export type ModelCapability =
  | "text"
  | "code"
  | "reasoning"
  | "vision"
  | "function_calling"
  | "long_context";

export interface ModelPricing {
  inputPer1k: number;
  outputPer1k: number;
  currency: "USD";
}

export interface ModelTierConfig {
  id: ModelTier;
  name: string;
  description: string;
  modelId: string;
  provider: string;
  icon: "zap" | "sparkles" | "crown";
  pricing: ModelPricing;
  capabilities: ModelCapability[];
  contextWindow: number;
  recommended?: boolean;
}

function getEnvModelId(tier: ModelTier, defaultId: string): string {
  const envKey = `MODEL_TIER_${tier.toUpperCase()}_ID`;
  return process.env[envKey] || defaultId;
}

function extractProvider(modelId: string): string {
  if (modelId.includes("/")) {
    return modelId.split("/")[0];
  }
  if (modelId.startsWith("gpt-")) return "openai";
  if (modelId.startsWith("claude-")) return "anthropic";
  if (modelId.startsWith("gemini-")) return "google";
  if (modelId.startsWith("grok-")) return "xai";
  if (modelId.startsWith("command-")) return "cohere";
  if (modelId.startsWith("jamba-") || modelId.startsWith("jurassic-"))
    return "ai21";
  if (modelId.startsWith("deepseek-")) return "deepseek";
  if (modelId.startsWith("llama")) return "meta";
  if (modelId.startsWith("qwen-")) return "alibaba";
  return "openai";
}

const FAST_MODEL_ID = getEnvModelId("fast", "openai/gpt-oss-120b");
const PRO_MODEL_ID = getEnvModelId("pro", "anthropic/claude-haiku-4.5");
const ULTRA_MODEL_ID = getEnvModelId("ultra", "anthropic/claude-sonnet-4.5");

export const MODEL_TIERS: Record<ModelTier, ModelTierConfig> = {
  fast: {
    id: "fast",
    name: "Fast",
    description: "Ultra-fast and cheap (Gemini 2.0 Flash)",
    modelId: FAST_MODEL_ID,
    provider: extractProvider(FAST_MODEL_ID),
    icon: "zap",
    pricing: {
      // Gemini 2.0 Flash: ~$0.10/$0.40 per 1M tokens
      inputPer1k: 0.0001,
      outputPer1k: 0.0004,
      currency: "USD",
    },
    capabilities: ["text", "code", "vision", "function_calling"],
    contextWindow: 1000000,
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "Balanced speed and quality (Claude Haiku 4.5)",
    modelId: PRO_MODEL_ID,
    provider: extractProvider(PRO_MODEL_ID),
    icon: "sparkles",
    pricing: {
      inputPer1k: 0.001,
      outputPer1k: 0.005,
      currency: "USD",
    },
    capabilities: [
      "text",
      "code",
      "reasoning",
      "vision",
      "function_calling",
      "long_context",
    ],
    contextWindow: 128000,
    recommended: true,
  },
  ultra: {
    id: "ultra",
    name: "Ultra",
    description: "Best quality for complex tasks (Claude Sonnet 4.5)",
    modelId: ULTRA_MODEL_ID,
    provider: extractProvider(ULTRA_MODEL_ID),
    icon: "crown",
    pricing: {
      // Claude Sonnet 4: $3/$15 per 1M tokens
      inputPer1k: 0.003,
      outputPer1k: 0.015,
      currency: "USD",
    },
    capabilities: [
      "text",
      "code",
      "reasoning",
      "vision",
      "function_calling",
      "long_context",
    ],
    contextWindow: 200000,
  },
} as const;

export const MODEL_TIER_LIST: ModelTierConfig[] = [
  MODEL_TIERS.fast,
  MODEL_TIERS.pro,
  MODEL_TIERS.ultra,
];

/**
 * Additional models available in "More models" submenu.
 * Maps to ALLOWED_CHAT_MODELS from config.ts
 */
export interface AdditionalModel {
  id: string;
  name: string;
  description: string;
  modelId: string;
  provider: string;
}

export const ADDITIONAL_MODELS: AdditionalModel[] = [
  // Moonshot AI
  { id: "kimi-k2", name: "Kimi K2", description: "Fast & capable", modelId: "moonshotai/kimi-k2-0905", provider: "moonshot" },
  { id: "kimi-k2-turbo", name: "Kimi K2 Turbo", description: "Extra speed", modelId: "moonshotai/kimi-k2-turbo", provider: "moonshot" },
  // OpenAI
  { id: "gpt-5", name: "GPT-5", description: "Most capable OpenAI", modelId: "openai/gpt-5", provider: "openai" },
  { id: "gpt-5-mini", name: "GPT-5 Mini", description: "Fast & affordable", modelId: "openai/gpt-5-mini", provider: "openai" },
  // Anthropic
  { id: "claude-opus", name: "Claude Opus 4.1", description: "Most powerful", modelId: "anthropic/claude-opus-4.1", provider: "anthropic" },
  // Google
  { id: "gemini-flash-lite", name: "Gemini 2.5 Flash Lite", description: "Fastest option", modelId: "google/gemini-2.5-flash-lite", provider: "google" },
  { id: "gemini-flash", name: "Gemini 2.5 Flash", description: "Fast & smart", modelId: "google/gemini-2.5-flash", provider: "google" },
  { id: "gemini-pro", name: "Gemini 3 Pro", description: "Advanced reasoning", modelId: "google/gemini-3-pro-preview", provider: "google" },
  // DeepSeek
  { id: "deepseek-v3", name: "DeepSeek V3.2", description: "Open & powerful", modelId: "deepseek/deepseek-v3.2-exp", provider: "deepseek" },
  { id: "deepseek-r1", name: "DeepSeek R1", description: "Reasoning model", modelId: "deepseek/deepseek-r1", provider: "deepseek" },
];

/**
 * Build mode tiers - uses more capable models for character building tasks.
 * The fast tier uses a better model since gpt-oss can't handle complex build instructions.
 */
export const BUILD_MODE_TIERS: Record<ModelTier, ModelTierConfig> = {
  fast: {
    ...MODEL_TIERS.fast,
    modelId: "moonshotai/kimi-k2-0905",
    provider: "moonshotai",
    description: "Fast responses for build mode",
  },
  pro: {
    ...MODEL_TIERS.pro,
    recommended: true,
  },
  ultra: MODEL_TIERS.ultra,
};

export const BUILD_MODE_TIER_LIST: ModelTierConfig[] = [
  BUILD_MODE_TIERS.fast,
  BUILD_MODE_TIERS.pro,
  BUILD_MODE_TIERS.ultra,
];

export const DEFAULT_MODEL_TIER: ModelTier = "pro";

export function resolveModel(tierOrModelId?: string | null): ModelTierConfig {
  if (!tierOrModelId) {
    return MODEL_TIERS[DEFAULT_MODEL_TIER];
  }

  if (isValidModelTier(tierOrModelId)) {
    return MODEL_TIERS[tierOrModelId];
  }

  const tierFromModel = getTierFromModelId(tierOrModelId);
  if (tierFromModel) {
    return MODEL_TIERS[tierFromModel];
  }

  return {
    ...MODEL_TIERS[DEFAULT_MODEL_TIER],
    modelId: tierOrModelId,
    provider: extractProvider(tierOrModelId),
    name: "Custom",
    description: tierOrModelId,
  };
}

export function getModelIdFromTier(tier: ModelTier): string {
  return MODEL_TIERS[tier]?.modelId ?? MODEL_TIERS[DEFAULT_MODEL_TIER].modelId;
}

export function getTierFromModelId(modelId: string): ModelTier | null {
  for (const [tier, config] of Object.entries(MODEL_TIERS)) {
    if (config.modelId === modelId) return tier as ModelTier;
  }
  return null;
}

export function isValidModelTier(tier: string): tier is ModelTier {
  return tier in MODEL_TIERS;
}

export function estimateTierCost(
  tier: ModelTier,
  inputTokens: number,
  outputTokens: number,
): number {
  const { pricing } = MODEL_TIERS[tier];
  return (
    Math.ceil(
      ((inputTokens / 1000) * pricing.inputPer1k +
        (outputTokens / 1000) * pricing.outputPer1k) *
        100,
    ) / 100
  );
}

export function tierHasCapability(
  tier: ModelTier,
  capability: ModelCapability,
): boolean {
  return MODEL_TIERS[tier].capabilities.includes(capability);
}

export function getTiersWithCapability(
  capability: ModelCapability,
): ModelTier[] {
  return MODEL_TIER_LIST.filter((c) => c.capabilities.includes(capability)).map(
    (c) => c.id,
  );
}

export function getTierDisplayInfo(tier: ModelTier) {
  const config = MODEL_TIERS[tier];
  return {
    name: config.name,
    modelId: config.modelId,
    description: config.description,
    priceIndicator:
      tier === "fast" ? "$" : tier === "pro" ? "$$" : ("$$$" as const),
  };
}

export const STORAGE_KEY = "eliza-model-tier";
