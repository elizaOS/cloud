"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, User, Send, Loader2 } from "lucide-react";
import type { ElizaCharacter } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";

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

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]",
      );
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages, status]);

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

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-[#0A0A0A]">
      {/* Messages Area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full p-4" ref={scrollAreaRef}>
          <div className="space-y-4 max-w-5xl mx-auto">
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
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  } animate-in fade-in slide-in-from-bottom-4 duration-500`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {message.role === "assistant" ? (
                    <div className="flex flex-col gap-1 max-w-[70%]">
                      {/* Agent Name Row with Avatar */}
                      <div className="flex items-center gap-2">
                        <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#FF5800]">
                          <Bot className="h-3 w-3 text-white" />
                        </div>
                        <div
                          className="font-[family-name:var(--font-roboto-flex)] text-sm font-medium"
                          style={{ color: "#A1A1AA" }}
                        >
                          {character.name || "New Character"}
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        {/* Message Text */}
                        <div
                          className="py-2 rounded-none font-[family-name:var(--font-roboto-flex)] text-[16px] leading-[1.5]"
                          style={{ fontWeight: 500 }}
                        >
                          <div className="prose prose-sm max-w-none dark:prose-invert text-white [&_pre]:bg-black/40 [&_pre]:p-3 [&_pre]:rounded-none [&_code]:text-[#FF5800]">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {content}
                            </ReactMarkdown>
                          </div>
                        </div>
                        {/* Time */}
                        <div className="flex items-center gap-2">
                          <span
                            className="text-sm font-[family-name:var(--font-roboto-mono)]"
                            style={{ color: "#A1A1AA" }}
                          >
                            {formatTimestamp(currentTime)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 max-w-[70%]">
                      {/* User Message */}
                      <div
                        className="px-4 py-3 rounded-none font-[family-name:var(--font-roboto-flex)] text-[16px] leading-[1.5]"
                        style={{
                          backgroundColor: "#3A3A3A",
                          fontWeight: 500,
                        }}
                      >
                        <div className="whitespace-pre-wrap text-white">
                          {content}
                        </div>
                      </div>
                      {/* Time */}
                      <div className="flex items-center gap-2 justify-end px-1">
                        <span
                          className="text-sm font-[family-name:var(--font-roboto-mono)]"
                          style={{ color: "#A1A1AA" }}
                        >
                          {formatTimestamp(currentTime)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {isLoading && (
              <div className="flex justify-start">
                <div className="flex flex-col gap-1 max-w-[70%]">
                  <div className="flex items-center gap-2">
                    <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#FF5800]">
                      <Bot className="h-3 w-3 animate-pulse text-white" />
                    </div>
                    <div
                      className="font-[family-name:var(--font-roboto-flex)] text-sm font-medium"
                      style={{ color: "#A1A1AA" }}
                    >
                      {character.name || "New Character"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-white/60" />
                    <p className="text-sm text-white/60 font-[family-name:var(--font-roboto-flex)]">
                      is thinking...
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </div>

      {/* Quick Prompts */}
      {messages.length === 1 && (
        <div className="flex-shrink-0 px-6 pb-3">
          <div className="max-w-5xl mx-auto flex flex-wrap gap-2">
            {isEditMode ? (
              <>
                <button
                  onClick={() => setInputText("Add more personality traits")}
                  className="px-3 py-1.5 text-xs rounded-none bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 transition-colors"
                >
                  Add personality traits
                </button>
                <button
                  onClick={() => setInputText("Improve the bio description")}
                  className="px-3 py-1.5 text-xs rounded-none bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 transition-colors"
                >
                  Improve bio
                </button>
                <button
                  onClick={() => setInputText("Add conversation examples")}
                  className="px-3 py-1.5 text-xs rounded-none bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 transition-colors"
                >
                  Add examples
                </button>
                <button
                  onClick={() => setInputText("Refine the writing style")}
                  className="px-3 py-1.5 text-xs rounded-none bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 transition-colors"
                >
                  Refine style
                </button>
              </>
            ) : (
              quickPrompts.map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => setInputText(prompt)}
                  className="px-3 py-1.5 text-xs rounded-none bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 transition-colors"
                >
                  {prompt}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Input Area - Matching main chat style */}
      <form
        onSubmit={handleSubmit}
        className="border-t p-3 mb-4 mx-4"
        style={{ backgroundColor: "#1D1D1D" }}
      >
        <div className="max-w-5xl mx-auto space-y-2">
          {/* Text Input Box */}
          <div className="relative rounded-none border-2 border-border shadow-sm bg-black/20 overflow-hidden">
            {/* Robot Eye Visor Scanner - Animated line on top edge with randomness */}
            <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden pointer-events-none z-10">
              {/* Primary scanner */}
              <div
                className="absolute h-full w-24 bg-gradient-to-r from-transparent via-[#FF5800] to-transparent"
                style={{
                  animation: "visor-scan 4.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                  boxShadow: "0 0 15px 3px rgba(255, 88, 0, 0.7)",
                  filter: "blur(0.5px)",
                }}
              />
              {/* Secondary scanner for organic feel */}
              <div
                className="absolute h-full w-16 bg-gradient-to-r from-transparent via-[#FF5800]/60 to-transparent"
                style={{
                  animation: "visor-scan-delayed 6.2s cubic-bezier(0.3, 0.1, 0.7, 0.9) infinite 1.5s",
                  boxShadow: "0 0 10px 2px rgba(255, 88, 0, 0.5)",
                  filter: "blur(1px)",
                }}
              />
            </div>
            <input
              value={inputText}
              onChange={(e) => setInputText(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Describe your character or ask for help..."
              disabled={isLoading}
              className="w-full bg-transparent px-3 py-2.5 text-sm text-white placeholder:text-white/60 focus:outline-none disabled:opacity-50"
            />
          </div>

          {/* Bottom Row: Send Button */}
          <div className="flex items-center justify-end">
            <Button
              type="submit"
              disabled={isLoading || !inputText.trim()}
              size="icon"
              className="h-10 w-10 rounded-none border-none"
              style={{ backgroundColor: "rgba(255, 88, 0, 0.25)" }}
            >
              {isLoading ? (
                <Loader2
                  className="h-4 w-4 animate-spin"
                  style={{ color: "#FF5800" }}
                />
              ) : (
                <Send className="h-4 w-4" style={{ color: "#FF5800" }} />
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
