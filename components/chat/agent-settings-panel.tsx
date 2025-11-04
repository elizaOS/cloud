"use client";

import { X, Code, Zap, Database, FileUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea} from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface AgentSettingsPanelProps {
  agentName?: string;
  agentUsername?: string;
  agentSystem?: string;
  voiceModel?: string;
  onClose?: () => void;
  onSave?: (settings: Record<string, string>) => void;
}

export function AgentSettingsPanel({
  agentName = "Zilo",
  agentUsername = "zilo_132",
  agentSystem = "You are a pragmatic marketing strategist that blends creativity with data insight.",
  voiceModel = 'Eleven Labs "Adam"',
  onClose,
  onSave,
}: AgentSettingsPanelProps) {
  return (
    <div className="bg-neutral-950 border-l border-[#3e3e43] w-[587px] h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-0">
        <div className="flex flex-col gap-2">
          <p className="text-base font-mono font-bold text-white">Settings</p>
          <p className="text-xs text-white/60">
            Configure your AI agent's behaviour and capabilities.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="hover:opacity-80 transition-opacity"
        >
          <X className="h-6 w-6 text-white" />
        </button>
      </div>

      {/* Tabs */}
      <div className="border-t border-[#3e3e43] flex items-start">
        <button
          type="button"
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-[rgba(255,255,255,0.07)] border-b-2 border-white"
        >
          <Code className="h-4 w-4 text-white" />
          <p className="text-sm font-mono font-medium text-white tracking-tight">
            Settings
          </p>
        </button>

        <button
          type="button"
          className="flex-1 flex items-center justify-center gap-2 py-3 border-b border-r border-[#3e3e43]"
        >
          <Zap className="h-4 w-4 text-[#A2A2A2]" />
          <p className="text-sm font-mono font-medium text-[#A2A2A2] tracking-tight">
            Model Calls
          </p>
        </button>

        <button
          type="button"
          className="flex-1 flex items-center justify-center gap-2 py-3 border-b border-r border-[#3e3e43]"
        >
          <Database className="h-4 w-4 text-[#A2A2A2]" />
          <p className="text-sm font-mono font-medium text-[#A2A2A2] tracking-tight">
            Memories
          </p>
        </button>
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto px-4 py-8 space-y-8">
        {/* Sub-tabs */}
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <button
              type="button"
              className="px-2.5 py-2.5 border-b-[1.6px] border-white"
            >
              <p className="text-sm font-mono font-medium text-white">
                General
              </p>
            </button>
            <button type="button" className="px-2.5 py-2.5">
              <p className="text-sm font-mono font-medium text-[#A2A2A2]">
                Content
              </p>
            </button>
            <button type="button" className="px-2.5 py-2.5">
              <p className="text-sm font-mono font-medium text-[#A2A2A2]">
                Style
              </p>
            </button>
            <button type="button" className="px-2.5 py-2.5">
              <p className="text-sm font-mono font-medium text-[#A2A2A2]">
                File Upload
              </p>
            </button>
            <button type="button" className="px-2.5 py-2.5">
              <p className="text-sm font-mono font-medium text-[#A2A2A2]">
                Avatar
              </p>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="w-6 h-6 hover:opacity-80 transition-opacity"
              title="View as JSON"
            >
              <div className="text-white">{"{ }"}</div>
            </button>
            <Switch className="data-[state=checked]:bg-[#FF5800]" />
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-6">
          {/* Name Field */}
          <div className="space-y-2">
            <Label className="text-sm font-mono font-medium text-white">
              Name
            </Label>
            <Input
              defaultValue={agentName}
              className="bg-[#1a1a1a] border-zinc-800 text-white"
            />
            <p className="text-xs text-[#c7c7c7]/60">
              The primary identifier for this agent
            </p>
          </div>

          {/* Username Field */}
          <div className="space-y-2">
            <Label className="text-sm font-mono font-medium text-white">
              Username
            </Label>
            <Input
              defaultValue={agentUsername}
              className="bg-[#1a1a1a] border-zinc-800 text-white/50"
            />
            <p className="text-xs text-[#c7c7c7]/60">
              Used in URLs and API endpoints
            </p>
          </div>

          {/* System Field */}
          <div className="space-y-2">
            <Label className="text-sm font-mono font-medium text-white">
              System
            </Label>
            <Textarea
              defaultValue={agentSystem}
              className="bg-[#1a1a1a] border-zinc-800 text-white min-h-[100px]"
            />
            <p className="text-xs text-[#c7c7c7]/60">
              System prompt defining agent behaviour
            </p>
          </div>

          {/* Voice Model Field */}
          <div className="space-y-2">
            <Label className="text-sm font-mono font-medium text-white">
              Voice Model
            </Label>
            <Select defaultValue="adam">
              <SelectTrigger className="bg-[#1a1a1a] border-zinc-800 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1a1a] border-zinc-800">
                <SelectItem value="adam">Eleven Labs "Adam"</SelectItem>
                <SelectItem value="sarah">Eleven Labs "Sarah"</SelectItem>
                <SelectItem value="custom">Custom Voice</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-[#c7c7c7]/60">
              General area or archetype
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

