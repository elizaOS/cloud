import { NextResponse } from "next/server";
import { MODEL_TIER_LIST } from "@/lib/models/model-tiers";
import { calculateCost } from "@/lib/pricing";
import {
  calculateImageGenerationCostFromCatalog,
  calculateSTTCostFromCatalog,
  calculateTTSCostFromCatalog,
  calculateVideoGenerationCostFromCatalog,
  calculateVoiceCloneCostFromCatalog,
  getDefaultVideoBillingDimensions,
} from "@/lib/services/ai-pricing";
import {
  SUPPORTED_IMAGE_MODELS,
  SUPPORTED_VIDEO_MODELS,
} from "@/lib/services/ai-pricing-definitions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function buildRange(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value) && value > 0);
  return {
    min: Math.min(...valid),
    max: Math.max(...valid),
  };
}

export async function GET() {
  const imageCosts = await Promise.all(
    SUPPORTED_IMAGE_MODELS.map(async (model) => {
      const cost = await calculateImageGenerationCostFromCatalog({
        model: model.modelId,
        provider: model.provider,
        imageCount: 1,
        dimensions: model.defaultDimensions,
      });
      return cost.totalCost;
    }),
  );

  const videoCosts = await Promise.all(
    SUPPORTED_VIDEO_MODELS.map(async (model) => {
      const defaults = getDefaultVideoBillingDimensions(model.modelId);
      const cost = await calculateVideoGenerationCostFromCatalog({
        model: model.modelId,
        durationSeconds: defaults.durationSeconds,
        dimensions: defaults.dimensions,
      });
      return cost.totalCost;
    }),
  );

  const chatInputCosts = await Promise.all(
    MODEL_TIER_LIST.map(async (tier) => {
      const provider = tier.provider;
      const breakdown = await calculateCost(tier.modelId, provider, 1000, 0);
      return breakdown.inputCost;
    }),
  );

  const ttsCosts = await Promise.all(
    ["elevenlabs/eleven_flash_v2_5", "elevenlabs/eleven_multilingual_v2"].map(async (model) => {
      const cost = await calculateTTSCostFromCatalog({ model, characterCount: 1000 });
      return cost.totalCost;
    }),
  );

  const sttCost = await calculateSTTCostFromCatalog({
    model: "elevenlabs/scribe_v1",
    durationSeconds: 60,
  });
  const instantClone = await calculateVoiceCloneCostFromCatalog({ cloneType: "instant" });
  const professionalClone = await calculateVoiceCloneCostFromCatalog({
    cloneType: "professional",
  });

  return NextResponse.json({
    asOf: new Date().toISOString(),
    pricing: {
      "generate-image": {
        unit: "image",
        isVariable: true,
        estimatedRange: await buildRange(imageCosts),
        description: "Live image model pricing per generated image",
      },
      "generate-video": {
        unit: "video",
        isVariable: true,
        estimatedRange: await buildRange(videoCosts),
        description: "Live video model pricing per default request",
      },
      "chat-completions": {
        unit: "1k tokens",
        isVariable: true,
        estimatedRange: await buildRange(chatInputCosts),
        description: "Input-token pricing across current curated chat models",
      },
      "voice-tts": {
        unit: "1k chars",
        isVariable: true,
        estimatedRange: await buildRange(ttsCosts),
        description: "Live text-to-speech pricing per 1,000 characters",
      },
      "voice-stt": {
        unit: "minute",
        cost: sttCost.totalCost,
        description: "Live speech-to-text pricing per minute",
      },
      "voice-clone": {
        unit: "clone",
        isVariable: true,
        estimatedRange: {
          min: instantClone.totalCost,
          max: professionalClone.totalCost,
        },
        description: "Live voice cloning pricing by clone tier",
      },
    },
  });
}
