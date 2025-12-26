"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Send,
  Sparkles,
  RefreshCw,
  ExternalLink,
  ArrowLeft,
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
  Grid3x3,
  Workflow,
  Puzzle,
} from "lucide-react";
import { toast } from "sonner";
import { BrandCard, CornerBrackets, BrandButton } from "@/components/brand";
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
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  | "stopped"
  | "not_configured";
type SourceType = "agent" | "workflow" | "service" | "standalone";

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

interface SourceContext {
  type: SourceType;
  id: string;
  name: string;
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

const SOURCE_CONTEXT_INFO: Record<
  SourceType,
  { icon: typeof Grid3x3; color: string; templateSuggestion: TemplateType }
> = {
  agent: {
    icon: Bot,
    color: "#0B35F1",
    templateSuggestion: "chat",
  },
  workflow: {
    icon: Workflow,
    color: "#22C55E",
    templateSuggestion: "agent-dashboard",
  },
  service: {
    icon: Puzzle,
    color: "#06B6D4",
    templateSuggestion: "mcp-service",
  },
  standalone: {
    icon: Grid3x3,
    color: "#FF5800",
    templateSuggestion: "blank",
  },
};

/**
 * App Creator page - AI-powered app building experience.
 * Supports context from agents, workflows, or services for integrated creation.
 */
export default function AppCreatorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Parse source context from URL params
  const sourceContext: SourceContext | null = (() => {
    const sourceType = searchParams.get("source") as SourceType | null;
    const sourceId = searchParams.get("sourceId");
    const sourceName = searchParams.get("sourceName");
    if (sourceType && sourceId && sourceName) {
      return { type: sourceType, id: sourceId, name: sourceName };
    }
    return null;
  })();

  // Setup state
  const [step, setStep] = useState<"setup" | "building">("setup");
  const [appName, setAppName] = useState(
    sourceContext ? `${sourceContext.name} App` : "",
  );
  const [appDescription, setAppDescription] = useState(
    sourceContext
      ? `An app built with ${sourceContext.name} ${sourceContext.type}`
      : "",
  );
  const [templateType, setTemplateType] = useState<TemplateType>(
    sourceContext
      ? SOURCE_CONTEXT_INFO[sourceContext.type].templateSuggestion
      : "blank",
  );
  const [includeMonetization, setIncludeMonetization] = useState(false);
  const [includeAnalytics, setIncludeAnalytics] = useState(true);

  // Session state
  const [session, setSession] = useState<SessionData | null>(null);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [generatingMessage, setGeneratingMessage] = useState("Generating...");
  const [generatingColor, setGeneratingColor] = useState("text-cyan-400");
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

    const response = await fetch("/api/v1/app-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appName,
        appDescription,
        templateType,
        includeMonetization,
        includeAnalytics,
        // Include source context if available
        sourceContext: sourceContext
          ? {
            type: sourceContext.type,
            id: sourceContext.id,
            name: sourceContext.name,
          }
          : undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      if (
        error.error?.includes("credentials not configured") ||
        error.error?.includes("VERCEL_TOKEN")
      ) {
        setStatus("not_configured");
        setIsLoading(false);
        return;
      }
      throw new Error(error.error || "Failed to start session");
    }

    const data = await response.json();
    setSession(data.session);
    setStatus("ready");
    setStep("building");

    // Add welcome message with source context
    const contextMessage = sourceContext
      ? `\n\nI see you're building an app for **${sourceContext.name}** (${sourceContext.type}). I've pre-configured the template and settings to work with this integration.`
      : "";

    const welcomeMessage = `🚀 **Your sandbox is ready!**

I'll help you build your app. The live preview is loading on the right.${contextMessage}

What would you like to build?`;

    setMessages([
      {
        role: "assistant",
        content: welcomeMessage,
        timestamp: new Date().toISOString(),
      },
    ]);

    toast.success("Sandbox started!", {
      description: "Your development environment is ready.",
    });

