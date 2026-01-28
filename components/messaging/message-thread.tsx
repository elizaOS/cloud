"use client";

import { useEffect, useRef, useState } from "react";
import { MessageBubble, type Message } from "./message-bubble";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, Phone, Bot, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface MessageThreadProps {
  phoneNumber: string;
  messages: Message[];
  agentInfo: {
    agentId: string;
    agentPhoneNumber: string;
    provider: string;
  } | null;
  phoneNumberId?: string;
  isLoading?: boolean;
  onMessageSent?: () => void;
}

function ThreadSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Inbound message skeleton */}
      <div className="flex flex-col gap-1 max-w-[80%]">
        <Skeleton className="h-12 w-48 rounded-2xl rounded-bl-sm" />
        <Skeleton className="h-3 w-20" />
      </div>
      {/* Outbound message skeleton */}
      <div className="flex flex-col gap-1 max-w-[80%] items-end ml-auto">
        <Skeleton className="h-16 w-56 rounded-2xl rounded-br-sm" />
        <Skeleton className="h-3 w-24" />
      </div>
      {/* More skeletons */}
      <div className="flex flex-col gap-1 max-w-[80%]">
        <Skeleton className="h-10 w-40 rounded-2xl rounded-bl-sm" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

export function MessageThread({
  phoneNumber,
  messages,
  agentInfo,
  phoneNumberId,
  isLoading = false,
  onMessageSent,
}: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [messageInput, setMessageInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Send message handler
  const handleSendMessage = async () => {
    if (!messageInput.trim() || !phoneNumber || isSending) return;

    setIsSending(true);
    try {
      const response = await fetch("/api/v1/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: phoneNumber,
          body: messageInput.trim(),
          phoneNumberId,
          provider: agentInfo?.provider,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send message");
      }

      toast.success("Message sent!");
      setMessageInput("");
      onMessageSent?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  // Handle Enter key to send
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        {/* Header skeleton */}
        <div className="border-b p-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24 mt-1" />
        </div>
        <ThreadSkeleton />
      </div>
    );
  }

  if (!phoneNumber) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <MessageSquare className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground">
          Select a conversation
        </h3>
        <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
          Choose a conversation from the list to view the message history.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="thread-view">
      {/* Thread header */}
      <div className="border-b p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Phone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">{phoneNumber}</h2>
              {agentInfo && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Bot className="h-3 w-3" />
                  <span>Agent: {agentInfo.agentPhoneNumber}</span>
                  <Badge variant="outline" className="text-xs px-1.5 py-0">
                    {agentInfo.provider === "twilio" ? "SMS" : "iMessage"}
                  </Badge>
                </div>
              )}
            </div>
          </div>
          <Badge variant="secondary">
            {messages.length} message{messages.length !== 1 ? "s" : ""}
          </Badge>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="flex flex-col gap-4 p-4" data-testid="message-list">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <p>No messages in this conversation yet.</p>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                agentPhoneNumber={agentInfo?.agentPhoneNumber}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Message Input */}
      <div className="border-t p-4 bg-background">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Type a message..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSending || !agentInfo}
            className="flex-1"
            data-testid="message-input"
          />
          <Button
            onClick={handleSendMessage}
            disabled={isSending || !messageInput.trim() || !agentInfo}
            size="icon"
            data-testid="send-button"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        {!agentInfo && phoneNumber && (
          <p className="text-xs text-muted-foreground mt-2">
            No agent phone number available. Please set up a phone number in Settings.
          </p>
        )}
      </div>
    </div>
  );
}
