/**
 * Clone Your Crush themed Chat Input Component
 * Romantic pink-themed input with gradient styling
 */

"use client";

import { FormEvent } from "react";
import { Mic, Send, Square, Loader2, Heart, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ChatInputCrushProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onVoiceInput?: () => void;
  isLoading?: boolean;
  isRecording?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function ChatInputCrush({
  value,
  onChange,
  onSubmit,
  onVoiceInput,
  isLoading = false,
  isRecording = false,
  disabled = false,
  placeholder = "Type your message...",
  className,
}: ChatInputCrushProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as any);
    }
  };

  return (
    <form onSubmit={onSubmit} className={cn("p-4", className)}>
      <div className="relative">
        {/* Animated gradient border on loading */}
        {isLoading && (
          <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-pink-500 via-purple-500 to-pink-500 opacity-50 blur-sm animate-pulse" />
        )}

        <div
          className={cn(
            "relative flex items-end gap-3 p-4 rounded-2xl border backdrop-blur-xl transition-all",
            "bg-white/[0.03] border-white/10",
            isLoading && "border-pink-500/30",
          )}
        >
          {/* Subtle inner glow */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-pink-500/5 to-purple-500/5 pointer-events-none" />

          {/* Voice Input Button */}
          {onVoiceInput && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={isLoading || disabled}
              onClick={onVoiceInput}
              className={cn(
                "flex-shrink-0 h-10 w-10 rounded-full transition-all relative z-10",
                isRecording
                  ? "bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-400 hover:to-pink-500 text-white shadow-lg shadow-pink-500/30"
                  : "hover:bg-pink-500/10 text-pink-400 hover:text-pink-300",
              )}
            >
              {isRecording ? (
                <Square className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </Button>
          )}

          {/* Text Input */}
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isRecording ? "Recording... Click stop when done" : placeholder
            }
            disabled={isLoading || disabled || isRecording}
            rows={1}
            className={cn(
              "flex-1 bg-transparent border-0 text-white placeholder:text-white/40 resize-none",
              "focus:outline-none focus:ring-0 text-sm leading-relaxed py-2",
              "disabled:opacity-50 max-h-32 relative z-10",
            )}
            style={{
              minHeight: "24px",
              maxHeight: "128px",
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "24px";
              target.style.height = Math.min(target.scrollHeight, 128) + "px";
            }}
          />

          {/* Send Button */}
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || disabled || !value.trim() || isRecording}
            className={cn(
              "flex-shrink-0 h-10 w-10 rounded-full relative z-10 transition-all",
              "bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-400 hover:to-pink-500",
              "text-white shadow-lg shadow-pink-500/30 border-0",
              "disabled:opacity-50 disabled:shadow-none",
            )}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>

        {/* Typing indicator sparkles */}
        {isLoading && (
          <div className="absolute -top-8 left-4 flex items-center gap-2 text-xs text-pink-400">
            <Sparkles className="h-3 w-3 animate-pulse" />
            <span>Your crush is typing...</span>
          </div>
        )}
      </div>
    </form>
  );
}
