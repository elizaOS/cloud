/**
 * Advanced voice generator component with full-featured controls.
 * Matches the image generator layout with top input bar and creations grid.
 * Supports voice selection, settings, audio history, and playback.
 */

"use client";

import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Volume2,
  Loader2,
  Download,
  X,
  Send,
  Check,
  SlidersHorizontal,
  Play,
  Pause,
  Mic,
  Upload,
  ArrowLeft,
} from "lucide-react";
import { BrandCard, CornerBrackets } from "@/components/brand";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { TTS_GENERATION_COST, VOICE_CLONE_INSTANT_COST, VOICE_CLONE_PROFESSIONAL_COST } from "@/lib/pricing-constants";
import type { Voice } from "./types";

interface VoiceSettings {
  stability: number;
  similarityBoost: number;
  style: number;
}

interface GeneratedAudio {
  id: string;
  url: string;
  blob: Blob;
  text: string;
  voiceId: string;
  voiceName: string;
  timestamp: Date;
  duration: number;
  settings: VoiceSettings;
}

export interface TtsHistoryItem {
  id: string;
  url: string;
  text: string;
  voiceId: string;
  voiceName: string;
  createdAt: string;
}

interface VoiceGeneratorAdvancedProps {
  voices: Voice[];
  initialTtsHistory?: TtsHistoryItem[];
  creditBalance: number;
  onCreditBalanceChange?: (newBalance: number) => void;
  onVoiceCreated?: (voice: Voice) => void;
}

const DEFAULT_VOICES = [
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam" },
];

const MAX_TEXT_LENGTH = 5000;

