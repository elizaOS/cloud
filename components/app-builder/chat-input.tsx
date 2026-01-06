"use client";

/**
 * Optimized Chat Input Component
 * 
 * Uses Zustand for isolated input state management. This component only re-renders
 * when its own input changes, not when other parts of the app update.
 * Status is passed as a prop since it changes rarely (start/stop generation).
 */

import { memo, useCallback, useRef } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatInput } from "@/lib/app-builder/store";

type SessionStatus = "idle" | "initializing" | "ready" | "generating" | "error" | "stopped" | "timeout" | "not_configured" | "recovering";

interface ChatInputProps {
  onSendPrompt: (text?: string) => void;
  status: SessionStatus;
}

// Completely isolated input component - only subscribes to input state
const ChatInputInner = memo(function ChatInputInner({ 
  onSendPrompt,
  status,
}: ChatInputProps) {
  const input = useChatInput((state) => state.input);
  const setInput = useChatInput((state) => state.setInput);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "48px";
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
    }
  }, []);

  // Handle input change - direct Zustand update, no parent re-render
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
    },
    [setInput]
  );

  // Handle key down
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (status === "ready" && input.trim()) {
          onSendPrompt();
        }
      }
    },
    [status, input, onSendPrompt]
  );

  // Handle send button click
  const handleSend = useCallback(() => {
    if (input.trim() && status === "ready") {
      onSendPrompt();
    }
  }, [input, status, onSendPrompt]);

  return (
    <div className="flex-shrink-0 p-4 border-t border-white/[0.04]">
      {/* Visor Scanner Animation Styles */}
      <style jsx global>{`
        @keyframes visor-scan {
          0% {
            left: -100px;
          }
          100% {
            left: calc(100% + 100px);
          }
        }
      `}</style>
      <div className="relative rounded-xl border border-white/[0.06] bg-white/[0.015] overflow-hidden transition-all focus-within:border-white/[0.12] focus-within:bg-white/[0.025]">
        {/* Subtle scanning animation */}
        {status === "generating" && (
          <div className="absolute top-0 left-0 right-0 h-[1px] overflow-hidden pointer-events-none z-10 bg-white/[0.03]">
            <div
              className="absolute h-full w-32 bg-gradient-to-r from-transparent via-violet-400/60 to-transparent"
              style={{
                animation: "visor-scan 3s ease-in-out infinite",
              }}
            />
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          rows={1}
          placeholder="Describe what you want to build..."
          disabled={status !== "ready"}
          className="w-full bg-transparent px-4 pt-3 pb-2 text-[14px] text-white/90 placeholder:text-white/30 focus:outline-none disabled:opacity-50 resize-none leading-relaxed"
          style={{ minHeight: "48px", maxHeight: "120px" }}
        />

        {/* Bottom bar with send button */}
        <div className="flex items-center justify-end px-2 pb-2">
          <Button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || status !== "ready"}
            size="icon"
            className="h-7 w-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30 border border-white/[0.06] transition-all"
          >
            {status === "generating" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-white/50" />
            ) : (
              <Send className="h-3.5 w-3.5 text-white/60" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
});

// Export with a stable reference
export const ChatInput = ChatInputInner;
