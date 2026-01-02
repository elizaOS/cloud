import type { Metadata } from "next";

import { VideoPageClient } from "@/components/video/video-page-client";
import type { GeneratedVideo, VideoModelOption } from "@/components/video/types";
import { generatePageMetadata, ROUTE_METADATA } from "@/lib/seo";
import { listUserMedia } from "@/app/actions/gallery";

export const dynamic = "force-dynamic";

export const metadata: Metadata = generatePageMetadata({
  ...ROUTE_METADATA.videoGeneration,
  path: "/dashboard/video",
  noIndex: true,
});

const modelPresets: VideoModelOption[] = [
  {
    id: "fal-ai/veo3",
    label: "Google Veo 3",
    description:
      "State-of-the-art video generation with 1080p quality and audio support.",
    durationEstimate: "5-10s",
    dimensions: "1920 × 1080",
  },
  {
    id: "fal-ai/kling-video/v2.1/master/text-to-video",
    label: "Kling 2.1 Master",
    description:
      "Top-tier text-to-video with unparalleled motion fluidity and cinematic visuals.",
    durationEstimate: "5-10s",
    dimensions: "1920 × 1080",
  },
  {
    id: "fal-ai/minimax/hailuo-02/standard/text-to-video",
    label: "MiniMax Hailuo-02 Standard",
    description: "Cost-effective video generation with 768p resolution.",
    durationEstimate: "6-10s",
    dimensions: "1280 × 768",
  },
];

/**
 * Video Generation page for creating AI-generated videos.
 * Displays model presets and recent video history.
 *
 * @returns The rendered video generation page client component.
 */
export default async function VideoPage() {
  // Fetch recent videos from database
  let recentVideos: GeneratedVideo[] = [];

  try {
    const videos = await listUserMedia({ type: "video", limit: 20 });
    recentVideos = videos.map((video) => ({
      id: video.id,
      prompt: video.prompt,
      modelId: video.model,
      createdAt: video.createdAt.toISOString(),
      status: video.status === "completed" ? "completed" : "processing",
      videoUrl: video.url,
      thumbnailUrl: video.thumbnailUrl,
      resolution: video.dimensions?.width && video.dimensions?.height
        ? `${video.dimensions.width} × ${video.dimensions.height}`
        : undefined,
    }));
  } catch {
    // Silently fail - will show empty history
  }

  return (
    <VideoPageClient
      modelPresets={modelPresets}
      recentVideos={recentVideos}
    />
  );
}
