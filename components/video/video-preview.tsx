"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <Card className="flex h-full min-h-0 flex-col border-border/60 bg-background/80">
      <CardHeader className="space-y-2 pb-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xl font-semibold">Preview</CardTitle>
          <div className="flex items-center gap-2">
            <Badge
              className={cn(
                "rounded-full px-3",
                video ? "capitalize" : "bg-muted/80 text-muted-foreground",
              )}
              variant={
                video
                  ? video.status === "completed"
                    ? video.isMock
                      ? "outline"
                      : "default"
                    : video.status === "processing"
                      ? "outline"
                      : "destructive"
                  : "secondary"
              }
            >
              {video ? video.status : "Idle"}
            </Badge>
            {video?.isMock ? (
              <Badge variant="secondary" className="rounded-full px-3 text-xs">
                Mock preview
              </Badge>
            ) : null}
          </div>
        </div>
        <CardDescription>
          The most recent render appears here with metadata and quick actions.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 px-6 pb-0">
        <div className="relative mt-6 aspect-video w-full overflow-hidden rounded-2xl border border-border/60 bg-muted/40 shadow-inner">
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
                  className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-background/40 via-background/70 to-background/90 text-center"
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
                      <Play className="h-10 w-10 text-muted-foreground" />
                      <p className="mt-3 text-sm text-muted-foreground">
                        Generated video preview
                      </p>
                    </>
                  )}
                </div>
              )}
              {video.status === "processing" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm font-medium text-foreground">
                    Sending job to Fal…
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This usually takes a few moments.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <Sparkles className="h-10 w-10" />
              <p className="text-sm font-medium text-foreground">
                Your video will appear here once generated.
              </p>
              <p className="text-xs text-muted-foreground">
                Use the form to create a concept and track progress in real
                time.
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-4 rounded-2xl border border-border/50 bg-background/60 p-4 text-sm">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Prompt
            </p>
            <p className="text-sm text-foreground">
              {video?.prompt ?? "No prompt yet — craft a description to begin."}
            </p>
          </div>
          <div className="grid gap-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Model preset</span>
              <span className="font-medium text-foreground">
                {video?.modelId ?? "Not selected"}
              </span>
            </div>
            {video?.requestId ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Request ID</span>
                <span className="font-medium text-foreground break-all">
                  {video.requestId}
                </span>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" /> Duration
              </span>
              <span className="font-medium text-foreground">
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
                <span className="font-medium text-foreground">
                  {processingTimeLabel}
                </span>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Resolution</span>
              <span className="font-medium text-foreground">
                {video?.resolution ?? "—"}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>Seed</span>
              <span className="font-medium text-foreground">
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
                  className="font-medium text-primary hover:underline"
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
              "mt-4 rounded-2xl border px-4 py-3 text-xs leading-relaxed",
              video.status === "failed"
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
            )}
          >
            {video.status === "failed"
              ? `Generation failed: ${video.failureReason}`
              : `API response: ${video.failureReason}. Displaying cached/mock preview.`}
          </div>
        ) : null}
        {hasModerationFlag ? (
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
            <ShieldAlert className="h-3.5 w-3.5" />
            Potential safety flags were returned for this render. Review before
            sharing publicly.
          </div>
        ) : null}
      </CardContent>

      <CardFooter className="flex flex-col gap-3 border-t border-border/60 bg-background/70 py-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Last generated</span>
          <span className="font-medium text-foreground">
            {video?.createdAt
              ? new Date(video.createdAt).toLocaleString()
              : "—"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="flex-1 rounded-xl"
            variant="default"
            type="button"
            onClick={handleDownload}
          >
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
          <Button
            className="flex-1 rounded-xl"
            variant="outline"
            type="button"
            onClick={handleCopyLink}
          >
            <Link2 className="mr-2 h-4 w-4" />
            Copy link
          </Button>
        </div>
        {copyFeedback && (
          <p className="text-center text-xs text-muted-foreground">
            {copyFeedback}
          </p>
        )}
      </CardFooter>
    </Card>
  );
}
