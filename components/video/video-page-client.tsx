"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { MONTHLY_CREDIT_CAP } from "@/lib/pricing-constants";
import { CheckCircle2, Clock4, History, Loader2 } from "lucide-react";
import { useSetPageHeader } from "@/components/layout/page-header-context";

import { VideoGenerationForm } from "./video-generation-form";
import { VideoPreview } from "./video-preview";
import type {
  GeneratedVideo,
  VideoModelOption,
  VideoUsageSummary,
} from "./types";
import {
  BrandCard,
  BrandButton,
  CornerBrackets,
  SectionLabel,
} from "@/components/brand";

const THUMBNAIL_FALLBACKS = [
  "https://images.unsplash.com/photo-1526318472351-c75fcf07015d?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1482192597420-4817fdd7e8b0?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1489515217757-b51f1e5363ec?auto=format&fit=crop&w=1600&q=80",
];

const MOCK_VIDEO_BASE_URL = "https://video-placeholder.eliza.ai";
const TIMING_KEYS_IN_PRIORITY = ["inference", "total", "duration"] as const;

type FalVideoResponse = {
  video?: {
    url?: string;
    width?: number;
    height?: number;
    file_name?: string;
    file_size?: number;
    content_type?: string;
  };
  seed?: number;
  has_nsfw_concepts?: boolean[];
  timings?: Record<string, number> | null;
  requestId?: string;
  isFallback?: boolean;
  originalError?: string;
};

