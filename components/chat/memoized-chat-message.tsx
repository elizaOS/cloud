/**
 * Memoized chat message component for performance optimization.
 * Prevents re-renders of messages that haven't changed.
 */

"use client";

import React, { memo, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, Copy, Check, Volume2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ElizaAvatar } from "./eliza-avatar";
import Image from "next/image";

// Dynamically import ReactMarkdown to reduce initial bundle (~150KB savings)
// No loading fallback - we'll show plain text while it loads to avoid flicker
const ReactMarkdown = dynamic(() => import("react-markdown"), {
  ssr: false,
});

// Pre-load plugins at module level - shared across all message instances
// This prevents the flash caused by loading plugins inside each component
let pluginsCache: { remarkGfm: any; rehypeHighlight: any } | null = null;
let pluginsLoading = false;
const pluginsPromise = Promise.all([
  import("remark-gfm").then((mod) => mod.default),
  import("rehype-highlight").then((mod) => mod.default),
]).then(([remarkGfm, rehypeHighlight]) => {
  pluginsCache = { remarkGfm, rehypeHighlight };
  return pluginsCache;
});

// Hook to access shared plugins - all components share the same cache
function useMarkdownPlugins() {
  const [plugins, setPlugins] = useState(pluginsCache);
  
  useEffect(() => {
    if (!pluginsCache && !pluginsLoading) {
      pluginsLoading = true;
      pluginsPromise.then((loaded) => {
        setPlugins(loaded);
      });
    } else if (pluginsCache && !plugins) {
      setPlugins(pluginsCache);
    }
  }, [plugins]);
  
  return plugins;
}

interface Message {
  id: string;
  content: {
    text: string;
    clientMessageId?: string;
    attachments?: Array<{
      id: string;
      url: string;
      title?: string;
      contentType: string;
    }>;
  };
  isAgent: boolean;
  createdAt: number;
}

interface MemoizedChatMessageProps {
  message: Message;
  index: number;
  characterName: string;
  characterAvatarUrl?: string;
  copiedMessageId: string | null;
  currentPlayingId: string | null;
  isPlaying: boolean;
  hasAudioUrl: boolean;
  formatTimestamp: (timestamp: number) => string;
  onCopy: (
    text: string,
    messageId: string,
    attachments?: Message["content"]["attachments"],
  ) => void;
  onPlayAudio?: (messageId: string) => void;
  onImageLoad?: () => void;
}

