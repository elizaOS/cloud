import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import type { QueueStatus } from "@fal-ai/client";
import { requireAuthOrApiKey } from "@/lib/auth";
import {
  usageService,
  creditsService,
  generationsService,
} from "@/lib/services";
import {
  VIDEO_GENERATION_COST,
  VIDEO_GENERATION_FALLBACK_COST,
} from "@/lib/pricing";
import { uploadFromUrl } from "@/lib/blob";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

fal.config({
  proxyUrl: "/api/fal/proxy",
});

export const maxDuration = 300;

interface VideoGenerationRequest {
  prompt: string;
  model?: string;
}

interface FalVideoData {
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
  timings?: Record<string, number>;
}

const VALID_MODELS = [
  "fal-ai/veo3",
  "fal-ai/veo3/fast",
  "fal-ai/kling-video/v2.1/master/text-to-video",
  "fal-ai/kling-video/v2.1/pro/text-to-video",
  "fal-ai/kling-video/v2.1/standard/text-to-video",
  "fal-ai/minimax/hailuo-02/standard/text-to-video",
  "fal-ai/minimax/hailuo-02/pro/text-to-video",
];

async function handlePOST(request: NextRequest) {
  let generationId: string | undefined;
  try {
    const { user, apiKey } = await requireAuthOrApiKey(request);

    if (!process.env.FAL_KEY) {
      console.error("[VIDEO GENERATION] FAL_KEY is not configured");
      return NextResponse.json(
        { error: "Video generation service is not configured" },
        { status: 503 },
      );
    }

    const body: VideoGenerationRequest = await request.json();
    const { prompt, model = "fal-ai/veo3" } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Prompt is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    if (model && !VALID_MODELS.includes(model)) {
      return NextResponse.json(
        {
          error: "Invalid model specified",
          validModels: VALID_MODELS,
        },
        { status: 400 },
      );
    }

    const generation = await generationsService.create({
      organization_id: user.organization_id,
      user_id: user.id,
      api_key_id: apiKey?.id || null,
      type: "video",
      model: model,
      provider: "fal",
      prompt: prompt.trim(),
      status: "pending",
      credits: String(VIDEO_GENERATION_COST),
      cost: String(VIDEO_GENERATION_COST),
    });

    generationId = generation.id;

    console.log(
      `[VIDEO GENERATION] Starting generation for user ${user.id}, model: ${model}`,
    );

    const result = await fal.subscribe(model, {
      input: {
        prompt: prompt.trim(),
      },
      logs: true,
      onQueueUpdate: (update: QueueStatus) => {
        if (update.status === "IN_PROGRESS") {
          const logMessages = update.logs
            ?.map((log: { message: string }) => log.message)
            .join(", ");
          console.log(
            `[VIDEO GENERATION] Progress: ${logMessages || "Processing..."}`,
          );
        }
      },
    });

    const data = result.data as FalVideoData;

    if (!data?.video?.url) {
      console.error("[VIDEO GENERATION] No video URL in response:", data);
      return NextResponse.json(
        { error: "No video URL was returned from the generation service" },
        { status: 500 },
      );
    }

    console.log(
      `[VIDEO GENERATION] Success for user ${user.id}, requestId: ${result.requestId}`,
    );

    // Upload video to Vercel Blob
    let blobUrl = data.video.url;
    let blobFileSize: bigint | null = data.video.file_size
      ? BigInt(data.video.file_size)
      : null;
    try {
      const fileExtension =
        data.video.content_type?.split("/")[1] ||
        data.video.file_name?.split(".").pop() ||
        "mp4";
      const blobResult = await uploadFromUrl(data.video.url, {
        filename: `${generationId}.${fileExtension}`,
        contentType: data.video.content_type || "video/mp4",
        folder: "videos",
        userId: user.id,
      });
      blobUrl = blobResult.url;
      blobFileSize = blobResult.size ? BigInt(blobResult.size) : null;
      console.log(
        `[VIDEO GENERATION] Uploaded to Vercel Blob: ${blobUrl} (${blobResult.size} bytes)`,
      );
    } catch (blobError) {
      console.error(
        "[VIDEO GENERATION] Failed to upload to Vercel Blob:",
        blobError,
      );
      // Continue with original URL as fallback
    }

    const deductionResult = await creditsService.deductCredits({
      organizationId: user.organization_id,
      amount: VIDEO_GENERATION_COST,
      description: `Video generation: ${model}`,
      metadata: { user_id: user.id },
    });

    // FIXED: Fail the request if credit deduction fails to prevent revenue leak
    if (!deductionResult.success) {
      console.error(
        "[VIDEO GENERATION] Failed to deduct credits - insufficient balance",
        {
          organizationId: user.organization_id,
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
        { status: 402 }, // Payment Required
      );
    }

    const usageRecord = await usageService.create({
      organization_id: user.organization_id,
      user_id: user.id,
      api_key_id: apiKey?.id || null,
      type: "video",
      model: model,
      provider: "fal",
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
            ...data.video,
            url: blobUrl,
          },
          originalUrl: data.video.url,
          seed: data.seed,
          has_nsfw_concepts: data.has_nsfw_concepts,
          timings: data.timings,
          requestId: result.requestId,
          blobUrl: blobUrl !== data.video.url ? blobUrl : undefined,
        },
      });
    }

    console.log(
      `[VIDEO GENERATION] Cost: $${VIDEO_GENERATION_COST.toFixed(2)}, New balance: $${deductionResult.newBalance.toFixed(2)}`,
    );

    return NextResponse.json(
      {
        video: {
          ...data.video,
          url: blobUrl,
        },
        originalUrl: data.video.url,
        seed: data.seed,
        has_nsfw_concepts: data.has_nsfw_concepts,
        timings: data.timings,
        requestId: result.requestId,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[VIDEO GENERATION] Error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    console.log("[VIDEO GENERATION] Returning fallback video due to error");

    try {
      const { user: fallbackUser, apiKey: fallbackApiKey } =
        await requireAuthOrApiKey(request);

      const fallbackDeduction = await creditsService.deductCredits({
        organizationId: fallbackUser.organization_id,
        amount: VIDEO_GENERATION_FALLBACK_COST,
        description: "Video generation (fallback): fal-ai/veo3",
        metadata: { user_id: fallbackUser.id },
      });

      if (!fallbackDeduction.success) {
        console.error(
          "[VIDEO GENERATION] Failed to deduct fallback credits - insufficient balance",
        );
      }

      const fallbackUsageRecord = await usageService.create({
        organization_id: fallbackUser.organization_id,
        user_id: fallbackUser.id,
        api_key_id: fallbackApiKey?.id || null,
        type: "video",
        model: "fal-ai/veo3",
        provider: "fal",
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
          storage_url:
            "https://v3.fal.media/files/zebra/P8u5qLXJrXF--Xm1Kix6j_output.mp4",
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
            video: {
              url: "https://v3.fal.media/files/zebra/P8u5qLXJrXF--Xm1Kix6j_output.mp4",
              content_type: "video/mp4",
              width: 1920,
              height: 1080,
            },
          },
        });
      }

      console.log(
        `[VIDEO GENERATION] Fallback cost: $${VIDEO_GENERATION_FALLBACK_COST.toFixed(2)}, New balance: $${fallbackDeduction.newBalance.toFixed(2)}`,
      );
    } catch (authError) {
      console.error(
        "[VIDEO GENERATION] Auth error during fallback logging:",
        authError,
      );
    }

    return NextResponse.json(
      {
        video: {
          url: "https://v3.fal.media/files/zebra/P8u5qLXJrXF--Xm1Kix6j_output.mp4",
          content_type: "video/mp4",
          width: 1920,
          height: 1080,
        },
        seed: Math.floor(Math.random() * 10000),
        has_nsfw_concepts: [false],
        timings: { fallback: 0 },
        requestId: `fallback_${Date.now()}`,
        isFallback: true,
        originalError: errorMessage,
      },
      { status: 200 },
    );
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.CRITICAL);