export function VoiceGeneratorAdvanced({
  voices,
  initialTtsHistory = [],
  creditBalance,
  onCreditBalanceChange,
}: VoiceGeneratorAdvancedProps) {
  // Form state
  const [text, setText] = useState("");
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("EXAVITQu4vr4xnSDxMaL");
  const [settings, setSettings] = useState<VoiceSettings>({
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0,
  });

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const topAnchorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Convert initial history to GeneratedAudio format (without blob for server-side data)
  const convertedHistory: GeneratedAudio[] = initialTtsHistory.map((item) => ({
    id: item.id,
    url: item.url,
    blob: new Blob(), // Empty blob for server-loaded items
    text: item.text,
    voiceId: item.voiceId,
    voiceName: item.voiceName,
    timestamp: new Date(item.createdAt),
    duration: 0, // Will be loaded on play
    settings: { stability: 0.5, similarityBoost: 0.75, style: 0 },
  }));

  // Audio state
  const [audioState, setAudioState] = useState<{
    currentAudio: GeneratedAudio | null;
    history: GeneratedAudio[];
    playingId: string | null;
  }>({
    currentAudio: null,
    history: convertedHistory,
    playingId: null,
  });

  // Request state
  const [requestState, setRequestState] = useState<{
    isLoading: boolean;
    error: string | null;
  }>({
    isLoading: false,
    error: null,
  });

  // UI state
  const [uiState, setUiState] = useState<{
    activeTab: string;
    inputMode: "generate" | "clone";
    cloneMode: "select" | "upload" | "record";
    isDetailOpen: boolean;
    selectedAudio: GeneratedAudio | null;
  }>({
    activeTab: "creations",
    inputMode: "generate",
    cloneMode: "select",
    isDetailOpen: false,
    selectedAudio: null,
  });

  // Clone state
  const [cloneState, setCloneState] = useState<{
    isDragging: boolean;
    uploadedFiles: File[];
    isRecording: boolean;
    recordingTime: number;
    audioLevels: number[];
    voiceName: string;
    cloneType: "instant" | "professional";
    isCloning: boolean;
  }>({
    isDragging: false,
    uploadedFiles: [],
    isRecording: false,
    recordingTime: 0,
    audioLevels: [0, 0, 0, 0, 0, 0, 0, 0],
    voiceName: "",
    cloneType: "instant",
    isCloning: false,
  });

  // Recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Audio element refs for playback
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

  const hasEnoughCredits = Number(creditBalance) >= TTS_GENERATION_COST;

  // Filter to only show ready voices (not processing)
  const readyVoices = voices.filter(v => {
    const minutesElapsed = Math.max(
      0,
      (new Date().getTime() - new Date(v.createdAt).getTime()) / 1000 / 60
    );
    return !(v.cloneType === "professional" && minutesElapsed < 30);
  });

  // All available voices (custom + default)
  const allVoices = [
    ...readyVoices.map(v => ({ id: v.elevenlabsVoiceId, name: v.name, isCustom: true })),
    ...DEFAULT_VOICES.map(v => ({ ...v, isCustom: false })),
  ];

  const selectedVoice = allVoices.find(v => v.id === selectedVoiceId);

  // Scroll to top helper
  const scrollToTop = () => {
    requestAnimationFrame(() => {
      if (topAnchorRef.current) {
        topAnchorRef.current.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 300);
    });
  };

  // Cleanup audio URLs on unmount
  useEffect(() => {
    const historyRef = audioState.history;
    return () => {
      historyRef.forEach(audio => {
        URL.revokeObjectURL(audio.url);
      });
    };
  }, [audioState.history]);

  const handleGenerate = async () => {
    if (!text.trim()) return;
    if (text.length > MAX_TEXT_LENGTH) {
      setRequestState(prev => ({ ...prev, error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` }));
      return;
    }
    if (!hasEnoughCredits) {
      setRequestState(prev => ({ ...prev, error: `Insufficient credits. Need $${TTS_GENERATION_COST.toFixed(2)}` }));
      return;
    }

    setRequestState({ isLoading: true, error: null });

    const response = await fetch("/api/elevenlabs/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text.trim(),
        voiceId: selectedVoiceId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMsg = errorData.error || "Failed to generate speech";
      setRequestState({ isLoading: false, error: errorMsg });
      toast.error(errorMsg);
      return;
    }

    const data = await response.json();
    
    // Convert base64 to blob for local playback
    const audioBuffer = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
    const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });
    
    // Use storage URL if available, otherwise create blob URL
    const audioUrl = data.storageUrl || URL.createObjectURL(audioBlob);

    // Get audio duration
    const tempAudio = new Audio(audioUrl);
    await new Promise<void>(resolve => {
      tempAudio.addEventListener("loadedmetadata", () => resolve());
      tempAudio.load();
    });

    const newAudio: GeneratedAudio = {
      id: crypto.randomUUID(),
      url: audioUrl,
      blob: audioBlob,
      text: text.trim(),
      voiceId: selectedVoiceId,
      voiceName: data.voiceName || selectedVoice?.name || "Unknown",
      timestamp: new Date(),
      duration: tempAudio.duration,
      settings: { ...settings },
    };

    setAudioState(prev => ({
      ...prev,
      currentAudio: newAudio,
      history: [newAudio, ...prev.history].slice(0, 20),
    }));

    setRequestState({ isLoading: false, error: null });

    // Update credit balance
    if (onCreditBalanceChange) {
      onCreditBalanceChange(Number(creditBalance) - TTS_GENERATION_COST);
    }

    toast.success("Speech generated successfully!");
  };

  const handleDownload = (audio: GeneratedAudio) => {
    const link = document.createElement("a");
    link.href = audio.url;
    link.download = `eliza-tts-${audio.id}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Audio downloaded!");
  };

  const togglePlayback = async (audioId: string, audioUrl: string) => {
    // Check if URL is valid
    if (!audioUrl || audioUrl === "") {
      toast.error("Audio URL not available");
      return;
    }

    const currentlyPlaying = audioState.playingId;
    
    // Stop current playing audio
    if (currentlyPlaying) {
      const currentAudioEl = audioRefs.current.get(currentlyPlaying);
      if (currentAudioEl) {
        currentAudioEl.pause();
        currentAudioEl.currentTime = 0;
      }
    }

    // If clicking on same audio, just stop
    if (currentlyPlaying === audioId) {
      setAudioState(prev => ({ ...prev, playingId: null }));
      return;
    }

    // Play new audio
    let audioEl = audioRefs.current.get(audioId);
    if (!audioEl) {
      audioEl = new Audio(audioUrl);
      audioEl.addEventListener("ended", () => {
        setAudioState(prev => ({ ...prev, playingId: null }));
      });
      audioEl.addEventListener("error", () => {
        toast.error("Failed to play audio");
        setAudioState(prev => ({ ...prev, playingId: null }));
      });
      audioRefs.current.set(audioId, audioEl);
    }
    
    try {
      await audioEl.play();
      setAudioState(prev => ({ ...prev, playingId: audioId }));
    } catch (err) {
      toast.error("Failed to play audio");
      setAudioState(prev => ({ ...prev, playingId: null }));
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const cloneCost = cloneState.cloneType === "instant" ? VOICE_CLONE_INSTANT_COST : VOICE_CLONE_PROFESSIONAL_COST;
  const hasEnoughCreditsForClone = Number(creditBalance) >= cloneCost;

  const handleCloneVoice = async () => {
    if (cloneState.uploadedFiles.length === 0) {
      toast.error("Please upload at least one audio file");
      return;
    }
    if (!cloneState.voiceName.trim()) {
      toast.error("Please enter a name for your voice");
      return;
    }
    if (!hasEnoughCreditsForClone) {
      toast.error(`Insufficient credits. Need $${cloneCost.toFixed(2)}`);
      return;
    }

    setCloneState(prev => ({ ...prev, isCloning: true }));

    const formData = new FormData();
    formData.append("name", cloneState.voiceName.trim());
    formData.append("cloneType", cloneState.cloneType);
    cloneState.uploadedFiles.forEach((file, index) => {
      formData.append(`file${index}`, file);
    });

    const response = await fetch("/api/elevenlabs/voices/clone", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMsg = errorData.error || "Failed to clone voice";
      setCloneState(prev => ({ ...prev, isCloning: false }));
      toast.error(errorMsg);
      return;
    }

    const data = await response.json();
    
    // Reset clone state
    setCloneState(prev => ({
      ...prev,
      isCloning: false,
      uploadedFiles: [],
      voiceName: "",
    }));
    setUiState(prev => ({ ...prev, cloneMode: "select" }));

    // Update credit balance
    if (onCreditBalanceChange) {
      onCreditBalanceChange(Number(creditBalance) - cloneCost);
    }

    toast.success(`Voice "${data.voice?.name || cloneState.voiceName}" cloned successfully!`);
    
    // Refresh page to show new voice
    window.location.reload();
  };

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full scroll-smooth">
      {/* Scroll anchor */}
      <div ref={topAnchorRef} className="absolute top-0" />

      {/* Top Input Bar */}
      <div>
        <div className="w-full">
          <div
            className={`relative rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden transition-all ${
              requestState.isLoading
                ? "opacity-60 pointer-events-none"
                : "focus-within:border-white/[0.15] focus-within:bg-white/[0.03]"
            }`}
          >
            {/* Loading Scanner */}
            {requestState.isLoading && (
              <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden pointer-events-none z-10">
                <div
                  className="absolute h-full w-24 bg-gradient-to-r from-transparent via-[#FF5800] to-transparent"
                  style={{
                    animation: "visor-scan 4.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                    boxShadow: "0 0 15px 3px rgba(255, 88, 0, 0.7)",
                    filter: "blur(0.5px)",
                  }}
                />
              </div>
            )}

            {/* Input Mode Tabs - Inside the input card */}
            <div className="flex items-center gap-4 px-5 pt-3 pb-2 border-b border-white/[0.06]">
              <button
                type="button"
                onClick={() => setUiState(prev => ({ ...prev, inputMode: "generate" }))}
                className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                  uiState.inputMode === "generate"
                    ? "text-[#FF5800]"
                    : "text-white/40 hover:text-white/60"
                }`}
              >
                <Volume2 className="h-3.5 w-3.5" />
                Text to Voice
              </button>
              <button
                type="button"
                onClick={() => setUiState(prev => ({ ...prev, inputMode: "clone" }))}
                className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                  uiState.inputMode === "clone"
                    ? "text-[#FF5800]"
                    : "text-white/40 hover:text-white/60"
                }`}
              >
                <Mic className="h-3.5 w-3.5" />
                Clone Voice
              </button>
            </div>

            {/* Generate Speech Mode */}
            {uiState.inputMode === "generate" && (
              <>
                {/* Textarea */}
                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!requestState.isLoading && text.trim() && hasEnoughCredits) {
                        handleGenerate();
                      }
                    }
                  }}
                  placeholder="Enter the text you want to convert to speech..."
                  disabled={requestState.isLoading}
                  className="w-full bg-transparent px-5 pt-4 pb-4 text-xl text-white placeholder:text-white/40 focus:outline-none disabled:opacity-50 resize-none leading-relaxed"
                  style={{ height: "25vh", minHeight: "150px", maxHeight: "350px" }}
                />

                {/* Bottom bar with buttons */}
                <div className="flex items-center justify-between px-2 py-2">
                  {/* Left side - Voice selector and Settings */}
                  <div className="flex items-center gap-1.5">
                {/* Voice Selector Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild disabled={requestState.isLoading}>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={requestState.isLoading}
                      className="h-8 gap-1.5 px-2.5 rounded-lg hover:bg-white/[0.06] transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <Volume2 className="h-3.5 w-3.5 text-white/50" />
                      <span className="text-sm text-white/50 max-w-[120px] truncate">
                        {selectedVoice?.name || "Select Voice"}
                      </span>
                      <svg
                        className="h-3.5 w-3.5 text-white/30"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-56 max-h-80 overflow-y-auto rounded-xl border-white/[0.08] bg-[#1a1a1a]/95 backdrop-blur-xl p-1"
                    align="start"
                    side="bottom"
                    sideOffset={8}
                  >
                    {/* Custom Voices */}
                    {readyVoices.length > 0 && (
                      <>
                        <div className="px-3 py-1.5 text-xs font-mono text-white/40 uppercase">
                          Your Voices
                        </div>
                        {readyVoices.map((voice) => (
                          <DropdownMenuItem
                            key={voice.id}
                            className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer"
                            onSelect={() => setSelectedVoiceId(voice.elevenlabsVoiceId)}
                          >
                            <div className="flex items-center gap-3">
                              <Mic className="h-4 w-4 text-[#FF5800]" />
                              <span className="text-sm">{voice.name}</span>
                            </div>
                            {selectedVoiceId === voice.elevenlabsVoiceId && (
                              <Check className="h-4 w-4 text-[#FF5800]" />
                            )}
                          </DropdownMenuItem>
                        ))}
                        <div className="border-t border-white/10 my-1" />
                      </>
                    )}
                    
                    {/* Default Voices */}
                    <div className="px-3 py-1.5 text-xs font-mono text-white/40 uppercase">
                      Default Voices
                    </div>
                    {DEFAULT_VOICES.map((voice) => (
                      <DropdownMenuItem
                        key={voice.id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer"
                        onSelect={() => setSelectedVoiceId(voice.id)}
                      >
                        <div className="flex items-center gap-3">
                          <Volume2 className="h-4 w-4 text-white/50" />
                          <span className="text-sm">{voice.name}</span>
                        </div>
                        {selectedVoiceId === voice.id && (
                          <Check className="h-4 w-4 text-[#FF5800]" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Advanced Settings Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild disabled={requestState.isLoading}>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={requestState.isLoading}
                      className="h-8 gap-1.5 px-2.5 rounded-lg hover:bg-white/[0.06] transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5 text-white/50" />
                      <span className="text-sm text-white/50 hidden sm:inline">Settings</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-72 rounded-xl border-white/[0.08] bg-[#1a1a1a]/95 backdrop-blur-xl p-4"
                    align="start"
                    side="bottom"
                    sideOffset={8}
                  >
                    <div className="space-y-4">
                      {/* Stability */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-mono text-white/60">Stability</label>
                          <span className="text-xs font-mono text-white">{settings.stability.toFixed(2)}</span>
                        </div>
                        <Slider
                          value={[settings.stability]}
                          onValueChange={([value]) => setSettings(prev => ({ ...prev, stability: value }))}
                          min={0}
                          max={1}
                          step={0.01}
                          className="w-full [&_[role=slider]]:bg-[#FF5800] [&_[role=slider]]:border-[#FF5800]"
                        />
                      </div>

                      {/* Similarity Boost */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-mono text-white/60">Similarity</label>
                          <span className="text-xs font-mono text-white">{settings.similarityBoost.toFixed(2)}</span>
                        </div>
                        <Slider
                          value={[settings.similarityBoost]}
                          onValueChange={([value]) => setSettings(prev => ({ ...prev, similarityBoost: value }))}
                          min={0}
                          max={1}
                          step={0.01}
                          className="w-full [&_[role=slider]]:bg-[#FF5800] [&_[role=slider]]:border-[#FF5800]"
                        />
                      </div>

                      {/* Style */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-mono text-white/60">Style</label>
                          <span className="text-xs font-mono text-white">{settings.style.toFixed(2)}</span>
                        </div>
                        <Slider
                          value={[settings.style]}
                          onValueChange={([value]) => setSettings(prev => ({ ...prev, style: value }))}
                          min={0}
                          max={1}
                          step={0.01}
                          className="w-full [&_[role=slider]]:bg-[#FF5800] [&_[role=slider]]:border-[#FF5800]"
                        />
                      </div>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Character count */}
                <span className={`text-xs font-mono px-2 ${text.length > MAX_TEXT_LENGTH ? "text-rose-400" : "text-white/30"}`}>
                  {text.length}/{MAX_TEXT_LENGTH}
                </span>
              </div>

                  {/* Right side - Cost and Generate button */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-white/40">
                      ${TTS_GENERATION_COST.toFixed(2)}
                    </span>
                    <Button
                      type="button"
                      onClick={handleGenerate}
                      disabled={requestState.isLoading || !text.trim() || text.length > MAX_TEXT_LENGTH || !hasEnoughCredits}
                      size="icon"
                      className="h-8 w-8 rounded-lg bg-transparent hover:bg-white/[0.06] disabled:opacity-40 border-0 transition-colors"
                    >
                      {requestState.isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-[#FF5800]" />
                      ) : (
                        <Send className="h-4 w-4 text-[#FF5800]" />
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* Clone Voice Mode */}
            {uiState.inputMode === "clone" && (
              <div className="p-6" style={{ minHeight: "25vh" }}>
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) {
                      setCloneState(prev => ({
                        ...prev,
                        uploadedFiles: [...prev.uploadedFiles, ...Array.from(e.target.files!)],
                      }));
                    }
                  }}
                  className="hidden"
                />

                {/* Select Mode - Upload or Record */}
                {uiState.cloneMode === "select" && (
                  <div className="flex items-center justify-center h-full min-h-[200px]">
                    {/* Upload Option */}
                    <button
                      type="button"
                      onClick={() => setUiState(prev => ({ ...prev, cloneMode: "upload" }))}
                      className="flex-1 flex flex-col items-center justify-center gap-4 py-8 px-6 hover:bg-white/[0.02] transition-colors rounded-lg group"
                    >
                      <div className="rounded-full bg-white/[0.05] border border-white/10 p-6 group-hover:border-[#FF5800]/30 group-hover:bg-[#FF5800]/10 transition-colors">
                        <Upload className="h-10 w-10 text-white/50 group-hover:text-[#FF5800] transition-colors" />
                      </div>
                      <span className="text-lg font-medium text-white/70 group-hover:text-white transition-colors">
                        Upload
                      </span>
                    </button>

                    {/* Divider */}
                    <div className="h-32 w-px bg-white/10 mx-4" />

                    {/* Record Option */}
                    <button
                      type="button"
                      onClick={() => setUiState(prev => ({ ...prev, cloneMode: "record" }))}
                      className="flex-1 flex flex-col items-center justify-center gap-4 py-8 px-6 hover:bg-white/[0.02] transition-colors rounded-lg group"
                    >
                      <div className="rounded-full bg-white/[0.05] border border-white/10 p-6 group-hover:border-[#FF5800]/30 group-hover:bg-[#FF5800]/10 transition-colors">
                        <Mic className="h-10 w-10 text-white/50 group-hover:text-[#FF5800] transition-colors" />
                      </div>
                      <span className="text-lg font-medium text-white/70 group-hover:text-white transition-colors">
                        Record
                      </span>
                    </button>
                  </div>
                )}

                {/* Upload Mode - Drag & Drop */}
                {uiState.cloneMode === "upload" && (
                  <div className="h-full min-h-[200px] flex flex-col">
                    {/* Back button */}
                    <button
                      type="button"
                      onClick={() => {
                        setUiState(prev => ({ ...prev, cloneMode: "select" }));
                        setCloneState(prev => ({ ...prev, uploadedFiles: [], isDragging: false }));
                      }}
                      className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors mb-4 self-start"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </button>

                    {/* Drag & Drop Area */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setCloneState(prev => ({ ...prev, isDragging: true }));
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        setCloneState(prev => ({ ...prev, isDragging: false }));
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setCloneState(prev => ({ ...prev, isDragging: false }));
                        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("audio/"));
                        if (files.length > 0) {
                          setCloneState(prev => ({
                            ...prev,
                            uploadedFiles: [...prev.uploadedFiles, ...files],
                          }));
                        }
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                        cloneState.isDragging
                          ? "border-[#FF5800] bg-[#FF5800]/10"
                          : "border-white/20 hover:border-white/40 hover:bg-white/[0.02]"
                      }`}
                    >
                      {cloneState.uploadedFiles.length === 0 ? (
                        <>
                          <Upload className={`h-12 w-12 mb-4 ${cloneState.isDragging ? "text-[#FF5800]" : "text-white/40"}`} />
                          <p className="text-lg font-medium text-white/70">
                            Drag & drop audio files here
                          </p>
                          <p className="text-sm text-white/40 mt-1">
                            or click to browse
                          </p>
                        </>
                      ) : (
                        <div className="w-full p-4" onClick={(e) => e.stopPropagation()}>
                          <p className="text-sm text-white/50 mb-3 text-center">
                            {cloneState.uploadedFiles.length} file(s) selected
                          </p>
                          <div className="space-y-2 max-h-24 overflow-y-auto mb-4">
                            {cloneState.uploadedFiles.map((file, idx) => (
                              <div key={idx} className="flex items-center justify-between bg-white/5 px-3 py-2 rounded">
                                <span className="text-sm text-white truncate">{file.name}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCloneState(prev => ({
                                      ...prev,
                                      uploadedFiles: prev.uploadedFiles.filter((_, i) => i !== idx),
                                    }));
                                  }}
                                  className="text-white/40 hover:text-white ml-2"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="text-xs text-[#FF5800] hover:underline mb-4 block mx-auto"
                          >
                            + Add more files
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Voice Name, Clone Type, and Clone Button - Show when files uploaded */}
                    {cloneState.uploadedFiles.length > 0 && (
                      <div className="mt-4 space-y-4">
                        {/* Voice Name Input */}
                        <div>
                          <label className="text-xs font-mono text-white/50 mb-1.5 block">Voice Name</label>
                          <input
                            type="text"
                            value={cloneState.voiceName}
                            onChange={(e) => setCloneState(prev => ({ ...prev, voiceName: e.target.value }))}
                            placeholder="Enter a name for your voice..."
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:border-[#FF5800]/50 transition-colors"
                          />
                        </div>

                        {/* Clone Type Selector */}
                        <div>
                          <label className="text-xs font-mono text-white/50 mb-1.5 block">Clone Type</label>
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => setCloneState(prev => ({ ...prev, cloneType: "instant" }))}
                              className={`flex-1 flex flex-col items-center p-4 rounded-lg border transition-colors ${
                                cloneState.cloneType === "instant"
                                  ? "border-[#FF5800] bg-[#FF5800]/10"
                                  : "border-white/10 hover:border-white/20"
                              }`}
                            >
                              <span className="text-sm font-medium text-white mb-1">Instant</span>
                              <span className="text-xs text-white/50">~30 seconds</span>
                              <span className="text-sm font-mono text-[#FF5800] mt-2">${VOICE_CLONE_INSTANT_COST.toFixed(2)}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setCloneState(prev => ({ ...prev, cloneType: "professional" }))}
                              className={`flex-1 flex flex-col items-center p-4 rounded-lg border transition-colors ${
                                cloneState.cloneType === "professional"
                                  ? "border-[#FF5800] bg-[#FF5800]/10"
                                  : "border-white/10 hover:border-white/20"
                              }`}
                            >
                              <span className="text-sm font-medium text-white mb-1">Professional</span>
                              <span className="text-xs text-white/50">~30 minutes</span>
                              <span className="text-sm font-mono text-[#FF5800] mt-2">${VOICE_CLONE_PROFESSIONAL_COST.toFixed(2)}</span>
                            </button>
                          </div>
                        </div>

                        {/* Clone Voice Button */}
                        <Button
                          type="button"
                          onClick={handleCloneVoice}
                          disabled={cloneState.isCloning || !cloneState.voiceName.trim() || !hasEnoughCreditsForClone}
                          className="w-full bg-[#FF5800] hover:bg-[#FF5800]/90 text-white font-medium py-3 disabled:opacity-50"
                        >
                          {cloneState.isCloning ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              Cloning Voice...
                            </>
                          ) : (
                            <>
                              <Mic className="h-4 w-4 mr-2" />
                              Clone Voice - ${cloneCost.toFixed(2)}
                            </>
                          )}
                        </Button>

                        {/* Insufficient credits warning */}
                        {!hasEnoughCreditsForClone && (
                          <p className="text-xs text-center text-amber-400 font-mono">
                            Insufficient credits. Need ${cloneCost.toFixed(2)}, have ${Number(creditBalance).toFixed(2)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Record Mode - Microphone with visualization */}
                {uiState.cloneMode === "record" && (
                  <div className="h-full min-h-[200px] flex flex-col">
                    {/* Back button */}
                    <button
                      type="button"
                      onClick={() => {
                        setUiState(prev => ({ ...prev, cloneMode: "select" }));
                        setCloneState(prev => ({ ...prev, isRecording: false, recordingTime: 0, audioLevels: [0,0,0,0,0,0,0,0] }));
                        if (mediaRecorderRef.current && cloneState.isRecording) {
                          mediaRecorderRef.current.stop();
                        }
                        if (animationFrameRef.current) {
                          cancelAnimationFrame(animationFrameRef.current);
                        }
                      }}
                      className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors mb-4 self-start"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back
                    </button>

                    {/* Recording Area */}
                    <div className="flex-1 flex flex-col items-center justify-center">
                      {/* Microphone with visualization bars */}
                      <div className="relative flex items-center justify-center gap-3">
                        {/* Left bars */}
                        <div className="flex items-end gap-1 h-20">
                          {cloneState.audioLevels.slice(0, 4).map((level, idx) => (
                            <div
                              key={`left-${idx}`}
                              className="w-1.5 bg-[#FF5800] rounded-full transition-all duration-75"
                              style={{ height: `${Math.max(8, level * 80)}px` }}
                            />
                          ))}
                        </div>

                        {/* Microphone button */}
                        <button
                          type="button"
                          onClick={async () => {
                            if (cloneState.isRecording) {
                              // Stop recording
                              if (mediaRecorderRef.current) {
                                mediaRecorderRef.current.stop();
                              }
                              if (animationFrameRef.current) {
                                cancelAnimationFrame(animationFrameRef.current);
                              }
                              setCloneState(prev => ({ ...prev, isRecording: false, audioLevels: [0,0,0,0,0,0,0,0] }));
                            } else {
                              // Check if we're in a secure context (HTTPS or localhost)
                              if (typeof window !== "undefined" && !window.isSecureContext) {
                                toast.error("Microphone access requires HTTPS. Please access the site via https:// or localhost.");
                                return;
                              }

                              // Check browser support
                              if (typeof navigator === "undefined" || !navigator.mediaDevices) {
                                toast.error("Your browser doesn't support media devices. Please use Chrome, Firefox, or Safari. If using Safari, make sure to enable Media Capture.");
                                return;
                              }
                              
                              if (typeof navigator.mediaDevices.getUserMedia !== "function") {
                                toast.error("Your browser doesn't support getUserMedia. Please update your browser.");
                                return;
                              }

                              // Start recording with proper error handling
                              let stream: MediaStream;
                              try {
                                // Request microphone access - this should trigger the browser permission prompt
                                stream = await navigator.mediaDevices.getUserMedia({ 
                                  audio: true // Simplified to just audio: true for maximum compatibility
                                });
                              } catch (err) {
                                if (err instanceof Error) {
                                  if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
                                    toast.error("Microphone access denied. Please allow microphone permissions in your browser settings.");
                                  } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
                                    toast.error("No microphone found. Please connect a microphone and try again.");
                                  } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
                                    toast.error("Microphone is already in use by another application.");
                                  } else {
                                    toast.error(`Microphone error: ${err.message}`);
                                  }
                                } else {
                                  toast.error("Failed to access microphone. Please check your browser permissions.");
                                }
                                return;
                              }

                              const mediaRecorder = new MediaRecorder(stream, {
                                mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4",
                              });
                              mediaRecorderRef.current = mediaRecorder;
                              recordedChunksRef.current = [];

                              // Setup audio analyser for visualization
                              const audioContext = new AudioContext();
                              const source = audioContext.createMediaStreamSource(stream);
                              const analyser = audioContext.createAnalyser();
                              analyser.fftSize = 32;
                              source.connect(analyser);
                              analyserRef.current = analyser;

                              // Animate audio levels
                              const updateLevels = () => {
                                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                                analyser.getByteFrequencyData(dataArray);
                                const levels = Array.from(dataArray.slice(0, 8)).map(v => v / 255);
                                setCloneState(prev => ({ ...prev, audioLevels: levels }));
                                animationFrameRef.current = requestAnimationFrame(updateLevels);
                              };
                              updateLevels();

                              mediaRecorder.ondataavailable = (e) => {
                                if (e.data.size > 0) {
                                  recordedChunksRef.current.push(e.data);
                                }
                              };

                              mediaRecorder.onstop = () => {
                                const mimeType = mediaRecorder.mimeType || "audio/webm";
                                const extension = mimeType.includes("webm") ? "webm" : "mp4";
                                const blob = new Blob(recordedChunksRef.current, { type: mimeType });
                                const file = new File([blob], `recording-${crypto.randomUUID()}.${extension}`, { type: mimeType });
                                setCloneState(prev => ({
                                  ...prev,
                                  uploadedFiles: [...prev.uploadedFiles, file],
                                }));
                                stream.getTracks().forEach(track => track.stop());
                                audioContext.close();
                                toast.success("Recording saved!");
                              };

                              mediaRecorder.start(100); // Collect data every 100ms for smoother recording
                              setCloneState(prev => ({ ...prev, isRecording: true, recordingTime: 0 }));

                              // Recording timer
                              const startTime = Date.now();
                              const timerInterval = setInterval(() => {
                                setCloneState(prev => {
                                  if (!prev.isRecording) {
                                    clearInterval(timerInterval);
                                    return prev;
                                  }
                                  return {
                                    ...prev,
                                    recordingTime: Math.floor((Date.now() - startTime) / 1000),
                                  };
                                });
                              }, 1000);
                            }
                          }}
                          className={`rounded-full p-6 transition-colors ${
                            cloneState.isRecording
                              ? "bg-rose-500 hover:bg-rose-600 animate-pulse"
                              : "bg-[#FF5800]/10 border border-[#FF5800]/30 hover:bg-[#FF5800]/20"
                          }`}
                        >
                          <Mic className={`h-12 w-12 ${cloneState.isRecording ? "text-white" : "text-[#FF5800]"}`} />
                        </button>

                        {/* Right bars */}
                        <div className="flex items-end gap-1 h-20">
                          {cloneState.audioLevels.slice(4, 8).map((level, idx) => (
                            <div
                              key={`right-${idx}`}
                              className="w-1.5 bg-[#FF5800] rounded-full transition-all duration-75"
                              style={{ height: `${Math.max(8, level * 80)}px` }}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Recording status */}
                      <p className="mt-6 text-sm text-white/60">
                        {cloneState.isRecording ? (
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                            Recording... {formatDuration(cloneState.recordingTime)}
                          </span>
                        ) : (
                          "Click the microphone to start recording"
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Insufficient credits warning */}
          {!hasEnoughCredits && uiState.inputMode === "generate" && (
            <p className="text-xs text-center text-amber-400 font-mono mt-2">
              Insufficient credits. Need ${TTS_GENERATION_COST.toFixed(2)}, have ${Number(creditBalance).toFixed(2)}
            </p>
          )}
        </div>
      </div>

      {/* Main Content Area - Tabs */}
      <div className="flex-1 min-h-0 overflow-auto pt-8">
        {/* Error Display */}
        {requestState.error && (
          <div className="border border-rose-500/40 bg-rose-500/10 p-3 md:p-4 mb-4">
            <p className="text-xs md:text-sm font-mono text-rose-400 font-medium">
              {requestState.error}
            </p>
          </div>
        )}

        {/* Custom Tab Navigation */}
        <div className="flex items-center gap-8 mb-6">
          <button
            type="button"
            onClick={() => setUiState(prev => ({ ...prev, activeTab: "creations" }))}
            className={`text-base font-medium transition-colors ${
              uiState.activeTab === "creations"
                ? "text-[#FF5800]"
                : "text-white/50 hover:text-white/70"
            }`}
          >
            My Creations
          </button>
          <button
            type="button"
            onClick={() => setUiState(prev => ({ ...prev, activeTab: "voices" }))}
            className={`text-base font-medium transition-colors ${
              uiState.activeTab === "voices"
                ? "text-[#FF5800]"
                : "text-white/50 hover:text-white/70"
            }`}
          >
            My Voices {voices.length > 0 && <span className="ml-1.5 text-xs text-white/40">({voices.length})</span>}
          </button>
        </div>

        {/* My Creations Tab Content */}
        {uiState.activeTab === "creations" && (
          audioState.history.length > 0 || requestState.isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {requestState.isLoading && (
                <div className="relative overflow-hidden rounded-lg border border-[#FF5800]/40 bg-black/40 animate-pulse">
                  <div className="p-4 flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-[#FF5800]/20 flex items-center justify-center">
                      <Loader2 className="h-6 w-6 text-[#FF5800] animate-spin" />
                    </div>
                    <div className="flex-1">
                      <div className="h-4 bg-white/10 rounded w-3/4 mb-2" />
                      <div className="h-3 bg-white/10 rounded w-1/2" />
                    </div>
                  </div>
                </div>
              )}
              {audioState.history.map((audio) => (
                <div
                  key={audio.id}
                  className="group relative overflow-hidden rounded-lg border border-white/10 bg-black/40 hover:border-white/20 transition-colors"
                >
                  <div className="p-4">
                    {/* Top row - Play button and text preview */}
                    <div className="flex items-start gap-3">
                      {/* Play/Pause Button */}
                      <button
                        type="button"
                        onClick={() => togglePlayback(audio.id, audio.url)}
                        className="h-12 w-12 rounded-lg bg-[#FF5800]/10 border border-[#FF5800]/30 hover:bg-[#FF5800]/20 flex items-center justify-center flex-shrink-0 transition-colors"
                      >
                        {audioState.playingId === audio.id ? (
                          <Pause className="h-5 w-5 text-[#FF5800]" />
                        ) : (
                          <Play className="h-5 w-5 text-[#FF5800] ml-0.5" />
                        )}
                      </button>

                      {/* Text preview */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white line-clamp-2 leading-relaxed">
                          {audio.text}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-white/50">
                          <span>{audio.voiceName}</span>
                          <span>•</span>
                          <span>{formatDuration(audio.duration)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => handleDownload(audio)}
                            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                          >
                            <Download className="h-4 w-4 text-white/60" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs bg-neutral-800 text-white/80 border-white/10">
                          Download audio
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => {
                              setText(audio.text);
                              setSelectedVoiceId(audio.voiceId);
                              scrollToTop();
                            }}
                            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                          >
                            <Volume2 className="h-4 w-4 text-white/60" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs bg-neutral-800 text-white/80 border-white/10">
                          Re-use this text
                        </TooltipContent>
                      </Tooltip>

                      <span className="ml-auto text-xs font-mono text-white/30">
                        {new Date(audio.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <BrandCard className="relative border-dashed">
              <CornerBrackets size="md" className="opacity-50" />
              <div className="relative z-10 p-8 md:p-12 lg:p-20 text-center">
                <div className="flex flex-col items-center space-y-3 md:space-y-4">
                  <Volume2 className="h-8 md:h-10 lg:h-12 w-8 md:w-10 lg:w-12 text-[#FF5800]" />
                  <div className="space-y-2">
                    <h3 className="text-base md:text-lg font-mono font-semibold text-white">
                      No Creations Yet
                    </h3>
                    <p className="text-xs md:text-sm font-mono text-white/60">
                      Enter your text above and generate your first audio
                    </p>
                  </div>
                </div>
              </div>
            </BrandCard>
          )
        )}

        {/* My Voices Tab Content */}
        {uiState.activeTab === "voices" && (
          voices.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {voices.map((voice) => {
                const isProcessing = voice.cloneType === "professional" && 
                  Math.max(0, (new Date().getTime() - new Date(voice.createdAt).getTime()) / 1000 / 60) < 30;
                
                return (
                  <div
                    key={voice.id}
                    className="group relative overflow-hidden rounded-lg border border-white/10 bg-black/40 hover:border-white/20 transition-colors"
                  >
                    <div className="p-4">
                      {/* Voice Info */}
                      <div className="flex items-start gap-3">
                        {/* Voice Icon */}
                        <div className={`h-12 w-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isProcessing 
                            ? "bg-amber-500/10 border border-amber-500/30" 
                            : "bg-[#FF5800]/10 border border-[#FF5800]/30"
                        }`}>
                          {isProcessing ? (
                            <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
                          ) : (
                            <Mic className="h-5 w-5 text-[#FF5800]" />
                          )}
                        </div>

                        {/* Voice details */}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-white truncate">
                            {voice.name}
                          </h4>
                          <div className="flex items-center gap-2 mt-1 text-xs text-white/50">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
                              voice.cloneType === "professional"
                                ? "bg-purple-500/20 text-purple-400"
                                : "bg-blue-500/20 text-blue-400"
                            }`}>
                              {voice.cloneType}
                            </span>
                            {isProcessing && (
                              <span className="text-amber-400">Processing...</span>
                            )}
                          </div>
                          {voice.description && (
                            <p className="text-xs text-white/40 mt-1 line-clamp-1">
                              {voice.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Stats and actions */}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                        <div className="flex items-center gap-3 text-xs text-white/40">
                          <span>{voice.sampleCount} samples</span>
                          {voice.usageCount > 0 && (
                            <span>{voice.usageCount} uses</span>
                          )}
                        </div>
                        
                        {!isProcessing && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedVoiceId(voice.elevenlabsVoiceId);
                              setUiState(prev => ({ ...prev, inputMode: "generate" }));
                              scrollToTop();
                              toast.success(`Selected voice: ${voice.name}`);
                            }}
                            className="h-7 text-xs text-[#FF5800] hover:text-[#FF5800] hover:bg-[#FF5800]/10"
                          >
                            Use Voice
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <BrandCard className="relative border-dashed">
              <CornerBrackets size="md" className="opacity-50" />
              <div className="relative z-10 p-8 md:p-12 lg:p-20 text-center">
                <div className="flex flex-col items-center space-y-3 md:space-y-4">
                  <Mic className="h-8 md:h-10 lg:h-12 w-8 md:w-10 lg:w-12 text-[#FF5800]" />
                  <div className="space-y-2">
                    <h3 className="text-base md:text-lg font-mono font-semibold text-white">
                      No Cloned Voices Yet
                    </h3>
                    <p className="text-xs md:text-sm font-mono text-white/60">
                      Switch to Clone Voice above to create your first custom voice
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => setUiState(prev => ({ ...prev, inputMode: "clone" }))}
                    className="mt-4 bg-[#FF5800] hover:bg-[#FF5800]/90"
                  >
                    <Mic className="h-4 w-4 mr-2" />
                    Clone Voice
                  </Button>
                </div>
              </div>
            </BrandCard>
          )
        )}
      </div>
    </div>
  );
}
