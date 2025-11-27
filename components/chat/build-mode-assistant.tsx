"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, Loader2, Copy, Check } from "lucide-react";
import type { ElizaCharacter } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AgentMode } from "@/lib/eliza/agent-mode-types";
import {
  createConversationAction, 
  listUserConversationsAction 
} from "@/app/actions/conversations";

interface BuildModeAssistantProps {
  character: ElizaCharacter;
  onCharacterUpdate: (updates: Partial<ElizaCharacter>) => void;
  onCharacterRefresh?: () => Promise<void>; // Callback to refresh full character from DB
  userId: string; // Need userId for ElizaOS messages
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export function BuildModeAssistant({
  character,
  onCharacterUpdate,
  onCharacterRefresh,
  userId,
}: BuildModeAssistantProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [inputText, setInputText] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [builderRoomId, setBuilderRoomId] = useState<string>("");
  
  const [quickPrompts] = useState<string[]>([
    "Add personality traits",
    "Improve the bio",
    "Add conversation examples",
    "Refine writing style",
  ]);

  // Determine if this is an existing character
  const isEditMode = !!(character.name && character.bio);

  // Create builder room ID (consistent per character)
  // Each user-character combo gets its own build room
  useEffect(() => {
    const initializeBuilderRoom = async () => {
      if (!userId || !character.id) return;

      // Clear messages when switching characters
      setMessages([]);

      try {
        // The title used to identify builder rooms - MUST include character ID for uniqueness
        const builderTitle = `[BUILD] ${character.name || "New Character"} (${character.id})`;
        
        // Try to find existing builder room by matching the character ID in title
        const { success, conversations } = await listUserConversationsAction();
        
        if (success && conversations) {
          // Look for existing build room for THIS specific character
          // Match either the full title or just the pattern with character ID
          const existingRoom = conversations.find(
            (conv) => 
              conv.title === builderTitle || 
              conv.title.includes(`[BUILD]`) && conv.title.includes(`(${character.id})`)
          );
          
          if (existingRoom) {
            setBuilderRoomId(existingRoom.id);
            return;
          }
        }
        
        // Create new builder room for this specific character
        const { success: createSuccess, conversation } = await createConversationAction({
          title: builderTitle,
          model: "gpt-4o", // Default model for builder
        });
        
        if (createSuccess && conversation) {
          setBuilderRoomId(conversation.id);
        } else {
          toast.error("Failed to create builder room");
        }
      } catch (error) {
        console.error("Error initializing builder room:", error);
        toast.error("Failed to initialize build mode");
      }
    };
    
    initializeBuilderRoom();
  }, [character.id, userId]);

  // Load persisted messages when room is initialized
  useEffect(() => {
    const loadMessages = async () => {
      if (!builderRoomId) return;

      try {
        const response = await fetch(`/api/eliza/rooms/${builderRoomId}`);
        
        if (response.ok) {
          const data = await response.json();
          const loadedMessages = data.messages || [];

          console.log("#### LOADED MESSAGES loadedMessages", loadedMessages);
          
          // Convert Eliza messages to our Message format
          // The API returns messages with isAgent boolean and content as an object with source field
          const convertedMessages: Message[] = loadedMessages
            .map((msg: {
              id: string;
              content: { text?: string; source?: string; metadata?: { type?: string } };
              createdAt: number;
              isAgent: boolean;
            }) => {
              // Skip messages without text content
              const text = msg.content?.text;
              if (!text || typeof text !== "string") {
                return null;
              }

              // Skip action result messages - these are internal and shouldn't be shown in UI
              if (msg.content?.metadata?.type === "action_result") {
                return null;
              }

              // Determine role: prioritize 'source' field, fallback to isAgent
              // source can be: 'user', 'agent', 'action'
              const source = msg.content?.source;
              const isAgentMessage = source === 'agent' || source === 'action' || (source === undefined && msg.isAgent);

              return {
                id: msg.id,
                role: isAgentMessage ? ("assistant" as const) : ("user" as const),
                content: text,
                timestamp: msg.createdAt,
              };
            })
            .filter((msg: Message | null): msg is Message => msg !== null);
          
          if (convertedMessages.length > 0) {
            setMessages(convertedMessages);
          }
        }
      } catch (error) {
        console.error("[BuildMode] Error loading messages:", error);
      }
    };

    loadMessages();
  }, [builderRoomId]);

  // Set initial welcome message (only if no messages loaded)
  // We use a ref to track if we've ever loaded messages to avoid race conditions
  const hasLoadedMessagesRef = useRef(false);

  useEffect(() => {
    if (messages.length > 0) {
      hasLoadedMessagesRef.current = true;
    }
  }, [messages.length]);

  useEffect(() => {
    // Only show welcome message if:
    // 1. We have a builderRoomId (room is initialized)
    // 2. We have no messages
    // 3. We haven't loaded messages yet (avoids race condition where welcome shows before load completes)
    if (builderRoomId && messages.length === 0 && !hasLoadedMessagesRef.current) {
      // Small delay to let message loading complete first
      const timer = setTimeout(() => {
        // Double-check messages are still empty after delay
        if (messages.length === 0) {
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
              content: welcomeText,
              timestamp: Date.now(),
            },
          ]);
          hasLoadedMessagesRef.current = true;
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [builderRoomId, messages.length, isEditMode]);

  // Send message to ElizaOS stream endpoint with BUILD workflow
  const sendElizaMessage = async (text: string) => {
    if (!text.trim() || !builderRoomId) return;

    setIsLoading(true);

    // Add user message to UI immediately
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const response = await fetch(`/api/eliza/rooms/${builderRoomId}/messages/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: builderRoomId,
          entityId: userId,
          text,
          agentMode: {
            mode: AgentMode.BUILD,
            metadata: {
              targetCharacterId: character.id,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";
      let assistantMessageId = "";

      if (reader) {
        let buffer = "";
        let detectedApplyAction = false;
        let proposedCharacterUpdate: Partial<ElizaCharacter> | null = null;
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          
          // Split by double newline (SSE event separator)
          const events = buffer.split("\n\n");
          // Keep the last incomplete event in the buffer
          buffer = events.pop() || "";

          for (const eventBlock of events) {
            if (!eventBlock.trim()) continue;
            
            const lines = eventBlock.split("\n");
            let eventType = "";
            let eventData = "";
            
            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                eventData = line.slice(6);
              }
            }
            
            if (eventData) {
              try {
                const data = JSON.parse(eventData);
                
                // Handle agent message
                if (data.type === "agent" && data.content?.text) {
                  // Skip action result messages - these are internal and shouldn't be shown in UI
                  if (data.content?.metadata?.type === "action_result") {
                    // Still check for apply action even if we don't display the message
                    if (data.content?.actions && Array.isArray(data.content.actions)) {
                      if (data.content.actions.includes('APPLY_CHARACTER_CHANGES')) {
                        detectedApplyAction = true;
                      }
                    }
                    continue; // Skip adding this to the UI
                  }
                  
                  assistantMessage = data.content.text;
                  assistantMessageId = data.id;
                  
                  // Check if this message contains the APPLY_CHARACTER_CHANGES action
                  if (data.content?.actions && Array.isArray(data.content.actions)) {
                    if (data.content.actions.includes('APPLY_CHARACTER_CHANGES')) {
                      detectedApplyAction = true;
                    }
                  }

                  // Check if this message contains PROPOSE_CHARACTER_CHANGES with updatedCharacter
                  if (data.content?.metadata?.action === 'PROPOSE_CHARACTER_CHANGES' && 
                      data.content?.metadata?.updatedCharacter) {
                    proposedCharacterUpdate = data.content.metadata.updatedCharacter;
                  }
                }
              } catch (e) {
                console.warn("[BuildMode SSE] Failed to parse JSON:", eventData.substring(0, 100));
              }
            }
            
            // Handle done event
            if (eventType === "done") {
              if (assistantMessage) {
                const newAssistantMessage: Message = {
                  id: assistantMessageId || `assistant-${Date.now()}`,
                  role: "assistant",
                  content: assistantMessage,
                  timestamp: Date.now(),
                };
                setMessages((prev) => [...prev, newAssistantMessage]);
                
                // If we received a character update proposal, apply it immediately to the editor
                if (proposedCharacterUpdate) {
                  onCharacterUpdate(proposedCharacterUpdate);
                  toast.success("Character preview updated! Review the changes in the editor.", {
                    duration: 4000,
                  });
                }
                
                // If we detected an apply action, refresh the character data from DB
                if (detectedApplyAction && onCharacterRefresh) {
                  toast.success("Character saved! Refreshing data...", {
                    duration: 3000,
                  });
                  await onCharacterRefresh();
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message");
    } finally {
      setIsLoading(false);
    }
  };

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
  }, [messages, scrollToBottom]);

  // Additional scroll after a delay to handle late-loading content
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom();
    }, 100);
    return () => clearTimeout(timer);
  }, [messages, scrollToBottom]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;

    const userMessage = inputText;
    setInputText("");
    await sendElizaMessage(userMessage);
  };

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
              const content = message.content;
              const isAgent = message.role === "assistant";

              return (
                <div
                  key={message.id}
                  className={`flex ${
                    isAgent ? "justify-start" : "justify-end"
                  } animate-in fade-in slide-in-from-bottom-4 duration-500`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {isAgent ? (
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
                          {character.name || "Build Assistant"}
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        {/* Message Text */}
                        <div
                          className="py-2 rounded-none font-[family-name:var(--font-roboto-flex)] text-[16px] leading-[1.5]"
                          style={{ fontWeight: 500 }}
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
                          <div className="whitespace-pre-wrap text-white">
                            <div className="json-syntax prose prose-sm max-w-none dark:prose-invert overflow-hidden">
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
                        <div className="flex items-center gap-2">
                          <span
                            className="text-sm font-[family-name:var(--font-roboto-mono)]"
                            style={{ color: "#A1A1AA" }}
                          >
                            {formatTimestamp(message.timestamp)}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0 hover:bg-white/10"
                            onClick={() => copyToClipboard(content, message.id)}
                            title="Copy message"
                          >
                            {copiedMessageId === message.id ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3 text-white/60" />
                            )}
                          </Button>
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
                      {/* Time and Actions */}
                      <div className="flex items-center gap-2 justify-end px-1">
                        <span
                          className="text-sm font-[family-name:var(--font-roboto-mono)]"
                          style={{ color: "#A1A1AA" }}
                        >
                          {formatTimestamp(message.timestamp)}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 w-5 p-0 hover:bg-white/10"
                          onClick={() => copyToClipboard(content, message.id)}
                          title="Copy message"
                        >
                          {copiedMessageId === message.id ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3 text-white/60" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {isLoading && (
              <div className="flex justify-start animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex flex-col gap-1 max-w-[70%]">
                  <div className="flex items-center gap-2">
                    <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#FF5800]">
                      <Bot className="h-3 w-3 animate-pulse text-white" />
                    </div>
                    <div
                      className="font-[family-name:var(--font-roboto-flex)] text-sm font-medium"
                      style={{ color: "#A1A1AA" }}
                    >
                      {character.name || "Build Assistant"}
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
            {/* Robot Eye Visor Scanner - Animated line on top edge with randomness - Only show when waiting for agent */}
            {isLoading && (
              <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden pointer-events-none z-10">
                {/* Primary scanner */}
                <div
                  className="absolute h-full w-24 bg-gradient-to-r from-transparent via-[#FF5800] to-transparent"
                  style={{
                    animation:
                      "visor-scan 4.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                    boxShadow: "0 0 15px 3px rgba(255, 88, 0, 0.7)",
                    filter: "blur(0.5px)",
                  }}
                />
                {/* Secondary scanner for organic feel */}
                <div
                  className="absolute h-full w-16 bg-gradient-to-r from-transparent via-[#FF5800]/60 to-transparent"
                  style={{
                    animation:
                      "visor-scan-delayed 6.2s cubic-bezier(0.3, 0.1, 0.7, 0.9) infinite 1.5s",
                    boxShadow: "0 0 10px 2px rgba(255, 88, 0, 0.5)",
                    filter: "blur(1px)",
                  }}
                />
              </div>
            )}
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
