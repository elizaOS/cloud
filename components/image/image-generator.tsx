"use client";

import { useState } from "react";
import { Loader2, Sparkles, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div className="space-y-6">
      {/* Prompt Input */}
      <form onSubmit={handleGenerate} className="space-y-4">
        <div>
          <label
            htmlFor="prompt"
            className="block text-sm font-medium mb-2"
          >
            Image Description
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            placeholder="Describe the image you want to generate... (e.g., 'A futuristic city with flying cars at sunset')"
            disabled={isLoading}
            rows={4}
            className="w-full rounded-md border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none"
          />
        </div>

        <Button
          type="submit"
          disabled={isLoading || !prompt.trim()}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Image
            </>
          )}
        </Button>
      </form>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Generated Image */}
      {imageUrl && (
        <div className="space-y-4">
          {generatedText && (
            <div className="rounded-lg border bg-card p-4">
              <p className="text-sm text-muted-foreground">{generatedText}</p>
            </div>
          )}
          
          <div className="relative rounded-lg border bg-card overflow-hidden">
            <img
              src={imageUrl}
              alt={prompt}
              className="w-full h-auto"
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleDownload}
              className="flex-1"
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setImageUrl(null);
                setGeneratedText("");
              }}
              className="flex-1"
            >
              Generate Another
            </Button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!imageUrl && !isLoading && (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Sparkles className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No image generated yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Enter a description above and click &quot;Generate Image&quot; to create stunning AI-generated artwork.
          </p>
        </div>
      )}
    </div>
  );
}

