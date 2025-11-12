"use client";

import { useMemo } from "react";
import { Loader2, Sparkles, Timer } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { VideoModelOption } from "./types";
import { BrandCard, BrandButton, CornerBrackets } from "@/components/brand";

interface VideoGenerationFormProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  selectedModel: string;
  onModelChange: (value: string) => void;
  models: VideoModelOption[];
  referenceUrl: string;
  onReferenceChange: (value: string) => void;
  onGenerate?: (payload: {
    prompt: string;
    model: string;
    referenceUrl?: string;
  }) => void;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  statusMessage?: string | null;
}

export function VideoGenerationForm({
  prompt,
  onPromptChange,
  selectedModel,
  onModelChange,
  models,
  onGenerate,
  referenceUrl,
  onReferenceChange,
  isSubmitting = false,
  errorMessage,
  statusMessage,
}: VideoGenerationFormProps) {
  const activeModel = useMemo(
    () => models.find((model) => model.id === selectedModel) ?? models[0],
    [models, selectedModel],
  );

  return (
    <BrandCard className="relative h-full">
      <CornerBrackets size="md" className="opacity-50" />

      <form
        className="relative z-10 flex h-full flex-col gap-4 md:gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          onGenerate?.({
            prompt,
            model: selectedModel,
            referenceUrl,
          });
        }}
      >
        <div className="pb-0 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#FF5800]" />
            <h3 className="text-base md:text-lg lg:text-xl font-mono font-bold text-[#e1e1e1] uppercase">Generate a video</h3>
          </div>
          <p className="text-xs md:text-sm font-mono text-[#858585]">
            Describe the scene you have in mind, choose the model preset, and
            submit to send a generation job to the Fal runtime.
          </p>
          {errorMessage ? (
            <p className="text-xs md:text-sm font-mono text-rose-400 bg-rose-500/10 border border-rose-500/40 p-2" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <div className="flex-1 space-y-4 md:space-y-5 overflow-y-auto">
          <div className="space-y-2">
            <label
              htmlFor="video-prompt"
              className="text-xs font-mono font-medium text-white/70 uppercase tracking-wide"
            >
              Prompt
            </label>
            <Textarea
              id="video-prompt"
              placeholder="A cinematic drone shot over a futuristic coastal city at sunset"
              rows={4}
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              className="min-h-[100px] md:min-h-[120px] resize-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-mono font-medium text-white/70 uppercase tracking-wide">
              Model preset
            </label>
            <Select value={selectedModel} onValueChange={onModelChange}>
              <SelectTrigger className="w-full border-white/10 bg-black/40 text-white focus:ring-1 focus:ring-[#FF5800] h-auto min-h-[60px]">
                <SelectValue placeholder="Select a model">
                  {activeModel && (
                    <div className="flex flex-col gap-1 py-1 text-left min-w-0 w-full pr-6">
                      <span className="text-xs md:text-sm font-mono font-medium text-white truncate">
                        {activeModel.label}
                      </span>
                      <span className="text-xs font-mono text-white/60 leading-relaxed line-clamp-2">
                        {activeModel.description}
                      </span>
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-black/90 max-w-[90vw] sm:max-w-md">
                {models.map((model) => (
                  <SelectItem
                    key={model.id}
                    value={model.id}
                    className="text-white hover:bg-white/10 focus:bg-white/10 py-3"
                  >
                    <div className="flex flex-col gap-1.5 py-1 max-w-full">
                      <span className="text-xs md:text-sm font-mono font-medium text-white">
                        {model.label}
                      </span>
                      <span className="text-xs font-mono text-white/60 leading-relaxed">
                        {model.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 border border-dashed border-white/10 bg-black/40 p-3 md:p-4 text-xs md:text-sm text-white/60">
            <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wide text-white/70">
              <Sparkles className="h-4 w-4 text-[#FF5800]" />
              Model insights
            </div>
            <div className="grid gap-2 bg-black/60 border border-white/10 p-2 md:p-3">
              <div className="flex items-center justify-between text-xs font-mono text-white/60">
                <span>Resolution</span>
                <span className="font-medium text-white">
                  {activeModel.dimensions}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-white/60">
                <span className="flex items-center gap-2">
                  <Timer className="h-4 w-4 text-[#FF5800]" />
                  Est. duration
                </span>
                <span className="font-medium text-white">
                  {activeModel.durationEstimate}
                </span>
              </div>
            </div>
            <p className="text-xs font-mono leading-relaxed">
              Advanced controls for seed, duration, and motion strength will
              surface here as soon as the generation API exposes them.
            </p>
          </div>

          <div className="grid gap-2">
            <label
              htmlFor="video-reference"
              className="text-xs font-mono font-medium text-white/70 uppercase tracking-wide"
            >
              Reference image (optional)
            </label>
            <Input
              id="video-reference"
              type="url"
              placeholder="https://..."
              className="border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
              value={referenceUrl}
              onChange={(event) => onReferenceChange(event.target.value)}
            />
            <p className="text-xs font-mono text-white/50">
              Paste a reference image URL to anchor motion or framing.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-white/10 pt-3 md:pt-4">
          <button
            type="submit"
            disabled={isSubmitting}
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
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                "Generate video"
              )}
            </span>
          </button>
          <div
            className="space-y-1 text-center text-xs font-mono text-white/50"
            aria-live="polite"
          >
            {statusMessage ? (
              <p className="text-white/80">{statusMessage}</p>
            ) : null}
            <p>
              Your balance updates as renders finish—wire this panel to your
              usage service during backend integration.
            </p>
          </div>
        </div>
      </form>
    </BrandCard>
  );
}
