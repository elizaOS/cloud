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

async function safeCost<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<{ value: T | null; error: string | null }> {
  try {
    return { value: await fn(), error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[PRICING SUMMARY] Failed to fetch ${label}: ${message}`);
    return { value: null, error: message };
  }
}

export async function GET() {
  const warnings: string[] = [];

  const imageResults = await Promise.all(
    SUPPORTED_IMAGE_MODELS.map(async (model) => {
      const result = await safeCost(
        () =>
          calculateImageGenerationCostFromCatalog({
            model: model.modelId,
            provider: model.provider,
            imageCount: 1,
            dimensions: model.defaultDimensions,
          }),
        `image:${model.modelId}`,
      );
      if (result.error) warnings.push(`image:${model.modelId}: ${result.error}`);
      return result.value?.totalCost ?? null;
    }),
  );
  const imageCosts = imageResults.filter((v): v is number => v !== null);

  const videoResults = await Promise.all(
    SUPPORTED_VIDEO_MODELS.map(async (model) => {
      const result = await safeCost(() => {
        const defaults = getDefaultVideoBillingDimensions(model.modelId);
        return calculateVideoGenerationCostFromCatalog({
          model: model.modelId,
          durationSeconds: defaults.durationSeconds,
          dimensions: defaults.dimensions,
        });
      }, `video:${model.modelId}`);
      if (result.error) warnings.push(`video:${model.modelId}: ${result.error}`);
      return result.value?.totalCost ?? null;
    }),
  );
  const videoCosts = videoResults.filter((v): v is number => v !== null);

  const chatResults = await Promise.all(
    MODEL_TIER_LIST.map(async (tier) => {
      const result = await safeCost(
        () => calculateCost(tier.modelId, tier.provider, 1000, 0),
        `chat:${tier.modelId}`,
      );
      if (result.error) warnings.push(`chat:${tier.modelId}: ${result.error}`);
      return result.value?.inputCost ?? null;
    }),
  );
  const chatInputCosts = chatResults.filter((v): v is number => v !== null);

  const ttsResults = await Promise.all(
    ["elevenlabs/eleven_flash_v2_5", "elevenlabs/eleven_multilingual_v2"].map(async (model) => {
      const result = await safeCost(
        () => calculateTTSCostFromCatalog({ model, characterCount: 1000 }),
        `tts:${model}`,
      );
      if (result.error) warnings.push(`tts:${model}: ${result.error}`);
      return result.value?.totalCost ?? null;
    }),
  );
  const ttsCosts = ttsResults.filter((v): v is number => v !== null);

  const sttResult = await safeCost(
    () => calculateSTTCostFromCatalog({ model: "elevenlabs/scribe_v1", durationSeconds: 60 }),
    "stt:scribe_v1",
  );
  if (sttResult.error) warnings.push(`stt:scribe_v1: ${sttResult.error}`);

  const instantResult = await safeCost(
    () => calculateVoiceCloneCostFromCatalog({ cloneType: "instant" }),
    "voice_clone:instant",
  );
  if (instantResult.error) warnings.push(`voice_clone:instant: ${instantResult.error}`);

  const professionalResult = await safeCost(
    () => calculateVoiceCloneCostFromCatalog({ cloneType: "professional" }),
    "voice_clone:professional",
  );
  if (professionalResult.error)
    warnings.push(`voice_clone:professional: ${professionalResult.error}`);

  const pricing: Record<string, unknown> = {};

  if (imageCosts.length > 0) {
    pricing["generate-image"] = {
      unit: "image",
      isVariable: true,
      estimatedRange: await buildRange(imageCosts),
      description: "Live image model pricing per generated image",
    };
  }

  if (videoCosts.length > 0) {
    pricing["generate-video"] = {
      unit: "video",
      isVariable: true,
      estimatedRange: await buildRange(videoCosts),
      description: "Live video model pricing per default request",
    };
  }

  if (chatInputCosts.length > 0) {
    pricing["chat-completions"] = {
      unit: "1k tokens",
      isVariable: true,
      estimatedRange: await buildRange(chatInputCosts),
      description: "Input-token pricing across current curated chat models",
    };
  }

  if (ttsCosts.length > 0) {
    pricing["voice-tts"] = {
      unit: "1k chars",
      isVariable: true,
      estimatedRange: await buildRange(ttsCosts),
      description: "Live text-to-speech pricing per 1,000 characters",
    };
  }

  if (sttResult.value) {
    pricing["voice-stt"] = {
      unit: "minute",
      cost: sttResult.value.totalCost,
      description: "Live speech-to-text pricing per minute",
    };
  }

  if (instantResult.value && professionalResult.value) {
    pricing["voice-clone"] = {
      unit: "clone",
      isVariable: true,
      estimatedRange: {
        min: instantResult.value.totalCost,
        max: professionalResult.value.totalCost,
      },
      description: "Live voice cloning pricing by clone tier",
    };
  }

  return NextResponse.json({
    asOf: new Date().toISOString(),
    pricing,
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}
