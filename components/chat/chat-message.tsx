/**
 * Reusable Chat Message Component
 * Themed message bubble for agent and user messages
 */

"use client";

import { Clock, Volume2, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ChatMessageProps {
  message: {
    id: string;
    content: {
      text: string;
    };
    isAgent: boolean;
    createdAt: number;
  };
  avatar?: React.ReactNode;
  audioUrl?: string;
  isPlaying?: boolean;
  isThinking?: boolean;
  onPlayAudio?: () => void;
  formatTimestamp?: (timestamp: number) => string;
  className?: string;
}

export function ChatMessage({
  message,
  avatar,
  audioUrl,
  isPlaying,
  isThinking,
  onPlayAudio,
  formatTimestamp = (ts) => new Date(ts).toLocaleTimeString(),
  className,
}: ChatMessageProps) {
  return (
    <div
      className={cn(
        "flex gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500",
        message.isAgent ? "justify-start" : "justify-end",
        className,
      )}
    >
      {message.isAgent && avatar}

      <div
        className={cn(
          "rounded-none px-4 py-3 max-w-[80%] border transition-all",
          message.isAgent
            ? "bg-black/40 border-white/10"
            : "bg-[#FF580020] border-[#FF5800] text-white",
        )}
      >
        {isThinking ? (
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 rounded-full border-2 border-[#FF5800] border-t-transparent animate-spin" />
            <p className="text-sm text-white/70">Eliza is thinking...</p>
          </div>
        ) : (
          <>
            <div className="text-sm whitespace-pre-wrap text-white leading-relaxed">
              {message.content.text}
            </div>
            <div
              className={cn(
                "flex items-center justify-between gap-2 text-xs mt-3 pt-3 border-t",
                message.isAgent
                  ? "border-white/10 text-white/50"
                  : "border-[#FF5800]/20 text-white/70",
              )}
            >
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3" />
                <span>{formatTimestamp(message.createdAt)}</span>
              </div>
              {message.isAgent && audioUrl && onPlayAudio && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 hover:bg-white/10 text-white/70 hover:text-white"
                  onClick={onPlayAudio}
                >
                  {isPlaying ? (
                    <Square className="h-3 w-3" />
                  ) : (
                    <Volume2 className="h-3 w-3" />
                  )}
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      {!message.isAgent && (
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#FF5800] flex items-center justify-center">
          <div className="h-5 w-5 text-white font-bold">U</div>
        </div>
      )}
    </div>
  );
}

// Empty state component
export function ChatEmptyState({
  avatar,
  title = "Start a conversation",
  description = "Send a message to begin chatting",
}: {
  avatar?: React.ReactNode;
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-12">
      {avatar}
      <h3 className="text-lg font-semibold mb-2 text-white">{title}</h3>
      <p className="text-sm text-white/60 max-w-md">{description}</p>
    </div>
  );
}

