export type PricingProductFamily =
  | "language"
  | "embedding"
  | "image"
  | "video"
  | "tts"
  | "stt"
  | "voice_clone";

export type PricingBillingSource =
  | "gateway"
  | "openrouter"
  | "groq"
  | "openai"
  | "fal"
  | "elevenlabs";

export type PricingChargeUnit =
  | "token"
  | "image"
  | "request"
  | "second"
  | "minute"
  | "hour"
  | "character"
  | "1k_requests";

export interface SupportedImageModelDefinition {
  modelId: string;
  provider: string;
  billingSource: "gateway";
  label: string;
  sourceUrl: string;
  defaultDimensions?: Record<string, string | number | boolean | null>;
}

export interface SupportedVideoModelDefinition {
  modelId: string;
  provider: "fal";
  billingSource: "fal";
  label: string;
  pageUrl: string;
  pricingParser:
    | "veo"
    | "veo31"
    | "veo31lite"
    | "kling"
    | "hailuo_standard"
    | "hailuo_pro"
    | "wan"
    | "pixverse"
    | "seedance";
  defaultParameters: {
    durationSeconds: number;
    resolution?: string;
    audio?: boolean;
    voiceControl?: boolean;
  };
}

export interface ElevenLabsSnapshotEntry {
  modelId: string;
  provider: "elevenlabs";
  billingSource: "elevenlabs";
  productFamily: Exclude<
    PricingProductFamily,
    "language" | "embedding" | "image" | "video"
  >;
  chargeType: string;
  unit: PricingChargeUnit;
  unitPrice: number;
  sourceUrl: string;
  dimensions?: Record<string, string | number | boolean | null>;
  metadata?: Record<string, unknown>;
}

export const SUPPORTED_IMAGE_MODELS: SupportedImageModelDefinition[] = [
  {
    modelId: "google/gemini-2.5-flash-image",
    provider: "google",
    billingSource: "gateway",
    label: "Gemini 2.5 Flash Image",
    sourceUrl: "https://ai-gateway.vercel.sh/v1/models",
    defaultDimensions: { size: "default" },
  },
  {
    modelId: "google/gemini-3-pro-image",
    provider: "google",
    billingSource: "gateway",
    label: "Gemini 3 Pro Image",
    sourceUrl: "https://ai-gateway.vercel.sh/v1/models",
    defaultDimensions: { size: "default" },
  },
  {
    modelId: "google/gemini-3.1-flash-image-preview",
    provider: "google",
    billingSource: "gateway",
    label: "Gemini 3.1 Flash Image Preview",
    sourceUrl: "https://ai-gateway.vercel.sh/v1/models",
    defaultDimensions: { size: "default" },
  },
  {
    modelId: "bfl/flux-kontext-max",
    provider: "bfl",
    billingSource: "gateway",
    label: "FLUX Kontext Max",
    sourceUrl: "https://ai-gateway.vercel.sh/v1/models",
  },
] as const;

