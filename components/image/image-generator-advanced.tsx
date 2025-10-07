"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
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
  Share2
} from "lucide-react";
import Image from "next/image";
import { EnhancedLoading } from "./enhanced-loading";

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
  const [carouselApi, setCarouselApi] = useState<CarouselApi | undefined>(undefined);
  const [imageHistory, setImageHistory] = useState<GeneratedImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("generate");

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
        const generatedBatch: GeneratedImage[] = data.images.map(
          (
            img: { image?: string; url?: string }
            , index: number
          ) => {
            const base64OrData = img.image && img.image.startsWith("data:")
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
          }
        ).filter((g: GeneratedImage) => Boolean(g.url));

        if (generatedBatch.length > 0) {
          setCurrentImages(generatedBatch);
          setCurrentImage(generatedBatch[0]);
          setCurrentImageIndex(0);
          setImageHistory((prev) => [
            ...generatedBatch,
            ...prev,
          ].slice(0, 12));
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
    setSettings(prev => ({ ...prev, width, height }));
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
    <div className="flex flex-col lg:flex-row gap-6 w-full h-full">
      {/* Left Panel - Controls */}
      <div className="w-full lg:w-96 space-y-4">
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              Image Studio
            </CardTitle>
            <CardDescription>
              Create stunning AI-generated images with advanced controls
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Prompt Input */}
            <div className="space-y-3">
              <Label htmlFor="prompt" className="text-sm font-semibold">
                Prompt
              </Label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.currentTarget.value)}
                placeholder="Describe your vision in detail..."
                rows={6}
                className="w-full rounded-lg border-2 bg-background px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent resize-none"
              />
              {prompt && (
                <p className="text-xs text-muted-foreground text-right">
                  {prompt.length} characters
                </p>
              )}
            </div>

            {/* Preset Prompts */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Quick Presets</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_PROMPTS.slice(0, 3).map((preset, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors text-xs py-1"
                    onClick={() => selectPresetPrompt(preset)}
                  >
                    {preset.slice(0, 20)}...
                  </Badge>
                ))}
              </div>
            </div>

            <Separator />

            {/* Size Presets */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Image Size</Label>
              <div className="grid grid-cols-2 gap-2">
                {SIZE_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    variant={
                      settings.width === preset.width &&
                      settings.height === preset.height
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => selectSizePreset(preset.width, preset.height)}
                    className="w-full"
                  >
                    <div className="flex flex-col items-center">
                      <span className="text-xs font-medium">{preset.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {preset.width}×{preset.height}
                      </span>
                    </div>
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Advanced Settings */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-semibold">Advanced Settings</Label>
              </div>

              <div className="space-y-4">
                {/* Steps */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Steps</Label>
                    <span className="text-xs font-medium">{settings.steps}</span>
                  </div>
                  <Slider
                    value={[settings.steps]}
                    onValueChange={([value]) =>
                      setSettings((prev) => ({ ...prev, steps: value }))
                    }
                    min={10}
                    max={50}
                    step={5}
                    className="w-full"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    More steps = higher quality (slower)
                  </p>
                </div>

                {/* Guidance Scale */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">
                      Guidance Scale
                    </Label>
                    <span className="text-xs font-medium">
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
                    className="w-full"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Higher = more prompt adherence
                  </p>
                </div>

                {/* Images */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Images</Label>
                    <span className="text-xs font-medium">{numImages}</span>
                  </div>
                  <Slider
                    value={[numImages]}
                    onValueChange={([value]) => setNumImages(value)}
                    min={1}
                    max={4}
                    step={1}
                    className="w-full"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Generate up to 4 images at once
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={isLoading || !prompt.trim()}
              className="w-full h-12 text-base font-semibold shadow-lg hover:shadow-xl transition-all"
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-5 w-5" />
                  Generate Image
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Right Panel - Preview & History */}
      <div className="flex-1 space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="generate" className="gap-2">
              <ImageIcon className="h-4 w-4" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="h-4 w-4" />
              History ({imageHistory.length})
            </TabsTrigger>
          </TabsList>

          {/* Preview Tab */}
          <TabsContent value="generate" className="mt-4">
            {error && (
              <Card className="border-2 border-destructive bg-destructive/10 mb-4">
                <CardContent className="pt-6">
                  <p className="text-sm text-destructive font-medium">{error}</p>
                </CardContent>
              </Card>
            )}

            {currentImage ? (
              <Card className="border-2 overflow-hidden">
                <CardContent className="p-0">
                  {currentImages.length > 1 ? (
                    <div className="relative w-full bg-muted/10">
                      <Carousel setApi={setCarouselApi} className="w-full">
                        <CarouselContent>
                          {currentImages.map((img) => (
                            <CarouselItem key={img.id}>
                              <div className="relative aspect-square w-full bg-muted/10">
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
                        <CarouselPrevious className="left-4 top-1/2 -translate-y-1/2" />
                        <CarouselNext className="right-4 top-1/2 -translate-y-1/2" />
                      </Carousel>
                    </div>
                  ) : (
                    <div className="relative aspect-square w-full bg-muted/10">
                      <Image
                        src={currentImage.url}
                        alt={currentImage.prompt}
                        fill
                        className="object-contain"
                        unoptimized
                      />
                    </div>
                  )}
                  
                  <div className="p-6 space-y-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium leading-relaxed">
                        {currentImage.prompt}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="text-xs">
                          {currentImage.settings.width}×{currentImage.settings.height}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {currentImage.settings.steps} steps
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          CFG {currentImage.settings.guidanceScale}
                        </Badge>
                        {currentImages.length > 1 && (
                          <Badge variant="secondary" className="text-xs">
                            {currentImageIndex + 1}/{currentImages.length}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(currentImages[currentImageIndex] ?? currentImage)}
                        className="gap-2"
                      >
                        <Download className="h-4 w-4" />
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                      >
                        <Heart className="h-4 w-4" />
                        Like
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                      >
                        <Share2 className="h-4 w-4" />
                        Share
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                      >
                        <Maximize2 className="h-4 w-4" />
                        Full
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : isLoading ? (
              <div className="animate-in fade-in duration-500">
                <EnhancedLoading />
              </div>
            ) : (
              <Card className="border-2 border-dashed">
                <CardContent className="p-20 text-center">
                  <div className="flex flex-col items-center space-y-6">
                    <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-600/20 ring-8 ring-muted/30">
                      <ImageIcon className="h-12 w-12 text-primary" />
                    </div>
                    <div className="space-y-2 max-w-md">
                      <h3 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                        Ready to Create
                      </h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Describe your vision in the prompt field and adjust the
                        settings to generate your perfect image
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="mt-4">
            {imageHistory.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {imageHistory.map((image) => (
                  <Card
                    key={image.id}
                    className="group cursor-pointer overflow-hidden border-2 hover:border-primary transition-all hover:shadow-lg"
                    onClick={() => {
                      setCurrentImage(image);
                      setActiveTab("generate");
                    }}
                  >
                    <CardContent className="p-0">
                      <div className="relative aspect-square w-full bg-muted/10">
                        <Image
                          src={image.url}
                          alt={image.prompt}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                          unoptimized
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute bottom-0 left-0 right-0 p-3 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-xs line-clamp-2 leading-relaxed">
                            {image.prompt}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-2 border-dashed">
                <CardContent className="p-20 text-center">
                  <div className="flex flex-col items-center space-y-4">
                    <History className="h-12 w-12 text-muted-foreground" />
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">No History Yet</h3>
                      <p className="text-sm text-muted-foreground">
                        Your generated images will appear here
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