// Markdown components configuration
const markdownComponents = {
  code: ({
    className,
    children,
    ...props
  }: React.ComponentPropsWithoutRef<"code"> & { className?: string }) => {
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
  pre: ({ children }: { children: React.ReactNode }) => (
    <pre className="bg-black/40 border border-white/10 rounded-lg p-3 overflow-x-auto [&>code]:whitespace-pre-wrap [&>code]:break-words">
      {children}
    </pre>
  ),
  a: ({ href, children }: { href?: string; children: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[#FF5800] hover:text-[#FF5800]/80 underline break-all"
    >
      {children}
    </a>
  ),
  ul: ({ children }: { children: React.ReactNode }) => (
    <ul className="list-disc list-inside">{children}</ul>
  ),
  ol: ({ children }: { children: React.ReactNode }) => (
    <ol className="list-decimal list-inside">{children}</ol>
  ),
};

function ChatMessageComponent({
  message,
  index,
  characterName,
  characterAvatarUrl,
  copiedMessageId,
  currentPlayingId,
  isPlaying,
  hasAudioUrl,
  formatTimestamp,
  onCopy,
  onPlayAudio,
  onImageLoad,
}: MemoizedChatMessageProps) {
  const isThinking = message.id.startsWith("thinking-");
  // Use shared plugins cache - no flash since plugins are pre-loaded at module level
  const plugins = useMarkdownPlugins();

  return (
    <div
      className={`flex ${message.isAgent ? "justify-start" : "justify-end"} animate-in fade-in slide-in-from-bottom-4 duration-500`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {message.isAgent ? (
        <div className="flex flex-col gap-0.5 max-w-[85%] sm:max-w-[75%] group/message">
          {/* Agent Name Row with Avatar */}
          <div className="flex items-center gap-2">
            <ElizaAvatar
              avatarUrl={characterAvatarUrl}
              name={characterName}
              className="flex-shrink-0 w-5 h-5"
              iconClassName="h-3 w-3"
              animate={isThinking}
            />
            <span className="text-xs font-medium text-white/50">
              {characterName}
            </span>
          </div>

          <div className="flex flex-col gap-0.5">
            {isThinking ? (
              <div className="flex items-center gap-2 py-2 px-3 bg-white/[0.03] border border-white/[0.06] rounded-lg">
                <Loader2 className="h-4 w-4 animate-spin text-white/40" />
                <span className="text-sm text-white/40">thinking...</span>
              </div>
            ) : (
              <>
                {/* Message Text - Always show content immediately, upgrade to markdown when ready */}
                <div className="overflow-hidden">
                  <div className="text-[15px] leading-relaxed text-white/90 prose prose-invert prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-headings:my-3 prose-pre:my-2 break-words [&_pre]:overflow-x-auto [&_pre_code]:whitespace-pre-wrap [&_pre_code]:break-words">
                    {plugins && ReactMarkdown ? (
                      <ReactMarkdown
                        remarkPlugins={[plugins.remarkGfm]}
                        rehypePlugins={[plugins.rehypeHighlight]}
                        components={markdownComponents}
                      >
                        {message.content.text}
                      </ReactMarkdown>
                    ) : (
                      // Plain text fallback - shown immediately while markdown loads
                      // Uses same styling to prevent layout shift
                      <div className="whitespace-pre-wrap">
                        {message.content.text}
                      </div>
                    )}
                  </div>
                </div>

                {/* Image Attachments */}
                {message.content.attachments &&
                  message.content.attachments.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {message.content.attachments.map((attachment) => {
                        if (
                          attachment.contentType === "IMAGE" ||
                          attachment.contentType === "image"
                        ) {
                          return (
                            <div
                              key={attachment.id}
                              className="inline-block rounded-lg overflow-hidden border border-white/10 max-w-md"
                            >
                              <Image
                                src={attachment.url}
                                alt={attachment.title || "Generated image"}
                                width={512}
                                height={512}
                                className="w-full h-auto"
                                style={{ display: "block" }}
                                onLoad={onImageLoad}
                              />
                            </div>
                          );
                        }
                        return null;
                      })}
                    </div>
                  )}

                {/* Time and Actions */}
                <div className="flex items-center gap-2 opacity-0 group-hover/message:opacity-100 transition-opacity">
                  <span className="text-xs text-white/40">
                    {formatTimestamp(message.createdAt)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 hover:bg-white/10 rounded transition-colors"
                    onClick={() =>
                      onCopy(
                        message.content.text,
                        message.id,
                        message.content.attachments,
                      )
                    }
                    title="Copy message"
                  >
                    {copiedMessageId === message.id ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-white/50 hover:text-white/80" />
                    )}
                  </Button>
                  {hasAudioUrl && onPlayAudio && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 hover:bg-white/10 rounded transition-colors"
                      onClick={() => onPlayAudio(message.id)}
                    >
                      {currentPlayingId === message.id && isPlaying ? (
                        <Square className="h-3.5 w-3.5 text-white/50" />
                      ) : (
                        <Volume2 className="h-3.5 w-3.5 text-white/50 hover:text-white/80" />
                      )}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col max-w-[85%] sm:max-w-[75%] group/message items-end">
          {/* User Message */}
          <div className="py-2 px-3 bg-[#FF5800]/10 border border-[#FF5800]/20 rounded-lg transition-colors hover:bg-[#FF5800]/15 hover:border-[#FF5800]/30 w-fit ml-auto">
            <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-white/95 text-left">
              {message.content.text}
            </div>
          </div>
          {/* Time and Actions */}
          <div className="flex items-center gap-2 justify-end opacity-0 group-hover/message:opacity-100 transition-opacity">
            <span className="text-xs text-white/40">
              {formatTimestamp(message.createdAt)}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 hover:bg-white/10 rounded transition-colors"
              onClick={() =>
                onCopy(
                  message.content.text,
                  message.id,
                  message.content.attachments,
                )
              }
              title="Copy message"
            >
              {copiedMessageId === message.id ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-white/50 hover:text-white/80" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Memoize with custom comparison function
export const MemoizedChatMessage = memo(
  ChatMessageComponent,
  (prevProps, nextProps) => {
    // Only re-render if these specific props change
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.content.text === nextProps.message.content.text &&
      prevProps.copiedMessageId === nextProps.copiedMessageId &&
      prevProps.currentPlayingId === nextProps.currentPlayingId &&
      prevProps.isPlaying === nextProps.isPlaying &&
      prevProps.hasAudioUrl === nextProps.hasAudioUrl
    );
  },
);