export const SUPPORTED_VIDEO_MODELS: SupportedVideoModelDefinition[] = [
  {
    modelId: "fal-ai/veo3",
    provider: "fal",
    billingSource: "fal",
    label: "Veo 3",
    pageUrl: "https://fal.ai/models/fal-ai/veo3",
    pricingParser: "veo",
    defaultParameters: {
      durationSeconds: 8,
      audio: true,
    },
  },
  {
    modelId: "fal-ai/veo3/fast",
    provider: "fal",
    billingSource: "fal",
    label: "Veo 3 Fast",
    pageUrl: "https://fal.ai/models/fal-ai/veo3/fast",
    pricingParser: "veo",
    defaultParameters: {
      durationSeconds: 8,
      audio: true,
    },
  },
  {
    modelId: "fal-ai/veo3.1",
    provider: "fal",
    billingSource: "fal",
    label: "Veo 3.1",
    pageUrl: "https://fal.ai/models/fal-ai/veo3.1",
    pricingParser: "veo31",
    defaultParameters: {
      durationSeconds: 8,
      resolution: "720p",
      audio: true,
    },
  },
  {
    modelId: "fal-ai/veo3.1/fast",
    provider: "fal",
    billingSource: "fal",
    label: "Veo 3.1 Fast",
    pageUrl: "https://fal.ai/models/fal-ai/veo3.1/fast",
    pricingParser: "veo31",
    defaultParameters: {
      durationSeconds: 8,
      resolution: "720p",
      audio: true,
    },
  },
  {
    modelId: "fal-ai/veo3.1/lite",
    provider: "fal",
    billingSource: "fal",
    label: "Veo 3.1 Lite",
    pageUrl: "https://fal.ai/models/fal-ai/veo3.1/lite",
    pricingParser: "veo31lite",
    defaultParameters: {
      durationSeconds: 8,
      resolution: "720p",
      audio: true,
    },
  },
  {
    modelId: "fal-ai/kling-video/v3/standard/text-to-video",
    provider: "fal",
    billingSource: "fal",
    label: "Kling 3 Standard",
    pageUrl:
      "https://fal.ai/models/fal-ai/kling-video/v3/standard/text-to-video",
    pricingParser: "kling",
    defaultParameters: {
      durationSeconds: 5,
      audio: false,
      voiceControl: false,
    },
  },
  {
    modelId: "fal-ai/kling-video/v3/pro/text-to-video",
    provider: "fal",
    billingSource: "fal",
    label: "Kling 3 Pro",
    pageUrl: "https://fal.ai/models/fal-ai/kling-video/v3/pro/text-to-video",
    pricingParser: "kling",
    defaultParameters: {
      durationSeconds: 5,
      audio: false,
      voiceControl: false,
    },
  },
  {
    modelId: "fal-ai/kling-video/v2.6/pro/text-to-video",
    provider: "fal",
    billingSource: "fal",
    label: "Kling 2.6 Pro",
    pageUrl: "https://fal.ai/models/fal-ai/kling-video/v2.6/pro/text-to-video",
    pricingParser: "kling",
    defaultParameters: {
      durationSeconds: 5,
      audio: false,
      voiceControl: false,
    },
  },
  {
    modelId: "fal-ai/minimax/hailuo-2.3/standard/text-to-video",
    provider: "fal",
    billingSource: "fal",
    label: "Hailuo 2.3 Standard",
    pageUrl:
      "https://fal.ai/models/fal-ai/minimax/hailuo-2.3/standard/text-to-video",
    pricingParser: "hailuo_standard",
    defaultParameters: {
      durationSeconds: 6,
    },
  },
  {
    modelId: "fal-ai/minimax/hailuo-2.3/pro/text-to-video",
    provider: "fal",
    billingSource: "fal",
    label: "Hailuo 2.3 Pro",
    pageUrl:
      "https://fal.ai/models/fal-ai/minimax/hailuo-2.3/pro/text-to-video",
    pricingParser: "hailuo_pro",
    defaultParameters: {
      durationSeconds: 6,
    },
  },
  {
    modelId: "wan/v2.6/text-to-video",
    provider: "fal",
    billingSource: "fal",
    label: "Wan 2.6",
    pageUrl: "https://fal.ai/models/wan/v2.6/text-to-video",
    pricingParser: "wan",
    defaultParameters: {
      durationSeconds: 5,
      resolution: "720p",
    },
  },
  {
    modelId: "fal-ai/pixverse/v5/text-to-video",
    provider: "fal",
    billingSource: "fal",
    label: "PixVerse 5",
    pageUrl: "https://fal.ai/models/fal-ai/pixverse/v5/text-to-video",
    pricingParser: "pixverse",
    defaultParameters: {
      durationSeconds: 5,
      resolution: "720p",
      audio: false,
    },
  },
  {
    modelId: "fal-ai/pixverse/v5.5/text-to-video",
    provider: "fal",
    billingSource: "fal",
    label: "PixVerse 5.5",
    pageUrl: "https://fal.ai/models/fal-ai/pixverse/v5.5/text-to-video",
    pricingParser: "pixverse",
    defaultParameters: {
      durationSeconds: 5,
      resolution: "720p",
      audio: false,
    },
  },
  {
    modelId: "fal-ai/pixverse/v5.6/text-to-video",
    provider: "fal",
    billingSource: "fal",
    label: "PixVerse 5.6",
    pageUrl: "https://fal.ai/models/fal-ai/pixverse/v5.6/text-to-video",
    pricingParser: "pixverse",
    defaultParameters: {
      durationSeconds: 5,
      resolution: "720p",
      audio: false,
    },
  },
] as const;