    setIsLoading(false);
  }, [
    appName,
    appDescription,
    templateType,
    includeMonetization,
    includeAnalytics,
    sourceContext,
  ]);

  // Send a prompt to the builder
  const sendPrompt = useCallback(
    async (promptText?: string) => {
      const text = promptText || input.trim();
      if (!text || !session || status !== "ready") return;

      const userMessage: Message = {
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setStatus("generating");
      setGeneratingMessage("Analyzing request...");
      setGeneratingColor("text-cyan-400");

      try {
        const response = await fetch(
          `/api/v1/app-builder/sessions/${session.id}/prompts/stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: text,
            }),
          },
        );

        if (!response.ok) {
          const error = await response.json();
          toast.error(error.error || "Failed to process prompt");
          setStatus("ready");
          return;
        }

        // Read SSE stream
        const reader = response.body?.getReader();
        if (!reader) {
          toast.error("No response body");
          setStatus("ready");
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let finalData: {
          output?: string;
          filesAffected?: string[];
          success?: boolean;
          error?: string;
        } = {};

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

                if (eventType === "thinking") {
                  setGeneratingMessage("Planning changes...");
                  setGeneratingColor("text-purple-400");
                } else if (eventType === "tool_use") {
                  const toolName = data.tool;
                  if (toolName === "write_file") {
                    const fileName = data.input?.path?.split("/").pop() || "file";
                    setGeneratingMessage(`Writing ${fileName}...`);
                    setGeneratingColor("text-green-400");
                  } else if (toolName === "install_packages") {
                    setGeneratingMessage("Installing packages...");
                    setGeneratingColor("text-orange-400");
                  } else if (toolName === "check_build") {
                    setGeneratingMessage("Checking build...");
                    setGeneratingColor("text-yellow-400");
                  } else if (toolName === "read_file") {
                    setGeneratingMessage("Reading files...");
                    setGeneratingColor("text-blue-400");
                  } else if (toolName === "list_files") {
                    setGeneratingMessage("Exploring project...");
                    setGeneratingColor("text-indigo-400");
                  } else if (toolName === "run_command") {
                    setGeneratingMessage("Running command...");
                    setGeneratingColor("text-red-400");
                  }
                } else if (eventType === "complete") {
                  finalData = data;
                } else if (eventType === "error") {
                  throw new Error(data.error || "Failed to process prompt");
                }
              } catch (e) {
                if (e instanceof SyntaxError) continue;
                throw e;
              }
              eventType = "";
            }
          }
        }

        if (!finalData.success) {
          throw new Error(finalData.error || "Failed to process prompt");
        }

        const assistantMessage: Message = {
          role: "assistant",
          content: finalData.output || "",
          filesAffected: finalData.filesAffected,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setStatus("ready");

        // Refresh iframe
        if (iframeRef.current) {
          iframeRef.current.src = session.sandboxUrl;
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to process prompt",
        );
        setStatus("ready");
      }
    },
    [input, session, status],
  );

  // Auto-scaffold when session is ready and has description/template
  const hasAutoScaffoldedRef = useRef(false);
  useEffect(() => {
    if (
      !session ||
      status !== "ready" ||
      hasAutoScaffoldedRef.current ||
      messages.length > 1
    )
      return;

    if (appDescription || templateType !== "blank") {
      hasAutoScaffoldedRef.current = true;

      const initialScaffoldPrompt = appDescription
        ? `Set up the initial app structure based on these requirements:\n${appDescription}`
        : `Set up the initial ${templateType} app structure with all the core features.`;

      setTimeout(() => {
        sendPrompt(initialScaffoldPrompt);
      }, 500);
    }
  }, [
    session,
    status,
    messages.length,
    appDescription,
    templateType,
    sendPrompt,
  ]);

  // Stop the session
  const stopSession = useCallback(async () => {
    if (!session) return;

    await fetch(`/api/v1/app-builder/${session.id}/stop`, {
      method: "POST",
    });

    setStatus("stopped");
    toast.info("Session stopped");
  }, [session]);

  // Copy sandbox URL
  const copySandboxUrl = useCallback(async () => {
    if (!session?.sandboxUrl) return;
    await navigator.clipboard.writeText(session.sandboxUrl);
    setCopied(true);
    toast.success("URL copied");
    setTimeout(() => setCopied(false), 2000);
  }, [session]);

  // Render setup step
  if (step === "setup") {
    return (
      <div className="max-w-4xl mx-auto py-10 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/apps"
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-white/60" />
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: "#06B6D4" }}
              />
              <h1
                className="text-3xl font-normal tracking-tight text-white"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                App Creator
              </h1>
            </div>
            <p className="text-white/60">
              Build apps with AI-powered code generation
            </p>
          </div>
        </div>

        {/* Source Context Banner */}
        {sourceContext && (
          <BrandCard
            className="relative border-l-4"
            style={{
              borderLeftColor: SOURCE_CONTEXT_INFO[sourceContext.type].color,
            }}
          >
            <div className="flex items-center gap-3">
              {(() => {
                const Icon = SOURCE_CONTEXT_INFO[sourceContext.type].icon;
                return (
                  <div
                    className="p-2 rounded-none border"
                    style={{
                      backgroundColor: `${SOURCE_CONTEXT_INFO[sourceContext.type].color}15`,
                      borderColor: `${SOURCE_CONTEXT_INFO[sourceContext.type].color}40`,
                    }}
                  >
                    <Icon
                      className="h-5 w-5"
                      style={{
                        color: SOURCE_CONTEXT_INFO[sourceContext.type].color,
                      }}
                    />
                  </div>
                );
              })()}
              <div>
                <p
                  className="text-sm font-medium text-white"
                  style={{ fontFamily: "var(--font-roboto-mono)" }}
                >
                  Building app for: {sourceContext.name}
                </p>
                <p className="text-xs text-white/60">
                  This app will be integrated with your {sourceContext.type}
                </p>
              </div>
            </div>
          </BrandCard>
        )}

        {/* Setup Form */}
        <BrandCard className="relative shadow-lg shadow-black/50">
          <CornerBrackets size="sm" className="opacity-50" />
          <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-5 w-5 text-cyan-400" />
              <h2
                className="text-xl font-normal text-white"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                Configure Your App
              </h2>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-white/70">App Name</Label>
                <Input
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="My Awesome App"
                  className="bg-black/40 border-white/20 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-white/70">Template</Label>
                <Select
                  value={templateType}
                  onValueChange={(v) => setTemplateType(v as TemplateType)}
                >
                  <SelectTrigger className="bg-black/40 border-white/20 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex flex-col">
                          <span>{opt.label}</span>
                          <span className="text-xs text-white/50">
                            {opt.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-white/70">Description</Label>
              <Textarea
                value={appDescription}
                onChange={(e) => setAppDescription(e.target.value)}
                placeholder="Describe what your app should do..."
                className="bg-black/40 border-white/20 text-white min-h-[100px]"
              />
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <Switch
                  checked={includeMonetization}
                  onCheckedChange={setIncludeMonetization}
                />
                <Label className="text-white/70">Enable Monetization</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={includeAnalytics}
                  onCheckedChange={setIncludeAnalytics}
                />
                <Label className="text-white/70">Include Analytics</Label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Link href="/dashboard/apps">
                <BrandButton variant="hud">Cancel</BrandButton>
              </Link>
              <BrandButton
                variant="primary"
                onClick={startSession}
                disabled={!appName.trim() || isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Start Building
                  </>
                )}
              </BrandButton>
            </div>
          </div>
        </BrandCard>
      </div>
    );
  }

  // Not configured state
  if (status === "not_configured") {
    return (
      <div className="max-w-4xl mx-auto py-10">
        <BrandCard className="relative shadow-lg shadow-black/50">
          <CornerBrackets size="sm" className="opacity-50" />
          <div className="relative z-10 text-center py-12">
            <Code className="h-12 w-12 text-white/20 mx-auto mb-4" />
            <h2
              className="text-xl font-normal text-white mb-2"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              App Builder Not Configured
            </h2>
            <p className="text-white/60 mb-6">
              The AI app builder requires additional configuration. Please
              contact support for setup.
            </p>
            <Link href="/dashboard/apps">
              <BrandButton variant="hud">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Apps
              </BrandButton>
            </Link>
          </div>
        </BrandCard>
      </div>
    );
  }

  // Building step - full-screen builder interface
  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/40">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/apps"
            className="p-2 hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-white/60" />
          </Link>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            <span
              className="text-sm text-white"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              {appName}
            </span>
          </div>
          {sourceContext && (
            <div
              className="px-2 py-1 text-xs border"
              style={{
                backgroundColor: `${SOURCE_CONTEXT_INFO[sourceContext.type].color}15`,
                borderColor: `${SOURCE_CONTEXT_INFO[sourceContext.type].color}40`,
                color: SOURCE_CONTEXT_INFO[sourceContext.type].color,
                fontFamily: "var(--font-roboto-mono)",
              }}
            >
              {sourceContext.type}: {sourceContext.name}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {session?.sandboxUrl && (
            <>
              <button
                onClick={copySandboxUrl}
                className="p-2 hover:bg-white/10 transition-colors"
                title="Copy URL"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-400" />
                ) : (
                  <Copy className="h-4 w-4 text-white/60" />
                )}
              </button>
              <a
                href={session.sandboxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 hover:bg-white/10 transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="h-4 w-4 text-white/60" />
              </a>
            </>
          )}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 hover:bg-white/10 transition-colors"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen preview"}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4 text-white/60" />
            ) : (
              <Maximize2 className="h-4 w-4 text-white/60" />
            )}
          </button>
          {status === "ready" && (
            <button
              onClick={stopSession}
              className="p-2 hover:bg-red-500/20 transition-colors"
              title="Stop session"
            >
              <Square className="h-4 w-4 text-red-400" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Panel */}
        <div
          className={`flex flex-col border-r border-white/10 bg-black/20 transition-all ${isFullscreen ? "w-0 overflow-hidden" : "w-1/2"}`}
        >
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] p-4 ${msg.role === "user"
                    ? "bg-cyan-500/20 border border-cyan-500/30"
                    : "bg-white/5 border border-white/10"
                    }`}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => (
                        <h1 className="text-xl font-bold text-white mb-3 pb-2 border-b border-white/10">{children}</h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-lg font-semibold text-white mt-4 mb-2 flex items-center gap-2">{children}</h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-base font-medium text-cyan-300 mt-3 mb-1">{children}</h3>
                      ),
                      p: ({ children }) => (
                        <p className="text-sm text-white/80 mb-2 leading-relaxed">{children}</p>
                      ),
                      ul: ({ children }) => (
                        <ul className="space-y-1 mb-3 ml-1">{children}</ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="space-y-1 mb-3 ml-1 list-decimal list-inside">{children}</ol>
                      ),
                      li: ({ children }) => (
                        <li className="text-sm text-white/70 flex items-start gap-2">
                          <span className="text-cyan-400 mt-1.5">•</span>
                          <span>{children}</span>
                        </li>
                      ),
                      code: ({ className, children }) => {
                        const isInline = !className;
                        if (isInline) {
                          return (
                            <code className="px-1.5 py-0.5 bg-white/10 border border-white/20 text-cyan-300 text-xs font-mono rounded">
                              {children}
                            </code>
                          );
                        }
                        return (
                          <code className="block p-3 bg-black/40 border border-white/10 text-green-300 text-xs font-mono rounded overflow-x-auto my-2">
                            {children}
                          </code>
                        );
                      },
                      pre: ({ children }) => (
                        <pre className="bg-black/40 border border-white/10 rounded overflow-hidden my-3">{children}</pre>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold text-white">{children}</strong>
                      ),
                      em: ({ children }) => (
                        <em className="text-white/60 italic">{children}</em>
                      ),
                      a: ({ href, children }) => (
                        <a href={href} className="text-cyan-400 hover:text-cyan-300 underline" target="_blank" rel="noopener noreferrer">
                          {children}
                        </a>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-cyan-500/50 pl-3 my-2 text-white/60 italic">{children}</blockquote>
                      ),
                      hr: () => <hr className="border-white/10 my-4" />,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                  {/* Show example prompts after first assistant message */}
                  {i === 0 &&
                    msg.role === "assistant" &&
                    session?.examplePrompts &&
                    session.examplePrompts.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-white/10">
                        <p className="text-xs text-white/50 mb-2">
                          Try one of these:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {session.examplePrompts.map((prompt, idx) => (
                            <button
                              key={idx}
                              onClick={() => sendPrompt(prompt)}
                              disabled={status !== "ready"}
                              className="px-3 py-1.5 text-xs bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
                            >
                              {prompt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  {msg.filesAffected && msg.filesAffected.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <p className="text-xs text-white/50 mb-1">
                        Files modified:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {msg.filesAffected.map((file) => (
                          <span
                            key={file}
                            className="px-2 py-0.5 text-[10px] bg-white/5 border border-white/10 text-white/60 font-mono"
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
            {status === "generating" && (
              <div className="flex justify-start">
                <div className="bg-white/5 border border-white/10 p-4">
                  <div className="flex items-center gap-2">
                    <Loader2 className={`h-4 w-4 animate-spin ${generatingColor}`} />
                    <span className={`text-sm ${generatingColor}`}>{generatingMessage}</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-white/10">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !e.shiftKey && sendPrompt()
                }
                placeholder="Describe what you want to build..."
                className="flex-1 bg-black/40 border-white/20 text-white"
                disabled={status !== "ready"}
              />
              <BrandButton
                variant="primary"
                onClick={() => sendPrompt()}
                disabled={!input.trim() || status !== "ready"}
              >
                <Send className="h-4 w-4" />
              </BrandButton>
            </div>
          </div>
        </div>

        {/* Preview Panel */}
        <div className={`flex-1 bg-white/5 ${isFullscreen ? "w-full" : ""}`}>
          {session?.sandboxUrl ? (
            <iframe
              ref={iframeRef}
              src={session.sandboxUrl}
              className="w-full h-full border-0"
              title="App Preview"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-cyan-400 mx-auto mb-4" />
                <p className="text-white/60">Loading preview...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
