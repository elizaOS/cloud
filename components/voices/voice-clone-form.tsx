/**
 * Voice clone form component for creating voice clones.
 * Supports instant and professional cloning modes with audio upload.
 * Includes advanced settings for stability, similarity, and style.
 *
 * @param props - Voice clone form configuration
 * @param props.creditBalance - Current credit balance
 * @param props.onSuccess - Callback when voice is successfully created
 * @param props.onCreditBalanceChange - Callback when credit balance changes
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Upload,
  X,
  FileAudio,
  Loader2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  VOICE_CLONE_INSTANT_COST,
  VOICE_CLONE_PROFESSIONAL_COST,
} from "@/lib/pricing-constants";
import type { Voice } from "./types";
import { BrandCard, BrandButton, CornerBrackets } from "@/components/brand";

interface VoiceCloneFormProps {
  creditBalance: number;
  onSuccess: (newVoice: Voice) => void;
  onCreditBalanceChange: (newBalance: number) => void;
}

interface UploadedFile {
  file: File;
  id: string;
}

interface VoiceSettings {
  stability: number;
  similarityBoost: number;
  style: number;
  useSpeakerBoost: boolean;
}

interface FormData {
  name: string;
  description: string;
  cloneType: "instant" | "professional";
}

const DEFAULT_SETTINGS: VoiceSettings = {
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0,
  useSpeakerBoost: true,
};

const DEFAULT_FORM_DATA: FormData = {
  name: "",
  description: "",
  cloneType: "instant",
};

export function VoiceCloneForm({
  creditBalance,
  onSuccess,
  onCreditBalanceChange,
}: VoiceCloneFormProps) {
  // Form data consolidated
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM_DATA);
  // Advanced settings consolidated
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_SETTINGS);
  // File state
  const [files, setFiles] = useState<UploadedFile[]>([]);
  // UI state
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Async data
  const [professionalVoiceCount, setProfessionalVoiceCount] = useState<
    number | null
  >(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const cost =
    formData.cloneType === "instant"
      ? VOICE_CLONE_INSTANT_COST
      : VOICE_CLONE_PROFESSIONAL_COST;
  const hasEnoughCredits = Number(creditBalance) >= cost;

  // Fetch professional voice count on mount
  useEffect(() => {
    const fetchVoiceCount = async () => {
      const response = await fetch("/api/elevenlabs/voices/user");
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.voices) {
          const proCount = data.voices.filter(
            (v: Voice) => v.cloneType === "professional",
          ).length;
          setProfessionalVoiceCount(proCount);
        }
      }
    };

    fetchVoiceCount();
  }, []);

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    const newFiles: UploadedFile[] = [];
    const allowedTypes = [
      "audio/mpeg",
      "audio/wav",
      "audio/mp3",
      "audio/x-wav",
      "audio/webm",
      "audio/ogg",
    ];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];

      // Validate file type - check if type includes 'audio'
      const isAudioFile =
        file.type.startsWith("audio/") ||
        allowedTypes.some((type) => file.type.includes(type));

      if (!isAudioFile) {
        toast.error(`${file.name} is not a valid audio file`);
        continue;
      }

      // Validate file size (10MB max per file)
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} exceeds maximum size of 10MB`);
        continue;
      }

      newFiles.push({
        file,
        id: Math.random().toString(36).substr(2, 9),
      });
    }

    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles]);
      setError(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.name.trim()) {
      setError("Voice name is required");
      return;
    }

    if (files.length === 0) {
      setError("Please upload at least one audio file");
      return;
    }

    if (!hasEnoughCredits) {
      setError(
        `Insufficient balance. You need $${cost.toFixed(2)} but have $${Number(creditBalance).toFixed(2)}`,
      );
      return;
    }

    setIsUploading(true);

    try {
      const submitData = new FormData();
      submitData.append("name", formData.name.trim());
      submitData.append("cloneType", formData.cloneType);
      if (formData.description.trim()) {
        submitData.append("description", formData.description.trim());
      }

      // Add advanced settings
      submitData.append("settings", JSON.stringify(settings));

      // Add files
      files.forEach((f, index) => {
        submitData.append(`file${index + 1}`, f.file);
      });

      const response = await fetch("/api/elevenlabs/voices/clone", {
        method: "POST",
        body: submitData,
      });

      const data = await response.json();

      if (!response.ok) {
        // Check for service unavailable (quota issues)
        if (response.status === 503 || data.type === "service_unavailable") {
          const friendlyError =
            data.error ||
            "Voice service is temporarily unavailable. Please try again in a few minutes.";
          throw new Error(friendlyError);
        }
        throw new Error(data.error || "Failed to create voice clone");
      }

      // Show appropriate success message based on clone type
      if (formData.cloneType === "professional") {
        toast.success(
          `Voice "${formData.name}" is being created. Professional cloning takes 30-60 minutes. Check back later!`,
          { duration: 10000 },
        );
      } else {
        toast.success(
          `Voice "${formData.name}" created successfully and ready to use!`,
        );
      }

      // Update credit balance
      if (data.newBalance !== undefined) {
        onCreditBalanceChange(data.newBalance);
      }

      // Reset form
      setFormData(DEFAULT_FORM_DATA);
      setSettings(DEFAULT_SETTINGS);
      setFiles([]);

      // Notify parent
      onSuccess(data.voice);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create voice clone";
      setError(message);
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
  };

  return (
    <BrandCard className="relative flex flex-col h-auto lg:h-full lg:max-h-full lg:overflow-hidden">
      <CornerBrackets size="sm" className="opacity-50" />

      <div className="relative z-10 shrink-0 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#FF5800]" />
            <h3 className="text-sm md:text-base font-mono font-semibold text-[#e1e1e1] uppercase">
              Create Voice Clone
            </h3>
          </div>
        </div>
      </div>
      <form
        onSubmit={handleSubmit}
        className="relative z-10 flex flex-col flex-1 lg:min-h-0"
      >
        <div className="flex-1 lg:overflow-y-auto lg:min-h-0 space-y-3 pb-3">
          {/* Voice Name */}
          <div className="space-y-1.5">
            <label
              htmlFor="name"
              className="text-[10px] font-mono font-medium text-white/70 uppercase tracking-wide"
            >
              Voice Name <span className="text-rose-400">*</span>
            </label>
            <Input
              id="name"
              placeholder="My Voice"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              disabled={isUploading}
              required
              className="h-9 border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label
              htmlFor="description"
              className="text-[10px] font-mono font-medium text-white/70 uppercase tracking-wide"
            >
              Description <span className="text-white/40">(optional)</span>
            </label>
            <Input
              id="description"
              placeholder="Voice description"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              disabled={isUploading}
              className="h-9 border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
            />
          </div>

          {/* Clone Type - Compact inline selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono font-medium text-white/70 uppercase tracking-wide">
              Clone Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setFormData((prev) => ({ ...prev, cloneType: "instant" }))
                }
                disabled={isUploading}
                className={cn(
                  "flex-1 border px-3 py-2 text-left transition-all",
                  formData.cloneType === "instant"
                    ? "border-[#FF5800] bg-[#FF580010]"
                    : "border-white/10 hover:border-white/30 hover:bg-white/5",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-xs text-white">
                      Instant
                    </span>
                    <span className="bg-green-500/20 text-green-400 border border-green-500/40 px-1 py-0.5 text-[9px] font-mono font-bold uppercase">
                      Rec
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[9px] font-mono text-white/50 mt-1">
                  <span>~30s</span>
                  <span>•</span>
                  <span>1-3 min audio</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    cloneType: "professional",
                  }))
                }
                disabled={isUploading}
                className={cn(
                  "flex-1 border px-3 py-2 text-left transition-all",
                  formData.cloneType === "professional"
                    ? "border-[#FF5800] bg-[#FF580010]"
                    : "border-white/10 hover:border-white/30 hover:bg-white/5",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-xs text-white">
                      Professional
                    </span>
                    {professionalVoiceCount !== null &&
                      professionalVoiceCount >= 1 && (
                        <span className="border-amber-500/40 bg-amber-500/10 text-amber-300 border px-1 py-0.5 text-[9px] font-mono font-bold uppercase">
                          Full
                        </span>
                      )}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[9px] font-mono text-white/50 mt-1">
                  <span>30-60 min</span>
                  <span>•</span>
                  <span>30+ min audio</span>
                </div>
              </button>
            </div>
          </div>

          {/* Audio Upload */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono font-medium text-white/70 uppercase tracking-wide">
              Audio Samples <span className="text-rose-400">*</span>
            </label>

            <button
              type="button"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "border border-dashed p-4 text-center transition-colors cursor-pointer w-full",
                isDragging
                  ? "border-[#FF5800] bg-[#FF5800]/5"
                  : "border-white/20 hover:border-white/40 bg-black/20",
              )}
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                multiple
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
                disabled={isUploading}
              />
              <div className="flex items-center justify-center gap-3">
                <Upload className="h-5 w-5 text-white/40 shrink-0" />
                <div className="text-left">
                  <p className="text-xs font-mono font-medium text-white">
                    Drop audio files or click to browse
                  </p>
                  <p className="text-[10px] font-mono text-white/50">
                    MP3, WAV, WebM, OGG • Max 10MB each
                  </p>
                </div>
              </div>
            </button>

            {/* File List */}
            {files.length > 0 && (
              <div className="space-y-1.5 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/50 uppercase tracking-wide">
                    {files.length} file{files.length !== 1 ? "s" : ""} selected
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {files.map((f) => (
                    <div
                      key={f.id}
                      className="inline-flex items-center gap-1.5 px-2 py-1 border border-white/10 bg-black/40 max-w-[200px]"
                    >
                      <FileAudio className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-[10px] font-mono text-white truncate">
                        {f.file.name}
                      </span>
                      <span className="text-[9px] text-white/40 shrink-0">
                        {formatFileSize(f.file.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(f.id)}
                        disabled={isUploading}
                        className="shrink-0 text-rose-400 hover:text-rose-300 ml-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Voice Settings */}
          <div className="space-y-2 border-t border-white/10 pt-3">
            <label className="text-[10px] font-mono font-medium text-white/70 uppercase tracking-wide">
              Voice Settings
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-white/60 uppercase">
                    Stability
                  </span>
                  <span className="text-[10px] font-mono text-white/80">
                    {settings.stability.toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={[settings.stability]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={(v) =>
                    setSettings((prev) => ({ ...prev, stability: v[0] }))
                  }
                  disabled={isUploading}
                  className="h-4 [&_[role=slider]]:bg-[#FF5800] [&_[role=slider]]:border-[#FF5800]"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-white/60 uppercase">
                    Similarity
                  </span>
                  <span className="text-[10px] font-mono text-white/80">
                    {settings.similarityBoost.toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={[settings.similarityBoost]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={(v) =>
                    setSettings((prev) => ({
                      ...prev,
                      similarityBoost: v[0],
                    }))
                  }
                  disabled={isUploading}
                  className="h-4 [&_[role=slider]]:bg-[#FF5800] [&_[role=slider]]:border-[#FF5800]"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-white/60 uppercase">
                    Style
                  </span>
                  <span className="text-[10px] font-mono text-white/80">
                    {settings.style.toFixed(2)}
                  </span>
                </div>
                <Slider
                  value={[settings.style]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={(v) =>
                    setSettings((prev) => ({ ...prev, style: v[0] }))
                  }
                  disabled={isUploading}
                  className="h-4 [&_[role=slider]]:bg-[#FF5800] [&_[role=slider]]:border-[#FF5800]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Fixed at bottom */}
        <div className="shrink-0 pt-3 border-t border-white/10 space-y-2">
          {/* Error Message - Compact */}
          {error && (
            <div className="flex items-start gap-2 p-2 border border-destructive/50 bg-destructive/10 text-destructive text-xs">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit Button */}
          <BrandButton
            type="submit"
            variant="primary"
            disabled={isUploading || !hasEnoughCredits || files.length === 0}
            className="w-full font-semibold h-10"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Create Voice (${cost.toFixed(2)})
              </>
            )}
          </BrandButton>

          {/* Credit warning if insufficient */}
          {!hasEnoughCredits && (
            <p className="text-[10px] text-center text-amber-400 font-mono">
              Insufficient credits. Need ${cost.toFixed(2)}, have $
              {Number(creditBalance).toFixed(2)}
            </p>
          )}
        </div>
      </form>
    </BrandCard>
  );
}
