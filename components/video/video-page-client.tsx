/**
 * Video generation page client component.
 * Uses the VideoGeneratorAdvanced component for a clean, unified interface.
 */

"use client";

import { useSetPageHeader } from "@/components/layout/page-header-context";
import { VideoGeneratorAdvanced } from "./video-generator-advanced";
import type { GeneratedVideo, VideoModelOption } from "./types";

interface VideoPageClientProps {
  modelPresets: VideoModelOption[];
  recentVideos: GeneratedVideo[];
}

export function VideoPageClient({
  modelPresets,
  recentVideos,
}: VideoPageClientProps) {
  useSetPageHeader({
    title: "Video Studio",
  });

  return (
    <div className="w-full flex flex-col pb-6 md:pb-8">
      <VideoGeneratorAdvanced
        modelPresets={modelPresets}
        initialHistory={recentVideos}
      />
    </div>
  );
}
