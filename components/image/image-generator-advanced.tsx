/**
 * Advanced image generator component with full-featured controls.
 * Supports prompt input, advanced settings (width, height, steps, guidance scale),
 * image history, favorites, and carousel display of generated images.
 */

"use client";

import { useEffect, useState } from "react";
import { Slider } from "@/components/ui/slider";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import {
  Wand2,
  Sparkles,
  Settings2,
  ImageIcon,
  Loader2,
  Download,
  History,
  Maximize2,
  Heart,
  Share2,
  X,
} from "lucide-react";
import Image from "next/image";
import { EnhancedLoading } from "./enhanced-loading";
import {
  BrandTabs,
  BrandTabsList,
  BrandTabsTrigger,
  BrandTabsContent,
  BrandCard,
  BrandButton,
  CornerBrackets,
} from "@/components/brand";

interface ImageGenerationSettings {
  width: number;
  height: number;
  steps: number;
  guidanceScale: number;
}

interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  timestamp: Date;
  settings: ImageGenerationSettings;
}

interface GalleryItem {
  id: string;
  url: string;
  prompt: string;
  createdAt: Date;
  dimensions?: { width?: number; height?: number };
}

interface ImageGeneratorAdvancedProps {
  initialHistory?: GalleryItem[];
}

const SIZE_PRESETS = [
  { label: "Square", width: 1024, height: 1024 },
  { label: "Portrait", width: 768, height: 1024 },
  { label: "Landscape", width: 1024, height: 768 },
  { label: "Wide", width: 1280, height: 768 },
];

