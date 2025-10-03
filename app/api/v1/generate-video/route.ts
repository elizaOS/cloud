import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import type { QueueStatus } from "@fal-ai/client";
import { requireAuthOrApiKey } from "@/lib/auth";
import { createUsageRecord } from '@/lib/queries/usage';

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

export async function POST(request: NextRequest) {
  try {
    const { user, apiKey } = await requireAuthOrApiKey(request);

    if (!process.env.FAL_KEY) {
      console.error("[VIDEO GENERATION] FAL_KEY is not configured");
      return NextResponse.json(
        { error: "Video generation service is not configured" },
        { status: 503 }
      );
    }

    const body: VideoGenerationRequest = await request.json();
    const { prompt, model = "fal-ai/veo3" } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Prompt is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (model && !VALID_MODELS.includes(model)) {
      return NextResponse.json(
        {
          error: "Invalid model specified",
          validModels: VALID_MODELS
        },
        { status: 400 }
      );
    }

    console.log(`[VIDEO GENERATION] Starting generation for user ${user.id}, model: ${model}`);

    const result = await fal.subscribe(model, {
      input: {
        prompt: prompt.trim(),
      },
      logs: true,
      onQueueUpdate: (update: QueueStatus) => {
        if (update.status === "IN_PROGRESS") {
          const logMessages = update.logs?.map((log: { message: string }) => log.message).join(", ");
          console.log(`[VIDEO GENERATION] Progress: ${logMessages || "Processing..."}`);
        }
      },
    });

    const data = result.data as FalVideoData;

    if (!data?.video?.url) {
      console.error("[VIDEO GENERATION] No video URL in response:", data);
      return NextResponse.json(
        { error: "No video URL was returned from the generation service" },
        { status: 500 }
      );
    }

    console.log(`[VIDEO GENERATION] Success for user ${user.id}, requestId: ${result.requestId}`);

    await createUsageRecord({
      organization_id: user.organization_id,
      user_id: user.id,
      api_key_id: apiKey?.id || null,
      type: 'video',
      model: model,
      provider: 'fal',
      input_tokens: 0,
      output_tokens: 0,
      input_cost: 0,
      output_cost: 0,
      is_successful: true,
    });

    return NextResponse.json(
      {
        video: data.video,
        seed: data.seed,
        has_nsfw_concepts: data.has_nsfw_concepts,
        timings: data.timings,
        requestId: result.requestId,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[VIDEO GENERATION] Error:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

    console.log("[VIDEO GENERATION] Returning fallback video due to error");

    try {
      const { user: fallbackUser, apiKey: fallbackApiKey } = await requireAuthOrApiKey(request);
      await createUsageRecord({
        organization_id: fallbackUser.organization_id,
        user_id: fallbackUser.id,
        api_key_id: fallbackApiKey?.id || null,
        type: 'video',
        model: 'fal-ai/veo3',
        provider: 'fal',
        input_tokens: 0,
        output_tokens: 0,
        input_cost: 0,
        output_cost: 0,
        is_successful: false,
        error_message: errorMessage,
      });
    } catch (authError) {
      console.error('[VIDEO GENERATION] Auth error during fallback logging:', authError);
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
      { status: 200 }
    );
  }
}
