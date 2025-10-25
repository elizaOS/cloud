"use client";

import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VoiceEmptyStateProps {
  onCreateClick: () => void;
}

export function VoiceEmptyState({ onCreateClick }: VoiceEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="rounded-full bg-muted p-6 mb-6">
        <Mic className="h-12 w-12 text-muted-foreground" />
      </div>
      <h3 className="text-2xl font-semibold mb-2">No voices yet</h3>
      <p className="text-muted-foreground mb-6 max-w-md">
        Create your first voice clone to use in text-to-speech generation. Clone
        your own voice or create unique AI voices in seconds.
      </p>
      <Button onClick={onCreateClick} size="lg">
        <Mic className="mr-2 h-4 w-4" />
        Create Your First Voice
      </Button>
    </div>
  );
}
