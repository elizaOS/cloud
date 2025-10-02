"use client";

import { Download, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImageDisplayProps {
  imageUrl: string;
  prompt: string;
  generatedText?: string;
  onDownload: () => void;
  onGenerateAnother: () => void;
}

export function ImageDisplay({
  imageUrl,
  prompt,
  generatedText,
  onDownload,
  onGenerateAnother
}: ImageDisplayProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-700">
      {generatedText && (
        <div className="rounded-xl border bg-gradient-to-br from-card to-muted/20 px-6 py-4 shadow-sm">
          <p className="text-sm text-muted-foreground italic text-center leading-relaxed">
            &quot;{generatedText}&quot;
          </p>
        </div>
      )}

      <div className="relative rounded-2xl border-2 bg-card overflow-hidden shadow-xl hover:shadow-2xl transition-shadow duration-300">
        <div className="aspect-square w-full bg-muted/10">
          <img
            src={imageUrl}
            alt={prompt}
            className="w-full h-full object-contain"
          />
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-6 pt-12">
          <p className="text-sm font-medium text-white/90 line-clamp-2 leading-relaxed">
            {prompt}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Button
          variant="outline"
          onClick={onDownload}
          className="rounded-xl h-12 text-base font-medium shadow-sm hover:shadow-md transition-all"
          size="lg"
        >
          <Download className="mr-2 h-4 w-4" />
          Download
        </Button>
        <Button
          onClick={onGenerateAnother}
          className="rounded-xl h-12 text-base font-medium shadow-md hover:shadow-lg transition-all"
          size="lg"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Generate Another
        </Button>
      </div>
    </div>
  );
}
