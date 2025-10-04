"use client";

import { useMemo } from "react";
import { Loader2, Sparkles, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { VideoModelOption } from "./types";

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
    <Card className="h-full border-border/60 bg-background/70">
      <form
        className="flex h-full flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          onGenerate?.({
            prompt,
            model: selectedModel,
            referenceUrl,
          });
        }}
      >
        <CardHeader className="pb-0">
          <CardTitle className="text-xl font-semibold">
            Generate a video
          </CardTitle>
          <CardDescription>
            Describe the scene you have in mind, choose the model preset, and
            submit to send a generation job to the Fal runtime.
          </CardDescription>
          {errorMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </CardHeader>

        <CardContent className="flex-1 space-y-5 overflow-y-auto px-6">
          <div className="space-y-2">
            <Label htmlFor="video-prompt">Prompt</Label>
            <Textarea
              id="video-prompt"
              placeholder="A cinematic drone shot over a futuristic coastal city at sunset"
              rows={4}
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              className="min-h-[120px] resize-none rounded-xl border-border/70 bg-background"
            />
          </div>

          <div className="space-y-2">
            <Label>Model preset</Label>
            <Select value={selectedModel} onValueChange={onModelChange}>
              <SelectTrigger className="rounded-xl border-border/70 bg-background">
                <SelectValue placeholder="Select a model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">
                        {model.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {model.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              Model insights
            </div>
            <div className="grid gap-2 rounded-lg bg-background/60 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Resolution</span>
                <span className="font-medium text-foreground">
                  {activeModel.dimensions}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Timer className="h-4 w-4" />
                  Est. duration
                </span>
                <span className="font-medium text-foreground">
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
            <Label htmlFor="video-reference">Reference image (optional)</Label>
            <Input
              id="video-reference"
              type="url"
              placeholder="https://..."
              className="rounded-xl border-border/70 bg-background"
              value={referenceUrl}
              onChange={(event) => onReferenceChange(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Paste a reference image URL to anchor motion or framing.
            </p>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-2 border-t border-border/60 bg-background/80 py-4">
          <Button
            type="submit"
            size="lg"
            className="w-full rounded-xl"
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
          </Button>
          <div
            className="space-y-1 text-center text-xs text-muted-foreground"
            aria-live="polite"
          >
            {statusMessage ? (
              <p className="text-foreground/80">{statusMessage}</p>
            ) : null}
            <p>
              Generation credits refresh as renders finish—wire this panel to
              your usage service during backend integration.
            </p>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
