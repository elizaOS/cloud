/**
 * Chat input component with HUD-styled design matching the landing page.
 * Supports text input, voice recording, and loading states with animated scanner effect.
 *
 * @param props - Chat input configuration
 * @param props.value - Current input value
 * @param props.onChange - Callback when input value changes
 * @param props.onSubmit - Callback when form is submitted (Enter key or send button)
 * @param props.onVoiceInput - Optional callback for voice input button
 * @param props.isLoading - Whether a request is in progress (shows loading animation)
 * @param props.isRecording - Whether voice recording is active
 * @param props.disabled - Whether input is disabled
 * @param props.placeholder - Placeholder text for the input
 * @param props.className - Additional CSS classes
 */

"use client";

import { SyntheticEvent } from "react";
import { Mic, Send, Square, Loader2 } from "lucide-react";
import { HUDContainer, BrandButton } from "@/components/brand";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: SyntheticEvent) => void;
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
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e);
    }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    target.style.height = "24px";
    target.style.height = Math.min(target.scrollHeight, 128) + "px";
  };

  return (
    <form onSubmit={onSubmit} className={cn("p-4", className)}>
      <HUDContainer
        className="relative flex items-end gap-3 p-4"
        cornerSize="sm"
      >
        {/* Robot Eye Visor Scanner - Animated line on top edge with randomness - Only show when waiting for agent */}
        {isLoading && (
          <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden pointer-events-none">
            {/* Primary scanner */}
            <div
              className="absolute h-full w-20 bg-gradient-to-r from-transparent via-[#FF5800] to-transparent"
              style={{
                animation:
                  "visor-scan 4.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                boxShadow: "0 0 10px 2px rgba(255, 88, 0, 0.6)",
              }}
            />
            {/* Secondary scanner for organic feel */}
            <div
              className="absolute h-full w-16 bg-gradient-to-r from-transparent via-[#FF5800]/60 to-transparent"
              style={{
                animation:
                  "visor-scan-delayed 6.2s cubic-bezier(0.3, 0.1, 0.7, 0.9) infinite 1.5s",
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
        <textarea
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={
            isRecording ? "Recording... Click stop when done" : placeholder
          }
          disabled={isLoading || disabled || isRecording}
          className={cn(
            "flex-1 bg-transparent border-0 text-white placeholder:text-white/40 resize-none",
            "focus:outline-none focus:ring-0 text-sm leading-relaxed py-1",
            "disabled:opacity-50 max-h-32",
          )}
          style={{
            minHeight: "24px",
            maxHeight: "128px",
          }}
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
