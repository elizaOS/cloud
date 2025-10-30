"use client";

import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VoiceEmptyStateProps {
  onCreateClick: () => void;
}

export function VoiceEmptyState({ onCreateClick }: VoiceEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="rounded-full bg-primary/10 p-8 mb-6">
        <Mic className="h-16 w-16 text-primary" />
      </div>
      <h2 className="text-3xl font-bold mb-3">Welcome to Voice Studio</h2>
      <p className="text-muted-foreground mb-8 max-w-2xl text-lg">
        Clone your voice in seconds and use it for AI-powered text-to-speech
        generation. Create unlimited custom voices with just a few audio
        samples.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 max-w-3xl w-full">
        <div className="flex flex-col items-center p-4 rounded-lg bg-muted/50">
          <div className="rounded-full bg-primary/10 p-3 mb-2">
            <Mic className="h-6 w-6 text-primary" />
          </div>
          <p className="font-semibold mb-1">Record or Upload</p>
          <p className="text-xs text-muted-foreground">
            1-3 min of clear audio
          </p>
        </div>
        <div className="flex flex-col items-center p-4 rounded-lg bg-muted/50">
          <div className="rounded-full bg-primary/10 p-3 mb-2">
            <span className="text-2xl">⚡</span>
          </div>
          <p className="font-semibold mb-1">AI Processing</p>
          <p className="text-xs text-muted-foreground">~30 seconds</p>
        </div>
        <div className="flex flex-col items-center p-4 rounded-lg bg-muted/50">
          <div className="rounded-full bg-primary/10 p-3 mb-2">
            <span className="text-2xl">✨</span>
          </div>
          <p className="font-semibold mb-1">Ready to Use</p>
          <p className="text-xs text-muted-foreground">In any TTS generation</p>
        </div>
      </div>

      <Button onClick={onCreateClick} size="lg" className="h-12 px-8">
        <Mic className="mr-2 h-5 w-5" />
        Create Your First Voice Clone
      </Button>

      <p className="text-xs text-muted-foreground mt-4">
        Instant clone: 500 credits • Professional: 5,000 credits
      </p>
    </div>
  );
}
