"use client";

import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PromptInputProps {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
}

export function PromptInput({ prompt, onPromptChange, onSubmit, isLoading }: PromptInputProps) {
  return (
    <div className="rounded-2xl border bg-gradient-to-br from-card to-muted/20 p-8 shadow-sm">
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label
              htmlFor="prompt"
              className="flex items-center gap-2 text-sm font-semibold"
            >
              <Wand2 className="h-4 w-4 text-primary" />
              Image Description
            </label>
            {prompt && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {prompt.length} characters
              </span>
            )}
          </div>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => onPromptChange(e.currentTarget.value)}
            placeholder="Describe the image you want to generate in detail... The more specific you are, the better the results!"
            disabled={isLoading}
            rows={6}
            className="w-full rounded-xl border-2 bg-background px-5 py-4 text-sm leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-none shadow-sm transition-all"
          />
        </div>

        <Button
          type="submit"
          disabled={isLoading || !prompt.trim()}
          className="w-full rounded-xl h-12 text-base font-medium shadow-md hover:shadow-lg transition-all"
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
  );
}
