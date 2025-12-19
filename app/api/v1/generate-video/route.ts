import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { fal } from "@fal-ai/client";
import type { QueueStatus } from "@fal-ai/client";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { usageService } from "@/lib/services/usage";
import { creditsService } from "@/lib/services/credits";
import { generationsService } from "@/lib/services/generations";
import {
  VIDEO_GENERATION_COST,
  VIDEO_GENERATION_FALLBACK_COST,
} from "@/lib/pricing";
import { uploadFromUrl, isExternalProviderUrl } from "@/lib/blob";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { stripProviderPrefix } from "@/lib/utils/model-names";

fal.config({
  proxyUrl: "/api/fal/proxy",
});

export const maxDuration = 300;

interface VideoGenerationRequest {
  prompt: string;
  model?: string;
}

interface VideoProviderResponse {
  video: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
    width?: number;
    height?: number;
  };
  seed?: number;
  has_nsfw_concepts?: boolean[];
  timings?: Record<string, number> | null;
  requestId?: string;
}

// Map user-facing model IDs (creator/model) to internal API IDs (reseller/model)
const INTERNAL_MODELS: Record<string, string> = {
  // Google Veo 3
  "google/veo3": "fal-ai/veo3",
  "google/veo3-fast": "fal-ai/veo3/fast",
  // Kuaishou Kling
  "kling/v2.1-master": "fal-ai/kling-video/v2.1/master/text-to-video",
  "kling/v2.1-pro": "fal-ai/kling-video/v2.1/pro/text-to-video",
  "kling/v2.1-standard": "fal-ai/kling-video/v2.1/standard/text-to-video",
  // MiniMax Hailuo
  "minimax/hailuo-standard": "fal-ai/minimax/hailuo-02/standard/text-to-video",
  "minimax/hailuo-pro": "fal-ai/minimax/hailuo-02/pro/text-to-video",
};

// User-facing model IDs (what users can request)
const VALID_MODELS = Object.keys(INTERNAL_MODELS);

/**
 * Resolves a user-provided model to internal API format.
 * Accepts both user-friendly IDs (veo3) and legacy format (fal-ai/veo3).
 */
function resolveModelId(
  model: string,
): { userModel: string; internalModel: string } | null {
  // Direct match with user-friendly ID
  if (INTERNAL_MODELS[model]) {
    return { userModel: model, internalModel: INTERNAL_MODELS[model] };
  }

  // Legacy format: strip prefix and check
  const stripped = stripProviderPrefix(model);
  if (INTERNAL_MODELS[stripped]) {
    return { userModel: stripped, internalModel: INTERNAL_MODELS[stripped] };
  }

  return null;
}

/**
 * POST /api/v1/generate-video
 * Generates videos using AI video generation models.
 * Requires authentication with organization.
 *
 * @param request - Request body with prompt and optional model selection.
 * @returns Video generation job details and status.
 */
