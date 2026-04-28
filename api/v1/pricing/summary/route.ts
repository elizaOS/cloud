/**
 * GET /api/v1/pricing/summary
 * Computed summary of live pricing across image / video / chat / TTS / STT /
 * voice-clone surfaces. Pulled from the AI pricing catalog.
 */

import { Hono } from "hono";

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
import { logger } from "@/lib/utils/logger";
import type { AppEnv } from "@/api-lib/context";
import { failureResponse } from "@/api-lib/errors";
import { rateLimit, RateLimitPresets } from "@/api-lib/rate-limit";

function buildRange(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value) && value > 0);
  return { min: Math.min(...valid), max: Math.max(...valid) };
}

async function safeCost<T>(
  fn: () => Promise<T>,
  label: string,
  warnings: string[],
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[PRICING SUMMARY] Failed to fetch ${label}: ${message}`);
    warnings.push(`${label}: ${message}`);
    return null;
  }
}

const app = new Hono<AppEnv>();

app.use("*", rateLimit(RateLimitPresets.STANDARD));

app.get("/", async (c) => {
  try {
    const warnings: string[] = [];

    const imageResults = await Promise.all(
      SUPPORTED_IMAGE_MODELS.map((model) =>
        safeCost(
          () =>
            calculateImageGenerationCostFromCatalog({
              model: model.modelId,
              provider: model.provider,
              imageCount: 1,
              dimensions: model.defaultDimensions,
            }),
          `image:${model.modelId}`,
          warnings,
        ),
      ),
    );
    const imageCosts = imageResults.map((v) => v?.totalCost ?? null).filter((v): v is number => v !== null);

    const videoResults = await Promise.all(
      SUPPORTED_VIDEO_MODELS.map((model) =>
        safeCost(
          () => {
            const defaults = getDefaultVideoBillingDimensions(model.modelId);
            return calculateVideoGenerationCostFromCatalog({
              model: model.modelId,
              durationSeconds: defaults.durationSeconds,
              dimensions: defaults.dimensions,
            });
          },
          `video:${model.modelId}`,
          warnings,
        ),
      ),
    );
    const videoCosts = videoResults.map((v) => v?.totalCost ?? null).filter((v): v is number => v !== null);

    const chatResults = await Promise.all(
      MODEL_TIER_LIST.map((tier) =>
        safeCost(
          () => calculateCost(tier.modelId, tier.provider, 1000, 0),
          `chat:${tier.modelId}`,
          warnings,
        ),
      ),
    );
    const chatInputCosts = chatResults.map((v) => v?.inputCost ?? null).filter((v): v is number => v !== null);

    const ttsResults = await Promise.all(
      ["elevenlabs/eleven_flash_v2_5", "elevenlabs/eleven_multilingual_v2"].map((model) =>
        safeCost(
          () => calculateTTSCostFromCatalog({ model, characterCount: 1000 }),
          `tts:${model}`,
          warnings,
        ),
      ),
    );
    const ttsCosts = ttsResults.map((v) => v?.totalCost ?? null).filter((v): v is number => v !== null);

    const sttResult = await safeCost(
      () => calculateSTTCostFromCatalog({ model: "elevenlabs/scribe_v1", durationSeconds: 60 }),
      "stt:scribe_v1",
      warnings,
    );

    const instantResult = await safeCost(
      () => calculateVoiceCloneCostFromCatalog({ cloneType: "instant" }),
      "voice_clone:instant",
      warnings,
    );

    const professionalResult = await safeCost(
      () => calculateVoiceCloneCostFromCatalog({ cloneType: "professional" }),
      "voice_clone:professional",
      warnings,
    );

    const pricing: Record<string, unknown> = {};

    if (imageCosts.length > 0) {
      pricing["generate-image"] = {
        unit: "image",
        isVariable: true,
        estimatedRange: buildRange(imageCosts),
        description: "Live image model pricing per generated image",
      };
    }
    if (videoCosts.length > 0) {
      pricing["generate-video"] = {
        unit: "video",
        isVariable: true,
        estimatedRange: buildRange(videoCosts),
        description: "Live video model pricing per default request",
      };
    }
    if (chatInputCosts.length > 0) {
      pricing["chat-completions"] = {
        unit: "1k tokens",
        isVariable: true,
        estimatedRange: buildRange(chatInputCosts),
        description: "Input-token pricing across current curated chat models",
      };
    }
    if (ttsCosts.length > 0) {
      pricing["voice-tts"] = {
        unit: "1k chars",
        isVariable: true,
        estimatedRange: buildRange(ttsCosts),
        description: "Live text-to-speech pricing per 1,000 characters",
      };
    }
    if (sttResult) {
      pricing["voice-stt"] = {
        unit: "minute",
        cost: sttResult.totalCost,
        description: "Live speech-to-text pricing per minute",
      };
    }
    if (instantResult && professionalResult) {
      pricing["voice-clone"] = {
        unit: "clone",
        isVariable: true,
        estimatedRange: {
          min: instantResult.totalCost,
          max: professionalResult.totalCost,
        },
        description: "Live voice cloning pricing by clone tier",
      };
    }

    return c.json({
      asOf: new Date().toISOString(),
      pricing,
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  } catch (error) {
    return failureResponse(c, error);
  }
});

export default app;
