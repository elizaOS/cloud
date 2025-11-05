"use client";

import { useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Mic,
  Sparkles,
  Play,
  Trash2,
  ExternalLink,
  BarChart3,
  Loader2,
  AlertCircle,
  Library,
} from "lucide-react";
import { VoiceCloneForm } from "./voice-clone-form";
import { VoiceAudioPlayer } from "./voice-audio-player";
import {
  VoiceStatusBadge,
  getEstimatedReadyMessage,
} from "./voice-status-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  BrandCard,
  BrandButton,
  CornerBrackets,
  SectionLabel,
} from "@/components/brand";

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
  lastUsedAt?: Date | string | null;
  audioQualityScore?: string | null;
  totalAudioDurationSeconds?: number | null;
  status?: "processing" | "completed" | "failed";
  jobId?: string;
}

interface VoiceStudioAdvancedProps {
  initialVoices: Voice[];
  creditBalance: number;
  onCreditBalanceChange: (balance: number) => void;
}

export function VoiceStudioAdvanced({
  initialVoices,
  creditBalance,
  onCreditBalanceChange,
}: VoiceStudioAdvancedProps) {
  const router = useRouter();
  const [voices, setVoices] = useState<Voice[]>(initialVoices);
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(
    voices[0] || null,
  );
  const [previewVoice, setPreviewVoice] = useState<Voice | null>(null);
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [deleteDialogVoice, setDeleteDialogVoice] = useState<Voice | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Manual refresh function
  const manualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/elevenlabs/voices/user");
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setVoices(data.voices);
          toast.success("Voices refreshed");
        }
      }
    } catch (error) {
      toast.error("Failed to refresh voices");
      console.error("Refresh error:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const handleVoiceCreated = (newVoice: Voice) => {
    // Check if it's a professional clone (will be processing)
    if (newVoice.cloneType === "professional") {
      toast.success(
        `Voice "${newVoice.name}" is being processed. This may take 30-60 minutes. Refresh the page to check status.`,
        { duration: 8000 },
      );
      // Add with processing status
      setVoices([{ ...newVoice, status: "processing" }, ...voices]);
    } else {
      toast.success(
        `Voice "${newVoice.name}" created successfully and ready to use!`,
      );
      setVoices([newVoice, ...voices]);
      setSelectedVoice(newVoice);
    }
  };

  const handlePreview = async (voice: Voice) => {
    // Check if professional voice is still processing based on time
    const minutesElapsed = Math.max(
      0,
      (new Date().getTime() - new Date(voice.createdAt).getTime()) / 1000 / 60,
    );
    const isProcessing =
      voice.cloneType === "professional" && minutesElapsed < 30;

    if (isProcessing) {
      toast.error(
        "Voice is still being processed. Professional voice clones typically take 30-60 minutes. Please check back later.",
        { duration: 6000 },
      );
      return;
    }

    if (!voice.elevenlabsVoiceId) {
      toast.error("Voice ID not available. Voice may still be processing.");
      return;
    }

    setPreviewVoice(voice);
    setIsLoadingPreview(true);

    try {
      const response = await fetch("/api/elevenlabs/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Hello! This is a preview of your custom voice clone.",
          voiceId: voice.elevenlabsVoiceId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate preview");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPreviewAudioUrl(url);
    } catch (error) {
      // Check for service unavailable
      if (
        error instanceof Error &&
        error.message.includes("temporarily unavailable")
      ) {
        toast.error(error.message, { duration: 6000 });
      } else {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load voice preview",
        );
      }
      console.error("Preview error:", error);
      setPreviewVoice(null);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleDelete = async (voice: Voice) => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/elevenlabs/voices/${voice.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete voice");

      toast.success("Voice deleted successfully");
      setVoices(voices.filter((v) => v.id !== voice.id));
      if (selectedVoice?.id === voice.id) {
        setSelectedVoice(voices[0] || null);
      }
      setDeleteDialogVoice(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete voice",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUseInTTS = (voice: Voice) => {
    router.push(`/dashboard/eliza?voiceId=${voice.elevenlabsVoiceId}`);
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Count professional voices
  const professionalVoiceCount = voices.filter(
    (v) => v.cloneType === "professional",
  ).length;
  const professionalVoicesRemaining = Math.max(0, 1 - professionalVoiceCount);

  return (
    <Tabs
      defaultValue="voices"
      className="w-full h-[calc(100vh-180px)] flex flex-col"
    >
      {/* Tab Navigation */}
      <TabsList className="w-full rounded-none border-b border-white/10 bg-transparent h-10 p-0 justify-start">
        <TabsTrigger
          value="clone"
          className="rounded-none data-[state=active]:bg-[#FF5800]/10 data-[state=active]:border-b-2 data-[state=active]:border-[#FF5800] px-4 h-full text-sm"
        >
          <Mic className="h-3.5 w-3.5 mr-2" />
          Clone Voice
        </TabsTrigger>
        <TabsTrigger
          value="voices"
          className="rounded-none data-[state=active]:bg-[#FF5800]/10 data-[state=active]:border-b-2 data-[state=active]:border-[#FF5800] px-4 h-full text-sm"
        >
          <Library className="h-3.5 w-3.5 mr-2" />
          Voice Library
          {voices.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-white/10">
              {voices.length}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      {/* Clone Tab Content */}
      <TabsContent value="clone" className="flex-1 overflow-hidden mt-3 h-full">
        <VoiceCloneForm
          creditBalance={creditBalance}
          onSuccess={handleVoiceCreated}
          onCreditBalanceChange={onCreditBalanceChange}
        />
      </TabsContent>

      {/* Voices Tab Content */}
      <TabsContent value="voices" className="flex-1 overflow-hidden mt-3">
        <BrandCard className="relative flex flex-col h-full overflow-hidden">
          <CornerBrackets size="sm" className="opacity-50" />

          <div className="relative z-10 shrink-0">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                <SectionLabel>Voice Library</SectionLabel>
                <p className="text-sm text-white/60 mt-2">
                  {voices.length} voice{voices.length !== 1 ? "s" : ""}
                  {voices.some((v) => {
                    const mins = Math.max(
                      0,
                      (new Date().getTime() - new Date(v.createdAt).getTime()) /
                        1000 /
                        60,
                    );
                    return v.cloneType === "professional" && mins < 60;
                  }) && " • Some may still be processing"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 rounded-none border border-white/20 bg-white/10 px-2 py-1 text-xs text-white">
                  <BarChart3 className="h-3 w-3" />
                  {voices.reduce((sum, v) => sum + v.usageCount, 0)} uses
                </span>
                <span
                  className={
                    professionalVoicesRemaining === 0
                      ? "rounded-none border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-300"
                      : "rounded-none border border-white/20 bg-white/10 px-2 py-1 text-xs text-white"
                  }
                  title="Professional voice slots (ElevenLabs limitation)"
                >
                  Pro: {professionalVoiceCount}/1
                </span>
                <BrandButton
                  variant="outline"
                  size="sm"
                  onClick={manualRefresh}
                  disabled={isRefreshing}
                  className="h-8"
                >
                  {isRefreshing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Refresh"
                  )}
                </BrandButton>
              </div>
            </div>
          </div>

          <div className="relative z-10 border-t border-white/10 shrink-0 my-4" />

          <div className="relative z-10 flex-1 p-0 overflow-hidden">
            {voices.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12 px-6 text-center">
                <div className="rounded-full bg-[#FF580020] border border-[#FF5800]/40 p-6 mb-4">
                  <Mic className="h-10 w-10 text-[#FF5800]" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-white">
                  No voices yet
                </h3>
                <p className="text-sm text-white/60 max-w-sm">
                  Create your first voice clone using the form on the left.
                  Upload audio or record your voice to get started.
                </p>
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div className="p-6 space-y-6 pb-12">
                  {/* All Voices (processing status shown via badge) */}
                  {voices.map((voice) => {
                    const now = new Date();
                    return (
                      <BrandCard
                        key={voice.id}
                        corners={false}
                        hover
                        className={`cursor-pointer transition-all ${
                          selectedVoice?.id === voice.id
                            ? "border-[#FF5800] ring-2 ring-[#FF5800]/40"
                            : ""
                        }`}
                        onClick={() => setSelectedVoice(voice)}
                      >
                        <div className="pb-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-base truncate font-bold text-white">
                                {voice.name}
                              </h4>
                              <p className="line-clamp-1 text-xs text-white/60 mt-1">
                                {voice.description || "No description"}
                              </p>
                            </div>
                            <div className="ml-2 shrink-0">
                              <VoiceStatusBadge voice={voice} />
                            </div>
                          </div>
                        </div>

                        <div className="pb-3 space-y-3">
                          {/* Stats */}
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="flex flex-col">
                              <span className="text-white/50 uppercase tracking-wide">
                                Uses
                              </span>
                              <span className="font-medium text-white">
                                {voice.usageCount}
                              </span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-white/50 uppercase tracking-wide">
                                Samples
                              </span>
                              <span className="font-medium text-white">
                                {voice.sampleCount}
                              </span>
                            </div>
                            {voice.audioQualityScore && (
                              <div className="flex flex-col">
                                <span className="text-white/50 uppercase tracking-wide">
                                  Quality
                                </span>
                                <span className="font-medium text-white">
                                  {voice.audioQualityScore}/10
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Metadata & Status */}
                          <div className="pt-2 border-t border-white/10 space-y-2">
                            {/* Processing Status Message */}
                            {(() => {
                              const mins = Math.max(
                                0,
                                (now.getTime() -
                                  new Date(voice.createdAt).getTime()) /
                                  1000 /
                                  60,
                              );
                              const isProcessing =
                                voice.cloneType === "professional" && mins < 60;

                              if (isProcessing) {
                                let message = "";
                                if (mins < 30) {
                                  message =
                                    "Processing... Professional voices typically take 30-60 minutes.";
                                } else {
                                  message =
                                    "Finalizing... Click Refresh to check if ready.";
                                }

                                return (
                                  <Alert
                                    variant="default"
                                    className="py-2 rounded-none border-blue-500/40 bg-blue-500/10"
                                  >
                                    <AlertCircle className="h-3 w-3 text-blue-400" />
                                    <AlertDescription className="text-xs text-blue-400">
                                      {message}
                                    </AlertDescription>
                                  </Alert>
                                );
                              }
                              return null;
                            })()}
                          </div>

                          {/* Actions */}
                          <div className="flex gap-2 pt-2 border-t border-white/10">
                            {(() => {
                              const mins = Math.max(
                                0,
                                (now.getTime() -
                                  new Date(voice.createdAt).getTime()) /
                                  1000 /
                                  60,
                              );
                              const isProcessing =
                                voice.cloneType === "professional" && mins < 60;

                              return (
                                <>
                                  <BrandButton
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePreview(voice);
                                    }}
                                    disabled={isProcessing}
                                    className="flex-1 h-8 text-xs"
                                    title={
                                      isProcessing
                                        ? getEstimatedReadyMessage(voice)
                                        : "Preview voice"
                                    }
                                  >
                                    <Play className="mr-1 h-3 w-3" />
                                    Preview
                                  </BrandButton>
                                  <BrandButton
                                    variant="primary"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUseInTTS(voice);
                                    }}
                                    disabled={isProcessing}
                                    className="flex-1 h-8 text-xs"
                                    title={
                                      isProcessing
                                        ? "Voice not ready yet"
                                        : "Use in text-to-speech"
                                    }
                                  >
                                    <ExternalLink className="mr-1 h-3 w-3" />
                                    Use in TTS
                                  </BrandButton>
                                  <BrandButton
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteDialogVoice(voice);
                                    }}
                                    className="h-8 px-2 text-rose-400 hover:text-rose-400 hover:bg-rose-500/10"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </BrandButton>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </BrandCard>
                    );
                  })}

                  {/* Voice Insights - Scrollable with the voices */}
                  {selectedVoice && (
                    <>
                      <div className="my-6 border-t border-white/10" />
                      <div className="pb-4">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/50 mb-3">
                          <Sparkles className="h-4 w-4 text-[#FF5800]" />
                          Voice Insights
                        </div>
                        <div className="grid gap-3 rounded-none bg-black/40 border border-white/10 p-4 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-white/50">Clone Type</span>
                            <span className="font-medium capitalize text-white">
                              {selectedVoice.cloneType}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-white/50">Voice ID</span>
                            <span
                              className="font-mono text-xs truncate max-w-[180px] text-white"
                              title={selectedVoice.elevenlabsVoiceId}
                            >
                              {selectedVoice.elevenlabsVoiceId}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-white/50">Usage Count</span>
                            <span className="font-medium text-white">
                              {selectedVoice.usageCount} times
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-white/50">Sample Files</span>
                            <span className="font-medium text-white">
                              {selectedVoice.sampleCount} files
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-white/50">
                              Total Duration
                            </span>
                            <span className="font-medium text-white">
                              {formatDuration(
                                selectedVoice.totalAudioDurationSeconds ?? null,
                              )}
                            </span>
                          </div>
                          {selectedVoice.audioQualityScore && (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-white/50">
                                Quality Score
                              </span>
                              <span className="font-medium text-white">
                                {selectedVoice.audioQualityScore}/10
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-white/50">Created</span>
                            <span className="font-medium text-white">
                              {formatDistanceToNow(
                                new Date(selectedVoice.createdAt),
                                {
                                  addSuffix: true,
                                },
                              )}
                            </span>
                          </div>
                          {selectedVoice.lastUsedAt && (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-white/50">Last Used</span>
                              <span className="font-medium text-white">
                                {formatDistanceToNow(
                                  new Date(selectedVoice.lastUsedAt),
                                  {
                                    addSuffix: true,
                                  },
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        </BrandCard>
      </TabsContent>

      {/* Preview Dialog */}
      <Dialog
        open={!!previewVoice}
        onOpenChange={() => {
          if (previewAudioUrl) {
            URL.revokeObjectURL(previewAudioUrl);
          }
          setPreviewVoice(null);
          setPreviewAudioUrl(null);
        }}
      >
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
                <Loader2 className="h-8 w-8 animate-spin text-[#FF5800]" />
              </div>
            ) : previewAudioUrl ? (
              <div className="p-4 rounded-none bg-black/40 border border-white/10">
                <p className="text-sm text-white/60 mb-3">
                  Preview Text: &ldquo;Hello! This is a preview of your custom
                  voice clone.&rdquo;
                </p>
                <VoiceAudioPlayer audioUrl={previewAudioUrl} />
              </div>
            ) : (
              <div className="text-center text-white/60 py-8">
                Failed to load audio preview
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteDialogVoice}
        onOpenChange={() => setDeleteDialogVoice(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Voice Clone?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;
              {deleteDialogVoice?.name}&rdquo;? This action cannot be undone and
              the voice will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteDialogVoice && handleDelete(deleteDialogVoice)
              }
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete Voice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  );
}
