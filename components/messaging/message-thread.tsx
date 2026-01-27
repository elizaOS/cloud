"use client";

import { useEffect, useRef } from "react";
import { MessageBubble, type Message } from "./message-bubble";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Phone, Bot } from "lucide-react";

interface MessageThreadProps {
  phoneNumber: string;
  messages: Message[];
  agentInfo: {
    agentId: string;
    agentPhoneNumber: string;
    provider: string;
  } | null;
  isLoading?: boolean;
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
  isLoading = false,
}: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
    </div>
  );
}
