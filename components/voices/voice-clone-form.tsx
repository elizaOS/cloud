"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload,
  X,
  FileAudio,
  Loader2,
  AlertCircle,
  Coins,
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
    <Card className="h-full border-border/60 bg-background/70 shadow-sm">
      <CardHeader className="space-y-1 pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold">
            Create Voice Clone
          </CardTitle>
          <Badge variant="outline" className="text-xs font-medium">
            ${Number(creditBalance).toFixed(2)}
          </Badge>
        </div>
        <CardDescription className="text-sm">
          Upload audio or record your voice to create a custom AI voice
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-y-auto max-h-[calc(100vh-300px)] px-6">
        <form onSubmit={handleSubmit} className="space-y-7">
          {/* Voice Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Voice Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="My Voice"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isUploading}
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="A clone of my voice for content creation"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isUploading}
              rows={3}
            />
          </div>

          {/* Clone Type */}
          <div className="space-y-3">
            <div>
              <Label className="text-base font-semibold">Clone Type</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Choose between instant or professional quality cloning
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => setCloneType("instant")}
                disabled={isUploading}
                className={cn(
                  "relative rounded-xl border-2 p-5 text-left transition-all hover:shadow-sm",
                  cloneType === "instant"
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-muted-foreground/50 hover:bg-muted/30",
                )}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-base">Instant Clone</p>
                        <Badge
                          variant="secondary"
                          className="bg-green-500/10 text-green-600 border-green-500/20"
                        >
                          Recommended
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Fast and unlimited voice cloning
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 font-semibold text-xs"
                    >
                      ${VOICE_CLONE_INSTANT_COST.toFixed(2)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <span>⏱️</span>
                      <span>~30s processing</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span>🎤</span>
                      <span>1-3 min audio</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-green-600">✓</span>
                      <span className="text-green-600">Unlimited</span>
                    </div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setCloneType("professional")}
                disabled={isUploading}
                className={cn(
                  "relative rounded-xl border-2 p-5 text-left transition-all hover:shadow-sm",
                  cloneType === "professional"
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-muted-foreground/50 hover:bg-muted/30",
                )}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-base">Professional</p>
                        {professionalVoiceCount !== null && (
                          <Badge
                            variant={
                              professionalVoiceCount >= 1
                                ? "secondary"
                                : "outline"
                            }
                            className={cn(
                              "text-xs",
                              professionalVoiceCount >= 1 &&
                                "border-amber-500/50 bg-amber-500/10 text-amber-600",
                            )}
                          >
                            {professionalVoiceCount}/1 slots
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Studio-quality voice cloning
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="shrink-0 font-semibold text-xs"
                    >
                      ${VOICE_CLONE_PROFESSIONAL_COST.toFixed(2)}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span>⏱️</span>
                      <span>30-60 min</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span>🎤</span>
                      <span>30+ min audio</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-amber-600">⚠</span>
                      <span className="text-amber-600">Limited to 1</span>
                    </div>
                  </div>

                  {professionalVoiceCount !== null &&
                    professionalVoiceCount >= 1 && (
                      <div className="pt-2 border-t border-amber-500/20">
                        <p className="text-xs text-amber-600 flex items-start gap-1.5">
                          <span className="shrink-0">⚠</span>
                          <span>
                            Slot full - delete existing professional voice to
                            create new
                          </span>
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
              <Label className="text-base font-semibold">
                Audio Samples <span className="text-destructive">*</span>
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                Upload files or record directly in your browser
              </p>
            </div>

            <Tabs defaultValue="upload" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="upload">Upload Files</TabsTrigger>
                <TabsTrigger value="record">Record Voice</TabsTrigger>
              </TabsList>

              {/* Upload Tab */}
              <TabsContent value="upload" className="space-y-4">
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
              </TabsContent>

              {/* Record Tab */}
              <TabsContent value="record" className="space-y-4">
                {/* Recording Instructions */}
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <p className="font-semibold mb-2">Tips for best results:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Record in a quiet environment</li>
                      <li>Speak naturally and clearly</li>
                      <li>Record at least 1-3 minutes total</li>
                      <li>Use varied sentences and emotions</li>
                      <li>Avoid background music or noise</li>
                    </ul>
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
                      <Button
                        type="button"
                        onClick={recorder.startRecording}
                        size="lg"
                        disabled={isUploading}
                      >
                        <Mic className="mr-2 h-4 w-4" />
                        Start Recording
                      </Button>
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
                      <Button
                        type="button"
                        onClick={recorder.stopRecording}
                        variant="destructive"
                        size="lg"
                      >
                        <Square className="mr-2 h-4 w-4" />
                        Stop Recording
                      </Button>
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
                        <Label htmlFor="recording-name" className="text-xs">
                          Recording Name (optional)
                        </Label>
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
                        <Button
                          type="button"
                          onClick={handleSaveRecording}
                          className="flex-1"
                        >
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Save Recording
                        </Button>
                        <Button
                          type="button"
                          onClick={recorder.clearRecording}
                          variant="outline"
                          className="flex-1"
                        >
                          <X className="mr-2 h-4 w-4" />
                          Discard
                        </Button>
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
                    <Label className="text-xs text-muted-foreground">
                      Saved Recordings ({recordings.length})
                    </Label>
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
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRecording(rec.id)}
                          disabled={isUploading}
                          className="shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* Combined File List (Uploads + Recordings) */}
            {files.length > 0 && (
              <div className="space-y-2 mt-4">
                <Label className="text-xs text-muted-foreground">
                  Total Audio Files ({files.length})
                </Label>
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFile(f.id)}
                      disabled={isUploading}
                      className="shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Advanced Settings */}
          <Accordion type="single" collapsible>
            <AccordionItem value="advanced">
              <AccordionTrigger>Advanced Settings</AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Stability: {stability.toFixed(2)}</Label>
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
                  <Label>Similarity Boost: {similarityBoost.toFixed(2)}</Label>
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
                  <Label>Style: {style.toFixed(2)}</Label>
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

          {/* Credit Info */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-background">
                <Coins className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Balance</p>
                <p className="text-xs text-muted-foreground">
                  ${Number(creditBalance).toFixed(2)} available
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">Cost: ${cost.toFixed(2)}</p>
              {!hasEnoughCredits && (
                <p className="text-xs text-destructive font-medium">
                  Insufficient balance
                </p>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isUploading || !hasEnoughCredits || files.length === 0}
            className="w-full font-semibold"
            size="lg"
          >
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Creating Voice Clone...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                Create Voice Clone (${cost.toFixed(2)})
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
