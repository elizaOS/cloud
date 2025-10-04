"use client";

import { useState, useEffect, useRef } from "react";
import { useChat, type UIMessage } from "@ai-sdk/react";
import type { Conversation, ConversationMessage } from "@/lib/types";
import { Send, Loader2, Bot, User, Clock, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createConversationAction } from "@/app/actions/conversations";
import { cn } from "@/lib/utils";

interface ChatInterfaceWithPersistenceProps {
  conversation?: Conversation | null;
  initialMessages?: ConversationMessage[];
  onConversationCreated?: (conversation: Conversation) => void;
}

export function ChatInterfaceWithPersistence({
  conversation,
  initialMessages = [],
  onConversationCreated,
}: ChatInterfaceWithPersistenceProps) {
  const [input, setInput] = useState("");
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [availableModels, setAvailableModels] = useState<
    { id: string; name: string; provider?: string }[]
  >([]);
  const [selectedModel, setSelectedModel] = useState(
    conversation?.model || "gpt-4o",
  );
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(conversation?.id || null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  const messageTimestamps = useRef<Map<string, Date>>(new Map());

  const { messages, sendMessage, status, setMessages } = useChat({
    id: selectedModel,
  });

  useEffect(() => {
    fetch("/api/v1/models")
      .then((res) => res.json())
      .then((data) => {
        if (data.models) {
          setAvailableModels(data.models);
        }
      })
      .catch((err) => console.error("Failed to fetch models:", err));
  }, []);

  useEffect(() => {
    const conversationId = conversation?.id || null;
    const hasConversationChanged = conversationId !== activeConversationId;

    if (isFirstRender.current) {
      isFirstRender.current = false;
      setActiveConversationId(conversationId);

      if (initialMessages.length > 0) {
        initialMessages.forEach((msg) => {
          messageTimestamps.current.set(msg.id, new Date(msg.created_at));
        });

        const formattedMessages: UIMessage[] = initialMessages.map((msg) => ({
          id: msg.id,
          role: msg.role as "user" | "assistant",
          parts: [{ type: "text", text: msg.content }],
        }));
        setMessages(formattedMessages);
      }
      return;
    }

    if (hasConversationChanged) {
      setActiveConversationId(conversationId);
      messageTimestamps.current.clear();

      if (initialMessages.length > 0) {
        initialMessages.forEach((msg) => {
          messageTimestamps.current.set(msg.id, new Date(msg.created_at));
        });

        const formattedMessages: UIMessage[] = initialMessages.map((msg) => ({
          id: msg.id,
          role: msg.role as "user" | "assistant",
          parts: [{ type: "text", text: msg.content }],
        }));
        setMessages(formattedMessages);
      } else {
        setMessages([]);
      }
    }
  }, [conversation?.id, initialMessages, setMessages, activeConversationId]);

  useEffect(() => {
    messages.forEach((msg) => {
      if (!messageTimestamps.current.has(msg.id)) {
        messageTimestamps.current.set(msg.id, new Date());
      }
    });
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isCreatingConversation) return;

    let conversationId = conversation?.id;

    if (!conversationId) {
      setIsCreatingConversation(true);
      try {
        const result = await createConversationAction({
          title: "New Conversation",
          model: selectedModel,
        });

        if (!result.success || !result.conversation) {
          console.error("Failed to create conversation");
          setIsCreatingConversation(false);
          return;
        }

        conversationId = result.conversation.id;
        setActiveConversationId(conversationId);

        if (onConversationCreated) {
          onConversationCreated(result.conversation);
        }
      } catch (error) {
        console.error("Error creating conversation:", error);
        setIsCreatingConversation(false);
        return;
      } finally {
        setIsCreatingConversation(false);
      }
    }

    const messageText = input;
    setInput("");

    sendMessage({
      text: messageText,
      metadata: { conversationId },
    });
  };

  const isLoading = status === "streaming" || isCreatingConversation;
  const lastMessage =
    messages.length > 0 ? messages[messages.length - 1] : null;
  const isWaitingForResponse =
    lastMessage?.role === "user" && status === "submitted";

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();

    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return timeStr;
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();
    if (isYesterday) {
      return `Yesterday, ${timeStr}`;
    }

    const isSameYear = date.getFullYear() === now.getFullYear();
    const dateStr = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(isSameYear ? {} : { year: "numeric" }),
    });

    return `${dateStr}, ${timeStr}`;
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background/60">
      <div className="flex flex-col gap-4 border-b bg-card/80 px-6 py-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              {conversation?.title || "New Conversation"}
            </h3>
            <p className="text-xs text-muted-foreground">Powered by ElizaOS</p>
          </div>
        </div>

        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowModelSelector(!showModelSelector)}
            className="flex items-center gap-2 rounded-full border-border/60 bg-background/80 px-4 py-2 text-xs font-medium shadow-sm transition hover:bg-background"
          >
            <Settings className="h-4 w-4" />
            <span className="truncate">{selectedModel}</span>
            <Badge
              variant="secondary"
              className="rounded-full px-2 py-0 text-[10px]"
            >
              {messages.length}
            </Badge>
          </Button>

          {showModelSelector && availableModels.length > 0 && (
            <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-border/60 bg-popover shadow-xl">
              <div className="border-b bg-muted/40 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Select model
                </p>
              </div>
              <div className="max-h-64 overflow-y-auto px-2 py-2">
                {availableModels.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      setSelectedModel(model.id);
                      setShowModelSelector(false);
                    }}
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      selectedModel === model.id
                        ? "bg-muted text-foreground"
                        : "hover:bg-muted/60",
                    )}
                  >
                    <div className="font-medium">{model.name}</div>
                    {model.provider && (
                      <div className="text-xs text-muted-foreground">
                        {model.provider}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        {!conversation && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <Bot className="h-12 w-12 text-muted-foreground/80" />
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-foreground">
                Start a new conversation
              </h3>
              <p className="text-sm text-muted-foreground">
                Type your message below to begin. A new conversation will be
                created automatically.
              </p>
            </div>
          </div>
        )}

        {conversation && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <Bot className="h-12 w-12 text-muted-foreground/80" />
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-foreground">
                Start a conversation
              </h3>
              <p className="text-sm text-muted-foreground">
                Ask anything about AI, development, or how ElizaOS can help you
                build intelligent agents.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3",
                message.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              {message.role === "assistant" && (
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground shadow-sm">
                  <Bot className="h-5 w-5" />
                </div>
              )}

              <div
                className={cn(
                  "max-w-[min(760px,82%)] rounded-2xl border px-4 py-3 text-sm leading-relaxed shadow-sm",
                  message.role === "user"
                    ? "border-primary/40 bg-primary text-primary-foreground"
                    : "border-border bg-background",
                )}
              >
                <div className="whitespace-pre-wrap">
                  {message.parts.map((part, i) => {
                    switch (part.type) {
                      case "text":
                        return (
                          <div key={`${message.id}-${i}`}>{part.text}</div>
                        );
                      default:
                        return null;
                    }
                  })}
                </div>

                <div
                  className={cn(
                    "mt-3 flex items-center gap-2 text-xs",
                    message.role === "user"
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground",
                  )}
                >
                  <Clock className="h-3 w-3" />
                  <span>
                    {formatTimestamp(
                      messageTimestamps.current.get(message.id)?.getTime() ||
                        Date.now(),
                    )}
                  </span>
                </div>
              </div>

              {message.role === "user" && (
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary shadow-sm">
                  <User className="h-5 w-5" />
                </div>
              )}
            </div>
          ))}

          {isWaitingForResponse && (
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
              <div className="max-w-[min(760px,82%)] rounded-2xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground shadow-sm">
                Eliza Agent is thinking
              </div>
            </div>
          )}
        </div>

        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t bg-card/80 px-6 py-4 backdrop-blur-sm"
      >
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              placeholder={
                conversation
                  ? "Type your message…"
                  : "Type your message to start a new conversation…"
              }
              disabled={isLoading}
              className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="h-11 rounded-xl px-5 font-medium shadow-sm transition hover:shadow-md"
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
  );
}
