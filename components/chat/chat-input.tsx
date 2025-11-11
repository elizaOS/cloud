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
      <HUDContainer className="relative flex items-center gap-3 p-4" cornerSize="sm">
        {/* Robot Eye Visor Scanner - Animated line on top edge with randomness - Only show when waiting for agent */}
        {isLoading && (
          <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden pointer-events-none">
            {/* Primary scanner */}
            <div
              className="absolute h-full w-20 bg-gradient-to-r from-transparent via-[#FF5800] to-transparent"
              style={{
                animation: "visor-scan 4.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                boxShadow: "0 0 10px 2px rgba(255, 88, 0, 0.6)",
              }}
            />
            {/* Secondary scanner for organic feel */}
            <div
              className="absolute h-full w-16 bg-gradient-to-r from-transparent via-[#FF5800]/60 to-transparent"
              style={{
                animation: "visor-scan-delayed 6.2s cubic-bezier(0.3, 0.1, 0.7, 0.9) infinite 1.5s",
                boxShadow: "0 0 8px 2px rgba(255, 88, 0, 0.4)",
                filter: "blur(1px)",
              }}
            />
          </div>
        )}
        
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
