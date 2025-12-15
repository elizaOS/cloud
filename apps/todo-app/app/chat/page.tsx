"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send, ArrowLeft, Bot, RefreshCw, Loader2, Clock, Copy, Check } from "lucide-react";
import { useAuth } from "@/lib/use-auth";
import { cn } from "@/lib/utils";

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

  args.type =
    lower.includes("daily") || lower.includes("habit")
      ? "daily"
      : lower.includes("goal") || lower.includes("aspiration")
        ? "aspirational"
        : "one-off";

  const nameMatch =
    message.match(/:\s*(.+)/) ||
    message.match(
      /(?:add|create|new|complete|done|finish)\s+(?:a\s+)?(?:task|habit|goal)?\s*(.+)/i,
    );
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

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        'Hi! I can help manage your tasks. Try:\n\n• "Add a daily habit: Morning meditation"\n• "Create a task: Submit report"\n• "Show my tasks"\n• "What\'s my level?"',
      timestamp: new Date(),
    },
  ]);
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
        params: {
          name: parseToolFromMessage(input.trim()),
          arguments: parseArgsFromMessage(input.trim()),
        },
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

    setMessages((prev) => [
      ...prev,
      {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: assistantContent,
        timestamp: new Date(),
      },
    ]);
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
      <header className="border-b border-white/10 backdrop-blur-sm sticky top-0 z-40 bg-background/80">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link
            href="/dashboard"
            className="p-2 hover:bg-white/10 transition-colors text-white/70 hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FF5800] to-orange-600 flex items-center justify-center">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="font-semibold text-white">Task Assistant</span>
              <p className="text-xs text-white/50">Powered by Eliza</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {messages.map((message) => (
            <ChatBubble key={message.id} message={message} />
          ))}

          {isThinking && (
            <div className="flex gap-3 justify-start animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FF5800] to-orange-600 flex items-center justify-center flex-shrink-0">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <div className="rounded-none px-4 py-3 max-w-[80%] border bg-black/40 border-white/10">
                <div className="flex items-center gap-3">
                  <div className="h-4 w-4 rounded-full border-2 border-[#FF5800] border-t-transparent animate-spin" />
                  <p className="text-sm text-white/70">Assistant is thinking...</p>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      <div className="border-t border-white/10 bg-background/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto p-4">
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }}>
            <div className="group relative bg-black/40 transition-all duration-300 ease-out hover:bg-black/60 border border-white/20 hover:border-white/30 flex items-end gap-3 p-4">
              {/* HUD Corner Brackets */}
              <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-white/40 group-hover:border-[#FF5800] transition-colors" />
              <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-white/40 group-hover:border-[#FF5800] transition-colors" />
              <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-white/40 group-hover:border-[#FF5800] transition-colors" />
              <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-white/40 group-hover:border-[#FF5800] transition-colors" />

              {/* Robot Eye Visor Scanner - Only show when waiting for agent */}
              {isThinking && (
                <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden pointer-events-none">
                  <div
                    className="absolute h-full w-20 bg-gradient-to-r from-transparent via-[#FF5800] to-transparent"
                    style={{
                      animation: "visor-scan 4.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                      boxShadow: "0 0 10px 2px rgba(255, 88, 0, 0.6)",
                    }}
                  />
                  <div
                    className="absolute h-full w-16 bg-gradient-to-r from-transparent via-[#FF5800]/60 to-transparent"
                    style={{
                      animation: "visor-scan-delayed 6.2s cubic-bezier(0.3, 0.1, 0.7, 0.9) infinite 1.5s",
                      boxShadow: "0 0 8px 2px rgba(255, 88, 0, 0.4)",
                      filter: "blur(1px)",
                    }}
                  />
                </div>
              )}

              {/* Text Input */}
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "24px";
                  target.style.height = Math.min(target.scrollHeight, 128) + "px";
                }}
                placeholder="Ask me to create, complete, or list tasks..."
                disabled={isThinking}
                className={cn(
                  "flex-1 bg-transparent border-0 text-white placeholder:text-white/40 resize-none",
                  "focus:outline-none focus:ring-0 text-sm leading-relaxed py-1",
                  "disabled:opacity-50 max-h-32",
                )}
                style={{
                  minHeight: "24px",
                  maxHeight: "128px",
                }}
              />

              {/* Send Button */}
              <button
                type="submit"
                disabled={isThinking || !input.trim()}
                className="h-10 w-10 border-0 bg-[#FF580040] hover:brightness-125 active:brightness-150 transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isThinking ? (
                  <Loader2 className="h-5 w-5 animate-spin text-[#FF5800]" />
                ) : (
                  <Send className="h-5 w-5 text-[#FF5800]" />
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Chat bubble component matching main app style
function ChatBubble({ message }: { message: Message }) {
  const [isCopied, setIsCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <div
      className={cn(
        "flex gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500",
        message.role === "user" ? "justify-end" : "justify-start",
      )}
    >
      {message.role === "assistant" && (
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FF5800] to-orange-600 flex items-center justify-center flex-shrink-0">
          <Bot className="h-5 w-5 text-white" />
        </div>
      )}

      <div
        className={cn(
          "rounded-none px-4 py-3 max-w-[80%] border transition-all",
          message.role === "assistant"
            ? "bg-black/40 border-white/10"
            : "bg-[#FF580020] border-[#FF5800] text-white",
        )}
      >
        <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">
          {message.content}
        </p>
        <div
          className={cn(
            "flex items-center justify-between gap-2 text-xs mt-3 pt-3 border-t",
            message.role === "assistant"
              ? "border-white/10 text-white/50"
              : "border-[#FF5800]/20 text-white/70",
          )}
        >
          <div className="flex items-center gap-2">
            <Clock className="h-3 w-3" />
            <span>
              {message.timestamp.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
          <button
            onClick={copyToClipboard}
            className="h-6 w-6 p-0 hover:bg-white/10 text-white/70 hover:text-white rounded flex items-center justify-center transition-colors"
            title="Copy message"
          >
            {isCopied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>

      {message.role === "user" && (
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#FF5800] flex items-center justify-center">
          <span className="h-5 w-5 text-white font-bold flex items-center justify-center text-sm">U</span>
        </div>
      )}
    </div>
  );
}
