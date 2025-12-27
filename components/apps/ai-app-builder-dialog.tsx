/**
 * AI App Builder Dialog
 *
 * A full-screen dialog that provides:
 * - Live sandbox preview of the Next.js app
 * - Chat interface to prompt AI Assistant
 * - Template selection and configuration
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Send,
  Sparkles,
  RefreshCw,
  ExternalLink,
  X,
  Clock,
  Code,
  Bot,
  MessageSquare,
  LayoutTemplate,
  ChevronRight,
  Play,
  Square,
  Copy,
  Check,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { toast } from "sonner";
import { BrandCard, CornerBrackets, BrandButton } from "@/components/brand";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AIAppBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TemplateType =
  | "chat"
  | "agent-dashboard"
  | "landing-page"
  | "analytics"
  | "blank"
  | "mcp-service"
  | "a2a-agent";
type SessionStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "generating"
  | "error"
  | "stopped";

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

const TEMPLATE_OPTIONS = [
  { value: "blank", label: "Blank Project", description: "Start from scratch" },
  { value: "chat", label: "Chat App", description: "AI chat interface" },
  {
    value: "mcp-service",
    label: "MCP Service",
    description: "Model Context Protocol server",
  },
  {
    value: "a2a-agent",
    label: "A2A Agent",
    description: "Agent-to-Agent protocol endpoint",
  },
  {
    value: "agent-dashboard",
    label: "Agent Dashboard",
    description: "Manage AI agents",
  },
  {
    value: "landing-page",
    label: "Landing Page",
    description: "Marketing page",
  },
  {
    value: "analytics",
    label: "Analytics Dashboard",
    description: "Data visualization",
  },
];

export function AIAppBuilderDialog({
  open,
  onOpenChange,
}: AIAppBuilderDialogProps) {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Setup state
  const [step, setStep] = useState<"setup" | "building">("setup");
  const [appName, setAppName] = useState("");
  const [appDescription, setAppDescription] = useState("");
  const [templateType, setTemplateType] = useState<TemplateType>("blank");
  const [includeMonetization, setIncludeMonetization] = useState(false);
  const [includeAnalytics, setIncludeAnalytics] = useState(true);

  // Session state
  const [session, setSession] = useState<SessionData | null>(null);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Start a new builder session
  const startSession = useCallback(async () => {
    setIsLoading(true);
    setStatus("initializing");

    try {
      const response = await fetch("/api/v1/app-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appName,
          appDescription,
          templateType,
          includeMonetization,
          includeAnalytics,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to start session");
      }

      const data = await response.json();
      setSession(data.session);
      setStatus("ready");
      setStep("building");

      // Add welcome message
      setMessages([
        {
          role: "assistant",
          content: `🚀 **Your sandbox is ready!**

I'll help you build your app. The live preview is loading on the right.

${data.session.examplePrompts?.length > 0 ? "**Try one of these prompts to get started:**" : ""}

What would you like to build?`,
          timestamp: new Date().toISOString(),
        },
      ]);

      toast.success("Sandbox started!", {
        description: "Your development environment is ready.",
      });
    } catch (error) {
      setStatus("error");
      toast.error("Failed to start sandbox", {
        description:
          error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    appName,
    appDescription,
    templateType,
    includeMonetization,
    includeAnalytics,
  ]);

  // Send a prompt
  const sendPrompt = useCallback(
    async (prompt: string) => {
      if (!session || !prompt.trim() || isLoading) return;

      setIsLoading(true);
      setStatus("generating");

      // Add user message
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
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to send prompt");
        }

        // Add assistant message
        const assistantMessage: Message = {
          role: "assistant",
          content: data.output,
          filesAffected: data.filesAffected,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);

        // Refresh iframe
        if (iframeRef.current) {
          iframeRef.current.src = session.sandboxUrl;
        }

        setStatus("ready");
      } catch (error) {
        setStatus("ready");
        toast.error("Failed to process prompt", {
          description:
            error instanceof Error ? error.message : "Please try again",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [session, isLoading],
  );

  // Stop the session
  const stopSession = useCallback(async () => {
    if (!session) return;

    try {
      await fetch(`/api/v1/app-builder/sessions/${session.id}`, {
        method: "DELETE",
      });
      toast.success("Session stopped");
    } catch (error) {
      toast.error("Failed to stop session");
    }
  }, [session]);

  // Handle dialog close
  const handleClose = useCallback(() => {
    if (session && status !== "stopped") {
      // Confirm before closing active session
      if (
        window.confirm(
          "Stop the sandbox and close? You'll lose any unsaved work.",
        )
      ) {
        stopSession();
        onOpenChange(false);
      }
    } else {
      onOpenChange(false);
    }
  }, [session, status, stopSession, onOpenChange]);

  // Copy sandbox URL
  const copyUrl = async () => {
    if (!session?.sandboxUrl) return;
    await navigator.clipboard.writeText(session.sandboxUrl);
    setCopied(true);
    toast.success("URL copied");
    setTimeout(() => setCopied(false), 2000);
  };

  // Render setup step
  const renderSetup = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-r from-purple-600 to-[#FF5800] rounded-lg">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">AI App Builder</h2>
            <p className="text-sm text-white/60">Build apps with AI</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={handleClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Template Selection */}
          <div className="space-y-4">
            <Label className="text-lg font-semibold text-white flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5 text-[#FF5800]" />
              Choose a Template
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {TEMPLATE_OPTIONS.map((template) => (
                <div
                  key={template.value}
                  onClick={() =>
                    setTemplateType(template.value as TemplateType)
                  }
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    templateType === template.value
                      ? "border-[#FF5800] bg-[#FF5800]/10"
                      : "border-white/10 hover:border-white/30 bg-white/5"
                  }`}
                >
                  <div className="font-medium text-white">{template.label}</div>
                  <div className="text-sm text-white/60">
                    {template.description}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* App Details */}
          <div className="space-y-4">
            <Label className="text-lg font-semibold text-white flex items-center gap-2">
              <Code className="h-5 w-5 text-[#FF5800]" />
              App Details
            </Label>

            <div className="space-y-4">
              <div>
                <Label htmlFor="appName" className="text-white/80">
                  App Name (optional)
                </Label>
                <Input
                  id="appName"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="My Awesome App"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="appDescription" className="text-white/80">
                  Description (optional)
                </Label>
                <Textarea
                  id="appDescription"
                  value={appDescription}
                  onChange={(e) => setAppDescription(e.target.value)}
                  placeholder="Describe what you want to build..."
                  rows={3}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="space-y-4">
            <Label className="text-lg font-semibold text-white">Features</Label>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                <div>
                  <div className="font-medium text-white">
                    Analytics Integration
                  </div>
                  <div className="text-sm text-white/60">
                    Track usage and performance metrics
                  </div>
                </div>
                <Switch
                  checked={includeAnalytics}
                  onCheckedChange={setIncludeAnalytics}
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-purple-500/10 rounded-lg border border-purple-500/20">
                <div>
                  <div className="font-medium text-white">Monetization</div>
                  <div className="text-sm text-white/60">
                    Enable credit-based billing for your app
                  </div>
                </div>
                <Switch
                  checked={includeMonetization}
                  onCheckedChange={setIncludeMonetization}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 border-t border-white/10">
        <div className="max-w-2xl mx-auto flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={startSession}
            disabled={isLoading}
            className="bg-gradient-to-r from-purple-600 to-[#FF5800]"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting Sandbox...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Start Building
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  // Render building step
  const renderBuilding = () => (
    <div className="flex h-full">
      {/* Chat Panel */}
      <div
        className={`flex flex-col border-r border-white/10 ${isFullscreen ? "hidden" : "w-[400px]"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
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
                    : status === "error"
                      ? "bg-red-500"
                      : "bg-gray-500"
              }`}
            />
            <span className="text-xs text-white/60 capitalize">{status}</span>
          </div>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto p-4"
          style={{ scrollBehavior: "smooth" }}
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
                  className={`max-w-[85%] rounded-lg px-4 py-2 ${
                    message.role === "user"
                      ? "bg-[#FF5800]/20 border border-[#FF5800]/40"
                      : "bg-white/5 border border-white/10"
                  }`}
                >
                  <div className="prose prose-sm prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                  {message.filesAffected &&
                    message.filesAffected.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-white/10">
                        <div className="text-xs text-white/40 mb-1">
                          Files modified:
                        </div>
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
                  <div className="flex gap-1">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-[#FF5800] [animation-delay:-0.3s]" />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-[#FF5800] [animation-delay:-0.15s]" />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-[#FF5800]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Example prompts */}
        {messages.length === 1 && session?.examplePrompts && (
          <div className="p-4 border-t border-white/10">
            <div className="text-xs text-white/40 mb-2">Try these:</div>
            <div className="flex flex-wrap gap-2">
              {session.examplePrompts.slice(0, 4).map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => setInput(prompt)}
                  className="text-xs px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-white/70 hover:text-white transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-white/10">
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
      </div>

      {/* Preview Panel */}
      <div className="flex-1 flex flex-col">
        {/* Preview Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <span className="font-medium text-white">Live Preview</span>
            {session?.sandboxUrl && (
              <div className="flex items-center gap-2">
                <code className="text-xs text-white/60 bg-white/5 px-2 py-1 rounded">
                  {session.sandboxUrl}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={copyUrl}
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => window.open(session.sandboxUrl, "_blank")}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
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
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen preview"}
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Preview Iframe */}
        <div className="flex-1 bg-white">
          {session?.sandboxUrl ? (
            <iframe
              ref={iframeRef}
              src={session.sandboxUrl}
              className="w-full h-full border-0"
              title="App Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-white/40">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p>Loading preview...</p>
              </div>
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className="flex items-center justify-between p-2 border-t border-white/10 bg-black/20">
          <div className="flex items-center gap-4 text-xs text-white/40">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Session expires in 30 min
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={stopSession}
              className="h-7 text-xs text-red-400 hover:text-red-300"
            >
              <Square className="h-3 w-3 mr-1" />
              Stop Session
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-[95vw] w-[95vw] h-[90vh] p-0 gap-0 overflow-hidden"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">AI App Builder</DialogTitle>
        {step === "setup" ? renderSetup() : renderBuilding()}
      </DialogContent>
    </Dialog>
  );
}
