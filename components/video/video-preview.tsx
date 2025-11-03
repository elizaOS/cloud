"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import {
  Clock,
  Download,
  Link2,
  Loader2,
  Play,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import type { GeneratedVideo } from "./types";
import { BrandCard, BrandButton, CornerBrackets } from "@/components/brand";

interface VideoPreviewProps {
  video?: GeneratedVideo | null;
}

export function VideoPreview({ video }: VideoPreviewProps) {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasModerationFlag = video?.hasNsfwConcepts?.some(Boolean) ?? false;
  const timingMs = video?.timings
    ? (video.timings.inference ?? video.timings.total ?? video.timings.duration)
    : undefined;
  const processingTimeLabel =
    typeof timingMs === "number"
      ? timingMs >= 1000
        ? `${(timingMs / 1000).toFixed(1)}s`
        : `${Math.round(timingMs)}ms`
      : null;

  const showFeedback = useCallback((message: string) => {
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }

    setCopyFeedback(message);
    feedbackTimeoutRef.current = setTimeout(() => {
      setCopyFeedback(null);
      feedbackTimeoutRef.current = null;
    }, 2600);
  }, []);

  const handleDownload = useCallback(() => {
    if (!video?.videoUrl) {
      showFeedback("Video will be available after rendering completes.");
      return;
    }

    window.open(video.videoUrl, "_blank", "noopener,noreferrer");
    showFeedback("Opening video in a new tab.");
  }, [showFeedback, video]);

  const handleCopyLink = useCallback(async () => {
    if (!video?.videoUrl) {
      showFeedback("No video link yet — generate a clip first.");
      return;
    }

    if (typeof navigator === "undefined" || !navigator.clipboard) {
      showFeedback("Clipboard access unavailable in this browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(video.videoUrl);
      showFeedback("Link copied to clipboard.");
    } catch {
      showFeedback("Copy failed — select and copy the URL manually.");
    }
  }, [showFeedback, video]);

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  return (
    <BrandCard className="relative flex h-full min-h-0 flex-col">
      <CornerBrackets size="md" className="opacity-50" />

      <div className="relative z-10 space-y-2 pb-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xl font-bold text-white">Preview</h3>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-none px-3 py-1 text-xs font-bold uppercase tracking-wide border",
                video
                  ? video.status === "completed"
                    ? video.isMock
                      ? "bg-white/10 text-white/80 border-white/20"
                      : "bg-green-500/20 text-green-400 border-green-500/40"
                    : video.status === "processing"
                      ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                      : "bg-rose-500/20 text-rose-400 border-rose-500/40"
                  : "bg-white/10 text-white/60 border-white/20",
              )}
            >
              {video ? video.status : "Idle"}
            </span>
            {video?.isMock ? (
              <span className="rounded-none bg-white/10 px-3 py-1 text-xs text-white/60">
                Mock preview
              </span>
            ) : null}
          </div>
        </div>
        <p className="text-sm text-white/60">
          The most recent render appears here with metadata and quick actions.
        </p>
      </div>

      <div className="relative z-10 flex-1 min-h-0 pb-0 mt-6">
        <div className="relative aspect-video w-full overflow-hidden rounded-none border border-white/10 bg-black/60 shadow-inner">
          {video ? (
            <>
              {video.videoUrl ? (
                <video
                  key={video.videoUrl}
                  src={video.videoUrl}
                  controls
                  className="absolute inset-0 h-full w-full object-cover"
                  preload="metadata"
                />
              ) : (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-black/40 via-black/70 to-black/90 text-center"
                  style={
                    video.thumbnailUrl
                      ? {
                          backgroundImage: `url(${video.thumbnailUrl})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : undefined
                  }
                >
                  {!video.thumbnailUrl && (
                    <>
                      <Play className="h-10 w-10 text-white/50" />
                      <p className="mt-3 text-sm text-white/60">
                        Generated video preview
                      </p>
                    </>
                  )}
                </div>
              )}
              {video.status === "processing" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-[#FF5800]" />
                  <p className="text-sm font-medium text-white">
                    Sending job to Fal…
                  </p>
                  <p className="text-xs text-white/60">
                    This usually takes a few moments.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-white/60">
              <Sparkles className="h-10 w-10 text-[#FF5800]" />
              <p className="text-sm font-medium text-white">
                Your video will appear here once generated.
              </p>
              <p className="text-xs text-white/60">
                Use the form to create a concept and track progress in real
                time.
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-4 rounded-none border border-white/10 bg-black/40 p-4 text-sm">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
              Prompt
            </p>
            <p className="text-sm text-white">
              {video?.prompt ?? "No prompt yet — craft a description to begin."}
            </p>
          </div>
          <div className="grid gap-2 text-xs text-white/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Model preset</span>
              <span className="font-medium text-white">
                {video?.modelId ?? "Not selected"}
              </span>
            </div>
            {video?.requestId ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Request ID</span>
                <span className="font-medium text-white break-all">
                  {video.requestId}
                </span>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-[#FF5800]" /> Duration
              </span>
              <span className="font-medium text-white">
                {video?.durationSeconds
                  ? `${video.durationSeconds}s`
                  : video?.status === "processing"
                    ? "Rendering"
                    : "Pending"}
              </span>
            </div>
            {processingTimeLabel ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Processing time</span>
                <span className="font-medium text-white">
                  {processingTimeLabel}
                </span>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Resolution</span>
              <span className="font-medium text-white">
                {video?.resolution ?? "—"}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Seed</span>
              <span className="font-medium text-white">
                {video?.seed ?? "Auto"}
              </span>
            </div>
            {video?.referenceUrl ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Reference</span>
                <a
                  href={video.referenceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-[#FF5800] hover:underline"
                >
                  Open link
                </a>
              </div>
            ) : null}
          </div>
        </div>

        {video?.failureReason ? (
          <div
            className={cn(
              "mt-4 rounded-none border px-4 py-3 text-xs leading-relaxed",
              video.status === "failed"
                ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
                : "border-amber-500/40 bg-amber-500/10 text-amber-300",
            )}
          >
            {video.status === "failed"
              ? `Generation failed: ${video.failureReason}`
              : `API response: ${video.failureReason}. Displaying cached/mock preview.`}
          </div>
        ) : null}
        {hasModerationFlag ? (
          <div className="mt-3 flex items-center gap-2 rounded-none border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
            <ShieldAlert className="h-3.5 w-3.5" />
            Potential safety flags were returned for this render. Review before
            sharing publicly.
          </div>
        ) : null}
      </div>

      <div className="relative z-10 flex flex-col gap-3 border-t border-white/10 pt-4 mt-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
          <span>Last generated</span>
          <span className="font-medium text-white">
            {video?.createdAt
              ? new Date(video.createdAt).toLocaleString()
              : "—"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <BrandButton
            className="flex-1"
            variant="primary"
            type="button"
            onClick={handleDownload}
          >
            <Download className="mr-2 h-4 w-4" />
            Download
          </BrandButton>
          <BrandButton
            className="flex-1"
            variant="outline"
            type="button"
            onClick={handleCopyLink}
          >
            <Link2 className="mr-2 h-4 w-4" />
            Copy link
          </BrandButton>
        </div>
        {copyFeedback && (
          <p className="text-center text-xs text-white/60">{copyFeedback}</p>
        )}
      </div>
    </BrandCard>
  );
}