const parseDurationEstimate = (estimate?: string): number | undefined => {
  if (!estimate) {
    return undefined;
  }

  const rangeMatch = estimate.match(
    /(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/i,
  );
  if (rangeMatch) {
    const start = parseFloat(rangeMatch[1]);
    const end = parseFloat(rangeMatch[2]);
    return Number.isFinite(start) && Number.isFinite(end)
      ? (start + end) / 2
      : undefined;
  }

  const singleMatch = estimate.match(/(\d+(?:\.\d+)?)/);
  if (singleMatch) {
    const value = parseFloat(singleMatch[1]);
    return Number.isFinite(value) ? value : undefined;
  }

  return undefined;
};

const getDurationFromTimings = (
  timings?: Record<string, number> | null,
): number | undefined => {
  if (!timings) {
    return undefined;
  }

  for (const key of TIMING_KEYS_IN_PRIORITY) {
    const value = timings[key];
    if (typeof value === "number" && value > 0) {
      return Math.max(1, Math.round(value / 1000));
    }
  }

  return undefined;
};

const getResolutionLabel = (
  width?: number,
  height?: number,
): string | undefined => {
  if (!width || !height) {
    return undefined;
  }

  return `${width} × ${height}`;
};

const pickFallbackThumbnail = (): string => {
  return THUMBNAIL_FALLBACKS[
    Math.floor(Math.random() * THUMBNAIL_FALLBACKS.length)
  ];
};

const buildMockVideoUrl = (id: string): string => {
  return `${MOCK_VIDEO_BASE_URL}/${id}.mp4`;
};

interface VideoPageClientProps {
  modelPresets: VideoModelOption[];
  featuredVideo: GeneratedVideo | null;
  usage: VideoUsageSummary;
  recentVideos: GeneratedVideo[];
}

export function VideoPageClient({
  modelPresets,
  featuredVideo,
  usage,
  recentVideos,
}: VideoPageClientProps) {
  const [prompt, setPrompt] = useState(
    featuredVideo?.prompt ??
      "A cinematic drone shot over a futuristic coastal city at sunset",
  );
  const [selectedModel, setSelectedModel] = useState(
    featuredVideo?.modelId ?? modelPresets[0]?.id ?? "",
  );
  const [currentVideo, setCurrentVideo] = useState<GeneratedVideo | null>(
    featuredVideo,
  );
  const [historyVideos, setHistoryVideos] =
    useState<GeneratedVideo[]>(recentVideos);
  const [usageStats, setUsageStats] = useState<VideoUsageSummary>(usage);
  const [referenceUrl, setReferenceUrl] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useSetPageHeader({
    title: "Video Generation Studio",
    description:
      "Generate stunning clips, iterate on creative directions, and keep an eye on usage — all in one streamlined workspace.",
  });

  const creditsUsed = usageStats.monthlyCredits;
  const creditProgress = Math.min(
    100,
    Math.round((creditsUsed / MONTHLY_CREDIT_CAP) * 100),
  );

  const selectedPreset = useMemo(() => {
    return (
      modelPresets.find((preset) => preset.id === selectedModel) ??
      modelPresets[0] ??
      null
    );
  }, [modelPresets, selectedModel]);

  useEffect(() => {
    setFormError(null);
  }, [prompt, selectedModel]);

  const scrollToHistory = useCallback(() => {
    const element = document.getElementById("recent-renders");
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const replaceVideoEntry = useCallback(
    (draftId: string, nextVideo: GeneratedVideo) => {
      setHistoryVideos((prev) =>
        prev.map((entry) => (entry.id === draftId ? nextVideo : entry)),
      );

      setCurrentVideo((prev) =>
        prev && prev.id === draftId ? nextVideo : prev,
      );
    },
    [],
  );

  const updateUsageAfterCompletion = useCallback((durationSeconds?: number) => {
    setUsageStats((prev) => {
      const normalizedDuration =
        typeof durationSeconds === "number" && Number.isFinite(durationSeconds)
          ? durationSeconds
          : prev.averageDuration;
      const nextTotal = prev.totalRenders + 1;
      const nextAverage =
        nextTotal > 0
          ? (prev.averageDuration * prev.totalRenders + normalizedDuration) /
            nextTotal
          : normalizedDuration;

      return {
        ...prev,
        totalRenders: nextTotal,
        monthlyCredits: Math.min(prev.monthlyCredits + 1, MONTHLY_CREDIT_CAP),
        lastGeneration: new Date().toISOString(),
        averageDuration: Number.isFinite(nextAverage)
          ? nextAverage
          : prev.averageDuration,
      };
    });
  }, []);

  const simulateMockCompletion = useCallback(
    (draft: GeneratedVideo) => {
      const duration =
        parseDurationEstimate(
          modelPresets.find((preset) => preset.id === draft.modelId)
            ?.durationEstimate,
        ) ?? 10;
      const mock: GeneratedVideo = {
        ...draft,
        status: "completed",
        isMock: true,
        videoUrl: draft.videoUrl ?? buildMockVideoUrl(draft.id),
        durationSeconds: duration,
        seed: draft.seed ?? Math.floor(Math.random() * 10_000),
        timings: { mock: duration * 1000 },
        failureReason: draft.failureReason,
      };

      replaceVideoEntry(draft.id, mock);
      updateUsageAfterCompletion(duration);
      setStatusMessage(
        "Mock render displayed while the generation API is unavailable.",
      );
    },
    [modelPresets, replaceVideoEntry, updateUsageAfterCompletion],
  );

  const handleGenerate = useCallback(
    async ({
      prompt: inputPrompt,
      model,
      referenceUrl: reference,
    }: {
      prompt: string;
      model: string;
      referenceUrl?: string;
    }) => {
      const trimmedPrompt = inputPrompt.trim();
      if (!trimmedPrompt) {
        setFormError("Enter a descriptive prompt before generating a video.");
        return;
      }

      const chosenModel = model || modelPresets[0]?.id || "custom";
      const now = new Date();
      const draftId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `vd_${Math.floor(Math.random() * 1_000_000)}`;
      const fallbackThumbnail = pickFallbackThumbnail();

      const draft: GeneratedVideo = {
        id: draftId,
        prompt: trimmedPrompt,
        modelId: chosenModel,
        thumbnailUrl: fallbackThumbnail,
        createdAt: now.toISOString(),
        status: "processing",
        durationSeconds: undefined,
        resolution: selectedPreset?.dimensions ?? currentVideo?.resolution,
        referenceUrl: reference?.trim() || undefined,
      };

      setIsGenerating(true);
      setFormError(null);
      setStatusMessage("Submitting job to the video generation API…");

      setCurrentVideo(draft);
      setHistoryVideos((prev) => [
        draft,
        ...prev.filter((entry) => entry.id !== draft.id),
      ]);

      toast.info("Video generation started", {
        description:
          "Your video is being generated. This may take a few minutes.",
      });

      try {
        const response = await fetch("/api/v1/generate-video", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: trimmedPrompt,
            model: chosenModel,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          const message =
            typeof errorBody?.error === "string"
              ? errorBody.error
              : `Request failed (${response.status})`;
          throw new Error(message);
        }

        const payload: FalVideoResponse = await response.json();
        const durationFromTimings = getDurationFromTimings(payload.timings);
        const resolution = getResolutionLabel(
          payload.video?.width,
          payload.video?.height,
        );

        const completed: GeneratedVideo = {
          ...draft,
          id: payload.requestId ?? draft.id,
          requestId: payload.requestId ?? draft.id,
          status: "completed",
          videoUrl:
            payload.video?.url ?? draft.videoUrl ?? buildMockVideoUrl(draft.id),
          thumbnailUrl: draft.thumbnailUrl,
          seed: payload.seed ?? draft.seed,
          hasNsfwConcepts: payload.has_nsfw_concepts,
          timings: payload.timings ?? null,
          durationSeconds:
            durationFromTimings ??
            parseDurationEstimate(selectedPreset?.durationEstimate),
          resolution: resolution ?? draft.resolution,
          failureReason: undefined,
          isMock: false,
        };

        replaceVideoEntry(draft.id, completed);
        updateUsageAfterCompletion(completed.durationSeconds);
        setStatusMessage(
          "Video ready — open it in a new tab or copy the link.",
        );
        setReferenceUrl("");

        if (payload.isFallback) {
          toast.warning("Fallback video generated", {
            description: "Using a sample video due to service unavailability.",
          });
        } else {
          toast.success("Video generated successfully!", {
            description: `Your video is ready. Duration: ${completed.durationSeconds || "N/A"}s`,
          });
        }
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : "Video generation failed.";

        const failedDraft: GeneratedVideo = {
          ...draft,
          status: "failed",
          failureReason: message,
        };

        replaceVideoEntry(draft.id, failedDraft);
        setFormError(message);
        setStatusMessage(
          "Generation failed — displaying a mock render as a placeholder.",
        );

        toast.error("Video generation failed", {
          description: message,
        });

        simulateMockCompletion(failedDraft);
      } finally {
        setIsGenerating(false);
      }
    },
    [
      currentVideo?.resolution,
      modelPresets,
      replaceVideoEntry,
      selectedPreset,
      simulateMockCompletion,
      updateUsageAfterCompletion,
    ],
  );

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <VideoGenerationForm
          prompt={prompt}
          onPromptChange={setPrompt}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          models={modelPresets}
          referenceUrl={referenceUrl}
          onReferenceChange={setReferenceUrl}
          onGenerate={(payload) => {
            void handleGenerate(payload);
          }}
          isSubmitting={isGenerating}
          errorMessage={formError}
          statusMessage={statusMessage}
        />
        <VideoPreview video={currentVideo} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <BrandCard className="relative">
          <CornerBrackets size="sm" className="opacity-50" />

          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-2">
              <Clock4 className="h-5 w-5 text-[#FF5800]" />
              <h3 className="text-lg font-bold text-white">
                Capacity overview
              </h3>
            </div>
            <p className="text-sm text-white/60">
              Track your render capacity and plan ahead as we connect live
              credits.
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-none border border-white/10 bg-black/40 p-4">
                <p className="text-xs uppercase tracking-wide text-white/50">
                  Monthly credits used
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {creditsUsed}
                </p>
                <p className="text-xs text-white/50">of {MONTHLY_CREDIT_CAP}</p>
              </div>
              <div className="rounded-none border border-white/10 bg-black/40 p-4">
                <p className="text-xs uppercase tracking-wide text-white/50">
                  Remaining renders
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {Math.max(MONTHLY_CREDIT_CAP - creditsUsed, 0)}
                </p>
                <p className="text-xs text-white/50">
                  Estimated based on current mix
                </p>
              </div>
              <div className="rounded-none border border-white/10 bg-black/40 p-4">
                <p className="text-xs uppercase tracking-wide text-white/50">
                  Fastest turnaround
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {Math.max(usageStats.averageDuration - 1.3, 2).toFixed(0)}s
                </p>
                <p className="text-xs text-white/50">
                  Using speed-optimized models
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Monthly spend</span>
                <span className="font-medium text-white">
                  {creditProgress}%
                </span>
              </div>
              <Progress value={creditProgress} className="h-2 bg-white/10">
                <div
                  className="h-full bg-[#FF5800] transition-all"
                  style={{ width: `${creditProgress}%` }}
                />
              </Progress>
              <p className="text-xs text-white/50">
                Budget resets on the 1st of every month. Reach out if you need a
                larger allocation.
              </p>
            </div>
          </div>
        </BrandCard>

        <BrandCard
          className="relative flex h-full flex-col"
          id="recent-renders"
        >
          <CornerBrackets size="sm" className="opacity-50" />

          <div className="relative z-10 space-y-2 mb-6">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-[#FF5800]" />
              <h3 className="text-lg font-bold text-white">Recent renders</h3>
            </div>
            <p className="text-sm text-white/60">
              A quick snapshot of your latest generation attempts.
            </p>
          </div>

          <div className="relative z-10 flex-1 space-y-4 overflow-y-auto">
            {historyVideos.map((video) => (
              <div
                key={video.id}
                className="flex flex-col gap-2 rounded-none border border-white/10 bg-black/40 p-4 transition-colors hover:border-[#FF5800]/50"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-none px-3 py-1 text-xs font-bold uppercase tracking-wide border capitalize",
                      video.status === "completed"
                        ? video.isMock
                          ? "bg-white/10 text-white/80 border-white/20"
                          : "bg-green-500/20 text-green-400 border-green-500/40"
                        : video.status === "processing"
                          ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                          : "bg-rose-500/20 text-rose-400 border-rose-500/40",
                    )}
                  >
                    {video.status}
                  </span>
                  {video.isMock ? (
                    <span className="rounded-none bg-white/10 px-2.5 py-0.5 text-[11px] uppercase tracking-wide text-white/60">
                      Mock preview
                    </span>
                  ) : null}
                  <p className="text-sm font-medium text-white">
                    {video.prompt.length > 80
                      ? `${video.prompt.slice(0, 77)}...`
                      : video.prompt}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#FF5800]" />
                    {video.modelId}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock4 className="h-3.5 w-3.5 text-[#FF5800]" />
                    {video.durationSeconds
                      ? `${video.durationSeconds}s`
                      : video.status === "processing"
                        ? "Rendering"
                        : "Pending"}
                  </span>
                  <span>
                    {new Date(video.createdAt).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {video.requestId ? (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/50">
                    <span className="font-medium text-white/80">
                      Request ID:
                    </span>
                    <span className="break-all">{video.requestId}</span>
                  </div>
                ) : null}
                {video.failureReason && video.status !== "completed" ? (
                  <div className="text-[11px] text-rose-400">
                    {video.failureReason}
                  </div>
                ) : null}
              </div>
            ))}
            {historyVideos.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center rounded-none border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-white/60">
                <Loader2 className="mb-2 h-5 w-5 animate-spin text-[#FF5800]" />
                No renders yet — submit a prompt to get started.
              </div>
            )}
          </div>

          <div className="relative z-10 border-t border-white/10 pt-4 mt-4">
            <BrandButton
              variant="outline"
              className="w-full"
              type="button"
              onClick={scrollToHistory}
            >
              View full history
            </BrandButton>
          </div>
        </BrandCard>
      </section>
    </div>
  );
}
