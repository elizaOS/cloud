/**
 * App AI Builder Component
 * 
 * Embedded AI builder for editing existing apps.
 * Provides a split view with chat interface and live sandbox preview.
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  Send,
  Sparkles,
  RefreshCw,
  ExternalLink,
  Clock,
  MessageSquare,
  Square,
  Copy,
  Check,
  AlertCircle,
  Settings,
  ExternalLinkIcon,
  Bot,
} from "lucide-react";
import { toast } from "sonner";
import { BrandCard, CornerBrackets } from "@/components/brand";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { App } from "@/db/schemas";

interface AppAIBuilderProps {
  app: App;
}

type SessionStatus = "idle" | "initializing" | "ready" | "generating" | "error" | "stopped" | "not_configured";

interface Message {
  role: "user" | "assistant";
  content: string;
  filesAffected?: string[];
  timestamp: string;
}

interface SessionData {
  id: string;
  sandboxId: string;
  sandboxUrl: string;
  status: SessionStatus;
  examplePrompts: string[];
}

export function AppAIBuilder({ app }: AppAIBuilderProps) {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Session state
  const [session, setSession] = useState<SessionData | null>(null);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Start a new builder session for this app
  const startSession = useCallback(async () => {
    setIsLoading(true);
    setStatus("initializing");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/v1/app-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: app.id,
          appName: app.name,
          appDescription: app.description || "",
          templateType: "blank",
          includeMonetization: app.monetization_enabled,
          includeAnalytics: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error?.includes("credentials not configured") || 
            data.error?.includes("VERCEL_TOKEN") ||
            data.error?.includes("OIDC")) {
          setStatus("not_configured");
          setErrorMessage(data.error);
          return;
        }
        throw new Error(data.error || "Failed to start session");
      }

      setSession(data.session);
      setStatus("ready");

      // Add welcome message
      setMessages([
        {
          role: "assistant",
          content: `🚀 **Sandbox ready for ${app.name}!**

I'll help you build and enhance your app. The live preview is loading on the right.

**What would you like to add or change?**

Some ideas:
- Add a new page or feature
- Improve the UI design
- Add analytics tracking
- Integrate more APIs`,
          timestamp: new Date().toISOString(),
        },
      ]);

      toast.success("Sandbox started!", {
        description: "Your development environment is ready.",
      });
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
      toast.error("Failed to start sandbox", {
        description: error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setIsLoading(false);
    }
  }, [app]);

  // Send a prompt
  const sendPrompt = useCallback(async (prompt: string) => {
    if (!session || !prompt.trim() || isLoading) return;

    setIsLoading(true);
    setStatus("generating");

    const userMessage: Message = {
      role: "user",
      content: prompt,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    try {
      const response = await fetch(
        `/api/v1/app-builder/sessions/${session.id}/prompts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send prompt");
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: data.output,
        filesAffected: data.filesAffected,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Refresh iframe
      if (iframeRef.current && session) {
        iframeRef.current.src = session.sandboxUrl;
      }

      setStatus("ready");
    } catch (error) {
      setStatus("ready");
      toast.error("Failed to process prompt", {
        description: error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setIsLoading(false);
    }
  }, [session, isLoading]);

  // Stop the session
  const stopSession = useCallback(async () => {
    if (!session) return;

    try {
      await fetch(`/api/v1/app-builder/sessions/${session.id}`, {
        method: "DELETE",
      });
      setSession(null);
      setStatus("idle");
      setMessages([]);
      toast.success("Session stopped");
    } catch (error) {
      toast.error("Failed to stop session");
    }
  }, [session]);

  // Copy sandbox URL
  const copyUrl = async () => {
    if (!session?.sandboxUrl) return;
    await navigator.clipboard.writeText(session.sandboxUrl);
    setCopied(true);
    toast.success("URL copied");
    setTimeout(() => setCopied(false), 2000);
  };

  // Render not configured state
  if (status === "not_configured") {
    return (
      <BrandCard className="relative">
        <CornerBrackets className="opacity-20" />
        <div className="relative z-10 p-8">
          <div className="max-w-2xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-yellow-500/20 mb-6">
              <Settings className="h-8 w-8 text-yellow-500" />
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-3">
              Sandbox Not Configured
            </h2>
            <p className="text-white/60 mb-6">
              The AI App Builder requires sandbox credentials to create development environments.
            </p>

            <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-left mb-6">
              <h3 className="font-semibold text-white mb-3">Setup Instructions:</h3>
              <ol className="space-y-3 text-sm text-white/70">
                <li className="flex gap-2">
                  <span className="text-[#FF5800] font-mono">1.</span>
                  <span>Get a Vercel Access Token from <a href="https://vercel.com/account/tokens" target="_blank" rel="noopener" className="text-[#FF5800] hover:underline">vercel.com/account/tokens</a></span>
                </li>
                <li className="flex gap-2">
                  <span className="text-[#FF5800] font-mono">2.</span>
                  <span>Find your Team ID in Vercel Dashboard → Settings</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-[#FF5800] font-mono">3.</span>
                  <span>Find your Project ID in Project → Settings → General</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-[#FF5800] font-mono">4.</span>
                  <span>Add to your <code className="bg-white/10 px-1.5 py-0.5 rounded">.env.local</code>:</span>
                </li>
              </ol>
              
              <pre className="mt-4 p-4 bg-black/30 rounded text-xs text-white/80 overflow-x-auto">
{`VERCEL_TOKEN=your_token_here
VERCEL_TEAM_ID=team_xxx
VERCEL_PROJECT_ID=prj_xxx
ANTHROPIC_API_KEY=your_key_here`}
              </pre>
            </div>

            <div className="flex justify-center gap-3">
              <Button
                variant="outline"
                onClick={() => window.open("https://vercel.com/docs/vercel-sandbox", "_blank")}
              >
                <ExternalLinkIcon className="h-4 w-4 mr-2" />
                View Documentation
              </Button>
              <Button
                onClick={() => {
                  setStatus("idle");
                  setErrorMessage(null);
                }}
              >
                Try Again
              </Button>
            </div>
          </div>
        </div>
      </BrandCard>
    );
  }

  // Render idle state
  if (status === "idle") {
    return (
      <BrandCard className="relative">
        <CornerBrackets className="opacity-20" />
        <div className="relative z-10 p-8">
          <div className="max-w-2xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-r from-purple-600 to-[#FF5800] mb-6">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-3">
              AI App Builder
            </h2>
            <p className="text-white/60 mb-8 max-w-md mx-auto">
              Launch a sandbox environment to build and enhance your app with AI assistance.
            </p>

            <Button
              onClick={startSession}
              disabled={isLoading}
              size="lg"
              className="bg-gradient-to-r from-purple-600 to-[#FF5800] hover:opacity-90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5 mr-2" />
                  Start Building
                </>
              )}
            </Button>
          </div>
        </div>
      </BrandCard>
    );
  }

  // Render initializing state
  if (status === "initializing") {
    return (
      <BrandCard className="relative">
        <CornerBrackets className="opacity-20" />
        <div className="relative z-10 p-8">
          <div className="max-w-md mx-auto text-center">
            <Loader2 className="h-12 w-12 animate-spin text-[#FF5800] mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">
              Starting Sandbox
            </h2>
            <p className="text-white/60">
              Setting up your development environment...
            </p>
            <div className="mt-6 space-y-2 text-left max-w-xs mx-auto">
              <div className="flex items-center gap-2 text-sm text-white/60">
                <Check className="h-4 w-4 text-green-500" />
                Creating sandbox instance
              </div>
              <div className="flex items-center gap-2 text-sm text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                Installing dependencies
              </div>
              <div className="flex items-center gap-2 text-sm text-white/40">
                <div className="h-4 w-4" />
                Starting dev server
              </div>
            </div>
          </div>
        </div>
      </BrandCard>
    );
  }

  // Render error state
  if (status === "error") {
    return (
      <BrandCard className="relative">
        <CornerBrackets className="opacity-20" />
        <div className="relative z-10 p-8">
          <div className="max-w-md mx-auto text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/20 mb-4">
              <AlertCircle className="h-6 w-6 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              Failed to Start Sandbox
            </h2>
            <p className="text-white/60 mb-4">
              {errorMessage || "There was an error starting the development environment."}
            </p>
            <Button onClick={startSession} variant="outline">
              Try Again
            </Button>
          </div>
        </div>
      </BrandCard>
    );
  }

  // Render active session
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[600px]">
      {/* Chat Panel */}
      <BrandCard className="relative flex flex-col h-[600px] overflow-hidden">
        <CornerBrackets className="opacity-20" />
        
        {/* Header */}
        <div className="relative z-10 flex items-center justify-between p-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-[#FF5800]" />
            <span className="font-semibold text-white">AI Assistant</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                status === "ready"
                  ? "bg-green-500"
                  : status === "generating"
                  ? "bg-yellow-500 animate-pulse"
                  : "bg-gray-500"
              }`}
            />
            <span className="text-xs text-white/60 capitalize">{status}</span>
          </div>
        </div>

        {/* Messages - Scrollable Container */}
        <div 
          ref={messagesContainerRef}
          className="relative z-10 flex-1 overflow-y-auto p-4 scroll-smooth"
          style={{ scrollBehavior: 'smooth' }}
        >
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[90%] rounded-lg px-4 py-2 ${
                    message.role === "user"
                      ? "bg-[#FF5800]/20 border border-[#FF5800]/40"
                      : "bg-white/5 border border-white/10"
                  }`}
                >
                  <div className="prose prose-sm prose-invert max-w-none overflow-hidden">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                  {message.filesAffected && message.filesAffected.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-white/10">
                      <div className="text-xs text-white/40 mb-1">Files modified:</div>
                      <div className="flex flex-wrap gap-1">
                        {message.filesAffected.map((file, i) => (
                          <span
                            key={i}
                            className="text-xs px-1.5 py-0.5 bg-white/10 rounded text-white/70"
                          >
                            {file}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && status === "generating" && (
              <div className="flex gap-3">
                <div className="bg-white/5 border border-white/10 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-[#FF5800]" />
                    <span className="text-sm text-white/60">Generating...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="relative z-10 p-4 border-t border-white/10 flex-shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendPrompt(input);
            }}
            className="flex gap-2"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendPrompt(input);
                }
              }}
              placeholder="Describe what you want to build..."
              disabled={isLoading}
              className="flex-1 min-h-[44px] max-h-[120px] resize-none"
              rows={1}
            />
            <Button
              type="submit"
              disabled={!input.trim() || isLoading}
              size="icon"
              className="bg-[#FF5800] hover:bg-[#FF5800]/90 h-[44px] w-[44px]"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </BrandCard>

      {/* Preview Panel */}
      <BrandCard className="relative flex flex-col h-[600px] overflow-hidden">
        <CornerBrackets className="opacity-20" />
        
        {/* Preview Header */}
        <div className="relative z-10 flex items-center justify-between p-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-medium text-white">Live Preview</span>
            {session?.sandboxUrl && (
              <code className="text-xs text-white/60 bg-white/5 px-2 py-1 rounded max-w-[150px] truncate">
                {session.sandboxUrl}
              </code>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={copyUrl}
              title="Copy URL"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                if (iframeRef.current && session) {
                  iframeRef.current.src = session.sandboxUrl;
                }
              }}
              title="Refresh preview"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => window.open(session?.sandboxUrl, "_blank")}
              title="Open in new tab"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Preview Iframe */}
        <div className="relative z-10 flex-1 bg-white rounded-b-lg overflow-hidden">
          {session?.sandboxUrl ? (
            <iframe
              ref={iframeRef}
              src={session.sandboxUrl}
              className="w-full h-full border-0"
              title="App Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-white/40 bg-black/50">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p>Loading preview...</p>
              </div>
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className="relative z-10 flex items-center justify-between p-2 border-t border-white/10 flex-shrink-0">
          <div className="flex items-center gap-4 text-xs text-white/40">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Session expires in 30 min
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={stopSession}
            className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            <Square className="h-3 w-3 mr-1" />
            Stop Session
          </Button>
        </div>
      </BrandCard>
    </div>
  );
}
