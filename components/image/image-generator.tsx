"use client";

import { useState } from "react";
import { PromptInput } from "./prompt-input";
import { ImageDisplay } from "./image-display";
import { EmptyState } from "./empty-state";
import { LoadingState } from "./loading-state";

export function ImageGenerator() {
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [generatedText, setGeneratedText] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        body: JSON.stringify({ prompt }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate image");
      }

      const imageData = data.image.startsWith("data:")
        ? data.image
        : `data:image/png;base64,${data.image}`;
      setImageUrl(imageData);

      if (data.text) {
        setGeneratedText(data.text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!imageUrl) return;

    const link = document.createElement("a");
    link.href = imageUrl;
    link.download = `eliza-generated-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGenerateAnother = () => {
    setImageUrl(null);
    setGeneratedText("");
  };

  return (
    <div className="space-y-8 w-full">
      <PromptInput
        prompt={prompt}
        onPromptChange={setPrompt}
        onSubmit={handleGenerate}
        isLoading={isLoading}
      />

      {error && (
        <div className="rounded-xl border-2 border-destructive bg-destructive/10 px-6 py-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <p className="text-sm text-destructive font-medium">{error}</p>
        </div>
      )}

      {isLoading && !imageUrl && <LoadingState />}

      {imageUrl && (
        <ImageDisplay
          imageUrl={imageUrl}
          prompt={prompt}
          generatedText={generatedText}
          onDownload={handleDownload}
          onGenerateAnother={handleGenerateAnother}
        />
      )}

      {!imageUrl && !isLoading && <EmptyState />}
    </div>
  );
}
