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
  Terminal,
  Monitor,
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

type ProgressStep = "creating" | "installing" | "starting" | "ready" | "error";

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
  const [progressStep, setProgressStep] = useState<ProgressStep>("creating");
  const [previewTab, setPreviewTab] = useState<"preview" | "console">("preview");
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);


  // Listen for console messages from iframe and sandbox
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Accept messages from sandbox
      if (event.data?.type === "console" && event.data?.message) {
        setConsoleLogs(prev => [...prev, `[${event.data.level || "log"}] ${event.data.message}`]);
      }
      // Handle Next.js dev server messages
      if (event.data?.type === "webpack-hmr" || event.data?.action === "built") {
        setConsoleLogs(prev => [...prev, `[hmr] ${event.data.action || "update"}`]);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Add log helper
  const addLog = useCallback((message: string, level: string = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    setConsoleLogs(prev => [...prev, `[${timestamp}] [${level}] ${message}`]);
  }, []);

  // Poll for sandbox logs when session is active
  const lastLogIndexRef = useRef<number>(0);
  useEffect(() => {
    if (!session || status !== "ready") {
      lastLogIndexRef.current = 0;
      return;
    }

    const fetchLogs = async () => {
      try {
        const res = await fetch(`/api/v1/app-builder/sessions/${session.id}/logs?tail=100`);
        const data = await res.json();
        if (data.success && data.logs?.length > 0) {
          // Only add new logs
          const newLogs = data.logs.slice(lastLogIndexRef.current);
          if (newLogs.length > 0) {
            setConsoleLogs(prev => {
              const timestamp = new Date().toLocaleTimeString();
              const formatted = newLogs.map((log: string) => `[${timestamp}] ${log}`);
              return [...prev, ...formatted];
            });
            lastLogIndexRef.current = data.logs.length;
          }
        }
      } catch (e) {
        // Silently ignore polling errors
      }
    };

    // Poll every 3 seconds
    const interval = setInterval(fetchLogs, 3000);
    fetchLogs(); // Initial fetch

    return () => clearInterval(interval);
  }, [session, status]);
  // Start a new builder session for this app using SSE streaming
  const startSession = useCallback(async () => {
    setIsLoading(true);
    setStatus("initializing");
    addLog("Starting sandbox environment...", "info");
    setProgressStep("creating");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/v1/app-builder/stream", {
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

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error?.includes("credentials not configured") || 
            errorData.error?.includes("VERCEL_TOKEN") ||
            errorData.error?.includes("OIDC")) {
          setStatus("not_configured");
          setErrorMessage(errorData.error);
          setIsLoading(false);
          return;
        }
        throw new Error(errorData.error || "Failed to start session");
      }

      // Read SSE stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ") && eventType) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (eventType === "progress") {
                setProgressStep(data.step as ProgressStep);
                addLog(`Progress: ${data.step}`, "info");
              } else if (eventType === "complete") {
                setSession(data.session);
                setStatus("ready");
                setMessages([{
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
                }]);
                addLog(`Sandbox ready at ${data.session.sandboxUrl}`, "success");
                toast.success("Sandbox started!", {
                  description: "Your development environment is ready.",
                });
              } else if (eventType === "error") {
                throw new Error(data.error || "Failed to start session");
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
            eventType = "";
          }
        }
      }
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
      toast.error("Failed to start sandbox", {
        description: error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setIsLoading(false);
    }
  }, [app, addLog]);

  // Send a prompt
  const sendPrompt = useCallback(async (prompt: string) => {
    if (!session || !prompt.trim() || isLoading) return;

    setIsLoading(true);
    setStatus("generating");

    addLog(`Sending prompt: "${prompt.substring(0, 50)}${prompt.length > 50 ? "..." : ""}"`, "info");

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

      if (data.filesAffected && data.filesAffected.length > 0) {
        addLog(`Modified files: ${data.filesAffected.join(", ")}`, "success");
      }
      addLog("Changes applied, refreshing preview...", "info");

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
  }, [session, isLoading, addLog]);

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
      addLog("Session stopped", "info");
      toast.success("Session stopped");
    } catch (error) {
      toast.error("Failed to stop session");
    }
  }, [session, addLog]);

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
    const steps = [
      { key: "creating", label: "Creating sandbox instance" },
      { key: "installing", label: "Installing dependencies" },
      { key: "starting", label: "Starting dev server" },
    ];
    
    const currentStepIndex = steps.findIndex(s => s.key === progressStep);
    
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
              {steps.map((step, index) => {
                const isComplete = index < currentStepIndex;
                const isCurrent = index === currentStepIndex;
                const isPending = index > currentStepIndex;
                
                return (
                  <div 
                    key={step.key}
                    className={`flex items-center gap-2 text-sm transition-all duration-300 ${
                      isComplete ? "text-white/60" : isCurrent ? "text-white/80" : "text-white/40"
                    }`}
                  >
                    {isComplete ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : isCurrent ? (
                      <Loader2 className="h-4 w-4 animate-spin text-[#FF5800]" />
                    ) : (
                      <div className="h-4 w-4" />
                    )}
                    {step.label}
                  </div>
                );
              })}
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
    <div className="flex flex-col gap-4 h-[calc(100dvh-360px)] min-h-[500px]">
      {/* Preview Panel - Top */}
      <BrandCard className="relative flex flex-col h-[500px] overflow-hidden">
        <CornerBrackets className="opacity-20" />
        
        {/* Preview Header */}
        <div className="relative z-10 flex items-center justify-between p-3 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            {/* Compact Tab Buttons */}
            <div className="flex bg-white/5 rounded-md p-0.5">
              <button
                onClick={() => setPreviewTab("preview")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  previewTab === "preview"
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                <Monitor className="h-3.5 w-3.5" />
                Preview
              </button>
              <button
                onClick={() => setPreviewTab("console")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  previewTab === "console"
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                <Terminal className="h-3.5 w-3.5" />
                Console
                {consoleLogs.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-[#FF5800]/20 text-[#FF5800] rounded-full text-[10px]">
                    {consoleLogs.length}
                  </span>
                )}
              </button>
            </div>
            {previewTab === "preview" && session?.sandboxUrl && (
              <code className="text-xs text-white/50 bg-white/5 px-2 py-1 rounded max-w-[180px] truncate">
                {session.sandboxUrl}
              </code>
            )}
          </div>
          <div className="flex items-center gap-1">
            {previewTab === "console" && consoleLogs.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setConsoleLogs([])}
                title="Clear console"
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            )}
            {previewTab === "preview" && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={copyUrl}
                  title="Copy URL"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    if (iframeRef.current && session) {
                      iframeRef.current.src = session.sandboxUrl;
                    }
                  }}
                  title="Refresh preview"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => window.open(session?.sandboxUrl, "_blank")}
                  title="Open in new tab"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Preview Content */}
        <div className="relative z-10 flex-1 overflow-hidden">
          {previewTab === "preview" ? (
            session?.sandboxUrl ? (
              <iframe
                ref={iframeRef}
                src={session.sandboxUrl}
                className="w-full h-full border-0 bg-white"
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
            )
          ) : (
            <div className="h-full bg-[#1a1a1a] overflow-auto font-mono text-xs">
              {consoleLogs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-white/30">
                  <div className="text-center">
                    <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No console logs yet</p>
                  </div>
                </div>
              ) : (
                <div className="p-3 space-y-0.5">
                  {consoleLogs.map((log, i) => {
                    // Determine log type and color
                    let colorClass = "text-white/60"; // default server output
                    let bgClass = "";
                    
                    if (log.includes("[info]")) {
                      colorClass = "text-blue-400";
                    } else if (log.includes("[success]")) {
                      colorClass = "text-green-400";
                    } else if (log.includes("[error]") || log.includes("Error") || log.includes("error")) {
                      colorClass = "text-red-400";
                      bgClass = "bg-red-500/10";
                    } else if (log.includes("[warning]") || log.includes("⚠") || log.includes("Warning")) {
                      colorClass = "text-yellow-400";
                      bgClass = "bg-yellow-500/5";
                    } else if (log.includes("Progress:")) {
                      colorClass = "text-purple-400";
                    } else if (log.includes("GET ") || log.includes("POST ") || log.includes("PUT ") || log.includes("DELETE ")) {
                      // HTTP requests
                      if (log.includes(" 2")) {
                        colorClass = "text-green-400/70";
                      } else if (log.includes(" 4") || log.includes(" 5")) {
                        colorClass = "text-red-400/70";
                      } else {
                        colorClass = "text-cyan-400/70";
                      }
                    } else if (log.includes("✓")) {
                      colorClass = "text-green-400/80";
                    } else if (log.includes("Next.js") || log.includes("Turbopack")) {
                      colorClass = "text-white/80";
                    }
                    
                    return (
                      <div key={i} className={`flex gap-2 hover:bg-white/5 px-1 rounded ${bgClass}`}>
                        <span className="text-white/20 select-none w-5 text-right shrink-0">{i + 1}</span>
                        <pre className={`whitespace-pre-wrap break-all ${colorClass}`}>{log}</pre>
                      </div>
                    );
                  })}
                </div>
              )}
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

      {/* Chat Panel - Bottom */}
      <BrandCard className="relative flex flex-col flex-1 min-h-[200px] overflow-hidden">
        <CornerBrackets className="opacity-20" />
        
        {/* Header */}
        <div className="relative z-10 flex items-center justify-between p-3 border-b border-white/10 flex-shrink-0">
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
          className="relative z-10 flex-1 overflow-y-auto p-3 scroll-smooth"
          style={{ scrollBehavior: 'smooth' }}
        >
          <div className="space-y-3">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 ${
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
                <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2">
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
        <div className="relative z-10 p-3 border-t border-white/10 flex-shrink-0">
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
              className="flex-1 min-h-[40px] max-h-[80px] resize-none"
              rows={1}
            />
            <Button
              type="submit"
              disabled={!input.trim() || isLoading}
              size="icon"
              className="bg-[#FF5800] hover:bg-[#FF5800]/90 h-[40px] w-[40px]"
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
    </div>
  );
}
