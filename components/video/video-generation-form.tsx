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
        className="relative z-10 flex h-full flex-col gap-6"
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
          <h3 className="text-xl font-bold text-white">Generate a video</h3>
          <p className="text-sm text-white/60">
            Describe the scene you have in mind, choose the model preset, and
            submit to send a generation job to the Fal runtime.
          </p>
          {errorMessage ? (
            <p className="text-sm text-rose-400" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto">
          <div className="space-y-2">
            <label
              htmlFor="video-prompt"
              className="text-xs font-medium text-white/70 uppercase tracking-wide"
            >
              Prompt
            </label>
            <Textarea
              id="video-prompt"
              placeholder="A cinematic drone shot over a futuristic coastal city at sunset"
              rows={4}
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              className="min-h-[120px] resize-none rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
              Model preset
            </label>
            <Select value={selectedModel} onValueChange={onModelChange}>
              <SelectTrigger className="rounded-none border-white/10 bg-black/40 text-white focus:ring-1 focus:ring-[#FF5800]">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-white/10 bg-black/90">
                {models.map((model) => (
                  <SelectItem
                    key={model.id}
                    value={model.id}
                    className="rounded-none text-white hover:bg-white/10 focus:bg-white/10"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-white">
                        {model.label}
                      </span>
                      <span className="text-xs text-white/60">
                        {model.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 rounded-none border border-dashed border-white/10 bg-black/40 p-4 text-sm text-white/60">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/70">
              <Sparkles className="h-4 w-4 text-[#FF5800]" />
              Model insights
            </div>
            <div className="grid gap-2 rounded-none bg-black/60 border border-white/10 p-3">
              <div className="flex items-center justify-between text-xs text-white/60">
                <span>Resolution</span>
                <span className="font-medium text-white">
                  {activeModel.dimensions}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-white/60">
                <span className="flex items-center gap-2">
                  <Timer className="h-4 w-4 text-[#FF5800]" />
                  Est. duration
                </span>
                <span className="font-medium text-white">
                  {activeModel.durationEstimate}
                </span>
              </div>
            </div>
            <p className="text-xs leading-relaxed">
              Advanced controls for seed, duration, and motion strength will
              surface here as soon as the generation API exposes them.
            </p>
          </div>

          <div className="grid gap-2">
            <label
              htmlFor="video-reference"
              className="text-xs font-medium text-white/70 uppercase tracking-wide"
            >
              Reference image (optional)
            </label>
            <Input
              id="video-reference"
              type="url"
              placeholder="https://..."
              className="rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
              value={referenceUrl}
              onChange={(event) => onReferenceChange(event.target.value)}
            />
            <p className="text-xs text-white/50">
              Paste a reference image URL to anchor motion or framing.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
          <BrandButton
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </span>
            ) : (
              "Generate video"
            )}
          </BrandButton>
          <div
            className="space-y-1 text-center text-xs text-white/50"
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
