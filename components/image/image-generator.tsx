"use client";

import { useState } from "react";
import { PromptInput } from "./prompt-input";
import { ImageDisplay } from "./image-display";
import { EmptyState } from "./empty-state";
import { LoadingState } from "./loading-state";

export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "21:9" | "9:21";
export type StylePreset = "none" | "photographic" | "digital-art" | "comic-book" | "fantasy-art" | "analog-film" | "neon-punk" | "isometric" | "low-poly" | "origami" | "line-art" | "cinematic" | "3d-model";

interface GeneratedImage {
  image: string;
  url?: string;
  text: string;
}

export function ImageGenerator() {
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numImages, setNumImages] = useState(1);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [stylePreset, setStylePreset] = useState<StylePreset>("none");

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
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
          numImages,
          aspectRatio,
          stylePreset: stylePreset !== "none" ? stylePreset : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate image");
      }

      // Handle multiple images response
      if (data.images && Array.isArray(data.images)) {
        const processedImages = data.images.map((img: GeneratedImage) => ({
          image: img.image.startsWith("data:") ? img.image : `data:image/png;base64,${img.image}`,
          url: img.url,
          text: img.text || "",
        }));
        setImages(processedImages);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = (imageData: string, index: number) => {
    const link = document.createElement("a");
    link.href = imageData;
    link.download = `eliza-generated-${Date.now()}-${index + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGenerateAnother = () => {
    setImages([]);
  };

  return (
    <div className="space-y-8 w-full">
      <PromptInput
        prompt={prompt}
        onPromptChange={setPrompt}
        onSubmit={handleGenerate}
        isLoading={isLoading}
        numImages={numImages}
        onNumImagesChange={setNumImages}
        aspectRatio={aspectRatio}
        onAspectRatioChange={setAspectRatio}
        stylePreset={stylePreset}
        onStylePresetChange={setStylePreset}
      />

      {error && (
        <div className="rounded-xl border-2 border-destructive bg-destructive/10 px-6 py-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <p className="text-sm text-destructive font-medium">{error}</p>
        </div>
      )}

      {isLoading && images.length === 0 && <LoadingState />}

      {images.length > 0 && (
        <div className="space-y-6">
          <div className={`grid gap-6 ${images.length === 1 ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
            {images.map((img, index) => (
              <ImageDisplay
                key={index}
                imageUrl={img.image}
                prompt={prompt}
                generatedText={img.text}
                onDownload={() => handleDownload(img.image, index)}
                onGenerateAnother={handleGenerateAnother}
                showGenerateAnother={index === images.length - 1}
              />
            ))}
          </div>
        </div>
      )}

      {images.length === 0 && !isLoading && <EmptyState />}
    </div>
  );
}
