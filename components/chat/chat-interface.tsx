"use client";

import { useChat } from "@ai-sdk/react";
import { Send, Loader2, Bot, User, Settings, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useRef, useEffect, useState } from "react";

interface Model {
  id: string;
  name: string;
  provider?: string;
}

export function ChatInterface() {
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("gpt-4o");
  const [models, setModels] = useState<Model[]>([]);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { messages, sendMessage, status } = useChat({
    id: selectedModel, // Create new chat instance when model changes
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch available models
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch("/api/v1/models");
        const data = await response.json();
        if (data.models) {
          setModels(data.models);
        }
      } catch (error) {
        console.error("Failed to fetch models:", error);
      }
    };
    fetchModels();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const isLoading = status === "streaming";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setError(null);
    sendMessage({ text: input });
    setInput("");
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

  return (
    <div className="flex flex-col h-[calc(100vh-16rem)] border rounded-lg bg-card">
      {/* Header with Model Selector */}
      <div className="border-b p-4 flex items-center justify-between bg-gradient-to-r from-background to-muted/20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">AI Assistant</h3>
            <p className="text-xs text-muted-foreground">Powered by ElizaOS</p>
          </div>
        </div>

        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowModelSelector(!showModelSelector)}
            className="gap-2 shadow-sm"
          >
            <Settings className="h-4 w-4" />
            <span className="text-xs font-medium">{selectedModel}</span>
            <Badge variant="secondary" className="ml-1 text-xs">
              {messages.length}
            </Badge>
          </Button>

          {showModelSelector && models.length > 0 && (
            <div className="absolute right-0 top-full mt-1 w-64 rounded-lg border bg-popover shadow-lg z-50">
              <div className="p-2 border-b">
                <p className="text-xs font-semibold text-muted-foreground">
                  Select Model
                </p>
              </div>
              <div className="max-h-64 overflow-y-auto p-2">
                {models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => {
                      setSelectedModel(model.id);
                      setShowModelSelector(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded text-sm hover:bg-accent transition-colors ${
                      selectedModel === model.id ? "bg-accent" : ""
                    }`}
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

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Start a conversation</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Ask me anything about AI, development, or how ElizaOS can help you
              build intelligent agents.
            </p>
          </div>
        )}

        {messages.map((message, index) => {
          return (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.role === "user" ? "justify-end" : "justify-start"
              } animate-in fade-in slide-in-from-bottom-4 duration-500`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {message.role === "assistant" && (
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-sm transition-transform hover:scale-110">
                  <Bot className="h-5 w-5 text-white" />
                </div>
              )}

              <div
                className={`rounded-2xl px-4 py-3 max-w-[80%] shadow-sm transform transition-all hover:scale-[1.02] hover:shadow-md ${
                  message.role === "user"
                    ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground"
                    : "bg-card border"
                }`}
              >
                <div className="text-sm whitespace-pre-wrap mb-2">
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

                {/* Message Footer with timestamp */}
                <div
                  className={`flex items-center gap-2 text-xs mt-2 pt-2 border-t ${
                    message.role === "user"
                      ? "border-primary-foreground/20 text-primary-foreground/80"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <Clock className="h-3 w-3" />
                  <span>{formatTimestamp(Date.now())}</span>
                </div>
              </div>

              {message.role === "user" && (
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-sm transition-transform hover:scale-110">
                  <User className="h-5 w-5 text-white" />
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="flex gap-3 justify-start animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-sm">
              <Bot className="h-5 w-5 text-white animate-pulse" />
            </div>
            <div className="rounded-2xl px-4 py-3 bg-card border shadow-sm space-y-2 max-w-[80%]">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
              <div className="flex gap-2 mt-3 pt-2 border-t">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form
        onSubmit={handleSubmit}
        className="border-t p-4 bg-gradient-to-r from-background to-muted/20"
      >
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              placeholder="Type your message..."
              disabled={isLoading}
              className="w-full rounded-xl border bg-background px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 transition-all"
            />
          </div>
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
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
  );
}
