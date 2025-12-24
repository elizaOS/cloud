/**
 * Chat message component displaying individual chat messages with attachments and audio.
 * Supports copy to clipboard, audio playback, and timestamp formatting.
 *
 * @param props - Chat message configuration
 * @param props.message - Message data including content and metadata
 * @param props.avatar - Optional avatar component
 * @param props.audioUrl - Optional audio URL for playback
 * @param props.isPlaying - Whether audio is currently playing
 * @param props.isThinking - Whether message is in thinking state
 * @param props.onPlayAudio - Optional callback for audio playback
 * @param props.formatTimestamp - Optional timestamp formatter function
 */

"use client";

import { useState } from "react";
import { Clock, Volume2, Square, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { ContentType, type Media } from "@elizaos/core";

interface ChatMessageProps {
  message: {
    id: string;
    content: {
      text: string;
      attachments?: Media[];
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
        (att) => att.contentType === ContentType.IMAGE,
      );

      if (imageAttachment) {
        // Copy the actual image to clipboard
        try {
          const response = await fetch(imageAttachment.url);
          const blob = await response.blob();

          // Ensure the blob is an image type
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
            <div className="text-sm text-white leading-relaxed prose prose-invert prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-headings:my-3 prose-pre:my-2 break-words [&_pre]:overflow-x-auto [&_pre_code]:whitespace-pre-wrap [&_pre_code]:break-words">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  code: ({ className, children, ...props }) => {
                    const isInline = !className;
                    return isInline ? (
                      <code
                        className="bg-white/10 px-1.5 py-0.5 rounded text-xs break-all"
                        {...props}
                      >
                        {children}
                      </code>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                  pre: ({ children }) => (
                    <pre className="bg-black/40 border border-white/10 rounded-lg p-3 overflow-x-auto [&>code]:whitespace-pre-wrap [&>code]:break-words">
                      {children}
                    </pre>
                  ),
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#FF5800] hover:text-[#FF5800]/80 underline break-all"
                    >
                      {children}
                    </a>
                  ),
                  ul: ({ children }) => (
                    <ul className="list-disc list-inside">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal list-inside">{children}</ol>
                  ),
                }}
              >
                {message.content.text}
              </ReactMarkdown>
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
