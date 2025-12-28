/**
 * Memoized chat message component for performance optimization.
 * Prevents re-renders of messages that haven't changed.
 */

"use client";

import React, { memo, useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { Loader2, Copy, Check, Volume2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ElizaAvatar } from "./eliza-avatar";
import Image from "next/image";
import { ContentType, type Media } from "@elizaos/core";

/**
 * Hook for smooth typewriter animation of streaming text.
 * Handles burst input gracefully by revealing text at a consistent pace.
 * Uses requestAnimationFrame for smooth 60fps animation.
 * 
 * IMPORTANT: Animation always completes to the full text, even after streaming ends.
 * This prevents the jarring "snap to end" effect when the final message arrives.
 */
function useTypewriterText(
  targetText: string,
  isActive: boolean,
  config: { charsPerFrame?: number; frameDelay?: number; onReveal?: () => void } = {}
) {
  // Faster base speed and shorter delay for smoother animation
  const { charsPerFrame = 5, frameDelay = 10, onReveal } = config;
  
  // Track animation state in ref (for animation logic)
  const animState = useRef({ 
    visibleLength: 0, 
    lastFrame: 0, 
    animationId: null as number | null,
    lastTargetLength: 0,
    wasActive: false  // Track in ref to avoid state-in-effect issues
  });
  
  // Track display state in React state (for rendering)
  const [displayLength, setDisplayLength] = useState(0);
  
  // Store onReveal in ref so it doesn't cause effect re-runs
  const onRevealRef = useRef(onReveal);
  useEffect(() => {
    onRevealRef.current = onReveal;
  });
  
  // Handle animation - runs when streaming OR when finishing animation after stream ends
  useEffect(() => {
    const state = animState.current;
    
    // Track if we've ever been active (for this message)
    if (isActive) {
      state.wasActive = true;
    }
    
    // Detect new message (target got shorter) and reset
    if (targetText.length < state.lastTargetLength) {
      state.visibleLength = 0;
      state.lastTargetLength = targetText.length;
      state.wasActive = isActive;
    } else {
      state.lastTargetLength = targetText.length;
    }
    
    // Skip animation if this message was never streamed (e.g., loaded from history)
    // But continue if we have an in-progress animation (displayLength > 0)
    if (!state.wasActive && !isActive && state.visibleLength === 0) {
      return;
    }
    
    // If animation complete, nothing to do
    if (state.visibleLength >= targetText.length) {
      return;
    }
    
    const animate = (timestamp: number) => {
      // Frame rate control - faster updates
      if (timestamp - state.lastFrame < frameDelay) {
        state.animationId = requestAnimationFrame(animate);
        return;
      }
      state.lastFrame = timestamp;
      
      const remaining = targetText.length - state.visibleLength;
      
      if (remaining <= 0) {
        state.animationId = null;
        return;
      }
      
      // Much more aggressive catch-up - stream should feel fast but smooth
      // When finishing (stream ended), catch up very quickly
      const isFinishing = !isActive;
      let catchUp: number;
      if (isFinishing) {
        // Very aggressive catch-up when stream has ended
        catchUp = remaining > 200 ? 8 : remaining > 100 ? 6 : remaining > 50 ? 4 : remaining > 20 ? 3 : 2;
      } else {
        // During streaming, still be aggressive to keep up
        catchUp = remaining > 150 ? 5 : remaining > 80 ? 4 : remaining > 40 ? 3 : remaining > 20 ? 2 : 1.5;
      }
      const toReveal = Math.min(remaining, Math.ceil(charsPerFrame * catchUp));
      
      state.visibleLength += toReveal;
      setDisplayLength(state.visibleLength);
      
      // Notify parent to scroll - call on every reveal
      onRevealRef.current?.();
      
      // Continue if more to reveal
      if (state.visibleLength < targetText.length) {
        state.animationId = requestAnimationFrame(animate);
      } else {
        state.animationId = null;
      }
    };
    
    // Start animation if needed
    if (!state.animationId && targetText.length > state.visibleLength) {
      state.animationId = requestAnimationFrame(animate);
    }
    
    // Capture ref value for cleanup
    const currentAnimState = animState.current;
    
    return () => {
      if (currentAnimState.animationId) {
        cancelAnimationFrame(currentAnimState.animationId);
        currentAnimState.animationId = null;
      }
    };
  }, [isActive, targetText, charsPerFrame, frameDelay]);
  
  // Return animated text if animation is in progress (displayLength > 0 and < target)
  // Otherwise return full text
  // displayLength === 0 means either: animation hasn't started OR message was never animated
  const isAnimating = displayLength > 0 && displayLength < targetText.length;
  
  return isAnimating ? targetText.slice(0, displayLength) : targetText;
}

/**
 * Hook for smooth typewriter animation of reasoning/CoT text.
 * Animation completes to full text even after the thinking phase ends.
 */
function useReasoningTypewriter(
  targetText: string,
  isActive: boolean,
  onReveal?: () => void
) {
  const animState = useRef({ 
    visibleLength: 0, 
    lastFrame: 0, 
    animationId: null as number | null,
    lastTargetLength: 0,
    wasActive: false
  });
  
  const [displayLength, setDisplayLength] = useState(0);
  
  // Store onReveal in ref so it doesn't cause effect re-runs
  const onRevealRef = useRef(onReveal);
  useEffect(() => {
    onRevealRef.current = onReveal;
  });
  
  useEffect(() => {
    const state = animState.current;
    
    // Track if we've ever been active
    if (isActive && targetText) {
      state.wasActive = true;
    }
    
    // Detect reset (new reasoning started or cleared)
    if (!targetText || targetText.length < state.lastTargetLength) {
      state.visibleLength = 0;
      state.lastTargetLength = targetText?.length || 0;
      state.wasActive = isActive && !!targetText;
      // Don't call setDisplayLength here - let animation handle it
      return;
    }
    state.lastTargetLength = targetText.length;
    
    // Skip if never active or already caught up
    if (!state.wasActive) {
      return;
    }
    
    if (state.visibleLength >= targetText.length) {
      return;
    }
    
    const animate = (timestamp: number) => {
      // Slightly slower pace for reasoning (easier to read)
      if (timestamp - state.lastFrame < 18) {
        state.animationId = requestAnimationFrame(animate);
        return;
      }
      state.lastFrame = timestamp;
      
      const remaining = targetText.length - state.visibleLength;
      
      if (remaining <= 0) {
        state.animationId = null;
        return;
      }
      
      // Catch-up for reasoning text - faster when finishing
      const isFinishing = !isActive;
      const catchUp = isFinishing
        ? (remaining > 60 ? 3 : remaining > 20 ? 2.5 : 2)
        : (remaining > 80 ? 2.5 : remaining > 30 ? 1.8 : 1);
      const toReveal = Math.min(remaining, Math.ceil(2 * catchUp));
      
      state.visibleLength += toReveal;
      setDisplayLength(state.visibleLength);
      
      // Notify parent to scroll
      onRevealRef.current?.();
      
      if (state.visibleLength < targetText.length) {
        state.animationId = requestAnimationFrame(animate);
      } else {
        state.animationId = null;
      }
    };
    
    if (!state.animationId && targetText.length > state.visibleLength) {
      state.animationId = requestAnimationFrame(animate);
    }
    
    // Capture ref value for cleanup
    const currentState = animState.current;
    
    return () => {
      if (currentState.animationId) {
        cancelAnimationFrame(currentState.animationId);
        currentState.animationId = null;
      }
    };
  }, [targetText, isActive]);
  
  // Return animated text if in progress, otherwise full text (or empty if never started)
  if (!targetText) {
    return "";
  }
  
  // displayLength === 0 means animation hasn't started - return empty for consistency
  // once animation starts (displayLength > 0), continue even if not complete
  const isAnimating = displayLength > 0 && displayLength < targetText.length;
  
  return isAnimating ? targetText.slice(0, displayLength) : (displayLength >= targetText.length ? targetText : "");
}

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
    // Only subscribe to promise if cache isn't already loaded
    if (!pluginsCache && !pluginsLoading) {
      pluginsLoading = true;
    }
    // Subscribe to the promise - it will resolve immediately if already loaded
    let mounted = true;
    pluginsPromise.then((loaded) => {
      if (mounted) {
        setPlugins(loaded);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return plugins;
}

interface Message {
  id: string;
  content: {
    text: string;
    clientMessageId?: string;
    attachments?: Media[];
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
  isStreaming?: boolean;
  formatTimestamp: (timestamp: number) => string;
  onCopy: (
    text: string,
    messageId: string,
    attachments?: Message["content"]["attachments"],
  ) => void;
  onPlayAudio?: (messageId: string) => void;
  onImageLoad?: () => void;
  /** Chain-of-thought reasoning text to display while thinking */
  reasoningText?: string;
  /** Current phase of reasoning: planning, actions, or response */
  reasoningPhase?: "planning" | "actions" | "response" | null;
  /** Callback when typewriter animation reveals more text (for scrolling) */
  onTextReveal?: () => void;
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
  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="bg-black/40 border border-white/10 rounded-lg p-3 overflow-x-auto [&>code]:whitespace-pre-wrap [&>code]:break-words">
      {children}
    </pre>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[#FF5800] hover:text-[#FF5800]/80 underline break-all"
    >
      {children}
    </a>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc list-inside">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal list-inside">{children}</ol>
  ),
};

function ChatMessageComponent({
  message,
  characterName,
  characterAvatarUrl,
  copiedMessageId,
  currentPlayingId,
  isPlaying,
  hasAudioUrl,
  isStreaming = false,
  formatTimestamp,
  onCopy,
  onPlayAudio,
  onImageLoad,
  reasoningText,
  reasoningPhase,
  onTextReveal,
}: MemoizedChatMessageProps) {
  const isThinking = message.id.startsWith("thinking-");
  const hasReasoning = isThinking && reasoningText && reasoningText.length > 0;
  // Use shared plugins cache - no flash since plugins are pre-loaded at module level
  const plugins = useMarkdownPlugins();

  // Detect streaming from message id if not explicitly passed
  const isStreamingMessage = isStreaming || message.id.startsWith("streaming-");
  
  // Typewriter effect for streaming messages - reveals text smoothly regardless of burst input
  // Calls onTextReveal on each animation frame to trigger scroll
  const displayText = useTypewriterText(
    message.content.text,
    isStreamingMessage,
    { onReveal: onTextReveal }
  );
  
  // Typewriter effect for reasoning/CoT text
  const displayReasoningText = useReasoningTypewriter(
    reasoningText || "",
    hasReasoning,
    onTextReveal
  );

  return (
    <div
      className={`flex ${message.isAgent ? "justify-start" : "justify-end"}`}
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
              <div className="py-2.5 px-3.5 bg-white/[0.02] border border-white/[0.05] rounded-lg backdrop-blur-sm">
                <style jsx global>{`
                  @keyframes reasoningFadeIn {
                    from {
                      opacity: 0;
                      transform: translateY(2px);
                    }
                    to {
                      opacity: 1;
                      transform: translateY(0);
                    }
                  }
                  
                  @keyframes reasoningTextAppear {
                    from {
                      opacity: 0.3;
                    }
                    to {
                      opacity: 0.65;
                    }
                  }
                  
                  @keyframes pulseGlow {
                    0%, 100% { 
                      box-shadow: 0 0 0 0 rgba(255, 88, 0, 0);
                      border-color: rgba(255, 88, 0, 0.15);
                    }
                    50% { 
                      box-shadow: 0 0 8px 2px rgba(255, 88, 0, 0.1);
                      border-color: rgba(255, 88, 0, 0.25);
                    }
                  }
                  
                  @keyframes dotPulse {
                    0%, 80%, 100% { transform: scale(0.8); opacity: 0.4; }
                    40% { transform: scale(1); opacity: 1; }
                  }
                  
                  .reasoning-container {
                    animation: reasoningFadeIn 300ms ease-out forwards;
                  }
                  
                  .reasoning-border {
                    animation: pulseGlow 2s ease-in-out infinite;
                  }
                  
                  .reasoning-text {
                    animation: reasoningTextAppear 200ms ease-out forwards;
                    -webkit-font-smoothing: antialiased;
                  }
                  
                  .thinking-dots span {
                    display: inline-block;
                    animation: dotPulse 1.4s ease-in-out infinite;
                  }
                  .thinking-dots span:nth-child(1) { animation-delay: 0ms; }
                  .thinking-dots span:nth-child(2) { animation-delay: 200ms; }
                  .thinking-dots span:nth-child(3) { animation-delay: 400ms; }
                `}</style>
                {hasReasoning ? (
                  // Show chain-of-thought reasoning with smooth animation
                  <div className="reasoning-container space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#FF5800]/70" />
                        <div className="absolute inset-0 h-3.5 w-3.5 animate-ping opacity-20 rounded-full bg-[#FF5800]" />
                      </div>
                      <span className="text-xs font-medium text-[#FF5800]/70 uppercase tracking-wider">
                        {reasoningPhase === "planning" && "Planning"}
                        {reasoningPhase === "actions" && "Executing"}
                        {reasoningPhase === "response" && "Composing"}
                        {!reasoningPhase && "Thinking"}
                      </span>
                    </div>
                    <div className="reasoning-text reasoning-border text-sm text-white/75 italic leading-relaxed border-l-2 border-[#FF5800]/25 pl-3 ml-1 py-0.5">
                      {displayReasoningText}
                      <span 
                        className="streaming-cursor inline-block w-[2px] h-[0.9em] bg-[#FF5800]/50 ml-0.5 rounded-sm align-text-bottom"
                        style={{ verticalAlign: 'text-bottom' }}
                      />
                    </div>
                  </div>
                ) : (
                  // Default thinking indicator with animated dots
                  <div className="flex items-center gap-2.5">
                    <Loader2 className="h-4 w-4 animate-spin text-white/50" />
                    <span className="text-sm text-white/50">
                      thinking<span className="thinking-dots"><span>.</span><span>.</span><span>.</span></span>
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Message Text - Always show content immediately, upgrade to markdown when ready */}
                <div className="overflow-hidden">
                  {/* Streaming text animation styles - smooth typewriter effect */}
                  <style jsx global>{`
                    @keyframes streamTextFadeIn {
                      0% {
                        opacity: 0.4;
                        filter: blur(1px);
                      }
                      100% {
                        opacity: 1;
                        filter: blur(0);
                      }
                    }
                    
                    @keyframes cursorBlink {
                      0%, 50% { opacity: 1; }
                      51%, 100% { opacity: 0; }
                    }
                    
                    @keyframes cursorPulse {
                      0%, 100% { 
                        opacity: 0.9;
                        transform: scaleY(1);
                      }
                      50% { 
                        opacity: 0.5;
                        transform: scaleY(0.85);
                      }
                    }
                    
                    .streaming-text-wrapper {
                      /* Smooth text rendering for animation */
                      -webkit-font-smoothing: antialiased;
                      -moz-osx-font-smoothing: grayscale;
                      text-rendering: optimizeLegibility;
                    }
                    
                    .streaming-text-content {
                      animation: streamTextFadeIn 200ms ease-out forwards;
                    }
                    
                    /* Smooth transitions for text changes */
                    .streaming-text-content p,
                    .streaming-text-content span,
                    .streaming-text-content div {
                      transition: opacity 150ms ease-out;
                    }
                    
                    .streaming-cursor {
                      animation: cursorPulse 800ms ease-in-out infinite;
                      will-change: opacity, transform;
                    }
                    
                    /* Non-streaming messages - subtle entrance */
                    .message-text-complete {
                      animation: streamTextFadeIn 300ms ease-out forwards;
                    }
                  `}</style>
                  <div
                    className={`streaming-text-wrapper text-[15px] leading-relaxed text-white/90 prose prose-invert prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-headings:my-3 prose-pre:my-2 break-words [&_pre]:overflow-x-auto [&_pre_code]:whitespace-pre-wrap [&_pre_code]:break-words ${isStreamingMessage ? "streaming-text-content" : "message-text-complete"}`}
                  >
                    {plugins && ReactMarkdown ? (
                      <ReactMarkdown
                        remarkPlugins={[plugins.remarkGfm]}
                        rehypePlugins={[plugins.rehypeHighlight]}
                        components={markdownComponents}
                      >
                        {isStreamingMessage ? displayText : message.content.text}
                      </ReactMarkdown>
                    ) : (
                      // Plain text fallback - shown immediately while markdown loads
                      // Uses same styling to prevent layout shift
                      <div className="whitespace-pre-wrap">
                        {isStreamingMessage ? displayText : message.content.text}
                      </div>
                    )}
                    {/* Elegant blinking cursor for streaming messages */}
                    {isStreamingMessage && (
                      <span 
                        className="streaming-cursor inline-block w-[3px] h-[1.1em] bg-gradient-to-b from-[#FF5800] to-[#FF5800]/60 ml-0.5 rounded-sm align-text-bottom" 
                        style={{ verticalAlign: 'text-bottom', marginBottom: '2px' }}
                      />
                    )}
                  </div>
                </div>

                {/* Image Attachments */}
                {message.content.attachments &&
                  message.content.attachments.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {message.content.attachments.map((attachment) => {
                        if (attachment.contentType === ContentType.IMAGE) {
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

                {/* Time and Actions - hide during streaming */}
                {!isStreamingMessage && (
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
                )}
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
    // Compare relevant props - streaming messages use streaming- prefix
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.content.text === nextProps.message.content.text &&
      prevProps.copiedMessageId === nextProps.copiedMessageId &&
      prevProps.currentPlayingId === nextProps.currentPlayingId &&
      prevProps.isPlaying === nextProps.isPlaying &&
      prevProps.hasAudioUrl === nextProps.hasAudioUrl &&
      prevProps.isStreaming === nextProps.isStreaming &&
      prevProps.reasoningText === nextProps.reasoningText &&
      prevProps.reasoningPhase === nextProps.reasoningPhase
    );
  },
);
