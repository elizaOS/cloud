"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, User, Send, Loader2, Copy, Check, Plus, Mic, ChevronDown, ArrowUp } from "lucide-react";
import type { ElizaCharacter } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface BuildModeAssistantProps {
  character: ElizaCharacter;
  onCharacterUpdate: (updates: Partial<ElizaCharacter>) => void;
}

export function BuildModeAssistant({
  character,
  onCharacterUpdate,
}: BuildModeAssistantProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [inputText, setInputText] = useState("");
  const [currentTime] = useState(() => Date.now());
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("Gemini");
  const [quickPrompts] = useState<string[]>([
    "Add personality traits",
    "Improve the bio",
    "Add conversation examples",
    "Refine writing style",
  ]);

  // Track the character ID to detect when we switch characters
  const characterIdRef = useRef(character.id);

  // Determine if this is an existing character
  const isEditMode = !!(character.name && character.bio);

  const { messages, sendMessage, status, setMessages } = useChat({
    id: "character-assistant",
    transport: new DefaultChatTransport({
      api: "/api/v1/character-assistant",
      body: {
        character: isEditMode ? character : undefined,
        isEditMode,
      },
    }),
  });

  // Set initial welcome message
  useEffect(() => {
    const characterChanged = characterIdRef.current !== character.id;

    if (characterChanged || messages.length === 0) {
      characterIdRef.current = character.id;

      const welcomeText = isEditMode
        ? `Hi! I'm here to help you edit **${character.name}**.

**Current Character:**
- **Name:** ${character.name}
- **Bio:** ${character.bio}
${character.adjectives && character.adjectives.length > 0 ? `- **Traits:** ${character.adjectives.join(", ")}\n` : ""}${character.topics && character.topics.length > 0 ? `- **Topics:** ${character.topics.join(", ")}\n` : ""}
What would you like to change or improve?`
        : `Hi! I'm here to help you create an amazing character. Let's start:

1. What should we name your character?
2. What's their personality like?
3. What will they be used for?

Tell me about your vision!`;

      setMessages([
        {
          id: "welcome",
          role: "assistant",
          parts: [
            {
              type: "text",
              text: welcomeText,
            },
          ],
        },
      ]);
    }
  }, [
    character.id,
    character.name,
    character.bio,
    character.adjectives,
    character.topics,
    isEditMode,
    setMessages,
    messages.length,
  ]);

  // Robust scroll to bottom function
  const scrollToBottom = useCallback((smooth = false) => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]",
      );
      if (viewport) {
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
          if (smooth) {
            viewport.scrollTo({
              top: viewport.scrollHeight,
              behavior: "smooth",
            });
          } else {
            viewport.scrollTop = viewport.scrollHeight;
          }
        });
      }
    }
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, status, scrollToBottom]);

  // Additional scroll after a delay to handle late-loading content
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom();
    }, 100);
    return () => clearTimeout(timer);
  }, [messages, status, scrollToBottom]);

  // Extract and apply character updates in real-time
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];

    if (
      lastMessage &&
      lastMessage.role === "assistant" &&
      lastMessage.id !== "welcome"
    ) {
      const content = lastMessage.parts
        .filter((part) => part.type === "text")
        .map((part) => (part as { text: string }).text)
        .join("");

      const jsonMatch = content.match(/```json\n([\s\S]*?)(\n```|$)/);
      if (jsonMatch) {
        const jsonText = jsonMatch[1].trim();

        try {
          const updates = JSON.parse(jsonText);
          onCharacterUpdate(updates);
        } catch {
          try {
            const fieldMatches = jsonText.matchAll(
              /"(\w+)":\s*("(?:[^"\\]|\\.)*"|true|false|null|\d+(?:\.\d+)?|\[[^\]]*\])/g,
            );
            const partialUpdates: Record<string, unknown> = {};

            for (const match of fieldMatches) {
              const [, key, value] = match;
              try {
                const parsedValue = JSON.parse(value);
                if (parsedValue !== null && parsedValue !== undefined) {
                  partialUpdates[key] = parsedValue;
                }
              } catch {
                // Skip invalid values
              }
            }

            if (Object.keys(partialUpdates).length > 0) {
              onCharacterUpdate(partialUpdates);
            }
          } catch {
            // Silently ignore parsing errors during streaming
          }
        }
      }
    }
  }, [messages, onCharacterUpdate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || status === "streaming") return;

    const userMessage = inputText;
    setInputText("");
    sendMessage({ text: userMessage });
  };

  const isLoading = status === "streaming";

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const copyToClipboard = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      toast.success("Message copied to clipboard");
      // Reset after 2 seconds
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
      toast.error("Failed to copy message");
    }
  };

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-[#0A0A0A] relative overflow-hidden">
      {/* Purple Gradient Background Effect */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: "50%",
          bottom: "30%",
          width: "800px",
          height: "800px",
          background: "radial-gradient(circle, #E500FF 0%, rgba(229, 0, 255, 0.4) 40%, transparent 70%)",
          filter: "blur(150px)",
          opacity: 0.5,
          zIndex: 0,
        }}
      />

      {/* Messages Area */}
      <div className="flex-1 min-h-0 overflow-hidden relative z-10">
        <ScrollArea className="h-full p-6" ref={scrollAreaRef}>
          <div className="space-y-6 max-w-4xl mx-auto">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-[#FF5800] mb-4">
                  <Bot className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-white">
                  Start Building Your Character
                </h3>
                <p className="text-sm text-white/60 max-w-md">
                  Describe your character and I&apos;ll help you create it
                </p>
              </div>
            )}

            {messages.map((message, index) => {
              const content = message.parts
                .filter((part) => part.type === "text")
                .map((part) => (part as { text: string }).text)
                .join("")
                .trim();

              return (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"
                    } animate-in fade-in slide-in-from-bottom-4 duration-500`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {message.role === "assistant" ? (
                    <div className="flex flex-col gap-2 max-w-[85%] min-w-0">
                      {/* Agent Name Row with Avatar */}
                      <div className="flex items-center gap-2 px-1">
                        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#FF5800]">
                          <Bot className="h-3 w-3 text-white" />
                        </div>
                        <div
                          className="font-[family-name:var(--font-roboto-flex)] text-sm font-medium"
                          style={{ color: "#A1A1AA" }}
                        >
                          Agent Creator Assistant
                        </div>
                      </div>

                      {/* Message Container with Background */}
                      <div
                        className="px-4 py-3 rounded-lg"
                        style={{
                          background: "rgba(255, 255, 255, 0.03)",
                          backdropFilter: "blur(10px)",
                          border: "1px solid rgba(255, 255, 255, 0.05)",
                        }}
                      >
                        {/* Message Text */}
                        <div
                          className="font-[family-name:var(--font-roboto-flex)] text-[15px] leading-[1.6]"
                          style={{ fontWeight: 400 }}
                        >
                          <style jsx>{`
                            .json-syntax :global(pre) {
                              background: rgba(0, 0, 0, 0.4) !important;
                              padding: 12px !important;
                              border-radius: 0 !important;
                              overflow-x: auto !important;
                              max-width: 100% !important;
                            }
                            .json-syntax :global(pre)::-webkit-scrollbar {
                              height: 8px;
                            }
                            .json-syntax :global(pre)::-webkit-scrollbar-track {
                              background: rgba(0, 0, 0, 0.2);
                            }
                            .json-syntax :global(pre)::-webkit-scrollbar-thumb {
                              background: rgba(255, 88, 0, 0.4);
                              border-radius: 0;
                            }
                            .json-syntax
                              :global(pre)::-webkit-scrollbar-thumb:hover {
                              background: rgba(255, 88, 0, 0.6);
                            }
                            .json-syntax :global(code) {
                              font-family:
                                "Monaco", "Menlo", "Ubuntu Mono", "Consolas",
                                monospace !important;
                              font-size: 13px !important;
                              white-space: pre !important;
                            }
                            /* JSON property keys */
                            .json-syntax :global(.token.property),
                            .json-syntax :global(.token.key) {
                              color: #fe9f6d !important;
                            }
                            /* JSON punctuation (brackets, braces, commas, colons) */
                            .json-syntax :global(.token.punctuation) {
                              color: #e434bb !important;
                            }
                            /* JSON string values */
                            .json-syntax :global(.token.string) {
                              color: #d4d4d4 !important;
                            }
                            /* JSON numbers */
                            .json-syntax :global(.token.number) {
                              color: #d4d4d4 !important;
                            }
                            /* JSON booleans and null */
                            .json-syntax :global(.token.boolean),
                            .json-syntax :global(.token.null) {
                              color: #d4d4d4 !important;
                            }
                          `}</style>
                          <div className="json-syntax prose prose-sm max-w-none dark:prose-invert text-white overflow-hidden prose-p:my-2 prose-p:leading-relaxed prose-headings:font-semibold prose-headings:text-white prose-strong:text-white prose-strong:font-semibold prose-ul:my-2 prose-li:my-1">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              rehypePlugins={[rehypeHighlight]}
                            >
                              {content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>

                      {/* Time and Actions */}
                      <div className="flex items-center gap-2 px-1">
                        <span
                          className="text-xs font-[family-name:var(--font-roboto-mono)]"
                          style={{ color: "#71717A" }}
                        >
                          {formatTimestamp(currentTime)}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-4 w-4 p-0 hover:bg-white/10"
                          onClick={() => copyToClipboard(content, message.id)}
                          title="Copy message"
                        >
                          {copiedMessageId === message.id ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3 text-white/40" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 max-w-[85%] min-w-0">
                      {/* User Message */}
                      <div
                        className="px-5 py-3.5 rounded-lg font-[family-name:var(--font-roboto-flex)] text-[15px] leading-[1.6]"
                        style={{
                          background: "rgba(58, 58, 58, 0.7)",
                          backdropFilter: "blur(10px)",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          fontWeight: 400,
                        }}
                      >
                        <div className="whitespace-pre-wrap text-white">
                          {content}
                        </div>
                      </div>
                      {/* Time and Actions */}
                      <div className="flex items-center gap-2 justify-end px-1">
                        <span
                          className="text-xs font-[family-name:var(--font-roboto-mono)]"
                          style={{ color: "#71717A" }}
                        >
                          {formatTimestamp(currentTime)}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-4 w-4 p-0 hover:bg-white/10"
                          onClick={() => copyToClipboard(content, message.id)}
                          title="Copy message"
                        >
                          {copiedMessageId === message.id ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3 text-white/40" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {isLoading && (
              <div className="flex justify-start">
                <div className="flex flex-col gap-2 max-w-[85%] min-w-0">
                  <div className="flex items-center gap-2 px-1">
                    <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#FF5800]">
                      <Bot className="h-3 w-3 animate-pulse text-white" />
                    </div>
                    <div
                      className="font-[family-name:var(--font-roboto-flex)] text-sm font-medium"
                      style={{ color: "#A1A1AA" }}
                    >
                      Agent Creator Assistant
                    </div>
                  </div>
                  <div
                    className="px-4 py-3 rounded-lg"
                    style={{
                      background: "rgba(255, 255, 255, 0.03)",
                      backdropFilter: "blur(10px)",
                      border: "1px solid rgba(255, 255, 255, 0.05)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-4 w-4 animate-spin text-white/60" />
                      <p className="text-sm text-white/60 font-[family-name:var(--font-roboto-flex)]">
                        Thinking...
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </div>



      {/* Input Area - Matching Figma design */}
      <form
        onSubmit={handleSubmit}
        className="p-4 mb-4 mx-6 relative z-10"
        style={{ borderColor: "#353535" }}
      >
        <div className="max-w-4xl mx-auto">
          {/* Textarea Input Box with Controls Inside */}
          <div className="relative">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as any);
                }
              }}
              placeholder="How do you want your agent to be?"
              disabled={isLoading}
              rows={4}
              className="w-full bg-transparent px-4 py-3 pb-12 text-sm text-white placeholder:text-white/40 focus:outline-none disabled:opacity-50 resize-none border"
              style={{
                fontFamily: "'Geist', sans-serif",
                backgroundColor: "#0A0A0A",
                borderColor: "#2A2A2A",
                borderRadius: "0",
              }}
            />

            {/* Bottom Row: Model Selector + Action Buttons - Positioned Inside */}
            <div className="absolute pb-2 bottom-3 left-3 right-3 flex items-center justify-between">
              {/* Gemini Dropdown */}
              <button
                type="button"
                className="flex items-center gap-2 px-3 py-1.5 transition-colors hover:bg-white/5"
                style={{
                  backgroundColor: "transparent",
                  border: "1px solid #2A2A2A",
                  borderRadius: "0",
                }}
              >
                <span className="text-sm text-white/90" style={{ fontFamily: "'Geist', sans-serif" }}>
                  {selectedModel}
                </span>
                <ChevronDown className="h-3 w-3 text-white/50" />
              </button>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5">
                {/* Add/Plus Button */}
                <button
                  type="button"
                  className="h-8 w-8 flex items-center justify-center transition-colors hover:bg-white/5"
                  style={{
                    backgroundColor: "transparent",
                    border: "1px solid #2A2A2A",
                    borderRadius: "0",
                  }}
                >
                  <Plus className="h-4 w-4 text-white/60" />
                </button>

                {/* Microphone Button */}
                <button
                  type="button"
                  className="h-8 w-8 flex items-center justify-center transition-colors hover:bg-white/5"
                  style={{
                    backgroundColor: "transparent",
                    border: "1px solid #2A2A2A",
                    borderRadius: "0",
                  }}
                >
                  <Mic className="h-4 w-4 text-white/60" />
                </button>

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={isLoading || !inputText.trim()}
                  className="h-8 w-8 flex items-center justify-center transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{
                    backgroundColor: "#E500FF",
                    borderRadius: "0",
                  }}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  ) : (
                    <ArrowUp className="h-4 w-4 text-white" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
