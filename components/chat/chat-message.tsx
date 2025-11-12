/**
 * Reusable Chat Message Component
 * Themed message bubble for agent and user messages
 */

"use client";

import { useState } from "react";
import { Clock, Volume2, Square, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ChatMessageProps {
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
  const [isCopied, setIsCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      // Check if there are image attachments
      const imageAttachment = message.content.attachments?.find(
        (att) =>
          att.contentType === "IMAGE" ||
          att.contentType === "image" ||
          att.contentType.startsWith("image/"),
      );

      if (imageAttachment) {
        // Copy the actual image to clipboard
        try {
          const response = await fetch(imageAttachment.url);
          const blob = await response.blob();

          // Ensure the blob is an image type
          const imageBlob =
            blob.type.startsWith("image/")
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
          console.error(
            "Failed to copy image, falling back to text:",
            imageError,
          );
          toast.error("Failed to copy image, try downloading instead");
          return;
        }
      }

      // Fall back to copying text if no image
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
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 hover:bg-white/10 text-white/70 hover:text-white"
                  onClick={copyToClipboard}
                  title="Copy message"
                >
                  {isCopied ? (
                    <Check className="h-3 w-3 text-green-500" />
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
