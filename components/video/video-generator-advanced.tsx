/**
 * Advanced video generator component with full-featured controls.
 * Matches the image generator layout with top input bar and creations grid.
 * Supports model selection, settings, video history, and playback.
 */

"use client";

import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Video,
  Loader2,
  Download,
  X,
  Send,
  Check,
  Play,
  Search,
  Copy,
} from "lucide-react";
import { BrandCard, CornerBrackets } from "@/components/brand";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import type { VideoModelOption, GeneratedVideo } from "./types";
import { listExploreVideos, type GalleryItem } from "@/app/actions/gallery";

interface VideoGeneratorAdvancedProps {
  modelPresets: VideoModelOption[];
  initialHistory?: GeneratedVideo[];
}

export function VideoGeneratorAdvanced({
  modelPresets,
  initialHistory = [],
}: VideoGeneratorAdvancedProps) {
  // Form state
  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState(modelPresets[0]?.id ?? "");

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const topAnchorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll to top helper
  const scrollToTop = () => {
    requestAnimationFrame(() => {
      if (topAnchorRef.current) {
        topAnchorRef.current.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 300);
    });
  };

  // Video state
  const [videoState, setVideoState] = useState<{
    currentVideo: GeneratedVideo | null;
    history: GeneratedVideo[];
    playingId: string | null;
  }>({
    currentVideo: null,
    history: initialHistory,
    playingId: null,
  });

  // Request state
  const [requestState, setRequestState] = useState<{
    isLoading: boolean;
    error: string | null;
  }>({
    isLoading: false,
    error: null,
  });

  // UI state
  const [uiState, setUiState] = useState<{
    activeTab: string;
    isFullscreenOpen: boolean;
    selectedVideo: GeneratedVideo | null;
    selectedExploreVideo: GalleryItem | null;
  }>({
    activeTab: "creations",
    isFullscreenOpen: false,
    selectedVideo: null,
    selectedExploreVideo: null,
  });

  // Explore videos state
  const [exploreState, setExploreState] = useState<{
    videos: GalleryItem[];
    isLoading: boolean;
    error: string | null;
  }>({
    videos: [],
    isLoading: false,
    error: null,
  });

  // Fetch explore videos when tab changes to explore
  useEffect(() => {
    if (
      uiState.activeTab === "explore" &&
      exploreState.videos.length === 0 &&
      !exploreState.isLoading
    ) {
      const fetchVideos = async () => {
        setExploreState((prev) => ({ ...prev, isLoading: true }));
        const videos = await listExploreVideos(20);
        setExploreState({ videos, isLoading: false, error: null });
      };
      fetchVideos();
    }
  }, [uiState.activeTab, exploreState.videos.length, exploreState.isLoading]);

  const selectedPreset =
    modelPresets.find((p) => p.id === selectedModel) ?? modelPresets[0];

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setRequestState({ isLoading: true, error: null });
    setUiState((prev) => ({ ...prev, activeTab: "creations" }));

    const draftId = crypto.randomUUID();
    const draft: GeneratedVideo = {
      id: draftId,
      prompt: prompt.trim(),
      modelId: selectedModel,
      createdAt: new Date().toISOString(),
      status: "processing",
    };

    // Add to history immediately
    setVideoState((prev) => ({
      ...prev,
      currentVideo: draft,
      history: [draft, ...prev.history],
    }));

    toast.info("Video generation started", {
      description:
        "Your video is being generated. This may take a few minutes.",
    });

    let response: Response;
    try {
      response = await fetch("/api/v1/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model: selectedModel,
        }),
      });
    } catch (fetchError) {
      const errorMsg =
        fetchError instanceof Error ? fetchError.message : "Network error";
      setVideoState((prev) => ({
        ...prev,
        history: prev.history.map((v) =>
          v.id === draftId
            ? {
                ...v,
                status: "failed" as const,
                failureReason: `Network error: ${errorMsg}`,
              }
            : v
        ),
      }));
      setRequestState({
        isLoading: false,
        error: `Network error: ${errorMsg}`,
      });
      toast.error("Video generation failed", {
        description: `Network error: ${errorMsg}`,
      });
      return;
    }

    if (!response.ok) {
      let errorBody: Record<string, unknown> = {};
      try {
        errorBody = await response.json();
      } catch {
        // JSON parse failed, use empty object
      }

      let message =
        (errorBody?.error as string) || `Request failed (${response.status})`;

      // Add more context for common errors
      if (response.status === 402) {
        message = `Insufficient credits. Required: $${errorBody.required}, Available: $${errorBody.available}`;
      } else if (response.status === 503) {
        message =
          "Video generation service is not configured. Please try again later.";
      } else if (response.status === 429) {
        message = "Rate limit exceeded. Please wait a moment and try again.";
      } else if (errorBody?.originalError) {
        message = `${message} (${errorBody.originalError})`;
      }

      // Update draft to failed
      setVideoState((prev) => ({
        ...prev,
        history: prev.history.map((v) =>
          v.id === draftId
            ? { ...v, status: "failed" as const, failureReason: message }
            : v
        ),
      }));

      setRequestState({ isLoading: false, error: message });
      toast.error("Video generation failed", { description: message });
      return;
    }

    interface VideoPayload {
      requestId?: string;
      video?: {
        url?: string;
        duration?: number;
        width?: number;
        height?: number;
      };
      seed?: number;
    }

    let payload: VideoPayload;
    try {
      payload = await response.json();
    } catch {
      const errorMsg = "Failed to parse response";
      setVideoState((prev) => ({
        ...prev,
        history: prev.history.map((v) =>
          v.id === draftId
            ? { ...v, status: "failed" as const, failureReason: errorMsg }
            : v
        ),
      }));
      setRequestState({ isLoading: false, error: errorMsg });
      toast.error("Video generation failed", { description: errorMsg });
      return;
    }

    const completed: GeneratedVideo = {
      ...draft,
      id: payload.requestId ?? draft.id,
      requestId: payload.requestId,
      status: "completed",
      videoUrl: payload.video?.url,
      thumbnailUrl: draft.thumbnailUrl,
      seed: payload.seed,
      durationSeconds: payload.video?.duration,
      resolution:
        payload.video?.width && payload.video?.height
          ? `${payload.video.width} × ${payload.video.height}`
          : undefined,
    };

    setVideoState((prev) => ({
      ...prev,
      currentVideo: completed,
      history: prev.history.map((v) => (v.id === draftId ? completed : v)),
    }));

    setRequestState({ isLoading: false, error: null });
    toast.success("Video generated successfully!");
  };

  const handleDownload = (video: GeneratedVideo) => {
    if (!video.videoUrl) {
      toast.error("Video not available yet");
      return;
    }
    window.open(video.videoUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full w-full scroll-smooth"
    >
      {/* Scroll anchor */}
      <div ref={topAnchorRef} className="absolute top-0" />

      {/* Top Input Bar */}
      <div>
        <div className="w-full">
          <div
            className={`relative rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden transition-all ${
              requestState.isLoading
                ? "opacity-60 pointer-events-none"
                : "focus-within:border-white/[0.15] focus-within:bg-white/[0.03]"
            }`}
          >
            {/* Loading Scanner */}
            {requestState.isLoading && (
              <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden pointer-events-none z-10">
                <div
                  className="absolute h-full w-24 bg-gradient-to-r from-transparent via-[#FF5800] to-transparent"
                  style={{
                    animation:
                      "visor-scan 4.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                    boxShadow: "0 0 15px 3px rgba(255, 88, 0, 0.7)",
                    filter: "blur(0.5px)",
                  }}
                />
              </div>
            )}

            {/* Textarea */}
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!requestState.isLoading && prompt.trim()) {
                    handleGenerate();
                  }
                }
              }}
              placeholder="Describe the video you want to generate..."
              disabled={requestState.isLoading}
              className="w-full bg-transparent px-5 pt-4 pb-4 text-xl text-white placeholder:text-white/40 focus:outline-none disabled:opacity-50 resize-none leading-relaxed"
              style={{ height: "25vh", minHeight: "150px", maxHeight: "350px" }}
            />

            {/* Bottom bar with buttons */}
            <div className="flex items-center justify-between px-2 py-2">
              {/* Left side - Model selector */}
              <div className="flex items-center gap-1.5">
                {/* Model Selector Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    asChild
                    disabled={requestState.isLoading}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={requestState.isLoading}
                      className="h-8 gap-1.5 px-2.5 rounded-lg hover:bg-white/[0.06] transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <Video className="h-3.5 w-3.5 text-white/50" />
                      <span className="text-sm text-white/50 max-w-[200px] truncate">
                        {selectedPreset?.label || "Select Model"}
                      </span>
                      <svg
                        className="h-3.5 w-3.5 text-white/30"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-72 max-h-80 overflow-y-auto rounded-xl border-white/[0.08] bg-[#1a1a1a]/95 backdrop-blur-xl p-1"
                    align="start"
                    side="bottom"
                    sideOffset={8}
                  >
                    {modelPresets.map((preset) => (
                      <DropdownMenuItem
                        key={preset.id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer"
                        onSelect={() => setSelectedModel(preset.id)}
                      >
                        <div className="flex flex-col">
                          <span className="text-sm">{preset.label}</span>
                          {preset.dimensions && (
                            <span className="text-[11px] text-white/40">
                              {preset.dimensions}
                            </span>
                          )}
                        </div>
                        {selectedModel === preset.id && (
                          <Check className="h-4 w-4 text-[#FF5800]" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Right side - Generate button */}
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={requestState.isLoading || !prompt.trim()}
                size="icon"
                className="h-8 w-8 rounded-lg bg-transparent hover:bg-white/[0.06] disabled:opacity-40 border-0 transition-colors"
              >
                {requestState.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#FF5800]" />
                ) : (
                  <Send className="h-4 w-4 text-[#FF5800]" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area - Tabs */}
      <div className="flex-1 min-h-0 overflow-auto pt-8">
        {/* Error Display */}
        {requestState.error && (
          <div className="border border-rose-500/40 bg-rose-500/10 p-3 md:p-4 mb-4">
            <p className="text-xs md:text-sm font-mono text-rose-400 font-medium">
              {requestState.error}
            </p>
          </div>
        )}

        {/* Custom Tab Navigation */}
        <div className="flex items-center gap-8 mb-6">
          <button
            type="button"
            onClick={() =>
              setUiState((prev) => ({ ...prev, activeTab: "creations" }))
            }
            className={`text-base font-medium transition-colors ${
              uiState.activeTab === "creations"
                ? "text-[#FF5800]"
                : "text-white/50 hover:text-white/70"
            }`}
          >
            My Collection
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() =>
                  setUiState((prev) => ({ ...prev, activeTab: "explore" }))
                }
                className={`flex items-center gap-2 text-base font-medium transition-colors ${
                  uiState.activeTab === "explore"
                    ? "text-[#FF5800]"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                <Search className="h-4 w-4" />
                Explore
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              align="start"
              alignOffset={20}
              className="text-xs bg-neutral-800 text-white border-white/10 max-w-[220px] text-center"
            >
              Explore what other builders have generated
            </TooltipContent>
          </Tooltip>
        </div>

        {/* My Collection Tab Content */}
        {uiState.activeTab === "creations" &&
          (videoState.history.length > 0 || requestState.isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {videoState.history.map((video) => (
                <div
                  key={video.id}
                  className="group relative overflow-hidden rounded-lg border border-white/10 bg-black cursor-pointer"
                  onMouseEnter={() => {
                    if (video.videoUrl) {
                      const videoEl = document.getElementById(
                        `video-${video.id}`
                      ) as HTMLVideoElement;
                      if (videoEl) {
                        videoEl.style.opacity = "1";
                        videoEl.play();
                        setVideoState((prev) => ({
                          ...prev,
                          playingId: video.id,
                        }));
                      }
                    }
                  }}
                  onMouseLeave={() => {
                    if (video.videoUrl) {
                      const videoEl = document.getElementById(
                        `video-${video.id}`
                      ) as HTMLVideoElement;
                      if (videoEl) {
                        videoEl.pause();
                        setVideoState((prev) => ({ ...prev, playingId: null }));
                      }
                    }
                  }}
                  onClick={() => {
                    if (video.status === "completed" && video.videoUrl) {
                      const videoEl = document.getElementById(
                        `video-${video.id}`
                      ) as HTMLVideoElement;
                      if (videoEl) {
                        videoEl.pause();
                      }
                      setUiState((prev) => ({
                        ...prev,
                        selectedVideo: video,
                        isFullscreenOpen: true,
                      }));
                    }
                  }}
                >
                  {/* Video Container */}
                  <div className="relative aspect-video w-full bg-black">
                    {video.videoUrl ? (
                      <video
                        id={`video-${video.id}`}
                        src={video.videoUrl}
                        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-200"
                        preload="metadata"
                        playsInline
                        loop
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-black/40 to-black/80">
                        {video.status === "processing" ? (
                          <Loader2 className="h-8 w-8 text-[#FF5800] animate-spin" />
                        ) : video.status === "failed" ? (
                          <X className="h-8 w-8 text-rose-400" />
                        ) : (
                          <Video className="h-8 w-8 text-white/40" />
                        )}
                      </div>
                    )}

                    {/* Status badge - only show for processing/failed */}
                    {video.status !== "completed" && (
                      <div className="absolute top-3 left-3 z-10">
                        <span
                          className={`px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-wide border rounded ${
                            video.status === "processing"
                              ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                              : "bg-rose-500/20 text-rose-400 border-rose-500/40"
                          }`}
                        >
                          {video.status}
                        </span>
                      </div>
                    )}

                    {/* Title overlay at absolute bottom of video */}
                    <div className="absolute bottom-0 left-0 right-0 px-3 pb-2 pt-12 bg-gradient-to-t from-black via-black/80 to-transparent">
                      {/* Title + Action buttons on same row */}
                      <div className="flex items-end justify-between gap-3">
                        {/* Title on the left */}
                        <p className="mb-4 text-base md:text-lg font-medium text-white line-clamp-2 leading-snug pointer-events-none flex-1">
                          {video.prompt}
                        </p>

                        {/* Action buttons on the right - only on hover */}
                        {video.status === "completed" && video.videoUrl && (
                          <div className="flex mb-4 items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownload(video);
                                  }}
                                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                                >
                                  <Download className="h-4 w-4 text-white" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent
                                side="bottom"
                                className="text-xs bg-neutral-800 text-white border-white/10"
                              >
                                Download video
                              </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPrompt(video.prompt);
                                    scrollToTop();
                                  }}
                                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                                >
                                  <Copy className="h-4 w-4 text-white" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent
                                side="bottom"
                                className="text-xs bg-neutral-800 text-white border-white/10"
                              >
                                Re-use this prompt
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                      </div>

                      {/* Error message for failed videos */}
                      {video.status === "failed" && video.failureReason && (
                        <p className="text-xs text-rose-400 mt-1 line-clamp-1 pointer-events-none">
                          {video.failureReason}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <BrandCard className="relative border-dashed">
              <CornerBrackets size="md" className="opacity-50" />
              <div className="relative z-10 p-8 md:p-12 lg:p-20 text-center">
                <div className="flex flex-col items-center space-y-3 md:space-y-4">
                  <Video className="h-8 md:h-10 lg:h-12 w-8 md:w-10 lg:w-12 text-[#FF5800]" />
                  <div className="space-y-2">
                    <h3 className="text-base md:text-lg font-mono font-semibold text-white">
                      No Videos Yet
                    </h3>
                    <p className="text-xs md:text-sm font-mono text-white/60">
                      Describe your vision above and generate your first video
                    </p>
                  </div>
                </div>
              </div>
            </BrandCard>
          ))}

        {/* Explore Tab Content */}
        {uiState.activeTab === "explore" &&
          (exploreState.isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="relative overflow-hidden rounded-lg border border-white/10 bg-black/40 animate-pulse"
                >
                  <div className="aspect-video w-full" />
                </div>
              ))}
            </div>
          ) : exploreState.error ? (
            <BrandCard className="relative border-dashed border-rose-500/40">
              <div className="relative z-10 p-8 text-center">
                <p className="text-sm font-mono text-rose-400">
                  {exploreState.error}
                </p>
              </div>
            </BrandCard>
          ) : exploreState.videos.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {exploreState.videos.map((video) => (
                <div
                  key={video.id}
                  className="group relative overflow-hidden rounded-lg border border-white/10 bg-black cursor-pointer"
                  onMouseEnter={() => {
                    if (video.url) {
                      const videoEl = document.getElementById(
                        `explore-video-${video.id}`
                      ) as HTMLVideoElement;
                      if (videoEl) {
                        videoEl.play();
                      }
                    }
                  }}
                  onMouseLeave={() => {
                    if (video.url) {
                      const videoEl = document.getElementById(
                        `explore-video-${video.id}`
                      ) as HTMLVideoElement;
                      if (videoEl) {
                        videoEl.pause();
                      }
                    }
                  }}
                  onClick={() =>
                    setUiState((prev) => ({
                      ...prev,
                      selectedExploreVideo: video,
                    }))
                  }
                >
                  <div className="relative aspect-video w-full bg-black">
                    {video.url ? (
                      <video
                        id={`explore-video-${video.id}`}
                        src={video.url}
                        className="absolute inset-0 w-full h-full object-cover"
                        preload="metadata"
                        playsInline
                        loop
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Video className="h-8 w-8 text-white/40" />
                      </div>
                    )}

                    {/* Title overlay at bottom */}
                    <div className="absolute bottom-0 left-0 right-0 px-3 pb-2 pt-12 bg-gradient-to-t from-black via-black/80 to-transparent">
                      <div className="flex items-end justify-between gap-3">
                        <p className="mb-4 text-base md:text-lg font-medium text-white line-clamp-2 leading-snug pointer-events-none flex-1">
                          {video.prompt}
                        </p>

                        {video.url && (
                          <div className="flex mb-4 items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (video.url) {
                                      window.open(
                                        video.url,
                                        "_blank",
                                        "noopener,noreferrer"
                                      );
                                    }
                                  }}
                                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                                >
                                  <Download className="h-4 w-4 text-white" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent
                                side="bottom"
                                className="text-xs bg-neutral-800 text-white border-white/10"
                              >
                                Download video
                              </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPrompt(video.prompt);
                                    scrollToTop();
                                  }}
                                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                                >
                                  <Copy className="h-4 w-4 text-white" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent
                                side="bottom"
                                className="text-xs bg-neutral-800 text-white border-white/10"
                              >
                                Re-use this prompt
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <BrandCard className="relative border-dashed">
              <CornerBrackets size="md" className="opacity-50" />
              <div className="relative z-10 p-8 md:p-12 lg:p-20 text-center">
                <div className="flex flex-col items-center space-y-3 md:space-y-4">
                  <Search className="h-8 md:h-10 lg:h-12 w-8 md:w-10 lg:w-12 text-[#FF5800]" />
                  <div className="space-y-2">
                    <h3 className="text-base md:text-lg font-mono font-semibold text-white">
                      No Videos to Explore
                    </h3>
                    <p className="text-xs md:text-sm font-mono text-white/60">
                      Check back later for community creations
                    </p>
                  </div>
                </div>
              </div>
            </BrandCard>
          ))}
      </div>

      {/* Fullscreen Video Modal */}
      <Dialog
        open={uiState.isFullscreenOpen}
        onOpenChange={(open) =>
          setUiState((prev) => ({ ...prev, isFullscreenOpen: open }))
        }
      >
        <DialogContent
          className="!max-w-[99vw] !max-h-[99vh] !w-[99vw] !h-[99vh] p-0 bg-black/95 border-white/10 sm:!max-w-[99vw] md:!max-w-[99vw] lg:!max-w-[99vw]"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">
            {uiState.selectedVideo?.prompt || "Video preview"}
          </DialogTitle>
          {uiState.selectedVideo && (
            <div className="relative w-full h-full flex items-center justify-center p-4 md:p-6">
              {/* Main Content */}
              <div className="relative w-full h-full flex items-center justify-center pb-32 md:pb-40">
                {uiState.selectedVideo.videoUrl ? (
                  <video
                    key={uiState.selectedVideo.videoUrl}
                    src={uiState.selectedVideo.videoUrl}
                    controls
                    autoPlay
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-4 text-center">
                    <Video className="h-12 w-12 text-white/40" />
                    <p className="text-sm font-mono text-white/60">
                      Video not available yet.
                    </p>
                  </div>
                )}
              </div>

              {/* Close button */}
              <DialogClose className="absolute top-4 right-4 z-50 rounded-none border border-white/20 bg-black/60 p-2 hover:bg-[#FF580020] hover:border-[#FF5800]/40 transition-colors">
                <X className="h-5 w-5 text-white" />
              </DialogClose>

              {/* Info overlay at bottom */}
              <div className="absolute bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-black/95 via-black/80 to-transparent px-6 pt-8 pb-6 md:px-8 md:pt-12 md:pb-8 space-y-3">
                {/* Prompt */}
                <p className="text-sm text-white/90 leading-relaxed max-w-4xl break-words">
                  {uiState.selectedVideo.prompt}
                </p>

                {/* Action Buttons */}
                {uiState.selectedVideo.videoUrl && (
                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(uiState.selectedVideo!)}
                      className="border-white/20 bg-black/60 hover:bg-white/5"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (uiState.selectedVideo?.prompt) {
                          setPrompt(uiState.selectedVideo.prompt);
                          setUiState((prev) => ({
                            ...prev,
                            isFullscreenOpen: false,
                          }));
                          scrollToTop();
                        }
                      }}
                      className="border-white/20 bg-black/60 hover:bg-white/5"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Re-use prompt
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