export function ImageGeneratorAdvanced({
  initialHistory = [],
}: ImageGeneratorAdvancedProps) {
  // Convert initial history to GeneratedImage format
  const convertedHistory: GeneratedImage[] = initialHistory.map((item) => ({
    id: item.id,
    url: item.url,
    prompt: item.prompt,
    timestamp: new Date(item.createdAt),
    settings: {
      width: item.dimensions?.width || 1024,
      height: item.dimensions?.height || 1024,
      steps: 30,
      guidanceScale: 7.5,
    },
  }));

  // Form state
  const [prompt, setPrompt] = useState("");
  const [settings, setSettings] = useState<ImageGenerationSettings>({
    width: 1024,
    height: 1024,
    steps: 30,
    guidanceScale: 7.5,
  });
  const [numImages, setNumImages] = useState<number>(1);

  // Consolidated image state - current batch and selection (initialized with server history)
  const [imageState, setImageState] = useState<{
    currentImage: GeneratedImage | null;
    currentImages: GeneratedImage[];
    currentIndex: number;
    history: GeneratedImage[];
  }>({
    currentImage: null,
    currentImages: [],
    currentIndex: 0,
    history: convertedHistory,
  });

  // Carousel API (external ref)
  const [carouselApi, setCarouselApi] = useState<CarouselApi | undefined>(
    undefined,
  );

  // Consolidated request state
  const [requestState, setRequestState] = useState<{
    isLoading: boolean;
    error: string | null;
  }>({
    isLoading: false,
    error: null,
  });

  // Consolidated UI state
  const [uiState, setUiState] = useState<{
    activeTab: string;
    isFullscreenOpen: boolean;
  }>({
    activeTab: "generate",
    isFullscreenOpen: false,
  });

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setRequestState({ isLoading: true, error: null });

    try {
      const response = await fetch("/api/v1/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          ...settings,
          numImages,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setRequestState({
          isLoading: false,
          error: data.error || "Failed to generate image",
        });
        return;
      }

      // Handle multiple images array response
      if (Array.isArray(data.images) && data.images.length > 0) {
        const generatedBatch: GeneratedImage[] = data.images
          .map((img: { image?: string; url?: string }, index: number) => {
            const base64OrData =
              img.image && img.image.startsWith("data:")
                ? img.image
                : img?.image
                  ? `data:image/png;base64,${img.image}`
                  : "";
            const finalUrl = img.url ?? base64OrData;
            return {
              id: `${Date.now()}-${index}`,
              url: finalUrl,
              prompt,
              timestamp: new Date(),
              settings: { ...settings },
            };
          })
          .filter((g: GeneratedImage) => Boolean(g.url));

        if (generatedBatch.length > 0) {
          setImageState((prev) => ({
            ...prev,
            currentImages: generatedBatch,
            currentImage: generatedBatch[0],
            currentIndex: 0,
            history: [...generatedBatch, ...prev.history].slice(0, 12),
          }));
        }
      } else if (data.image) {
        // Backward compatibility: single image response
        const imageData = data.image.startsWith("data:")
          ? data.image
          : `data:image/png;base64,${data.image}`;

        const newImage: GeneratedImage = {
          id: Date.now().toString(),
          url: imageData,
          prompt,
          timestamp: new Date(),
          settings: { ...settings },
        };

        setImageState((prev) => ({
          ...prev,
          currentImages: [newImage],
          currentImage: newImage,
          currentIndex: 0,
          history: [newImage, ...prev.history].slice(0, 12),
        }));
      }
    } catch (err) {
      setRequestState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : "An error occurred",
      }));
    } finally {
      setRequestState((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const handleDownload = (image: GeneratedImage) => {
    const link = document.createElement("a");
    link.href = image.url;
    link.download = `eliza-${image.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const selectPresetPrompt = (presetPrompt: string) => {
    setPrompt(presetPrompt);
  };

  const selectSizePreset = (width: number, height: number) => {
    setSettings((prev) => ({ ...prev, width, height }));
  };

  useEffect(() => {
    if (!carouselApi) return;
    const onSelect = () => {
      const idx = carouselApi.selectedScrollSnap();
      const img = imageState.currentImages[idx];
      if (img) {
        setImageState((prev) => ({
          ...prev,
          currentIndex: idx,
          currentImage: img,
        }));
      }
    };
    carouselApi.on("select", onSelect);
    onSelect();
    return () => {
      carouselApi.off("select", onSelect);
    };
  }, [carouselApi, imageState.currentImages]);

  return (
    <div className="flex flex-col lg:flex-row gap-4 md:gap-6 w-full h-full">
      {/* Left Panel - Controls */}
      <div className="w-full lg:w-96 space-y-4">
        <BrandCard className="relative">
          <CornerBrackets size="sm" className="opacity-50" />

          <div className="relative z-10 space-y-4 md:space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-[#FF5800]" />
                <h3 className="text-base md:text-lg font-mono font-bold text-[#e1e1e1] uppercase">
                  Image Studio
                </h3>
              </div>
            </div>
            {/* Prompt Input */}
            <div className="space-y-3">
              <label
                htmlFor="prompt"
                className="text-xs font-mono font-medium text-white/70 uppercase tracking-wide"
              >
                Prompt
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.currentTarget.value)}
                placeholder="Describe your vision in detail..."
                rows={5}
                className="w-full border border-white/10 bg-black/40 px-3 md:px-4 py-2 md:py-3 text-xs md:text-sm leading-relaxed text-white placeholder:text-white/40 focus:outline-none border-[0.1px] focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800] resize-none"
              />
            </div>

            {/* Size Presets */}
            <div className="space-y-2">
              <label className="text-xs font-mono font-medium text-white/70 uppercase tracking-wide">
                Image Size
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {SIZE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      selectSizePreset(preset.width, preset.height)
                    }
                    className={`w-full px-1.5 py-1 border transition-colors ${
                      settings.width === preset.width &&
                      settings.height === preset.height
                        ? "bg-[#FF5800]/20 border-[#FF5800] text-[#FF5800]"
                        : "border-white/20 bg-transparent text-white hover:bg-white/5"
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-mono font-medium leading-tight py-2">
                        {preset.label}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced Settings */}
            <div className="space-y-3 md:space-y-4">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-[#FF5800]" />
                <label className="text-xs font-mono font-medium text-white/70 uppercase tracking-wide">
                  Advanced Settings
                </label>
              </div>

              <div className="space-y-3 md:space-y-4">
                {/* Steps */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono text-white/50 uppercase tracking-wide">
                      Steps
                    </label>
                    <span className="text-xs font-mono font-medium text-white">
                      {settings.steps}
                    </span>
                  </div>
                  <Slider
                    value={[settings.steps]}
                    onValueChange={([value]) =>
                      setSettings((prev) => ({ ...prev, steps: value }))
                    }
                    min={10}
                    max={50}
                    step={5}
                    className="w-full [&_[role=slider]]:bg-[#FF5800] [&_[role=slider]]:border-[#FF5800]"
                  />
                </div>

                {/* Guidance Scale */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono text-white/50 uppercase tracking-wide">
                      Guidance Scale
                    </label>
                    <span className="text-xs font-mono font-medium text-white">
                      {settings.guidanceScale.toFixed(1)}
                    </span>
                  </div>
                  <Slider
                    value={[settings.guidanceScale]}
                    onValueChange={([value]) =>
                      setSettings((prev) => ({ ...prev, guidanceScale: value }))
                    }
                    min={1}
                    max={20}
                    step={0.5}
                    className="w-full [&_[role=slider]]:bg-[#FF5800] [&_[role=slider]]:border-[#FF5800]"
                  />
                </div>

                {/* Images */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono text-white/50 uppercase tracking-wide">
                      Images
                    </label>
                    <span className="text-xs font-mono font-medium text-white">
                      {numImages}
                    </span>
                  </div>
                  <Slider
                    value={[numImages]}
                    onValueChange={([value]) => setNumImages(value)}
                    min={1}
                    max={4}
                    step={1}
                    className="w-full [&_[role=slider]]:bg-[#FF5800] [&_[role=slider]]:border-[#FF5800]"
                  />
                </div>
              </div>
            </div>

            {/* Generate Button */}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={requestState.isLoading || !prompt.trim()}
              className="relative bg-[#e1e1e1] px-4 py-3 overflow-hidden hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full"
            >
              <div
                className="absolute inset-0 opacity-20 bg-repeat pointer-events-none"
                style={{
                  backgroundImage: `url(/assets/settings/pattern-6px-flip.png)`,
                  backgroundSize: "2.915576934814453px 2.915576934814453px",
                }}
              />
              <span className="relative z-10 text-black font-mono font-medium text-sm md:text-base flex items-center justify-center gap-2">
                {requestState.isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    Generate Image
                  </>
                )}
              </span>
            </button>
          </div>
        </BrandCard>
      </div>

      {/* Right Panel - Preview & History */}
      <div className="flex-1 space-y-4">
        <BrandTabs
          id="image-generator-tabs"
          value={uiState.activeTab}
          onValueChange={(value) =>
            setUiState((prev) => ({ ...prev, activeTab: value }))
          }
          className="w-full"
        >
          <BrandTabsList className="w-full max-w-md">
            <BrandTabsTrigger
              value="generate"
              className="gap-1 md:gap-2 flex-1"
            >
              <ImageIcon className="h-3 md:h-4 w-3 md:w-4" />
              <span className="text-xs md:text-sm">Preview</span>
            </BrandTabsTrigger>
            <BrandTabsTrigger value="history" className="gap-1 md:gap-2 flex-1">
              <History className="h-3 md:h-4 w-3 md:w-4" />
              <span className="text-xs md:text-sm">
                History ({imageState.history.length})
              </span>
            </BrandTabsTrigger>
          </BrandTabsList>

          {/* Preview Tab */}
          <BrandTabsContent value="generate" className="mt-3 md:mt-4">
            {requestState.error && (
              <div className="border border-rose-500/40 bg-rose-500/10 p-3 md:p-4 mb-4">
                <p className="text-xs md:text-sm font-mono text-rose-400 font-medium">
                  {requestState.error}
                </p>
              </div>
            )}

            {imageState.currentImage ? (
              <>
                {imageState.currentImages.length > 1 && (
                  <div className="mb-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 md:gap-3">
                    {imageState.currentImages.map((img, idx) => (
                      <button
                        key={img.id}
                        onClick={() => {
                          setImageState((prev) => ({
                            ...prev,
                            currentIndex: idx,
                            currentImage: img,
                          }));
                          if (carouselApi) {
                            carouselApi.scrollTo(idx);
                          }
                        }}
                        className={`group relative block overflow-hidden border ${
                          idx === imageState.currentIndex
                            ? "border-[#FF5800] ring-2 ring-[#FF5800]/40"
                            : "border-white/10"
                        }`}
                        aria-label={`Select image ${idx + 1}`}
                        type="button"
                      >
                        <div className="relative aspect-square w-full bg-black/40">
                          <Image
                            src={img.url}
                            alt={img.prompt}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                            unoptimized
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <BrandCard className="relative overflow-hidden">
                  <CornerBrackets size="md" className="opacity-50" />
                  <div className="relative z-10 p-0">
                    {imageState.currentImages.length > 1 ? (
                      <div className="relative w-full bg-black/40">
                        <Carousel setApi={setCarouselApi} className="w-full">
                          <CarouselContent>
                            {imageState.currentImages.map((img) => (
                              <CarouselItem key={img.id}>
                                <div className="relative w-full h-[300px] md:h-[400px] lg:h-[500px] bg-black/40">
                                  <Image
                                    src={img.url}
                                    alt={img.prompt}
                                    fill
                                    className="object-contain"
                                    unoptimized
                                  />
                                </div>
                              </CarouselItem>
                            ))}
                          </CarouselContent>
                          <CarouselPrevious className="left-2 md:left-4 top-1/2 -translate-y-1/2" />
                          <CarouselNext className="right-2 md:right-4 top-1/2 -translate-y-1/2" />
                        </Carousel>
                      </div>
                    ) : (
                      <div className="relative w-full h-[300px] md:h-[400px] lg:h-[500px] bg-black/40">
                        <Image
                          src={imageState.currentImage.url}
                          alt={imageState.currentImage.prompt}
                          fill
                          className="object-contain"
                          unoptimized
                        />
                      </div>
                    )}

                    <div className="p-3 md:p-4 lg:p-6 space-y-3 md:space-y-4">
                      <div className="space-y-2">
                        <p className="text-xs md:text-sm font-mono font-medium leading-relaxed text-white break-words">
                          {imageState.currentImage.prompt}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-white/60 flex-wrap">
                          <span className="bg-white/10 px-2 py-0.5 text-xs font-mono text-white whitespace-nowrap">
                            {imageState.currentImage.settings.width}×
                            {imageState.currentImage.settings.height}
                          </span>
                          <span className="bg-white/10 px-2 py-0.5 text-xs font-mono text-white whitespace-nowrap">
                            {imageState.currentImage.settings.steps} steps
                          </span>
                          <span className="bg-white/10 px-2 py-0.5 text-xs font-mono text-white whitespace-nowrap">
                            CFG {imageState.currentImage.settings.guidanceScale}
                          </span>
                          {imageState.currentImages.length > 1 && (
                            <span className="bg-[#FF580020] border border-[#FF5800]/40 px-2 py-0.5 text-xs font-mono text-[#FF5800] whitespace-nowrap">
                              {imageState.currentIndex + 1}/
                              {imageState.currentImages.length}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleDownload(
                              imageState.currentImages[
                                imageState.currentIndex
                              ] ?? imageState.currentImage,
                            )
                          }
                          className="px-3 py-2 border border-white/20 bg-transparent text-white hover:bg-white/5 transition-colors flex items-center justify-center gap-1 md:gap-2"
                        >
                          <Download className="h-3 md:h-4 w-3 md:w-4" />
                          <span className="text-xs font-mono">Download</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setUiState((prev) => ({
                              ...prev,
                              isFullscreenOpen: true,
                            }))
                          }
                          className="px-3 py-2 border border-white/20 bg-transparent text-white hover:bg-white/5 transition-colors flex items-center justify-center gap-1 md:gap-2"
                        >
                          <Maximize2 className="h-3 md:h-4 w-3 md:w-4" />
                          <span className="text-xs font-mono">Full</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </BrandCard>
              </>
            ) : requestState.isLoading ? (
              <div className="animate-in fade-in duration-500">
                <EnhancedLoading />
              </div>
            ) : (
              <BrandCard className="relative border-dashed">
                <CornerBrackets size="md" className="opacity-50" />
                <div className="relative z-10 p-6 md:p-12 text-center">
                  <div className="flex flex-col items-center space-y-3 md:space-y-4">
                    <div className="inline-flex items-center justify-center w-12 md:w-16 h-12 md:h-16 bg-[#FF580020] border border-[#FF5800]/40">
                      <ImageIcon className="h-6 md:h-8 w-6 md:w-8 text-[#FF5800]" />
                    </div>
                    <div className="space-y-2 max-w-md">
                      <h3 className="text-base md:text-lg font-mono font-bold text-white">
                        Ready to Create
                      </h3>
                      <p className="text-xs md:text-sm font-mono text-white/60 leading-relaxed">
                        Describe your vision in the prompt field and adjust the
                        settings to generate your perfect image
                      </p>
                    </div>
                  </div>
                </div>
              </BrandCard>
            )}
          </BrandTabsContent>

          {/* History Tab */}
          <BrandTabsContent value="history" className="mt-3 md:mt-4">
            {imageState.history.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                {imageState.history.map((image) => (
                  <div
                    key={image.id}
                    className="group cursor-pointer overflow-hidden p-0 border border-white/10 hover:border-[#FF5800]/50 transition-colors"
                    onClick={() => {
                      setImageState((prev) => ({
                        ...prev,
                        currentImage: image,
                        currentImages: [image],
                        currentIndex: 0,
                      }));
                      setUiState((prev) => ({
                        ...prev,
                        activeTab: "generate",
                      }));
                    }}
                  >
                    <div className="relative aspect-square w-full bg-black/40">
                      <Image
                        src={image.url}
                        alt={image.prompt}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                        unoptimized
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10" />
                      <div className="absolute bottom-0 left-0 right-0 p-2 md:p-3 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <p className="text-xs font-mono line-clamp-2 leading-relaxed">
                          {image.prompt}
                        </p>
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
                    <History className="h-8 md:h-10 lg:h-12 w-8 md:w-10 lg:w-12 text-[#FF5800]" />
                    <div className="space-y-2">
                      <h3 className="text-base md:text-lg font-mono font-semibold text-white">
                        No History Yet
                      </h3>
                      <p className="text-xs md:text-sm font-mono text-white/60">
                        Your generated images will appear here
                      </p>
                    </div>
                  </div>
                </div>
              </BrandCard>
            )}
          </BrandTabsContent>
        </BrandTabs>
      </div>

      {/* Fullscreen Image Modal */}
      <Dialog
        open={uiState.isFullscreenOpen}
        onOpenChange={(open) =>
          setUiState((prev) => ({ ...prev, isFullscreenOpen: open }))
        }
      >
        <DialogContent
          className="!max-w-[99vw] !max-h-[99vh] !w-[99vw] !h-[99vh] p-0 bg-black/80 border-white/10 sm:!max-w-[99vw] md:!max-w-[99vw] lg:!max-w-[99vw]"
          showCloseButton={false}
        >
          <div className="relative w-full h-full flex items-center justify-center p-1">
            {imageState.currentImage && (
              <>
                <div className="relative w-full h-full flex items-center justify-center">
                  <Image
                    src={
                      imageState.currentImages[imageState.currentIndex]?.url ??
                      imageState.currentImage.url
                    }
                    alt={
                      imageState.currentImages[imageState.currentIndex]
                        ?.prompt ?? imageState.currentImage.prompt
                    }
                    width={3000}
                    height={3000}
                    className="object-contain max-w-full max-h-full w-auto h-auto"
                    unoptimized
                  />
                </div>

                {/* Close button */}
                <DialogClose className="absolute top-2 md:top-4 right-2 md:right-4 z-50 border border-white/20 bg-black/60 p-2 hover:bg-[#FF580020] hover:border-[#FF5800]/40 transition-colors">
                  <X className="h-4 md:h-5 w-4 md:w-5 text-white" />
                </DialogClose>

                {/* Image info overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 md:p-4 lg:p-6 space-y-2 md:space-y-3">
                  <p className="text-xs md:text-sm font-mono text-white/90 leading-relaxed max-w-3xl break-words">
                    {imageState.currentImages[imageState.currentIndex]
                      ?.prompt ?? imageState.currentImage.prompt}
                  </p>
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <span className="bg-white/10 px-2 py-1 font-mono text-white whitespace-nowrap">
                      {imageState.currentImages[imageState.currentIndex]
                        ?.settings.width ??
                        imageState.currentImage.settings.width}
                      ×
                      {imageState.currentImages[imageState.currentIndex]
                        ?.settings.height ??
                        imageState.currentImage.settings.height}
                    </span>
                    <span className="bg-white/10 px-2 py-1 font-mono text-white whitespace-nowrap">
                      {imageState.currentImages[imageState.currentIndex]
                        ?.settings.steps ??
                        imageState.currentImage.settings.steps}{" "}
                      steps
                    </span>
                    <span className="bg-white/10 px-2 py-1 font-mono text-white whitespace-nowrap">
                      CFG{" "}
                      {imageState.currentImages[imageState.currentIndex]
                        ?.settings.guidanceScale ??
                        imageState.currentImage.settings.guidanceScale}
                    </span>
                    {imageState.currentImages.length > 1 && (
                      <span className="bg-[#FF580020] border border-[#FF5800]/40 px-2 py-1 font-mono text-[#FF5800] whitespace-nowrap">
                        {imageState.currentIndex + 1}/
                        {imageState.currentImages.length}
                      </span>
                    )}
                  </div>

                  {/* Navigation buttons for multiple images */}
                  {imageState.currentImages.length > 1 && (
                    <div className="flex items-center gap-2 pt-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          const newIndex =
                            imageState.currentIndex > 0
                              ? imageState.currentIndex - 1
                              : imageState.currentImages.length - 1;
                          setImageState((prev) => ({
                            ...prev,
                            currentIndex: newIndex,
                            currentImage: prev.currentImages[newIndex],
                          }));
                        }}
                        disabled={imageState.currentImages.length <= 1}
                        className="px-3 py-2 border border-white/20 bg-black/60 text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                      >
                        <span className="text-xs font-mono">Previous</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const newIndex =
                            imageState.currentIndex <
                            imageState.currentImages.length - 1
                              ? imageState.currentIndex + 1
                              : 0;
                          setImageState((prev) => ({
                            ...prev,
                            currentIndex: newIndex,
                            currentImage: prev.currentImages[newIndex],
                          }));
                        }}
                        disabled={imageState.currentImages.length <= 1}
                        className="px-3 py-2 border border-white/20 bg-black/60 text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                      >
                        <span className="text-xs font-mono">Next</span>
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 border border-white/20 bg-black/60 text-white hover:bg-white/5 transition-colors ml-auto flex items-center gap-2"
                        onClick={() =>
                          handleDownload(
                            imageState.currentImages[imageState.currentIndex] ??
                              imageState.currentImage!,
                          )
                        }
                      >
                        <Download className="h-4 w-4" />
                        <span className="text-xs font-mono">Download</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
