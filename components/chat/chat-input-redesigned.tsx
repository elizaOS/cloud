"use client";

import { FormEvent } from "react";
import { Plus, Mic, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ChatInputRedesignedProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onAttachment?: () => void;
  onVoiceInput?: () => void;
  isLoading?: boolean;
  isRecording?: boolean;
  disabled?: boolean;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  models?: Array<{ id: string; name: string }>;
  placeholder?: string;
  className?: string;
}

export function ChatInputRedesigned({
  value,
  onChange,
  onSubmit,
  onAttachment,
  onVoiceInput,
  isLoading = false,
  isRecording = false,
  disabled = false,
  selectedModel = "gemini",
  onModelChange,
  models = [
    { id: "gemini", name: "Gemini" },
    { id: "gpt-4", name: "GPT-4" },
    { id: "claude", name: "Claude" },
  ],
  placeholder = "Type your message here...",
  className,
}: ChatInputRedesignedProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as unknown as FormEvent);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className={cn("bg-[#1d1d1d] border border-zinc-800 p-3", className)}
    >
      {/* Textarea */}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isLoading || disabled || isRecording}
        rows={1}
        className="w-full bg-transparent border-0 text-sm text-zinc-400 placeholder:text-zinc-400/30 focus:outline-none resize-none mb-12"
      />

      {/* Bottom Bar */}
      <div className="flex items-center justify-between">
        {/* Left: Model Selector */}
        <div className="flex items-center gap-2">
          <div className="h-6">
            <Select value={selectedModel} onValueChange={onModelChange}>
              <SelectTrigger className="bg-neutral-900 border border-zinc-800 text-[#a2a0a3] text-xs font-mono font-medium h-6 px-2 gap-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1a1a] border-[#303030]">
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id} className="text-xs">
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Attachment Button */}
          {onAttachment && (
            <button
              type="button"
              onClick={onAttachment}
              disabled={disabled}
              className="bg-[#302f2f] border border-[#555555] p-[3.4px] hover:bg-[#3e3e3e] transition-colors disabled:opacity-50"
              title="Add attachment"
            >
              <Plus className="h-[17px] w-[17px] text-[#A2A0A3]" />
            </button>
          )}

          {/* Voice Input Button */}
          {onVoiceInput && (
            <button
              type="button"
              onClick={onVoiceInput}
              disabled={disabled}
              className="bg-[#302f2f] border border-[#555555] p-[3.3px] hover:bg-[#3e3e3e] transition-colors disabled:opacity-50"
              title={isRecording ? "Stop recording" : "Voice input"}
            >
              <Mic className="h-[17.5px] w-[17.5px] text-white" />
            </button>
          )}

          {/* Send Button */}
          <button
            type="submit"
            disabled={isLoading || disabled || !value.trim() || isRecording}
            className="bg-[rgba(255,88,0,0.25)] p-[3.3px] hover:bg-[rgba(255,88,0,0.35)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Send message"
          >
            <ArrowUp className="h-[17.4px] w-[17.4px] text-[#FF5800]" />
          </button>
        </div>
      </div>

      {/* Progress indicator decoration */}
      <div className="absolute h-[3px] left-[611px] top-[-0.92px] w-[126px] opacity-0 group-focus-within:opacity-100 transition-opacity">
        <div className="h-full bg-gradient-to-r from-[#FF5800] to-transparent" />
      </div>
    </form>
  );
}

