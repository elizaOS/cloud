"use client";

import { useState } from "react";
import { VoiceCloneForm } from "./voice-clone-form";
import { VoiceCard } from "./voice-card";
import { VoiceEmptyState } from "./voice-empty-state";
import { VoiceAudioPlayer } from "./voice-audio-player";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

interface Voice {
  id: string;
  elevenlabsVoiceId: string;
  name: string;
  description: string | null;
  cloneType: "instant" | "professional";
  sampleCount: number;
  usageCount: number;
  isActive: boolean;
  createdAt: Date | string;
  lastUsedAt: Date | string | null;
  audioQualityScore: string | null;
  totalAudioDurationSeconds: number | null;
}

interface VoiceManagerProps {
  voices: Voice[];
  onVoicesChange: (voices: Voice[]) => void;
  creditBalance: number;
  onCreditBalanceChange: (balance: number) => void;
}

export function VoiceManager({
  voices,
  onVoicesChange,
  creditBalance,
  onCreditBalanceChange,
}: VoiceManagerProps) {
  const [isFormExpanded, setIsFormExpanded] = useState(voices.length === 0);
  const [previewVoice, setPreviewVoice] = useState<Voice | null>(null);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const handleVoiceCreated = (newVoice: Voice) => {
    onVoicesChange([newVoice, ...voices]);
    setIsFormExpanded(false);
    toast.success(`Voice "${newVoice.name}" created successfully!`);
  };

  const handleVoiceDeleted = (voiceId: string) => {
    onVoicesChange(voices.filter((v) => v.id !== voiceId));
  };

  const handlePreview = async (voice: Voice) => {
    setPreviewVoice(voice);
    setIsLoadingPreview(true);

    try {
      // Generate a sample text-to-speech to preview the voice
      const response = await fetch("/api/elevenlabs/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: "Hello! This is a preview of your custom voice clone.",
          voiceId: voice.elevenlabsVoiceId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate preview");
      }

      // Convert audio stream to blob URL
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPreviewAudioUrl(url);
    } catch (error) {
      toast.error("Failed to load voice preview");
      console.error("Preview error:", error);
      setPreviewVoice(null);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleClosePreview = () => {
    if (previewAudioUrl) {
      URL.revokeObjectURL(previewAudioUrl);
    }
    setPreviewVoice(null);
    setPreviewAudioUrl(null);
  };

  return (
    <div className="space-y-8">
      {/* Voice Clone Form */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold">
              {isFormExpanded ? "Create New Voice" : "Voice Library"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {isFormExpanded
                ? "Upload audio samples to create your voice clone"
                : `You have ${voices.length} voice${voices.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          {voices.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setIsFormExpanded(!isFormExpanded)}
            >
              {isFormExpanded ? (
                <>
                  <ChevronUp className="mr-2 h-4 w-4" />
                  Hide Form
                </>
              ) : (
                <>
                  <ChevronDown className="mr-2 h-4 w-4" />
                  Create New Voice
                </>
              )}
            </Button>
          )}
        </div>

        {isFormExpanded && (
          <VoiceCloneForm
            creditBalance={creditBalance}
            onSuccess={handleVoiceCreated}
            onCreditBalanceChange={onCreditBalanceChange}
          />
        )}
      </div>

      {/* Voice List */}
      {voices.length === 0 ? (
        <VoiceEmptyState onCreateClick={() => setIsFormExpanded(true)} />
      ) : (
        <div>
          {!isFormExpanded && (
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2">My Voices</h3>
              <p className="text-sm text-muted-foreground">
                Manage your custom voice clones and use them in text-to-speech
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {voices.map((voice) => (
              <VoiceCard
                key={voice.id}
                voice={voice}
                onDelete={handleVoiceDeleted}
                onPreview={handlePreview}
              />
            ))}
          </div>
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewVoice} onOpenChange={handleClosePreview}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{previewVoice?.name}</DialogTitle>
            <DialogDescription>
              {previewVoice?.description || "Voice preview"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {isLoadingPreview ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : previewAudioUrl ? (
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground mb-3">
                  Preview Text: "Hello! This is a preview of your custom voice
                  clone."
                </p>
                <VoiceAudioPlayer audioUrl={previewAudioUrl} />
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                Failed to load audio preview
              </div>
            )}

            {previewVoice && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Clone Type</p>
                  <p className="font-medium capitalize">
                    {previewVoice.cloneType}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Samples</p>
                  <p className="font-medium">
                    {previewVoice.sampleCount} files
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Times Used</p>
                  <p className="font-medium">{previewVoice.usageCount}</p>
                </div>
                {previewVoice.audioQualityScore && (
                  <div>
                    <p className="text-muted-foreground">Quality Score</p>
                    <p className="font-medium">
                      {previewVoice.audioQualityScore}/10
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
