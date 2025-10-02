"use client";

import { useState } from "react";
import Image from "next/image";
import { Loader2, Sparkles, Download, Wand2, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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
      const response = await fetch("/api/generate-image", {
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

      // Handle base64 image
      const imageData = data.image.startsWith('data:') 
        ? data.image 
        : `data:image/png;base64,${data.image}`;
      setImageUrl(imageData);
      
      // Store any generated text response
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
    
    // Create a temporary link to download the base64 image
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `eliza-generated-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 w-full">
      {/* Prompt Input Card */}
      <div className="rounded-xl border bg-gradient-to-br from-card to-muted/20 p-6 shadow-sm w-full">
        <form onSubmit={handleGenerate} className="space-y-4">
          <div>
            <div className="mb-3">
              <label
                htmlFor="prompt"
                className="flex items-center gap-2 text-sm font-semibold"
              >
                <Wand2 className="h-4 w-4 text-primary" />
                Image Description
              </label>
            </div>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.currentTarget.value)}
              placeholder="Describe the image you want to generate... (e.g., 'A futuristic city with flying cars at sunset, cyberpunk style, ultra detailed')"
              disabled={isLoading}
              rows={5}
              className="w-full rounded-xl border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none shadow-sm transition-all"
            />
            {prompt && (
              <p className="mt-2 text-xs text-muted-foreground">
                {prompt.length} characters
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isLoading || !prompt.trim()}
            className="w-full rounded-xl shadow-sm hover:shadow-md transition-all"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Generating your masterpiece...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                Generate Image
              </>
            )}
          </Button>
        </form>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-xl border border-destructive bg-destructive/10 p-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <p className="text-sm text-destructive font-medium">{error}</p>
        </div>
      )}

      {/* Generated Image */}
      {imageUrl && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full">
          {generatedText && (
            <div className="rounded-xl border bg-gradient-to-br from-card to-muted/20 p-4 shadow-sm">
              <p className="text-sm text-muted-foreground italic text-center">&quot;{generatedText}&quot;</p>
            </div>
          )}
          
          <div className="group relative rounded-2xl border bg-card overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 mx-auto max-w-2xl">
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10" />
            <Image
              src={imageUrl}
              alt={prompt}
              width={1024}
              height={1024}
              className="w-full h-auto transform group-hover:scale-105 transition-transform duration-500"
              unoptimized
            />
            <div className="absolute bottom-0 left-0 right-0 p-6 text-white z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <p className="text-sm font-medium line-clamp-2">{prompt}</p>
            </div>
          </div>

          <div className="flex gap-3 max-w-2xl mx-auto">
            <Button
              variant="outline"
              onClick={handleDownload}
              className="flex-1 rounded-xl shadow-sm hover:shadow-md transition-all"
              size="lg"
            >
              <Download className="mr-2 h-4 w-4" />
              Download Image
            </Button>
            <Button
              onClick={() => {
                setImageUrl(null);
                setGeneratedText("");
              }}
              className="flex-1 rounded-xl shadow-sm hover:shadow-md transition-all"
              size="lg"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Another
            </Button>
          </div>
        </div>
      )}
      
      {/* Loading State with Skeleton */}
      {isLoading && !imageUrl && (
        <div className="space-y-4 animate-in fade-in duration-500 w-full">
          <div className="rounded-2xl border bg-card overflow-hidden shadow-lg max-w-2xl mx-auto">
            <Skeleton className="w-full aspect-square" />
          </div>
          <div className="flex gap-3 max-w-2xl mx-auto">
            <Skeleton className="h-12 flex-1 rounded-xl" />
            <Skeleton className="h-12 flex-1 rounded-xl" />
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating your image...
            </p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!imageUrl && !isLoading && (
        <div className="rounded-2xl border-2 border-dashed p-16 text-center bg-gradient-to-br from-muted/20 to-transparent hover:border-primary/50 transition-all duration-300">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-600/20 mb-6">
            <ImageIcon className="h-10 w-10 text-primary" />
          </div>
          <h3 className="text-xl font-bold mb-3 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            Ready to Create Magic
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            Describe your vision in detail above and watch as AI brings it to life. 
            The more specific you are, the better the results!
          </p>
          <div className="mt-6 flex items-center justify-center gap-2">
            <Badge variant="outline" className="text-xs">
              1024x1024
            </Badge>
            <Badge variant="outline" className="text-xs">
              High Quality
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}

