"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Slider } from "@/components/ui/slider";
import {
  Upload,
  X,
  FileAudio,
  Loader2,
  AlertCircle,
  Mic,
  Square,
  Clock,
  CheckCircle,
  Info,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  VOICE_CLONE_INSTANT_COST,
  VOICE_CLONE_PROFESSIONAL_COST,
} from "@/lib/pricing-constants";
import { useAudioRecorder } from "@/components/chat/hooks/use-audio-recorder";
import type { Voice } from "./types";
import {
  BrandTabs,
  BrandTabsList,
  BrandTabsTrigger,
  BrandTabsContent,
  BrandCard,
  BrandButton,
  CornerBrackets,
} from "@/components/brand";

interface VoiceCloneFormProps {
  creditBalance: number;
  onSuccess: (newVoice: Voice) => void;
  onCreditBalanceChange: (newBalance: number) => void;
}

interface UploadedFile {
  file: File;
  id: string;
}

export function VoiceCloneForm({
  creditBalance,
  onSuccess,
  onCreditBalanceChange,
}: VoiceCloneFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cloneType, setCloneType] = useState<"instant" | "professional">(
    "instant",
  );
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [professionalVoiceCount, setProfessionalVoiceCount] = useState<
    number | null
  >(null);

  // Advanced settings
  const [stability, setStability] = useState(0.5);
  const [similarityBoost, setSimilarityBoost] = useState(0.75);
  const [style, setStyle] = useState(0);
  const [useSpeakerBoost, setUseSpeakerBoost] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorder = useAudioRecorder();
  const [recordings, setRecordings] = useState<
    Array<{ blob: Blob; id: string; duration: number }>
  >([]);
  const [recordingName, setRecordingName] = useState("");

  const cost =
    cloneType === "instant"
      ? VOICE_CLONE_INSTANT_COST
      : VOICE_CLONE_PROFESSIONAL_COST;
  const hasEnoughCredits = Number(creditBalance) >= cost;

  // Fetch professional voice count on mount
  useEffect(() => {
    const fetchVoiceCount = async () => {
      try {
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
      } catch (error) {
        console.error("Failed to fetch voice count:", error);
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

  const handleSaveRecording = () => {
    if (!recorder.audioBlob) return;

    const name = recordingName.trim() || `Recording ${recordings.length + 1}`;
    const recording = {
      blob: recorder.audioBlob,
      id: Math.random().toString(36).substr(2, 9),
      duration: recorder.recordingTime,
    };

    setRecordings((prev) => [...prev, recording]);

    // Convert recording to File and add to files list
    // Use correct file extension based on blob type
    const ext = recorder.audioBlob.type.includes("webm") ? "webm" : "wav";
    const file = new File([recorder.audioBlob], `${name}.${ext}`, {
      type: recorder.audioBlob.type,
    });

    setFiles((prev) => [
      ...prev,
      {
        file,
        id: recording.id,
      },
    ]);

    recorder.clearRecording();
    setRecordingName("");
    toast.success("Recording saved!");
  };

  const removeRecording = (id: string) => {
    setRecordings((prev) => prev.filter((r) => r.id !== id));
    removeFile(id);
  };

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!name.trim()) {
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
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("cloneType", cloneType);
      if (description.trim()) {
        formData.append("description", description.trim());
      }

      // Add advanced settings
      formData.append(
        "settings",
        JSON.stringify({
          stability,
          similarityBoost,
          style,
          useSpeakerBoost,
        }),
      );

      // Add files
      files.forEach((f, index) => {
        formData.append(`file${index + 1}`, f.file);
      });

      const response = await fetch("/api/elevenlabs/voices/clone", {
        method: "POST",
        body: formData,
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
      if (cloneType === "professional") {
        toast.success(
          `Voice "${name}" is being created. Professional cloning takes 30-60 minutes. Check back later!`,
          { duration: 10000 },
        );
      } else {
        toast.success(`Voice "${name}" created successfully and ready to use!`);
      }

      // Update credit balance
      if (data.newBalance !== undefined) {
        onCreditBalanceChange(data.newBalance);
      }

      // Reset form
      setName("");
      setDescription("");
      setFiles([]);
      setCloneType("instant");
      setStability(0.5);
      setSimilarityBoost(0.75);
      setStyle(0);
      setUseSpeakerBoost(true);

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
    <BrandCard className="relative h-full flex flex-col overflow-hidden">
      <CornerBrackets size="sm" className="opacity-50" />

      <div className="relative z-10 shrink-0 space-y-4 pb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-white">
            Create Voice Clone
          </h3>
          <span className="rounded-none border border-white/20 bg-white/10 px-2 py-1 text-xs font-medium text-white">
            ${Number(creditBalance).toFixed(2)}
          </span>
        </div>
        <p className="text-sm text-white/60">
          Upload audio or record your voice to create a custom AI voice
        </p>
      </div>
      <div className="relative z-10 flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="space-y-6 pb-6">
          {/* Voice Name */}
          <div className="space-y-2">
            <label
              htmlFor="name"
              className="text-xs font-medium text-white/70 uppercase tracking-wide"
            >
              Voice Name <span className="text-rose-400">*</span>
            </label>
            <Input
              id="name"
              placeholder="My Voice"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isUploading}
              required
              className="rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label
              htmlFor="description"
              className="text-xs font-medium text-white/70 uppercase tracking-wide"
            >
              Description (optional)
            </label>
            <Textarea
              id="description"
              placeholder="A clone of my voice for content creation"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isUploading}
              rows={3}
              className="rounded-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]"
            />
          </div>

          {/* Clone Type */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                Clone Type
              </label>
              <p className="text-xs text-white/50 mt-1">
                Choose between instant or professional quality cloning
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setCloneType("instant")}
                disabled={isUploading}
                className={cn(
                  "relative rounded-none border p-3 text-left transition-all",
                  cloneType === "instant"
                    ? "border-[#FF5800] bg-[#FF580010]"
                    : "border-white/10 hover:border-white/30 hover:bg-white/5",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-white">
                        Instant Clone
                      </p>
                      <span className="rounded-none bg-green-500/20 text-green-400 border border-green-500/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                        Recommended
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-white/50">
                      <span>⏱️ ~30s</span>
                      <span>🎤 1-3 min</span>
                      <span className="text-green-400">✓ Unlimited</span>
                    </div>
                  </div>
                  <span className="shrink-0 font-semibold text-sm rounded-none border border-white/20 bg-white/10 px-2 py-1 text-white">
                    ${VOICE_CLONE_INSTANT_COST.toFixed(2)}
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setCloneType("professional")}
                disabled={isUploading}
                className={cn(
                  "relative rounded-none border p-3 text-left transition-all",
                  cloneType === "professional"
                    ? "border-[#FF5800] bg-[#FF580010]"
                    : "border-white/10 hover:border-white/30 hover:bg-white/5",
                )}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-white">
                          Professional
                        </p>
                        {professionalVoiceCount !== null && (
                          <span
                            className={cn(
                              "text-[10px] rounded-none border px-1.5 py-0.5 font-bold uppercase tracking-wide",
                              professionalVoiceCount >= 1
                                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                                : "border-white/20 bg-white/10 text-white",
                            )}
                          >
                            {professionalVoiceCount}/1 slots
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-white/50">
                        <span>⏱️ 30-60 min</span>
                        <span>🎤 30+ min</span>
                        <span className="text-amber-300">⚠ Limited</span>
                      </div>
                    </div>
                    <span className="shrink-0 font-semibold text-sm rounded-none border border-white/20 bg-white/10 px-2 py-1 text-white">
                      ${VOICE_CLONE_PROFESSIONAL_COST.toFixed(2)}
                    </span>
                  </div>
                  {professionalVoiceCount !== null &&
                    professionalVoiceCount >= 1 && (
                      <div className="pt-2 border-t border-amber-500/20">
                        <p className="text-[10px] text-amber-300 flex items-start gap-1">
                          <span className="shrink-0">⚠</span>
                          <span>Slot full - delete existing to create new</span>
                        </p>
                      </div>
                    )}
                </div>
              </button>
            </div>
          </div>

          {/* Audio Source - Tabs for Upload or Record */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                Audio Samples <span className="text-rose-400">*</span>
              </label>
              <p className="text-xs text-white/50 mt-1">
                Upload files or record directly in your browser
              </p>
            </div>

            <BrandTabs defaultValue="upload" className="w-full">
              <BrandTabsList className="w-full">
                <BrandTabsTrigger value="upload" className="flex-1">
                  Upload Files
                </BrandTabsTrigger>
                <BrandTabsTrigger value="record" className="flex-1">
                  Record Voice
                </BrandTabsTrigger>
              </BrandTabsList>

              {/* Upload Tab */}
              <BrandTabsContent value="upload" className="space-y-4">
                <button
                  type="button"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer w-full",
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/50",
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
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm font-medium mb-1">
                    Drag & drop audio files here, or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Supported: MP3, WAV, WebM, OGG (max 10MB each)
                  </p>
                </button>
              </BrandTabsContent>

              {/* Record Tab */}
              <BrandTabsContent value="record" className="space-y-4">
                {/* Recording Instructions */}
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <strong>Tips:</strong> Record 1-3+ min in a quiet space,
                    speak naturally and clearly with varied sentences.
                  </AlertDescription>
                </Alert>

                {/* Recording Controls */}
                <div className="flex flex-col items-center gap-4 p-6 rounded-lg border-2 bg-muted/50">
                  {!recorder.isRecording && !recorder.audioBlob && (
                    <>
                      <div className="text-center">
                        <Mic className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm font-medium">Ready to record</p>
                        <p className="text-xs text-muted-foreground">
                          Click the button below to start
                        </p>
                      </div>
                      <BrandButton
                        type="button"
                        onClick={recorder.startRecording}
                        variant="primary"
                        size="lg"
                        disabled={isUploading}
                      >
                        <Mic className="mr-2 h-4 w-4" />
                        Start Recording
                      </BrandButton>
                    </>
                  )}

                  {recorder.isRecording && (
                    <>
                      <div className="text-center">
                        <div className="relative mb-4">
                          <div className="absolute inset-0 animate-ping">
                            <div className="h-16 w-16 rounded-full bg-destructive/20 mx-auto" />
                          </div>
                          <Mic className="h-16 w-16 mx-auto text-destructive relative z-10" />
                        </div>
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <p className="text-2xl font-mono font-semibold">
                            {formatRecordingTime(recorder.recordingTime)}
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Recording in progress...
                        </p>
                      </div>
                      <BrandButton
                        type="button"
                        onClick={recorder.stopRecording}
                        variant="primary"
                        size="lg"
                        className="animate-pulse"
                      >
                        <Square className="mr-2 h-4 w-4" fill="currentColor" />
                        Stop Recording
                      </BrandButton>
                    </>
                  )}

                  {recorder.audioBlob && !recorder.isRecording && (
                    <div className="w-full space-y-3">
                      <div className="flex items-center justify-center gap-2 text-sm">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <span className="font-medium">
                          Recording complete (
                          {formatRecordingTime(recorder.recordingTime)})
                        </span>
                      </div>

                      {/* Recording Name Input */}
                      <div className="space-y-2">
                        <label
                          htmlFor="recording-name"
                          className="text-xs font-medium text-white/70 uppercase tracking-wide"
                        >
                          Recording Name (optional)
                        </label>
                        <Input
                          id="recording-name"
                          placeholder={`Recording ${recordings.length + 1}`}
                          value={recordingName}
                          onChange={(e) => setRecordingName(e.target.value)}
                          className="text-sm"
                        />
                      </div>

                      {/* Audio Preview */}
                      <audio
                        controls
                        src={URL.createObjectURL(recorder.audioBlob)}
                        className="w-full"
                      >
                        <track kind="captions" />
                      </audio>

                      <div className="flex gap-2">
                        <BrandButton
                          type="button"
                          onClick={handleSaveRecording}
                          variant="primary"
                          className="flex-1"
                        >
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Save Recording
                        </BrandButton>
                        <BrandButton
                          type="button"
                          onClick={recorder.clearRecording}
                          variant="outline"
                          className="flex-1"
                        >
                          <X className="mr-2 h-4 w-4" />
                          Discard
                        </BrandButton>
                      </div>
                    </div>
                  )}

                  {recorder.error && (
                    <Alert variant="destructive" className="w-full">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        {recorder.error}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                {/* Saved Recordings List */}
                {recordings.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs text-white/50 uppercase tracking-wide">
                      Saved Recordings ({recordings.length})
                    </label>
                    {recordings.map((rec, index) => (
                      <div
                        key={rec.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-muted"
                      >
                        <Mic className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            Recording {index + 1}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Duration: {formatRecordingTime(rec.duration)}
                          </p>
                        </div>
                        <BrandButton
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRecording(rec.id)}
                          disabled={isUploading}
                          className="shrink-0 text-rose-400 hover:bg-rose-500/10"
                        >
                          <X className="h-4 w-4" />
                        </BrandButton>
                      </div>
                    ))}
                  </div>
                )}
              </BrandTabsContent>
            </BrandTabs>

            {/* Combined File List (Uploads + Recordings) */}
            {files.length > 0 && (
              <div className="space-y-2 mt-4">
                <label className="text-xs text-white/50 uppercase tracking-wide">
                  Total Audio Files ({files.length})
                </label>
                {files.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border"
                  >
                    <FileAudio className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {f.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(f.file.size)}
                      </p>
                    </div>
                    <BrandButton
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFile(f.id)}
                      disabled={isUploading}
                      className="shrink-0 text-rose-400 hover:bg-rose-500/10"
                    >
                      <X className="h-4 w-4" />
                    </BrandButton>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Advanced Settings */}
          <Accordion type="single" collapsible>
            <AccordionItem value="advanced">
              <AccordionTrigger className="text-sm">
                Advanced Settings
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pt-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                      Stability: {stability.toFixed(2)}
                    </label>
                  </div>
                  <Slider
                    value={[stability]}
                    min={0}
                    max={1}
                    step={0.01}
                    onValueChange={(v) => setStability(v[0])}
                    disabled={isUploading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Higher values make the voice more stable but less expressive
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                    Similarity Boost: {similarityBoost.toFixed(2)}
                  </label>
                  <Slider
                    value={[similarityBoost]}
                    min={0}
                    max={1}
                    step={0.01}
                    onValueChange={(v) => setSimilarityBoost(v[0])}
                    disabled={isUploading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Higher values make the voice more similar to the original
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-white/70 uppercase tracking-wide">
                    Style: {style.toFixed(2)}
                  </label>
                  <Slider
                    value={[style]}
                    min={0}
                    max={1}
                    step={0.01}
                    onValueChange={(v) => setStyle(v[0])}
                    disabled={isUploading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Controls expressiveness and emotion in the voice
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Error Message */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <BrandButton
            type="submit"
            variant="primary"
            disabled={isUploading || !hasEnoughCredits || files.length === 0}
            className="w-full font-semibold h-11"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Voice Clone...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Create Voice Clone (${cost.toFixed(2)})
              </>
            )}
          </BrandButton>
        </form>
      </div>
    </BrandCard>
  );
}
