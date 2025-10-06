"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send } from "lucide-react";

interface Message {
  id: string;
  content: {
    text: string;
  };
  isAgent: boolean;
  createdAt: number;
}

export function ElizaChatInterface() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Generate a unique entity ID for this session
  const entityId = useRef(`user-${Math.random().toString(36).substring(7)}`);

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

      // Load initial messages
      await loadMessages(data.roomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
      console.error("Error creating room:", err);
    } finally {
      setIsInitializing(false);
    }
  }, []);

  // Create a new room on component mount
  useEffect(() => {
    createRoom();
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [createRoom]);

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
              const existingIds = new Set(prev.map((m) => m.id));
              const newMessages = data.messages.filter(
                (m: Message) => !existingIds.has(m.id),
              );
              return [...prev, ...newMessages];
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

  const loadMessages = async (targetRoomId: string) => {
    try {
      const response = await fetch(`/api/eliza/rooms/${targetRoomId}`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error("Error loading messages:", err);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !roomId || isLoading) return;

    const messageText = inputText.trim();
    setInputText("");
    setIsLoading(true);
    setError(null);

    // Optimistically add user message to UI
    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      content: { text: messageText },
      isAgent: false,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    try {
      const response = await fetch(`/api/eliza/rooms/${roomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId: entityId.current,
          text: messageText,
          attachments: [],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const data = await response.json();

      // Replace temp message with real one
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempUserMessage.id ? data.message : msg,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
      console.error("Error sending message:", err);
      // Remove temp message on error
      setMessages((prev) => prev.filter((msg) => msg.id !== tempUserMessage.id));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (isInitializing) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Initializing Eliza...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      <ScrollArea className="flex-1 p-6" ref={scrollAreaRef}>
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && !error && (
            <div className="text-center text-muted-foreground py-12">
              <p className="text-sm">No messages yet. Say hello to Eliza!</p>
            </div>
          )}

          {messages.map((message) => (
            <Card
              key={message.id}
              className={`p-4 ${
                message.isAgent
                  ? "bg-muted ml-0 mr-12"
                  : "bg-primary text-primary-foreground ml-12 mr-0"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-xs font-medium mb-2 opacity-70">
                    {message.isAgent ? "Eliza" : "You"}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">
                    {message.content.text}
                  </p>
                </div>
              </div>
            </Card>
          ))}

          {isLoading && (
            <Card className="p-4 bg-muted ml-0 mr-12">
              <div className="flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                <p className="text-sm text-muted-foreground">
                  Eliza is thinking...
                </p>
              </div>
            </Card>
          )}
        </div>
      </ScrollArea>

      {error && (
        <div className="border-t bg-destructive/10 text-destructive px-6 py-3">
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="border-t p-6">
        <div className="max-w-4xl mx-auto flex gap-3">
          <Input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            disabled={isLoading || !roomId}
            className="flex-1"
          />
          <Button
            onClick={sendMessage}
            disabled={isLoading || !roomId || !inputText.trim()}
            size="icon"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

