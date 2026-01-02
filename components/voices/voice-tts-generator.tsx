/**
 * Text-to-Speech generator component.
 * Allows users to input text and generate audio using ElevenLabs TTS API.
 * Supports voice selection, playback, and download.
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Play,
  Pause,
  Download,
  Volume2,
  AlertCircle,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Voice } from "./types";
import {
  BrandCard,
  BrandButton,
  CornerBrackets,
} from "@/components/brand";
import { TTS_GENERATION_COST } from "@/lib/pricing-constants";

interface VoiceTTSGeneratorProps {
  voices: Voice[];
  creditBalance: number;
  onCreditBalanceChange?: (newBalance: number) => void;
}

interface GenerationState {
  isGenerating: boolean;
  audioUrl: string | null;
  audioBlob: Blob | null;
  error: string | null;
}

interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

const MAX_TEXT_LENGTH = 5000;

const DEFAULT_VOICES = [
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah (Default)" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam" },
];

export function VoiceTTSGenerator({ voices, creditBalance, onCreditBalanceChange }: VoiceTTSGeneratorProps) {
  const [text, setText] = useState("");
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("EXAVITQu4vr4xnSDxMaL");
  
  const hasEnoughCredits = Number(creditBalance) >= TTS_GENERATION_COST;
  
  const [generationState, setGenerationState] = useState<GenerationState>({
    isGenerating: false,
    audioUrl: null,
    audioBlob: null,
    error: null,
  });

  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
      if (generationState.audioUrl) {
        URL.revokeObjectURL(generationState.audioUrl);
      }
    };
  }, [generationState.audioUrl]);

  // Setup audio element event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setPlaybackState(prev => ({ ...prev, currentTime: audio.currentTime }));
    };

    const handleLoadedMetadata = () => {
      setPlaybackState(prev => ({ ...prev, duration: audio.duration }));
    };

    const handleEnded = () => {
      setPlaybackState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [generationState.audioUrl]);

  const handleGenerate = async () => {
    if (!text.trim()) {
      setGenerationState(prev => ({ ...prev, error: "Please enter some text to generate speech" }));
      return;
    }

    if (text.length > MAX_TEXT_LENGTH) {
      setGenerationState(prev => ({ 
        ...prev, 
        error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` 
      }));
      return;
    }

    // Cleanup previous audio
    if (generationState.audioUrl) {
      URL.revokeObjectURL(generationState.audioUrl);
    }

    setGenerationState({
      isGenerating: true,
      audioUrl: null,
      audioBlob: null,
      error: null,
    });
    setPlaybackState({ isPlaying: false, currentTime: 0, duration: 0 });

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
      setGenerationState(prev => ({ ...prev, isGenerating: false, error: errorMsg }));
      toast.error(errorMsg);
      return;
    }

    const data = await response.json();
    
    // Convert base64 to blob
    const audioBuffer = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
    const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });
    
    // Use storage URL if available, otherwise create blob URL
    const audioUrl = data.storageUrl || URL.createObjectURL(audioBlob);

    setGenerationState({
      isGenerating: false,
      audioUrl,
      audioBlob,
      error: null,
    });

    // Update credit balance (deduct the cost)
    if (onCreditBalanceChange) {
      onCreditBalanceChange(Number(creditBalance) - TTS_GENERATION_COST);
    }

    toast.success("Speech generated successfully!");
  };

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    
    // If we have a blob but no valid URL, recreate it
    if (generationState.audioBlob && !generationState.audioUrl) {
      const newUrl = URL.createObjectURL(generationState.audioBlob);
      setGenerationState(prev => ({ ...prev, audioUrl: newUrl }));
      audio.src = newUrl;
    }
    
    if (!generationState.audioUrl && !generationState.audioBlob) {
      toast.error("Audio not available. Please generate again.");
      return;
    }

    if (playbackState.isPlaying) {
      audio.pause();
      setPlaybackState(prev => ({ ...prev, isPlaying: false }));
    } else {
      try {
        await audio.play();
        setPlaybackState(prev => ({ ...prev, isPlaying: true }));
      } catch (error) {
        // Audio URL may have been revoked, try to recreate from blob
        if (generationState.audioBlob) {
          const newUrl = URL.createObjectURL(generationState.audioBlob);
          setGenerationState(prev => ({ ...prev, audioUrl: newUrl }));
          audio.src = newUrl;
          await audio.play();
          setPlaybackState(prev => ({ ...prev, isPlaying: true }));
        } else {
          toast.error("Audio session expired. Please generate again.");
        }
      }
    }
  };

  const handleDownload = () => {
    if (!generationState.audioBlob) return;

    const url = URL.createObjectURL(generationState.audioBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tts-${Date.now()}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success("Audio downloaded!");
  };

  const handleReset = () => {
    if (generationState.audioUrl) {
      URL.revokeObjectURL(generationState.audioUrl);
    }
    setText("");
    setGenerationState({
      isGenerating: false,
      audioUrl: null,
      audioBlob: null,
      error: null,
    });
    setPlaybackState({ isPlaying: false, currentTime: 0, duration: 0 });
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getSelectedVoiceName = () => {
    // Check custom voices first
    const customVoice = voices.find(v => v.elevenlabsVoiceId === selectedVoiceId);
    if (customVoice) return customVoice.name;
    
    // Check default voices
    const defaultVoice = DEFAULT_VOICES.find(v => v.id === selectedVoiceId);
    return defaultVoice?.name || "Unknown";
  };

  // Filter to only show ready voices (not processing)
  const readyVoices = voices.filter(v => {
    const minutesElapsed = Math.max(
      0,
      (new Date().getTime() - new Date(v.createdAt).getTime()) / 1000 / 60
    );
    return !(v.cloneType === "professional" && minutesElapsed < 30);
  });

  return (
    <BrandCard className="relative flex flex-col h-auto lg:h-full lg:max-h-full lg:overflow-hidden">
      <CornerBrackets size="sm" className="opacity-50" />

      <div className="relative z-10 shrink-0 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#FF5800]" />
          <h3 className="text-sm md:text-base font-mono font-semibold text-[#e1e1e1] uppercase">
            Text to Speech
          </h3>
        </div>
        <p className="text-xs font-mono text-[#858585] mt-1">
          Convert text to natural-sounding speech
        </p>
      </div>

      <div className="relative z-10 flex flex-col flex-1 lg:min-h-0 space-y-4">
        {/* Voice Selection */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-mono font-medium text-white/70 uppercase tracking-wide">
            Voice
          </label>
          <Select value={selectedVoiceId} onValueChange={setSelectedVoiceId}>
            <SelectTrigger className="h-9 border-white/10 bg-black/40 text-white">
              <SelectValue placeholder="Select a voice" />
            </SelectTrigger>
            <SelectContent>
              {/* Custom Voices */}
              {readyVoices.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-mono text-white/50 uppercase">
                    Your Voices
                  </div>
                  {readyVoices.map((voice) => (
                    <SelectItem key={voice.id} value={voice.elevenlabsVoiceId}>
                      {voice.name}
                    </SelectItem>
                  ))}
                  <div className="border-t border-white/10 my-1" />
                </>
              )}
              
              {/* Default Voices */}
              <div className="px-2 py-1.5 text-xs font-mono text-white/50 uppercase">
                Default Voices
              </div>
              {DEFAULT_VOICES.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>
                  {voice.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Text Input */}
        <div className="space-y-1.5 flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-mono font-medium text-white/70 uppercase tracking-wide">
              Text <span className="text-rose-400">*</span>
            </label>
            <span className={cn(
              "text-[10px] font-mono",
              text.length > MAX_TEXT_LENGTH ? "text-rose-400" : "text-white/50"
            )}>
              {text.length}/{MAX_TEXT_LENGTH}
            </span>
          </div>
          <Textarea
            placeholder="Enter the text you want to convert to speech..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={generationState.isGenerating}
            className={cn(
              "flex-1 min-h-[150px] lg:min-h-0 resize-none border-white/10 bg-black/40 text-white placeholder:text-white/40 focus:ring-1 focus:ring-[#FF5800] focus:border-[#FF5800]",
              text.length > MAX_TEXT_LENGTH && "border-rose-400 focus:ring-rose-400 focus:border-rose-400"
            )}
          />
        </div>

        {/* Error Message */}
        {generationState.error && (
          <div className="flex items-start gap-2 p-2 border border-destructive/50 bg-destructive/10 text-destructive text-xs">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{generationState.error}</span>
          </div>
        )}

        {/* Audio Player */}
        {generationState.audioUrl && (
          <div className="space-y-3 p-4 border border-white/10 bg-black/40">
            <audio ref={audioRef} src={generationState.audioUrl} className="hidden" />
            
            <div className="flex items-center gap-3">
              <BrandButton
                type="button"
                variant="primary"
                size="sm"
                onClick={togglePlayback}
                className="h-10 w-10 p-0"
              >
                {playbackState.isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4 ml-0.5" />
                )}
              </BrandButton>

              {/* Progress Bar */}
              <div className="flex-1">
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#FF5800] transition-all duration-100"
                    style={{
                      width: playbackState.duration
                        ? `${(playbackState.currentTime / playbackState.duration) * 100}%`
                        : "0%",
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] font-mono text-white/50">
                    {formatTime(playbackState.currentTime)}
                  </span>
                  <span className="text-[10px] font-mono text-white/50">
                    {formatTime(playbackState.duration)}
                  </span>
                </div>
              </div>

              <BrandButton
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="h-10 px-3"
              >
                <Download className="h-4 w-4 mr-1.5" />
                Download
              </BrandButton>
            </div>

            <div className="flex items-center gap-2 text-xs text-white/60">
              <Volume2 className="h-3.5 w-3.5" />
              <span>Generated with: {getSelectedVoiceName()}</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="shrink-0 pt-3 border-t border-white/10 space-y-2">
          <div className="flex gap-2">
            {generationState.audioUrl && (
              <BrandButton
                type="button"
                variant="ghost"
                onClick={handleReset}
                className="px-3"
              >
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Reset
              </BrandButton>
            )}
            
            <BrandButton
              type="button"
              variant="primary"
              disabled={generationState.isGenerating || !text.trim() || text.length > MAX_TEXT_LENGTH || !hasEnoughCredits}
              onClick={handleGenerate}
              className="flex-1 font-semibold h-10"
            >
              {generationState.isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Speech (${TTS_GENERATION_COST.toFixed(2)})
                </>
              )}
            </BrandButton>
          </div>
          
          {/* Credit warning if insufficient */}
          {!hasEnoughCredits && (
            <p className="text-[10px] text-center text-amber-400 font-mono">
              Insufficient credits. Need ${TTS_GENERATION_COST.toFixed(2)}, have ${Number(creditBalance).toFixed(2)}
            </p>
          )}
        </div>
      </div>
    </BrandCard>
  );
}
