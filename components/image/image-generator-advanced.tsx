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

const PRESET_PROMPTS = [
  "A majestic lion in a fantasy landscape with aurora borealis",
  "Cyberpunk cityscape at night with neon lights and flying cars",
  "A serene Japanese garden with cherry blossoms and koi pond",
  "Abstract geometric art with vibrant colors and patterns",
  "A futuristic space station orbiting a distant planet",
];

const SIZE_PRESETS = [
  { label: "Square", width: 1024, height: 1024 },
  { label: "Portrait", width: 768, height: 1024 },
  { label: "Landscape", width: 1024, height: 768 },
  { label: "Wide", width: 1280, height: 768 },
];

export function ImageGeneratorAdvanced() {
  const [prompt, setPrompt] = useState("");
  const [settings, setSettings] = useState<ImageGenerationSettings>({
    width: 1024,
    height: 1024,
    steps: 30,
    guidanceScale: 7.5,
  });
  const [currentImage, setCurrentImage] = useState<GeneratedImage | null>(null);
  const [currentImages, setCurrentImages] = useState<GeneratedImage[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [numImages, setNumImages] = useState<number>(1);
  const [carouselApi, setCarouselApi] = useState<CarouselApi | undefined>(
    undefined,
  );
  const [imageHistory, setImageHistory] = useState<GeneratedImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("generate");
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setIsLoading(true);
    setError(null);

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
        throw new Error(data.error || "Failed to generate image");
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
          setCurrentImages(generatedBatch);
          setCurrentImage(generatedBatch[0]);
          setCurrentImageIndex(0);
          setImageHistory((prev) => [...generatedBatch, ...prev].slice(0, 12));
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

        setCurrentImages([newImage]);
        setCurrentImage(newImage);
        setCurrentImageIndex(0);
        setImageHistory((prev) => [newImage, ...prev].slice(0, 12));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
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
      setCurrentImageIndex(idx);
      const img = currentImages[idx];
      if (img) setCurrentImage(img);
    };
    carouselApi.on("select", onSelect);
    onSelect();
    return () => {
      carouselApi.off("select", onSelect);
    };
  }, [carouselApi, currentImages]);

  return (
    <div className="flex flex-col lg:flex-row gap-4 md:gap-6 w-full h-full">
      {/* Left Panel - Controls */}
      <div className="w-full lg:w-96 space-y-4">
        <BrandCard className="relative">
          <CornerBrackets size="sm" className="opacity-50" />

          <div className="relative z-10 space-y-4 md:space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Settings2 className="h-4 w-4 text-[#FF5800]" />
                <h3 className="text-base md:text-lg font-mono font-bold text-[#e1e1e1] uppercase">
                  Image Studio
                </h3>
              </div>
              <p className="text-xs md:text-sm font-mono text-[#858585]">
                Create stunning AI-generated images with advanced controls
              </p>
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
                className="w-full border border-white/10 bg-black/40 px-3 md:px-4 py-2 md:py-3 text-xs md:text-sm leading-relaxed text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800] resize-none"
              />
              {prompt && (
                <p className="text-xs font-mono text-white/50 text-right">
                  {prompt.length} characters
                </p>
              )}
            </div>

            {/* Preset Prompts */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-white/50 uppercase tracking-wide">
                Quick Presets
              </label>
              <div className="flex flex-wrap gap-2">
                {PRESET_PROMPTS.slice(0, 3).map((preset, index) => (
                  <button
                    key={index}
                    type="button"
                    className="cursor-pointer border border-white/10 bg-black/40 px-3 py-2 text-xs font-mono text-white/80 hover:bg-[#FF5800]/20 hover:border-[#FF5800]/40 hover:text-[#FF5800] transition-colors text-left w-full"
                    onClick={() => selectPresetPrompt(preset)}
                  >
                    {preset.slice(0, 30)}...
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-white/10" />

            {/* Size Presets */}
            <div className="space-y-2">
              <label className="text-xs font-mono font-medium text-white/70 uppercase tracking-wide">
                Image Size
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SIZE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      selectSizePreset(preset.width, preset.height)
                    }
                    className={`w-full px-3 py-2.5 border transition-colors ${settings.width === preset.width &&
                      settings.height === preset.height
                      ? "bg-[#FF5800] border-[#FF5800] text-white"
                      : "border-white/20 bg-black/40 text-white/70 hover:bg-white/5"
                      }`}
                  >
                    <div className="flex flex-col items-center">
                      <span className="text-xs font-mono font-medium leading-tight">
                        {preset.label}
                      </span>
                      <span className="text-[10px] font-mono leading-tight text-white/80">
                        {preset.width}×{preset.height}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-white/10" />

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
                  <p className="text-[10px] font-mono text-white/50">
                    More steps = higher quality (slower)
                  </p>
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
                  <p className="text-[10px] font-mono text-white/50">
                    Higher = more prompt adherence
                  </p>
                </div>

                {/* Images */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono text-white/50 uppercase tracking-wide">
                      Quantity
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
                  <p className="text-[10px] font-mono text-white/50">
                    Generate up to 4 images at once
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-white/10" />

            {/* Generate Button */}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isLoading || !prompt.trim()}
              className="relative bg-[#B85C3B] px-4 py-3 overflow-hidden hover:bg-[#C66D4B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full"
            >
              <div
                className="absolute inset-0 opacity-20 bg-repeat pointer-events-none"
                style={{
                  backgroundImage: `url(/assets/settings/pattern-6px-flip.png)`,
                  backgroundSize: "2.915576934814453px 2.915576934814453px",
                }}
              />
              <span className="relative z-10 text-white font-mono font-medium text-sm md:text-base flex items-center justify-center gap-2">
                {isLoading ? (
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
          value={activeTab}
          onValueChange={setActiveTab}
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
                History ({imageHistory.length})
              </span>
            </BrandTabsTrigger>
          </BrandTabsList>

          {/* Preview Tab */}
          <BrandTabsContent value="generate" className="mt-3 md:mt-4">
            {error && (
              <div className="border border-rose-500/40 bg-rose-500/10 p-3 md:p-4 mb-4">
                <p className="text-xs md:text-sm font-mono text-rose-400 font-medium">
                  {error}
                </p>
              </div>
            )}

            {currentImage ? (
              <>
                {currentImages.length > 1 && (
                  <div className="mb-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 md:gap-3">
                    {currentImages.map((img, idx) => (
                      <button
                        key={img.id}
                        onClick={() => {
                          setCurrentImageIndex(idx);
                          setCurrentImage(img);
                          if (carouselApi) {
                            carouselApi.scrollTo(idx);
                          }
                        }}
                        className={`group relative block overflow-hidden border ${idx === currentImageIndex
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
                  <div className="relative z-10 p-0">
                    {currentImages.length > 1 ? (
                      <div className="relative w-full bg-black/40">
                        <Carousel setApi={setCarouselApi} className="w-full">
                          <CarouselContent>
                            {currentImages.map((img) => (
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
                          src={currentImage.url}
                          alt={currentImage.prompt}
                          fill
                          className="object-contain"
                          unoptimized
                        />
                      </div>
                    )}

                    <div className="p-3 md:p-4 lg:p-6 space-y-3 md:space-y-4">
                      <div className="space-y-2">
                        <p className="text-xs md:text-sm font-mono font-medium leading-relaxed text-white break-words">
                          {currentImage.prompt}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-white/60 flex-wrap">
                          <span className="bg-white/10 px-2 py-0.5 text-xs font-mono text-white whitespace-nowrap">
                            {currentImage.settings.width}×
                            {currentImage.settings.height}
                          </span>
                          <span className="bg-white/10 px-2 py-0.5 text-xs font-mono text-white whitespace-nowrap">
                            {currentImage.settings.steps} steps
                          </span>
                          <span className="bg-white/10 px-2 py-0.5 text-xs font-mono text-white whitespace-nowrap">
                            CFG {currentImage.settings.guidanceScale}
                          </span>
                          {currentImages.length > 1 && (
                            <span className="bg-[#FF580020] border border-[#FF5800]/40 px-2 py-0.5 text-xs font-mono text-[#FF5800] whitespace-nowrap">
                              {currentImageIndex + 1}/{currentImages.length}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleDownload(
                              currentImages[currentImageIndex] ?? currentImage,
                            )
                          }
                          className="px-3 py-2 border border-white/20 bg-transparent text-white hover:bg-white/5 transition-colors flex items-center justify-center gap-1 md:gap-2"
                        >
                          <Download className="h-3 md:h-4 w-3 md:w-4" />
                          <span className="text-xs font-mono">Save</span>
                        </button>
                        <button
                          type="button"
                          className="px-3 py-2 border border-white/20 bg-transparent text-white hover:bg-white/5 transition-colors flex items-center justify-center gap-1 md:gap-2"
                        >
                          <Heart className="h-3 md:h-4 w-3 md:w-4" />
                          <span className="text-xs font-mono">Like</span>
                        </button>
                        <button
                          type="button"
                          className="px-3 py-2 border border-white/20 bg-transparent text-white hover:bg-white/5 transition-colors flex items-center justify-center gap-1 md:gap-2"
                        >
                          <Share2 className="h-3 md:h-4 w-3 md:w-4" />
                          <span className="text-xs font-mono">Share</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsFullscreenOpen(true)}
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
            ) : isLoading ? (
              <div className="animate-in fade-in duration-500">
                <EnhancedLoading />
              </div>
            ) : (
              <BrandCard className="relative bg-[#161616]" corners={false}>
                <div className="relative z-10 p-6 md:p-12 text-center">
                  <div className="flex flex-col items-center space-y-3 md:space-y-4">
                    <div className="inline-flex items-center justify-center w-12 md:w-16 h-12 md:h-16 bg-[#1B1B1B]">
                      <ImageIcon className="h-6 md:h-8 w-6 md:w-8 text-white" />
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
            {imageHistory.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                {imageHistory.map((image) => (
                  <div
                    key={image.id}
                    className="group cursor-pointer overflow-hidden p-0 border border-white/10 hover:border-[#FF5800]/50 transition-colors"
                    onClick={() => {
                      setCurrentImage(image);
                      setCurrentImages([image]);
                      setCurrentImageIndex(0);
                      setActiveTab("generate");
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
              <BrandCard corners={false} className="relative border-dashed bg-[#161616]">
                <div className="relative z-10 p-8 md:p-12 lg:p-20 text-center">
                  <div className="flex flex-col items-center space-y-3 md:space-y-4">
                    <History className="h-8 md:h-10 lg:h-12 w-8 md:w-10 lg:w-12 text-white" />
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
      <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
        <DialogContent
          className="!max-w-[99vw] !max-h-[99vh] !w-[99vw] !h-[99vh] p-0 bg-black/80 border-white/10 sm:!max-w-[99vw] md:!max-w-[99vw] lg:!max-w-[99vw]"
          showCloseButton={false}
        >
          <div className="relative w-full h-full flex items-center justify-center p-1">
            {currentImage && (
              <>
                <div className="relative w-full h-full flex items-center justify-center">
                  <Image
                    src={
                      currentImages[currentImageIndex]?.url ?? currentImage.url
                    }
                    alt={
                      currentImages[currentImageIndex]?.prompt ??
                      currentImage.prompt
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
                    {currentImages[currentImageIndex]?.prompt ??
                      currentImage.prompt}
                  </p>
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    <span className="bg-white/10 px-2 py-1 font-mono text-white whitespace-nowrap">
                      {currentImages[currentImageIndex]?.settings.width ??
                        currentImage.settings.width}
                      ×
                      {currentImages[currentImageIndex]?.settings.height ??
                        currentImage.settings.height}
                    </span>
                    <span className="bg-white/10 px-2 py-1 font-mono text-white whitespace-nowrap">
                      {currentImages[currentImageIndex]?.settings.steps ??
                        currentImage.settings.steps}{" "}
                      steps
                    </span>
                    <span className="bg-white/10 px-2 py-1 font-mono text-white whitespace-nowrap">
                      CFG{" "}
                      {currentImages[currentImageIndex]?.settings
                        .guidanceScale ?? currentImage.settings.guidanceScale}
                    </span>
                    {currentImages.length > 1 && (
                      <span className="bg-[#FF580020] border border-[#FF5800]/40 px-2 py-1 font-mono text-[#FF5800] whitespace-nowrap">
                        {currentImageIndex + 1}/{currentImages.length}
                      </span>
                    )}
                  </div>

                  {/* Navigation buttons for multiple images */}
                  {currentImages.length > 1 && (
                    <div className="flex items-center gap-2 pt-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          const newIndex =
                            currentImageIndex > 0
                              ? currentImageIndex - 1
                              : currentImages.length - 1;
                          setCurrentImageIndex(newIndex);
                          setCurrentImage(currentImages[newIndex]);
                        }}
                        disabled={currentImages.length <= 1}
                        className="px-3 py-2 border border-white/20 bg-black/60 text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                      >
                        <span className="text-xs font-mono">Previous</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const newIndex =
                            currentImageIndex < currentImages.length - 1
                              ? currentImageIndex + 1
                              : 0;
                          setCurrentImageIndex(newIndex);
                          setCurrentImage(currentImages[newIndex]);
                        }}
                        disabled={currentImages.length <= 1}
                        className="px-3 py-2 border border-white/20 bg-black/60 text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                      >
                        <span className="text-xs font-mono">Next</span>
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 border border-white/20 bg-black/60 text-white hover:bg-white/5 transition-colors ml-auto flex items-center gap-2"
                        onClick={() =>
                          handleDownload(
                            currentImages[currentImageIndex] ?? currentImage,
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