export const ELEVENLABS_SNAPSHOT_PRICING: ElevenLabsSnapshotEntry[] = [
  {
    modelId: "elevenlabs/eleven_flash_v2_5",
    provider: "elevenlabs",
    billingSource: "elevenlabs",
    productFamily: "tts",
    chargeType: "generation",
    unit: "character",
    unitPrice: 0.00005,
    sourceUrl: "https://elevenlabs.io/pricing/api",
    metadata: {
      tier: "business_snapshot",
      note: "Published marginal API rate snapshot for Flash/Turbo-class models",
    },
  },
  {
    modelId: "elevenlabs/eleven_turbo_v2_5",
    provider: "elevenlabs",
    billingSource: "elevenlabs",
    productFamily: "tts",
    chargeType: "generation",
    unit: "character",
    unitPrice: 0.00005,
    sourceUrl: "https://elevenlabs.io/pricing/api",
    metadata: {
      tier: "business_snapshot",
      note: "Published marginal API rate snapshot for Flash/Turbo-class models",
    },
  },
  {
    modelId: "elevenlabs/eleven_multilingual_v2",
    provider: "elevenlabs",
    billingSource: "elevenlabs",
    productFamily: "tts",
    chargeType: "generation",
    unit: "character",
    unitPrice: 0.0001,
    sourceUrl: "https://elevenlabs.io/pricing/api",
    metadata: {
      tier: "business_snapshot",
      note: "Published marginal API rate snapshot for Multilingual-class models",
    },
  },
  {
    modelId: "elevenlabs/eleven_v3",
    provider: "elevenlabs",
    billingSource: "elevenlabs",
    productFamily: "tts",
    chargeType: "generation",
    unit: "character",
    unitPrice: 0.0001,
    sourceUrl: "https://elevenlabs.io/pricing/api",
    metadata: {
      tier: "business_snapshot",
      note: "Published marginal API rate snapshot for advanced multilingual models",
    },
  },
  {
    modelId: "elevenlabs/scribe_v1",
    provider: "elevenlabs",
    billingSource: "elevenlabs",
    productFamily: "stt",
    chargeType: "generation",
    unit: "hour",
    unitPrice: 0.22,
    sourceUrl: "https://elevenlabs.io/pricing/api",
    metadata: {
      tier: "business_snapshot",
      note: "Published marginal API rate snapshot for speech-to-text",
    },
  },
  {
    modelId: "elevenlabs/scribe_v2",
    provider: "elevenlabs",
    billingSource: "elevenlabs",
    productFamily: "stt",
    chargeType: "generation",
    unit: "hour",
    unitPrice: 0.22,
    sourceUrl: "https://elevenlabs.io/pricing/api",
    metadata: {
      tier: "business_snapshot",
      note: "Published marginal API rate snapshot for speech-to-text",
    },
  },
  {
    modelId: "elevenlabs/instant",
    provider: "elevenlabs",
    billingSource: "elevenlabs",
    productFamily: "voice_clone",
    chargeType: "generation",
    unit: "request",
    unitPrice: 0.42,
    sourceUrl: "https://elevenlabs.io/pricing/api",
    metadata: {
      tier: "manual_override_required",
      note: "Voice cloning does not expose a clean marginal API rate; override this if your account cost differs.",
    },
  },
  {
    modelId: "elevenlabs/professional",
    provider: "elevenlabs",
    billingSource: "elevenlabs",
    productFamily: "voice_clone",
    chargeType: "generation",
    unit: "request",
    unitPrice: 1.67,
    sourceUrl: "https://elevenlabs.io/pricing/api",
    metadata: {
      tier: "manual_override_required",
      note: "Voice cloning does not expose a clean marginal API rate; override this if your account cost differs.",
    },
  },
] as const;

export const SUPPORTED_VIDEO_MODEL_IDS = SUPPORTED_VIDEO_MODELS.map(
  (model) => model.modelId,
);
export const SUPPORTED_IMAGE_MODEL_IDS = SUPPORTED_IMAGE_MODELS.map(
  (model) => model.modelId,
);

export function getSupportedVideoModelDefinition(modelId: string) {
  return SUPPORTED_VIDEO_MODELS.find((model) => model.modelId === modelId);
}

export function getSupportedImageModelDefinition(modelId: string) {
  return SUPPORTED_IMAGE_MODELS.find((model) => model.modelId === modelId);
}
