/**
 * Reusable Chat Input Component
 * HUD-styled input matching landing page design
 */

"use client";

import { FormEvent } from "react";
import { Mic, Send, Square, Loader2 } from "lucide-react";
import { HUDContainer, BrandButton } from "@/components/brand";
import { cn } from "@/lib/utils";

interface ChatInputProps {
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

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onVoiceInput,
  isLoading = false,
  isRecording = false,
  disabled = false,
  placeholder = "Type your message...",
  className,
}: ChatInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as any);
    }
  };

  return (
    <form onSubmit={onSubmit} className={cn("p-4", className)}>
      <HUDContainer className="flex items-center gap-3 p-4" cornerSize="sm">
        {/* Voice Input Button */}
        {onVoiceInput && (
          <BrandButton
            type="button"
            variant={isRecording ? "primary" : "icon"}
            size="icon"
            disabled={isLoading || disabled}
            onClick={onVoiceInput}
          >
            {isRecording ? (
              <Square className="h-5 w-5" />
            ) : (
              <Mic
                className="h-5 w-5"
                style={{ color: isRecording ? "#FFFFFF" : "#FF5800" }}
              />
            )}
          </BrandButton>
        )}

        {/* Text Input */}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isRecording ? "Recording... Click stop when done" : placeholder
          }
          disabled={isLoading || disabled || isRecording}
          className={cn(
            "flex-1 bg-transparent border-0 text-white placeholder:text-white/40",
            "focus:outline-none focus:ring-0 text-sm",
            "disabled:opacity-50",
          )}
        />

        {/* Send Button */}
        <BrandButton
          type="submit"
          variant="icon-primary"
          size="icon"
          disabled={isLoading || disabled || !value.trim() || isRecording}
        >
          {isLoading ? (
            <Loader2
              className="h-5 w-5 animate-spin"
              style={{ color: "#FF5800" }}
            />
          ) : (
            <Send className="h-5 w-5" style={{ color: "#FF5800" }} />
          )}
        </BrandButton>
      </HUDContainer>
    </form>
  );
}