async function handlePOST(request: NextRequest) {
  let generationId: string | undefined;
  try {
    const { user, apiKey, session_token } =
      await requireAuthOrApiKeyWithOrg(request);

    if (!process.env.FAL_KEY) {
      logger.error(
        "[VIDEO GENERATION] Video generation service not configured",
      );
      return NextResponse.json(
        { error: "Video generation service is not configured" },
        { status: 503 },
      );
    }

    const body: VideoGenerationRequest = await request.json();
    const { prompt, model = "google/veo3" } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Prompt is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    const resolved = resolveModelId(model);
    if (!resolved) {
      return NextResponse.json(
        {
          error: "Invalid model specified",
          validModels: VALID_MODELS,
        },
        { status: 400 },
      );
    }

    const { userModel, internalModel } = resolved;

    const generation = await generationsService.create({
      organization_id: user.organization_id!!,
      user_id: user.id,
      api_key_id: apiKey?.id || null,
      type: "video",
      model: userModel,
      provider: "video",
      prompt: prompt.trim(),
      status: "pending",
      credits: String(VIDEO_GENERATION_COST),
      cost: String(VIDEO_GENERATION_COST),
    });

    generationId = generation.id;

    const result = await fal.subscribe(internalModel, {
      input: {
        prompt: prompt.trim(),
      },
      logs: true,
    });

    const data = result.data as VideoProviderResponse;

    if (!data?.video?.url) {
      logger.error("[VIDEO GENERATION] No video URL in response");
      return NextResponse.json(
        { error: "No video URL was returned from the generation service" },
        { status: 500 },
      );
    }

    // Upload video to our storage (required - we don't expose external provider URLs)
    let blobUrl: string;
    let blobFileSize: bigint | null = null;

    const fileExtension =
      data.video.content_type?.split("/")[1] ||
      data.video.file_name?.split(".").pop() ||
      "mp4";

    try {
      // Always upload to our storage
      if (!isExternalProviderUrl(data.video.url)) {
        logger.warn("[VIDEO GENERATION] Unexpected URL source");
      }

      const uploadResult = await uploadFromUrl(data.video.url, {
        filename: `${generationId}.${fileExtension}`,
        contentType: data.video.content_type || "video/mp4",
        folder: "videos",
        userId: user.id,
      });

      blobUrl = uploadResult.url;
      blobFileSize = BigInt(uploadResult.size);
    } catch (blobError) {
      logger.error(
        "[VIDEO GENERATION] Failed to upload to storage:",
        blobError,
      );
      return NextResponse.json(
        { error: "Failed to store video. Please try again." },
        { status: 500 },
      );
    }

    const deductionResult = await creditsService.deductCredits({
      organizationId: user.organization_id!!,
      amount: VIDEO_GENERATION_COST,
      description: `Video generation: ${userModel}`,
      metadata: { user_id: user.id },
      session_token,
    });

    if (!deductionResult.success) {
      logger.error(
        "[VIDEO GENERATION] Failed to deduct credits - insufficient balance",
        {
          organizationId: user.organization_id!!,
          cost: String(VIDEO_GENERATION_COST),
          balance: deductionResult.newBalance,
        },
      );

      return NextResponse.json(
        {
          error: "Insufficient credits to complete video generation",
          required: VIDEO_GENERATION_COST,
          available: deductionResult.newBalance,
        },
        { status: 402 },
      );
    }

    const usageRecord = await usageService.create({
      organization_id: user.organization_id!!,
      user_id: user.id,
      api_key_id: apiKey?.id || null,
      type: "video",
      model: userModel,
      provider: "video",
      input_tokens: 0,
      output_tokens: 0,
      input_cost: String(VIDEO_GENERATION_COST),
      output_cost: String(0),
      is_successful: true,
    });

    if (generationId) {
      await generationsService.update(generationId, {
        status: "completed",
        storage_url: blobUrl,
        mime_type: data.video.content_type || "video/mp4",
        file_size: blobFileSize,
        dimensions: {
          width: data.video.width,
          height: data.video.height,
        },
        usage_record_id: usageRecord.id,
        completed_at: new Date(),
        result: {
          video: {
            url: blobUrl,
            content_type: data.video.content_type,
            width: data.video.width,
            height: data.video.height,
          },
          seed: data.seed,
          has_nsfw_concepts: data.has_nsfw_concepts,
          timings: data.timings,
          requestId: result.requestId,
        },
      });
    }

    return NextResponse.json(
      {
        video: {
          url: blobUrl,
          content_type: data.video.content_type,
          width: data.video.width,
          height: data.video.height,
          file_name: data.video.file_name,
          file_size: blobFileSize ? Number(blobFileSize) : undefined,
        },
        model: userModel,
        seed: data.seed,
        has_nsfw_concepts: data.has_nsfw_concepts,
        timings: data.timings,
        requestId: result.requestId,
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error("[VIDEO GENERATION] Error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    try {
      const {
        user: fallbackUser,
        apiKey: fallbackApiKey,
        session_token: fallbackSessionToken,
      } = await requireAuthOrApiKeyWithOrg(request);

      const fallbackDeduction = await creditsService.deductCredits({
        organizationId: fallbackUser.organization_id,
        amount: VIDEO_GENERATION_FALLBACK_COST,
        description: "Video generation (fallback)",
        metadata: { user_id: fallbackUser.id },
        session_token: fallbackSessionToken,
      });

      if (!fallbackDeduction.success) {
        logger.error(
          "[VIDEO GENERATION] Failed to deduct fallback credits - insufficient balance",
        );
      }

      const fallbackUsageRecord = await usageService.create({
        organization_id: fallbackUser.organization_id,
        user_id: fallbackUser.id,
        api_key_id: fallbackApiKey?.id || null,
        type: "video",
        model: "veo3",
        provider: "video",
        input_tokens: 0,
        output_tokens: 0,
        input_cost: String(VIDEO_GENERATION_FALLBACK_COST),
        output_cost: String(0),
        is_successful: false,
        error_message: errorMessage,
      });

      if (generationId) {
        await generationsService.update(generationId, {
          status: "failed",
          error: errorMessage,
          storage_url: null,
          mime_type: "video/mp4",
          dimensions: {
            width: 1920,
            height: 1080,
          },
          credits: String(VIDEO_GENERATION_FALLBACK_COST),
          cost: String(VIDEO_GENERATION_FALLBACK_COST),
          usage_record_id: fallbackUsageRecord.id,
          completed_at: new Date(),
          result: {
            isFallback: true,
            originalError: errorMessage,
            video: null,
          },
        });
      }
    } catch (authError) {
      logger.error(
        "[VIDEO GENERATION] Auth error during fallback logging:",
        authError,
      );
    }

    return NextResponse.json(
      {
        error: "Video generation failed. Please try again.",
        isFallback: true,
        originalError: errorMessage,
      },
      { status: 500 },
    );
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.CRITICAL);
