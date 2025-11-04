"use client";

import { cn } from "@/lib/utils";
import Image from "next/image";
import { MessageFeedbackButtons } from "./message-feedback-buttons";
import { Sparkles } from "lucide-react";

interface ChatMessageRedesignedProps {
  message: {
    id: string;
    content: {
      text: string;
    };
    isAgent: boolean;
    createdAt: number;
  };
  agentName?: string;
  agentAvatar?: string;
  isThinking?: boolean;
  images?: string[];
  onLike?: () => void;
  onDislike?: () => void;
  onRegenerate?: () => void;
  onEditInStudio?: () => void;
  formatTimestamp?: (timestamp: number) => string;
  className?: string;
}

export function ChatMessageRedesigned({
  message,
  agentName = "Zilo",
  agentAvatar,
  isThinking = false,
  images,
  onLike,
  onDislike,
  onRegenerate,
  onEditInStudio,
  formatTimestamp = (ts) =>
    new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  className,
}: ChatMessageRedesignedProps) {
  return (
    <div className={cn("flex flex-col gap-2 w-full", className)}>
      {/* User Message */}
      {!message.isAgent && (
        <>
          <div className="flex flex-col gap-2 items-end w-full">
            <div className="bg-[rgba(255,255,255,0.1)] px-4 py-2 max-w-[410px]">
              <p className="text-sm text-white tracking-tight">
                {message.content.text}
              </p>
            </div>
            <p className="text-xs font-mono font-medium text-zinc-400">
              {formatTimestamp(message.createdAt)}
            </p>
          </div>
        </>
      )}

      {/* Agent Message */}
      {message.isAgent && (
        <div className="flex flex-col gap-4 w-full">
          {/* Agent Avatar & Name */}
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full overflow-hidden">
              {agentAvatar ? (
                <Image
                  src={agentAvatar}
                  alt={agentName}
                  width={16}
                  height={16}
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full bg-[#FF5800] flex items-center justify-center">
                  <span className="text-white text-[8px] font-bold">
                    {agentName.charAt(0)}
                  </span>
                </div>
              )}
            </div>
            <p className="text-xs font-mono text-zinc-400 opacity-80">
              {isThinking ? `${agentName} is thinking ...` : agentName}
            </p>
          </div>

          {/* Message Content */}
          {!isThinking && (
            <>
              <div className="max-w-[500px]">
                <p className="text-sm text-[#f2f2f2] tracking-tight whitespace-pre-wrap">
                  {message.content.text}
                </p>
              </div>

              {/* Images Grid (if any) */}
              {images && images.length > 0 && (
                <div className="border border-[#3e3e43] p-2 space-y-4">
                  <div className="flex gap-2">
                    {images.slice(0, 3).map((image, index) => (
                      <div
                        key={index}
                        className="w-[166px] h-[166px] relative overflow-hidden"
                      >
                        <Image
                          src={image}
                          alt={`Generated image ${index + 1}`}
                          fill
                          className="object-cover"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Feedback Buttons & Edit in Studio */}
                  <div className="flex items-center justify-between w-full">
                    <MessageFeedbackButtons
                      onLike={onLike}
                      onDislike={onDislike}
                      onRegenerate={onRegenerate}
                    />

                    {onEditInStudio && (
                      <button
                        type="button"
                        onClick={onEditInStudio}
                        className="px-2 py-1 bg-gradient-to-r from-[rgba(236,89,79,0.04)] to-[rgba(126,107,240,0.04)] hover:from-[rgba(236,89,79,0.08)] hover:to-[rgba(126,107,240,0.08)] transition-colors flex items-center gap-1"
                      >
                        <Sparkles className="h-3 w-3 text-[#FF5800]" />
                        <p className="text-xs font-mono bg-gradient-to-r from-[#EC594F] to-[#7E6BF0] bg-clip-text text-transparent">
                          Edit in Pro Studio
                        </p>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Message without images - just text and feedback */}
              {(!images || images.length === 0) && (
                <>
                  <MessageFeedbackButtons
                    onLike={onLike}
                    onDislike={onDislike}
                    onRegenerate={onRegenerate}
                  />
                </>
              )}

              {/* Timestamp */}
              <p className="text-xs font-mono font-medium text-zinc-400">
                {formatTimestamp(message.createdAt)}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

