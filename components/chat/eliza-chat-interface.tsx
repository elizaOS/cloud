"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Bot, User, Clock, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

export function ElizaChatInterface() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const roomsIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
                  const msgs = (js.messages || []) as { content: { text?: string }; createdAt: number }[];
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

  // Create or restore a room on mount, and start rooms polling
  useEffect(() => {
    const savedRoom = typeof window !== "undefined"
      ? window.localStorage.getItem("elizaRoomId")
      : null;
    if (savedRoom) {
      setRoomId(savedRoom);
      loadMessages(savedRoom);
    } else {
      createRoom();
    }
    loadRooms();
    roomsIntervalRef.current = setInterval(loadRooms, 10000);
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (roomsIntervalRef.current) {
        clearInterval(roomsIntervalRef.current);
      }
    };
  }, [createRoom, loadMessages, loadRooms]);

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
              // Remove temp/thinking placeholders
              const cleaned = prev.filter(
                (m) => !m.id.startsWith("temp-") && !m.id.startsWith("thinking-"),
              );
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

    // Poll every 2 seconds
    pollIntervalRef.current = setInterval(pollMessages, 2000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [roomId, messages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
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
    const tempUserMessage: Message = {
      id: clientMessageId,
      content: { text: messageText, clientMessageId },
      isAgent: false,
      createdAt: Date.now(),
    };
    const thinkingMessage: Message = {
      id: `thinking-${Date.now()}`,
      content: { text: "" },
      isAgent: true,
      createdAt: Date.now() + 1,
    };
    setMessages((prev) => [...prev, tempUserMessage, thinkingMessage]);

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

      // Remove optimistic placeholders; real messages will come via polling
      setMessages((prev) =>
        prev.filter(
          (msg) => msg.id !== tempUserMessage.id && !msg.id.startsWith("thinking-"),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
      console.error("Error sending message:", err);
      // Remove temp and thinking messages on error
      setMessages((prev) =>
        prev.filter((msg) => msg.id !== tempUserMessage.id && !msg.id.startsWith("thinking-")),
      );
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
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center mx-auto shadow-lg">
            <Bot className="h-8 w-8 text-white animate-pulse" />
          </div>
          <div>
            <p className="text-base font-semibold">Initializing Eliza...</p>
            <p className="text-sm text-muted-foreground mt-1">Setting up your conversation space</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full">
      {/* Left Sidebar - Rooms */}
      <div className="hidden md:flex md:flex-col w-80 border-r bg-card/50">
        <div className="border-b p-4 bg-gradient-to-r from-background to-muted/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Conversations</p>
            </div>
            <Button size="sm" variant="ghost" onClick={createRoom}>New</Button>
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
        <ScrollArea className="flex-1">
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
                    <p className="text-xs text-muted-foreground">No conversations yet</p>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 h-full">
        {/* Header */}
        <div className="border-b p-4 bg-gradient-to-r from-background to-muted/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Eliza</h3>
              <p className="text-xs text-muted-foreground">AI Assistant</p>
            </div>
            <Badge variant="secondary" className="ml-auto text-xs">
              {messages.length}
            </Badge>
          </div>
        </div>

        {/* Messages Area */}
        <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
          <div className="space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive bg-destructive/10 p-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {messages.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Start a conversation</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Ask me anything about AI, development, or how elizaOS can help you
                  build intelligent agents.
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
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-sm transition-transform hover:scale-110">
                      <Bot className={`h-5 w-5 text-white ${isThinking ? "animate-pulse" : ""}`} />
                    </div>
                  )}

                  <div
                    className={`rounded-2xl px-4 py-3 max-w-[80%] shadow-sm transform transition-all hover:scale-[1.02] hover:shadow-md ${
                      message.isAgent
                        ? "bg-card border"
                        : "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground"
                    }`}
                  >
                    {isThinking ? (
                      <div className="flex items-center gap-3">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <p className="text-sm text-muted-foreground">Eliza is thinking...</p>
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
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-sm transition-transform hover:scale-110">
                      <User className="h-5 w-5 text-white" />
                    </div>
                  )}
                </div>
              );
            })}

          </div>
        </ScrollArea>

        {/* Input Area */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="border-t p-4 bg-gradient-to-r from-background to-muted/20"
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
                className="w-full rounded-xl border bg-background px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 transition-all"
              />
            </div>
            <Button
              type="submit"
              disabled={isLoading || !roomId || !inputText.trim()}
              className="rounded-xl shadow-sm hover:shadow-md transition-all"
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

