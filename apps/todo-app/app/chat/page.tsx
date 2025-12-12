"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send, ArrowLeft, Bot, User, RefreshCw, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";

const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL || "http://localhost:3000";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const TOOL_PATTERNS: [RegExp, string][] = [
  [/\b(add|create|new)\b/i, "create_task"],
  [/\b(complete|done|finish)\b/i, "complete_task"],
  [/\b(delete|remove)\b/i, "delete_task"],
  [/\b(points|level|score|streak)\b/i, "get_points"],
  [/\b(list|show|tasks|what)\b/i, "list_tasks"],
];

function parseToolFromMessage(message: string): string {
  for (const [pattern, tool] of TOOL_PATTERNS) {
    if (pattern.test(message)) return tool;
  }
  return "list_tasks";
}

function parseArgsFromMessage(message: string): Record<string, string> {
  const lower = message.toLowerCase();
  const args: Record<string, string> = {};

  args.type = lower.includes("daily") || lower.includes("habit")
    ? "daily"
    : lower.includes("goal") || lower.includes("aspiration")
      ? "aspirational"
      : "one-off";

  const nameMatch = message.match(/:\s*(.+)/) || 
    message.match(/(?:add|create|new|complete|done|finish)\s+(?:a\s+)?(?:task|habit|goal)?\s*(.+)/i);
  if (nameMatch?.[1]) {
    args.name = nameMatch[1].trim();
  }

  if (/\b(complete|done|finish)\b/i.test(lower) && args.name) {
    args.id = args.name;
  }

  return args;
}

export default function ChatPage() {
  const router = useRouter();
  const { isLoading, isAuthenticated, token } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<Message[]>([{
    id: "welcome",
    role: "assistant",
    content: "Hi! I can help manage your tasks. Try:\n\n• \"Add a daily habit: Morning meditation\"\n• \"Create a task: Submit report\"\n• \"Show my tasks\"\n• \"What's my level?\"",
    timestamp: new Date(),
  }]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/");
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isThinking || !token) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsThinking(true);

    const response = await fetch(`${CLOUD_URL}/api/mcp/todoapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Token": token },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: parseToolFromMessage(input.trim()), arguments: parseArgsFromMessage(input.trim()) },
        id: Date.now(),
      }),
    });

    let assistantContent = "I had trouble processing that. Please try again.";
    if (response.ok) {
      const data = await response.json();
      if (data.result?.content?.[0]?.text) {
        assistantContent = data.result.content[0].text;
      } else if (data.error) {
        assistantContent = `Error: ${data.error.message}`;
      }
    }

    setMessages((prev) => [...prev, {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: assistantContent,
      timestamp: new Date(),
    }]);
    setIsThinking(false);
  }, [input, isThinking, token]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/50 backdrop-blur-sm sticky top-0 z-40 bg-background/80">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link href="/dashboard" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <span className="font-semibold">Task Assistant</span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              {message.role === "assistant" && (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4 text-white" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                message.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border"
              }`}>
                <p className="whitespace-pre-wrap">{message.content}</p>
                <p className="text-xs opacity-60 mt-1">
                  {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {message.role === "user" && (
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}

          {isThinking && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-orange-600 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white animate-pulse" />
              </div>
              <div className="bg-card border border-border rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" />
                  <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0.1s" }} />
                  <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0.2s" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <div className="border-t border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me to create, complete, or list tasks..."
              className="flex-1 px-4 py-3 rounded-xl bg-card border border-border focus:border-primary focus:outline-none transition-colors"
              disabled={isThinking}
            />
            <Button onClick={sendMessage} disabled={!input.trim() || isThinking} size="lg" className="px-4">
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
