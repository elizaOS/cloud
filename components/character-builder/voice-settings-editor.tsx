"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Mic, Volume2, Activity } from "lucide-react";
import type { ElizaCharacter } from "@/lib/types";

interface VoiceSettingsEditorProps {
  character: ElizaCharacter;
  onChange: (character: ElizaCharacter) => void;
}

export function VoiceSettingsEditor({
  character,
  onChange,
}: VoiceSettingsEditorProps) {
  const settings = character.settings || {};
  const voiceSettings = (settings.voice as Record<string, string | number | boolean | undefined>) || {};

  const updateVoiceSetting = (key: string, value: string | number | boolean) => {
    onChange({
      ...character,
      settings: {
        ...settings,
        voice: {
          ...voiceSettings,
          [key]: value,
        },
      },
    });
  };

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      {/* Header Card */}
      <div className="bg-[#FF5800]/10 border border-[#FF5800]/20 p-6 rounded-xl">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-[#FF5800]/20 rounded-full">
            <Mic className="h-6 w-6 text-[#FF5800]" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-white mb-2">
              Give Your Agent a Voice
            </h3>
            <p className="text-sm text-white/70 leading-relaxed">
              Configure how your agent sounds when speaking. You can use preset
              voices or connect custom voice providers like ElevenLabs.
            </p>
          </div>
        </div>
      </div>

      {/* Voice Configuration */}
      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-white/70 uppercase tracking-wide">
              Voice Provider
            </Label>
            <Select
              value={(voiceSettings.model as string) || "eleven_labs"}
              onValueChange={(value) => updateVoiceSetting("model", value)}
            >
              <SelectTrigger className="w-full bg-black/40 border-white/10 text-white rounded-xl h-10">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eleven_labs">ElevenLabs</SelectItem>
                <SelectItem value="openai">OpenAI TTS</SelectItem>
                <SelectItem value="system">System Default</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-white/70 uppercase tracking-wide">
              Voice ID
            </Label>
            <Input
              value={(voiceSettings.voiceId as string) || ""}
              onChange={(e) => updateVoiceSetting("voiceId", e.target.value)}
              placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
              className="bg-black/40 border-white/10 text-white rounded-xl h-10 focus:border-[#FF5800]"
            />
          </div>
        </div>

        {/* Sliders */}
        <div className="space-y-6 pt-4 border-t border-white/10">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-white/70 uppercase tracking-wide flex items-center gap-2">
                <Activity className="h-3 w-3" />
                Stability
              </Label>
              <span className="text-xs text-white/40">
                {(((voiceSettings.stability as number) ?? 0.5) * 100).toFixed(0)}%
              </span>
            </div>
            <Slider
              value={[(voiceSettings.stability as number) ?? 0.5]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={([value]) => updateVoiceSetting("stability", value)}
              className="py-2"
            />
            <p className="text-xs text-white/40">
              Higher stability makes the voice more consistent but less emotive.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-white/70 uppercase tracking-wide flex items-center gap-2">
                <Volume2 className="h-3 w-3" />
                Similarity Boost
              </Label>
              <span className="text-xs text-white/40">
                {(((voiceSettings.similarityBoost as number) ?? 0.75) * 100).toFixed(0)}%
              </span>
            </div>
            <Slider
              value={[(voiceSettings.similarityBoost as number) ?? 0.75]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={([value]) =>
                updateVoiceSetting("similarityBoost", value)
              }
              className="py-2"
            />
            <p className="text-xs text-white/40">
              Higher similarity ensures the voice matches the original sample closely.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

