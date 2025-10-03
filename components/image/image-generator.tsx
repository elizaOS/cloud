"use client";

import { useState } from "react";
import Image from "next/image";
import { Loader2, Sparkles, Download, Wand2, Image as ImageIcon, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export function ImageGenerator() {
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [generatedText, setGeneratedText] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(true);

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
      setShowForm(false); // Hide form when image is generated
      
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

  const handleReset = () => {
    setImageUrl(null);
    setGeneratedText("");
    setShowForm(true);
    setError(null);
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
    <div className="relative w-full">
      {/* Error Message - Always on top */}
      {error && (
        <div className="mb-6 rounded-xl border border-destructive bg-destructive/10 p-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <p className="text-sm text-destructive font-medium">{error}</p>
        </div>
      )}

      {/* Generated Image - Main Stage */}
      {imageUrl && (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-700 w-full max-w-4xl mx-auto">
          {/* Back to form button */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={handleReset}
              className="rounded-lg hover:bg-accent transition-all group"
              size="sm"
            >
              <ArrowLeft className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
              Create New Image
            </Button>
            {generatedText && (
              <Badge variant="outline" className="text-xs">
                <Sparkles className="h-3 w-3 mr-1" />
                AI Enhanced
              </Badge>
            )}
          </div>

          {/* Prompt Display */}
          <div className="rounded-xl border bg-gradient-to-br from-card to-muted/20 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-md">
                <Wand2 className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Your Prompt
                </p>
                <p className="text-sm leading-relaxed">{prompt}</p>
              </div>
            </div>
          </div>

          {generatedText && (
            <div className="rounded-xl border bg-gradient-to-br from-purple-500/5 to-blue-600/5 p-5 shadow-sm">
              <p className="text-sm text-muted-foreground italic text-center leading-relaxed">
                &quot;{generatedText}&quot;
              </p>
            </div>
          )}
          
          {/* Image Display */}
          <div className="group relative rounded-2xl border-2 bg-card overflow-hidden shadow-2xl hover:shadow-3xl transition-all duration-500">
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10" />
            <div className="relative w-full aspect-square">
              <Image
                src={imageUrl}
                alt={prompt}
                fill
                className="object-contain transform group-hover:scale-[1.02] transition-transform duration-700"
                unoptimized
                priority
              />
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-6 text-white z-20 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="text-xs bg-white/20 backdrop-blur-sm">
                  1024x1024
                </Badge>
                <Badge variant="secondary" className="text-xs bg-white/20 backdrop-blur-sm">
                  High Quality
                </Badge>
              </div>
              <p className="text-sm font-medium line-clamp-2">{prompt}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <Button
              variant="outline"
              onClick={handleDownload}
              className="flex-1 rounded-xl shadow-sm hover:shadow-md transition-all border-2 hover:border-primary/40"
              size="lg"
            >
              <Download className="mr-2 h-5 w-5" />
              Download
            </Button>
            <Button
              onClick={handleReset}
              className="flex-1 rounded-xl shadow-md hover:shadow-lg transition-all bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
              size="lg"
            >
              <Sparkles className="mr-2 h-5 w-5" />
              Generate Another
            </Button>
          </div>
        </div>
      )}
      
      {/* Loading State */}
      {isLoading && (
        <div className="space-y-6 animate-in fade-in duration-500 w-full max-w-4xl mx-auto">
          <div className="rounded-2xl border-2 bg-card overflow-hidden shadow-xl">
            <div className="relative w-full aspect-square">
              <Skeleton className="w-full h-full" />
              <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm">
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 animate-pulse">
                    <Sparkles className="h-8 w-8 text-primary animate-spin" />
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-1">Creating your masterpiece</p>
                    <p className="text-xs text-muted-foreground flex items-center justify-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      This may take a few moments...
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-4">
            <Skeleton className="h-12 flex-1 rounded-xl" />
            <Skeleton className="h-12 flex-1 rounded-xl" />
          </div>
        </div>
      )}

      {/* Input Form */}
      {showForm && !isLoading && !imageUrl && (
        <div className="space-y-6 w-full max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Prompt Input Card */}
          <div className="rounded-xl border-2 bg-gradient-to-br from-card to-muted/20 p-6 shadow-lg w-full">
            <form onSubmit={handleGenerate} className="space-y-5">
              <div>
                <div className="mb-3">
                  <label
                    htmlFor="prompt"
                    className="flex items-center gap-2 text-sm font-semibold"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
                      <Wand2 className="h-4 w-4 text-white" />
                    </div>
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
                  className="w-full rounded-xl border-2 border-muted-foreground/20 bg-background px-5 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 disabled:opacity-50 resize-none shadow-sm transition-all placeholder:text-muted-foreground/60"
                />
                {prompt && (
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-xs text-muted-foreground">
                      {prompt.length} characters
                    </p>
                    <Badge variant="outline" className="text-xs">
                      <Sparkles className="h-3 w-3 mr-1" />
                      AI Ready
                    </Badge>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                disabled={isLoading || !prompt.trim()}
                className="w-full rounded-xl shadow-md hover:shadow-lg transition-all bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
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

          {/* Empty State */}
          <div className="rounded-2xl border-2 border-dashed py-12 px-8 text-center bg-gradient-to-br from-purple-500/5 via-transparent to-blue-600/5 hover:border-primary/50 transition-all duration-300">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-600/20 mb-4 shadow-lg">
              <ImageIcon className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-xl font-bold mb-2 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              Ready to Create Magic
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed mb-4">
              Describe your vision in detail above and watch as AI brings it to life. 
              The more specific you are, the better the results!
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs px-2 py-1">
                1024x1024
              </Badge>
              <Badge variant="outline" className="text-xs px-2 py-1">
                High Quality
              </Badge>
              <Badge variant="outline" className="text-xs px-2 py-1">
                Fast Generation
              </Badge>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

