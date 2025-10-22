"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { Loader2, Send, Bot, User, Clock, MessageSquare } from "lucide-react";
import { ElizaAvatar } from "./eliza-avatar";

interface Message {
  id: string;
  content: {
    text: string;
    clientMessageId?: string;
  };
  isAgent: boolean;
  createdAt: number;
}

interface RoomItem {
  id: string;
  lastText?: string;
  lastTime?: number;
}

interface AgentInfo {
  id?: string;
  name?: string;
  avatarUrl?: string;
}

export function ElizaChatInterface() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const roomsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const thinkingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Generate a unique entity ID for this session
  const entityId = useRef<string>("");
  if (!entityId.current && typeof window !== "undefined") {
    const saved = window.localStorage.getItem("elizaEntityId");
    if (saved) {
      entityId.current = saved;
    } else {
      entityId.current = `user-${Math.random().toString(36).substring(7)}`;
      window.localStorage.setItem("elizaEntityId", entityId.current);
    }
  }

  const loadRooms = useCallback(async () => {
    setIsLoadingRooms(true);
    try {
      const params = new URLSearchParams({ entityId: entityId.current });
      const res = await fetch(`/api/eliza/rooms?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.rooms)) {
          const list = data.rooms.slice(0, 12) as { id: string }[];
          // Fetch last message preview per room (best-effort)
          const enriched: RoomItem[] = await Promise.all(
            list.map(async (r) => {
              try {
                const resp = await fetch(
                  `/api/eliza/rooms/${r.id}/messages?limit=1`,
                );
                if (resp.ok) {
                  const js = await resp.json();
                  const msgs = (js.messages || []) as {
                    content: { text?: string };
                    createdAt: number;
                  }[];
                  const last = msgs[msgs.length - 1];
                  return {
                    id: r.id,
                    lastText: last?.content?.text || "",
                    lastTime: last?.createdAt || 0,
                  } as RoomItem;
                }
              } catch {}
              return { id: r.id } as RoomItem;
            }),
          );
          setRooms(enriched);
        }
      }
    } catch {
      // non-fatal
    } finally {
      setIsLoadingRooms(false);
    }
  }, []);

  const loadMessages = useCallback(async (targetRoomId: string) => {
    try {
      const response = await fetch(`/api/eliza/rooms/${targetRoomId}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
        if (data.agent) {
          setAgentInfo(data.agent);
        }
      }
    } catch (err) {
      console.error("Error loading messages:", err);
    }
  }, []);

  const createRoom = useCallback(async () => {
    setIsInitializing(true);
    setError(null);
    try {
      const response = await fetch("/api/eliza/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId: entityId.current }),
      });

      if (!response.ok) {
        throw new Error("Failed to create room");
      }

      const data = await response.json();
      setRoomId(data.roomId);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("elizaRoomId", data.roomId);
      }

      // Load initial messages
      await loadMessages(data.roomId);
      await loadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
      console.error("Error creating room:", err);
    } finally {
      setIsInitializing(false);
    }
  }, [loadMessages, loadRooms]);

  // Initialize room: restore saved room or use most recent existing room
  useEffect(() => {
    const initializeRoom = async () => {
      // First check for saved room in localStorage
      const savedRoom =
        typeof window !== "undefined"
          ? window.localStorage.getItem("elizaRoomId")
          : null;

      if (savedRoom) {
        setRoomId(savedRoom);
        loadMessages(savedRoom);
        await loadRooms();
      } else {
        // No saved room - check if user has any existing rooms
        try {
          const params = new URLSearchParams({ entityId: entityId.current });
          const res = await fetch(`/api/eliza/rooms?${params.toString()}`);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.rooms) && data.rooms.length > 0) {
              // Use the most recent existing room
              const mostRecentRoom = data.rooms[0];
              setRoomId(mostRecentRoom.id);
              if (typeof window !== "undefined") {
                window.localStorage.setItem("elizaRoomId", mostRecentRoom.id);
              }
              loadMessages(mostRecentRoom.id);
              await loadRooms();
            } else {
              // No existing rooms - create a new one
              await createRoom();
            }
          } else {
            // Failed to get rooms - create a new one
            await createRoom();
          }
        } catch {
          // Error checking rooms - create a new one
          await createRoom();
        }
      }
    };

    initializeRoom();
    roomsIntervalRef.current = setInterval(loadRooms, 10000);
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (roomsIntervalRef.current) {
        clearInterval(roomsIntervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll for new messages
  useEffect(() => {
    if (!roomId) return;

    const pollMessages = async () => {
      try {
        const lastTimestamp =
          messages.length > 0
            ? Math.max(...messages.map((m) => m.createdAt))
            : 0;

        const response = await fetch(
          `/api/eliza/rooms/${roomId}/messages?afterTimestamp=${lastTimestamp}`,
        );

        if (response.ok) {
          const data = await response.json();
          if (data.messages && data.messages.length > 0) {
            setMessages((prev) => {
              // Check if any new message is from the agent
              const hasAgentResponse = (data.messages as Message[]).some(
                (msg) => msg.isAgent,
              );

              // Only remove thinking placeholder if we have an agent response
              const cleaned = prev.filter((m) => {
                if (m.id.startsWith("temp-")) return false; // Always remove temp user messages
                if (m.id.startsWith("thinking-") && hasAgentResponse) {
                  // Clear the thinking timeout since we got a response
                  if (thinkingTimeoutRef.current) {
                    clearTimeout(thinkingTimeoutRef.current);
                    thinkingTimeoutRef.current = null;
                  }
                  return false; // Remove thinking only if agent responded
                }
                return true;
              });

              const byId = new Map<string, Message>();
              for (const m of cleaned) byId.set(m.id, m);
              for (const incoming of data.messages as Message[]) {
                byId.set(incoming.id, incoming);
              }
              const merged = Array.from(byId.values());
              merged.sort((a, b) => a.createdAt - b.createdAt);
              return merged;
            });
          }
        }
      } catch (err) {
        console.error("Error polling messages:", err);
      }
    };

    // Check if there's a thinking message - if so, poll faster
    const hasThinkingMessage = messages.some((m) =>
      m.id.startsWith("thinking-"),
    );
    const pollInterval = hasThinkingMessage ? 500 : 2000; // 500ms when thinking, 2s otherwise

    pollIntervalRef.current = setInterval(pollMessages, pollInterval);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [roomId, messages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollViewportRef.current) {
      scrollViewportRef.current.scrollTop = scrollViewportRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!inputText.trim() || !roomId || isLoading) return;

    const messageText = inputText.trim();
    setInputText("");
    setIsLoading(true);
    setError(null);

    // Add optimistic user message and thinking placeholder in one atomic update
    const clientMessageId = `temp-${Date.now()}`;
    const now = Date.now();
    const tempUserMessage: Message = {
      id: clientMessageId,
      content: { text: messageText, clientMessageId },
      isAgent: false,
      createdAt: now,
    };
    const thinkingMessage: Message = {
      id: `thinking-${now}`,
      content: { text: "" },
      isAgent: true,
      createdAt: now + 999999, // Very high timestamp to ensure it always appears last
    };
    setMessages((prev) => [...prev, tempUserMessage, thinkingMessage]);

    // Safety timeout: remove thinking indicator after 30 seconds if no response
    thinkingTimeoutRef.current = setTimeout(() => {
      setMessages((prev) => prev.filter((m) => !m.id.startsWith("thinking-")));
      console.warn(
        "[Chat] Thinking indicator timeout - agent took too long to respond",
      );
    }, 30000);

    try {
      const response = await fetch(`/api/eliza/rooms/${roomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId: entityId.current,
          text: messageText,
          clientMessageId,
          attachments: [],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      // Remove only the temp user message; keep thinking indicator until real response arrives via polling
      setMessages((prev) =>
        prev.filter((msg) => msg.id !== tempUserMessage.id),
      );

      // Trigger immediate poll to catch response faster
      setTimeout(async () => {
        try {
          const lastTimestamp =
            messages.length > 0
              ? Math.max(...messages.map((m) => m.createdAt))
              : 0;
          const pollResponse = await fetch(
            `/api/eliza/rooms/${roomId}/messages?afterTimestamp=${lastTimestamp}`,
          );
          if (pollResponse.ok) {
            const data = await pollResponse.json();
            if (data.messages && data.messages.length > 0) {
              setMessages((prev) => {
                // Check if any new message is from the agent
                const hasAgentResponse = (data.messages as Message[]).some(
                  (msg) => msg.isAgent,
                );

                // Only remove thinking placeholder if we have an agent response
                const cleaned = prev.filter((m) => {
                  if (m.id.startsWith("temp-")) return false;
                  if (m.id.startsWith("thinking-") && hasAgentResponse) {
                    // Clear the thinking timeout since we got a response
                    if (thinkingTimeoutRef.current) {
                      clearTimeout(thinkingTimeoutRef.current);
                      thinkingTimeoutRef.current = null;
                    }
                    return false;
                  }
                  return true;
                });

                const byId = new Map<string, Message>();
                for (const m of cleaned) byId.set(m.id, m);
                for (const incoming of data.messages as Message[]) {
                  byId.set(incoming.id, incoming);
                }
                const merged = Array.from(byId.values());
                merged.sort((a, b) => a.createdAt - b.createdAt);
                return merged;
              });
            }
          }
        } catch (pollErr) {
          console.error("Error in immediate poll:", pollErr);
        }
      }, 100); // Poll after 100ms
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
      console.error("Error sending message:", err);
      // Remove temp and thinking messages on error
      setMessages((prev) =>
        prev.filter(
          (msg) =>
            msg.id !== tempUserMessage.id && !msg.id.startsWith("thinking-"),
        ),
      );
      // Clear thinking timeout on error
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current);
        thinkingTimeoutRef.current = null;
      }
    } finally {
      setIsLoading(false);
      loadRooms();
    }
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

  if (isInitializing) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-center space-y-3">
          <ElizaAvatar
            avatarUrl="https://raw.githubusercontent.com/elizaOS/eliza-avatars/refs/heads/master/Eliza/portrait.png"
            className="w-16 h-16 mx-auto shadow-lg"
            iconClassName="h-8 w-8"
            animate={true}
          />
          <div>
            <p className="text-base font-semibold">Initializing Eliza...</p>
            <p className="text-sm text-muted-foreground mt-1">
              Setting up your conversation space
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full">
      {/* Left Sidebar - Rooms */}
      <div className="hidden md:flex md:flex-col w-80 border-r bg-card/50">
        <div className="border-b p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Conversations</p>
            </div>
            <Button size="sm" variant="ghost" onClick={createRoom}>
              New
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={loadRooms}
            className="w-full text-xs"
          >
            Refresh
          </Button>
        </div>
        <ScrollAreaPrimitive.Root className="flex-1 overflow-hidden">
          <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
            <div className="p-2 space-y-1">
              {isLoadingRooms && rooms.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {rooms.map((r) => (
                    <button
                      key={r.id}
                      className={`w-full rounded-lg px-3 py-3 text-left transition-all hover:bg-accent/50 ${
                        r.id === roomId ? "bg-accent" : ""
                      }`}
                      onClick={() => {
                        setRoomId(r.id);
                        if (typeof window !== "undefined") {
                          window.localStorage.setItem("elizaRoomId", r.id);
                        }
                        setMessages([]);
                        loadMessages(r.id);
                      }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-xs font-semibold truncate flex-1">
                          Room {r.id.substring(0, 8)}...
                        </div>
                        {r.lastTime ? (
                          <div className="text-[10px] text-muted-foreground whitespace-nowrap ml-2">
                            {formatTimestamp(r.lastTime)}
                          </div>
                        ) : null}
                      </div>
                      {r.lastText && (
                        <div className="text-xs text-muted-foreground truncate">
                          {r.lastText}
                        </div>
                      )}
                    </button>
                  ))}
                  {rooms.length === 0 && !isLoadingRooms && (
                    <div className="px-3 py-8 text-center">
                      <p className="text-xs text-muted-foreground">
                        No conversations yet
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollAreaPrimitive.Viewport>
          <ScrollAreaPrimitive.ScrollAreaScrollbar
            orientation="vertical"
            className="flex touch-none p-px transition-colors select-none h-full w-2.5 border-l border-l-transparent"
          >
            <ScrollAreaPrimitive.ScrollAreaThumb className="bg-border relative flex-1 rounded-full" />
          </ScrollAreaPrimitive.ScrollAreaScrollbar>
          <ScrollAreaPrimitive.Corner />
        </ScrollAreaPrimitive.Root>
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 h-full">
        {/* Header */}
        <div className="border-b p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Eliza</h3>
              <p className="text-xs text-muted-foreground">AI Assistant</p>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <ScrollAreaPrimitive.Root className="flex-1 overflow-hidden" ref={scrollAreaRef}>
          <ScrollAreaPrimitive.Viewport 
            className="h-full w-full rounded-[inherit]" 
            ref={scrollViewportRef}
          >
            <div className="p-4 space-y-4">
              {error && (
                <div className="rounded-lg border border-destructive bg-destructive/10 p-3">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}

              {messages.length === 0 && !error && (
                <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
                  <ElizaAvatar
                    avatarUrl={agentInfo?.avatarUrl}
                    name={agentInfo?.name}
                    className="h-12 w-12 mb-4"
                    fallbackClassName="bg-muted"
                    iconClassName="h-6 w-6 text-muted-foreground"
                  />
                  <h3 className="text-lg font-semibold mb-2">
                    Start a conversation
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Ask me anything about AI, development, or how elizaOS can help
                    you build intelligent agents.
                  </p>
                </div>
              )}

              {messages.map((message, index) => {
                const isThinking = message.id.startsWith("thinking-");
                return (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.isAgent ? "justify-start" : "justify-end"
                    } animate-in fade-in slide-in-from-bottom-4 duration-500`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {message.isAgent && (
                      <ElizaAvatar
                        avatarUrl={agentInfo?.avatarUrl}
                        name={agentInfo?.name}
                        className="flex-shrink-0 w-9 h-9"
                        iconClassName="h-5 w-5"
                        animate={isThinking}
                      />
                    )}

                    <div
                      className={`rounded-2xl px-4 py-3 max-w-[80%] ${
                        message.isAgent
                          ? "bg-card border"
                          : "bg-primary text-primary-foreground"
                      }`}
                    >
                      {isThinking ? (
                        <div className="flex items-center gap-3">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <p className="text-sm text-muted-foreground">
                            Eliza is thinking...
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="text-sm whitespace-pre-wrap mb-2">
                            {message.content.text}
                          </div>
                          <div
                            className={`flex items-center gap-2 text-xs mt-2 pt-2 border-t ${
                              message.isAgent
                                ? "border-border text-muted-foreground"
                                : "border-primary-foreground/20 text-primary-foreground/80"
                            }`}
                          >
                            <Clock className="h-3 w-3" />
                            <span>{formatTimestamp(message.createdAt)}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {!message.isAgent && (
                      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary flex items-center justify-center">
                        <User className="h-5 w-5 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollAreaPrimitive.Viewport>
          <ScrollAreaPrimitive.ScrollAreaScrollbar
            orientation="vertical"
            className="flex touch-none p-px transition-colors select-none h-full w-2.5 border-l border-l-transparent"
          >
            <ScrollAreaPrimitive.ScrollAreaThumb className="bg-border relative flex-1 rounded-full" />
          </ScrollAreaPrimitive.ScrollAreaScrollbar>
          <ScrollAreaPrimitive.Corner />
        </ScrollAreaPrimitive.Root>

        {/* Input Area */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="border-t p-4"
        >
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                value={inputText}
                onChange={(e) => setInputText(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Type your message..."
                disabled={isLoading || !roomId}
                className="w-full rounded-lg border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
            </div>
            <Button
              type="submit"
              disabled={isLoading || !roomId || !inputText.trim()}
              size="lg"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
