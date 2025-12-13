/**
 * Clone Your Crush themed Chat Message Component
 * Romantic pink-themed message bubbles
 */

"use client";

import { useState } from "react";
import { Clock, Volume2, Square, Copy, Check, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ChatMessageCrushProps {
  message: {
    id: string;
    content: {
      text: string;
      attachments?: Array<{
        id: string;
        url: string;
        title?: string;
        contentType: string;
      }>;
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

export function ChatMessageCrush({
  message,
  avatar,
  audioUrl,
  isPlaying,
  isThinking,
  onPlayAudio,
  formatTimestamp = (ts) => new Date(ts).toLocaleTimeString(),
  className,
}: ChatMessageCrushProps) {
  const [isCopied, setIsCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      const imageAttachment = message.content.attachments?.find(
        (att) =>
          att.contentType === "IMAGE" ||
          att.contentType === "image" ||
          att.contentType.startsWith("image/"),
      );

      if (imageAttachment) {
        try {
          const response = await fetch(imageAttachment.url);
          const blob = await response.blob();
          const imageBlob = blob.type.startsWith("image/")
            ? blob
            : new Blob([blob], { type: "image/png" });

          const clipboardItem = new ClipboardItem({
            [imageBlob.type]: imageBlob,
          });

          await navigator.clipboard.write([clipboardItem]);
          setIsCopied(true);
          toast.success("Image copied to clipboard");
          setTimeout(() => setIsCopied(false), 2000);
          return;
        } catch (imageError) {
          console.error("Failed to copy image:", imageError);
          toast.error("Failed to copy image");
          return;
        }
      }

      await navigator.clipboard.writeText(message.content.text);
      setIsCopied(true);
      toast.success("Message copied to clipboard");
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
      toast.error("Failed to copy message");
    }
  };

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
          "rounded-2xl px-5 py-3.5 max-w-[80%] border transition-all backdrop-blur-sm relative",
          message.isAgent
            ? "bg-white/[0.03] border-white/10 shadow-lg"
            : "bg-gradient-to-br from-pink-500/90 to-pink-600/90 border-pink-400/30 text-white shadow-lg shadow-pink-500/20",
        )}
      >
        {/* Subtle glow effect for agent messages */}
        {message.isAgent && (
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-pink-500/5 to-purple-500/5 -z-10" />
        )}

        {isThinking ? (
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              <div
                className="h-2 w-2 rounded-full bg-pink-400 animate-bounce"
                style={{ animationDelay: "0ms" }}
              />
              <div
                className="h-2 w-2 rounded-full bg-pink-400 animate-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <div
                className="h-2 w-2 rounded-full bg-pink-400 animate-bounce"
                style={{ animationDelay: "300ms" }}
              />
            </div>
            <p className="text-sm text-white/70">Typing...</p>
          </div>
        ) : (
          <>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">
              {message.content.text}
            </div>
            <div
              className={cn(
                "flex items-center justify-between gap-2 text-xs mt-3 pt-3 border-t",
                message.isAgent
                  ? "border-white/10 text-white/50"
                  : "border-white/20 text-white/80",
              )}
            >
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                <span>{formatTimestamp(message.createdAt)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "h-6 w-6 p-0 hover:bg-white/10",
                    message.isAgent
                      ? "text-white/70 hover:text-white"
                      : "text-white/90 hover:text-white",
                  )}
                  onClick={copyToClipboard}
                  title="Copy message"
                >
                  {isCopied ? (
                    <Check className="h-3 w-3 text-green-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
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
            </div>
          </>
        )}
      </div>

      {!message.isAgent && (
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-pink-400 to-pink-500 flex items-center justify-center shadow-lg shadow-pink-500/30 border-2 border-pink-300/30">
          <div className="h-5 w-5 text-white font-bold flex items-center justify-center">
            <Heart className="h-4 w-4 fill-current" />
          </div>
        </div>
      )}
    </div>
  );
}

// Empty state component
export function ChatEmptyStateCrush({
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
      <h3 className="text-lg font-semibold mb-2 text-white bg-gradient-to-r from-pink-300 to-purple-300 bg-clip-text text-transparent">
        {title}
      </h3>
      <p className="text-sm text-white/60 max-w-md">{description}</p>
    </div>
  );
}
