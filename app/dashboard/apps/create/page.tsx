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
  Code,
  Bot,
  LayoutTemplate,
  Play,
  Square,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  Grid3x3,
  Workflow,
  Puzzle,
  Terminal,
  Monitor,
  Timer,
  Plus,
  AlertCircle,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { BrandCard, CornerBrackets, BrandButton } from "@/components/brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
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
  | "timeout"
  | "not_configured";

type ProgressStep = "creating" | "installing" | "starting" | "ready" | "error";
type SourceType = "agent" | "workflow" | "service" | "standalone";

interface Message {
  role: "user" | "assistant";
  content: string;
  filesAffected?: string[];
  timestamp: string;
  _thinkingId?: number;
}

interface SessionData {
  id: string;
  sandboxId: string;
  sandboxUrl: string;
  status: SessionStatus;
  examplePrompts: string[];
  expiresAt: string | null;
}

interface SourceContext {
  type: SourceType;
  id: string;
  name: string;
}

interface AppData {
  id: string;
  name: string;
  description: string | null;
  monetization_enabled?: boolean;
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

export default function AppCreatorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isRestoringSession = useRef(false);
  const hasAutoScaffoldedRef = useRef(false);

  const appIdFromUrl = searchParams.get("appId");
  const sessionIdFromUrl = searchParams.get("sessionId");
  const isEditMode = !!appIdFromUrl;

  const sourceContext: SourceContext | null = (() => {
    const sourceType = searchParams.get("source") as SourceType | null;
    const sourceId = searchParams.get("sourceId");
    const sourceName = searchParams.get("sourceName");
    if (sourceType && sourceId && sourceName) {
      return { type: sourceType, id: sourceId, name: sourceName };
    }
    return null;
  })();

  const [step, setStep] = useState<"setup" | "building">(
    isEditMode ? "building" : "setup",
  );
  const [appData, setAppData] = useState<AppData | null>(null);
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

  const [session, setSession] = useState<SessionData | null>(null);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [generatingMessage, setGeneratingMessage] = useState("Generating...");
  const [generatingColor, setGeneratingColor] = useState("text-cyan-400");
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progressStep, setProgressStep] = useState<ProgressStep>("creating");
  const [previewTab, setPreviewTab] = useState<"preview" | "console">("preview");
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [isRestoring, setIsRestoring] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [isExtending, setIsExtending] = useState(false);

  const messagesStorageKey = appIdFromUrl
    ? `app-builder-messages-${appIdFromUrl}`
    : `app-builder-messages-new`;

  useEffect(() => {
    if (!appIdFromUrl) return;

    const fetchAppData = async () => {
      try {
        const response = await fetch(`/api/v1/apps/${appIdFromUrl}`);
        if (!response.ok) {
          toast.error("App not found");
          router.push("/dashboard/apps");
          return;
        }
        const data = await response.json();
        if (data.success && data.app) {
          setAppData(data.app);
          setAppName(data.app.name);
          setAppDescription(data.app.description || "");
          setIncludeMonetization(data.app.monetization_enabled || false);
        }
      } catch {
        toast.error("Failed to load app");
        router.push("/dashboard/apps");
      }
    };

    fetchAppData();
  }, [appIdFromUrl, router]);

  useEffect(() => {
    if (!appIdFromUrl || sessionIdFromUrl || isRestoringSession.current || session)
      return;

    const fetchExistingSession = async () => {
      try {
        const response = await fetch(
          `/api/v1/app-builder?appId=${appIdFromUrl}&limit=1&includeInactive=false`,
        );

        if (!response.ok) return;

        const data = await response.json();
        if (data.success && data.sessions?.length > 0) {
          const existingSession = data.sessions[0];
          const params = new URLSearchParams(searchParams.toString());
          params.set("sessionId", existingSession.id);
          router.replace(`/dashboard/apps/create?${params.toString()}`);
        }
      } catch {
        // Silently ignore
      }
    };

    fetchExistingSession();
  }, [appIdFromUrl, sessionIdFromUrl, searchParams, session, router]);

  useEffect(() => {
    const sessionId = searchParams.get("sessionId");
    if (!sessionId || isRestoringSession.current || session) return;

    isRestoringSession.current = true;
    setIsRestoring(true);

    const restoreSession = async () => {
      try {
        const response = await fetch(
          `/api/v1/app-builder/sessions/${sessionId}`,
        );

        if (!response.ok) {
          const params = new URLSearchParams(searchParams.toString());
          params.delete("sessionId");
          const baseUrl = appIdFromUrl
            ? `/dashboard/apps/create?appId=${appIdFromUrl}`
            : "/dashboard/apps/create";
          router.replace(
            params.toString() ? `${baseUrl}&${params.toString()}` : baseUrl,
          );
          sessionStorage.removeItem(messagesStorageKey);
          setIsRestoring(false);
          return;
        }

        const data = await response.json();
        if (data.success && data.session) {
          const restoredSession: SessionData = {
            id: data.session.id,
            sandboxId: data.session.sandboxId,
            sandboxUrl: data.session.sandboxUrl,
            status: data.session.status,
            examplePrompts: data.session.examplePrompts || [],
            expiresAt: data.session.expiresAt || null,
          };

          if (!restoredSession.sandboxUrl) {
            const params = new URLSearchParams(searchParams.toString());
            params.delete("sessionId");
            router.replace(`/dashboard/apps/create?${params.toString()}`);
            sessionStorage.removeItem(messagesStorageKey);
            setIsRestoring(false);
            toast.error("Session expired", {
              description: "Please start a new build session.",
            });
            return;
          }

          setSession(restoredSession);
          setStatus(data.session.status);
          setStep("building");

          const stored = sessionStorage.getItem(messagesStorageKey);
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              setMessages(parsed);
            } catch {
              // Invalid stored data
            }
          }
        }
      } catch {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("sessionId");
        router.replace(`/dashboard/apps/create?${params.toString()}`);
        sessionStorage.removeItem(messagesStorageKey);
      } finally {
        setIsRestoring(false);
      }
    };

    restoreSession();
  }, [searchParams, session, appIdFromUrl, router, messagesStorageKey]);

  useEffect(() => {
    if (messages.length > 0) {
      sessionStorage.setItem(messagesStorageKey, JSON.stringify(messages));
    }
  }, [messages, messagesStorageKey]);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "console" && event.data?.message) {
        setConsoleLogs((prev) => [
          ...prev,
          `[${event.data.level || "log"}] ${event.data.message}`,
        ]);
      }
      if (
        event.data?.type === "webpack-hmr" ||
        event.data?.action === "built"
      ) {
        setConsoleLogs((prev) => [
          ...prev,
          `[hmr] ${event.data.action || "update"}`,
        ]);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (session?.expiresAt) {
      setExpiresAt(new Date(session.expiresAt));
    }
  }, [session?.expiresAt]);

  useEffect(() => {
    if (!expiresAt || status === "stopped" || status === "timeout") {
      setTimeRemaining("");
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const diff = expiresAt.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining("Expired");
        setStatus("timeout");
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, "0")}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, status]);

  const addLog = useCallback((message: string, level: string = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    setConsoleLogs((prev) => [...prev, `[${timestamp}] [${level}] ${message}`]);
  }, []);

  const extendSession = useCallback(async () => {
    if (!session || isExtending) return;

    setIsExtending(true);
    try {
      const response = await fetch(
        `/api/v1/app-builder/sessions/${session.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ durationMs: 900000 }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to extend session");
      }

      const newExpiresAt = new Date(Date.now() + 900000);
      setExpiresAt(newExpiresAt);
      addLog("Session extended by 15 minutes", "success");
      toast.success("Session extended", {
        description: "Your session has been extended by 15 minutes.",
      });
    } catch {
      toast.error("Failed to extend session");
      addLog("Failed to extend session", "error");
    } finally {
      setIsExtending(false);
    }
  }, [session, isExtending, addLog]);

  const lastLogIndexRef = useRef<number>(0);
  useEffect(() => {
    if (!session || status !== "ready") {
      lastLogIndexRef.current = 0;
      return;
    }

    let isCancelled = false;

    const fetchLogs = async () => {
      if (isCancelled) return;

      try {
        const res = await fetch(
          `/api/v1/app-builder/sessions/${session.id}/logs?tail=100`,
        );

        if (res.status === 403 || res.status === 404) {
          setSession(null);
          setStatus("idle");
          return;
        }

        if (!res.ok) return;

        const data = await res.json();
        if (data.success && data.logs?.length > 0) {
          const newLogs = data.logs.slice(lastLogIndexRef.current);
          if (newLogs.length > 0) {
            setConsoleLogs((prev) => {
              const timestamp = new Date().toLocaleTimeString();
              const formatted = newLogs.map(
                (log: string) => `[${timestamp}] ${log}`,
              );
              return [...prev, ...formatted];
            });
            lastLogIndexRef.current = data.logs.length;
          }
        }
      } catch {
        // Silently ignore network errors
      }
    };

    const interval = setInterval(fetchLogs, 3000);
    fetchLogs();

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [session, status]);

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
          appId: appIdFromUrl || undefined,
          appName: isEditMode ? undefined : appName,
          appDescription: isEditMode ? undefined : appDescription,
          templateType,
          includeMonetization,
          includeAnalytics,
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
        const errorData = await response.json();
        if (
          errorData.error?.includes("credentials not configured") ||
          errorData.error?.includes("VERCEL_TOKEN") ||
          errorData.error?.includes("OIDC")
        ) {
          setStatus("not_configured");
          setErrorMessage(errorData.error);
          setIsLoading(false);
          return;
        }
        throw new Error(errorData.error || "Failed to start session");
      }

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
                setStep("building");
                hasAutoScaffoldedRef.current = false;

                const displayName = isEditMode
                  ? appData?.name || appName
                  : appName;
                const contextMessage = sourceContext
                  ? `\n\nI see you're building an app for **${sourceContext.name}** (${sourceContext.type}). I've pre-configured the template and settings to work with this integration.`
                  : "";

                setMessages([
                  {
                    role: "assistant",
                    content: `🚀 **${isEditMode ? "Sandbox ready" : "Your sandbox is ready"} for ${displayName}!**

I'll help you ${isEditMode ? "enhance" : "build"} your app. The live preview is loading on the right.${contextMessage}

**What would you like to ${isEditMode ? "add or change" : "build"}?**

Some ideas:
- Add a new page or feature
- Improve the UI design
- Add analytics tracking
- Integrate more APIs`,
                    timestamp: new Date().toISOString(),
                  },
                ]);
                addLog(
                  `Sandbox ready at ${data.session.sandboxUrl}`,
                  "success",
                );

                const params = new URLSearchParams(searchParams.toString());
                params.set("sessionId", data.session.id);
                if (appIdFromUrl) {
                  params.set("appId", appIdFromUrl);
                }
                router.replace(
                  `/dashboard/apps/create?${params.toString()}`,
                  { scroll: false },
                );

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
        description:
          error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    appIdFromUrl,
    isEditMode,
    appData,
    appName,
    appDescription,
    templateType,
    includeMonetization,
    includeAnalytics,
    sourceContext,
    addLog,
    searchParams,
    router,
  ]);

  const sendPrompt = useCallback(
    async (promptText?: string) => {
      const text = promptText || input.trim();
      if (!text || !session || isLoading) return;

      setIsLoading(true);
      setStatus("generating");
      setGeneratingMessage("Analyzing request...");
      setGeneratingColor("text-cyan-400");

      addLog(
        `Sending prompt: "${text.substring(0, 50)}${text.length > 50 ? "..." : ""}"`,
        "info",
      );

      const userMessage: Message = {
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");

      const thinkingId = Date.now();
      let thinkingContent = "";
      let actionsContent = "";

      const updateThinking = (thinking: string, actions: string) => {
        let content = "";
        if (thinking) {
          content += `💭 *${thinking.substring(0, 200)}${thinking.length > 200 ? "..." : ""}*\n\n`;
        }
        if (actions) {
          content += actions;
        }
        if (!content) {
          content = "🤔 **Thinking...**";
        }

        setMessages((prev) => {
          const updated = [...prev];
          const thinkingIdx = updated.findIndex(
            (m) => m._thinkingId === thinkingId,
          );
          if (thinkingIdx >= 0) {
            updated[thinkingIdx] = {
              ...updated[thinkingIdx],
              content,
            };
          }
          return updated;
        });
      };

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "🤔 **Thinking...**",
          timestamp: new Date().toISOString(),
          _thinkingId: thinkingId,
        } as Message,
      ]);

      try {
        const response = await fetch(
          `/api/v1/app-builder/sessions/${session.id}/prompts/stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: text }),
          },
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to send prompt");
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

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
                  thinkingContent = data.text || "";
                  updateThinking(thinkingContent, actionsContent);
                  setGeneratingMessage("Planning changes...");
                  setGeneratingColor("text-purple-400");
                } else if (eventType === "tool_use") {
                  const toolName = data.tool;
                  let toolDisplay = "";
                  let statusMsg = "Working...";
                  let statusColor = "text-cyan-400";

                  if (toolName === "write_file") {
                    const path = data.input?.path || "file";
                    const fileName = path.split("/").pop() || path;
                    toolDisplay = `📝 Writing \`${path}\``;
                    statusMsg = `Writing ${fileName}...`;
                    statusColor = "text-green-400";
                  } else if (toolName === "read_file") {
                    const path = data.input?.path || "file";
                    toolDisplay = `👀 Reading \`${path}\``;
                    statusMsg = "Reading files...";
                    statusColor = "text-blue-400";
                  } else if (toolName === "install_packages") {
                    const packages =
                      data.input?.packages?.join(", ") || "packages";
                    toolDisplay = `📦 Installing ${packages}`;
                    statusMsg = "Installing packages...";
                    statusColor = "text-orange-400";
                  } else if (toolName === "check_build") {
                    toolDisplay = `🔍 Checking build...`;
                    statusMsg = "Checking build...";
                    statusColor = "text-yellow-400";
                  } else if (toolName === "list_files") {
                    toolDisplay = `📂 Listing files`;
                    statusMsg = "Exploring project...";
                    statusColor = "text-indigo-400";
                  } else if (toolName === "run_command") {
                    toolDisplay = `⚡ Running command`;
                    statusMsg = "Running command...";
                    statusColor = "text-red-400";
                  } else {
                    toolDisplay = `🔧 ${toolName}`;
                  }

                  setGeneratingMessage(statusMsg);
                  setGeneratingColor(statusColor);
                  actionsContent += `${toolDisplay}\n`;
                  updateThinking(thinkingContent, actionsContent);

                  addLog(
                    `🔧 ${toolName}: ${data.input?.path || data.input?.packages?.join(", ") || ""}`,
                    "info",
                  );
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

        setMessages((prev) => {
          const updated = prev.map((m) => {
            if (m._thinkingId === thinkingId) {
              const { _thinkingId: _, ...rest } = m;
              return {
                ...rest,
                content: actionsContent
                  ? `**Progress:**\n${actionsContent}`
                  : "🤔 *Processing...*",
              };
            }
            return m;
          });
          return [
            ...updated,
            {
              role: "assistant",
              content: finalData.output || "",
              filesAffected: finalData.filesAffected,
              timestamp: new Date().toISOString(),
            },
          ];
        });

        if (finalData.filesAffected && finalData.filesAffected.length > 0) {
          addLog(
            `✅ Modified: ${finalData.filesAffected.join(", ")}`,
            "success",
          );
        }
        addLog("Changes applied, refreshing preview...", "info");

        if (iframeRef.current && session) {
          iframeRef.current.src = session.sandboxUrl;
        }

        setStatus("ready");
      } catch (error) {
        setMessages((prev) => {
          const updated = prev.map((m) => {
            if (m._thinkingId === thinkingId) {
              const { _thinkingId: _, ...rest } = m;
              return {
                ...rest,
                content: actionsContent
                  ? `**Progress:**\n${actionsContent}\n\n⚠️ *Error occurred*`
                  : "⚠️ *Error occurred*",
              };
            }
            return m;
          });
          return [
            ...updated,
            {
              role: "assistant",
              content: `❌ **Error:** ${error instanceof Error ? error.message : "Something went wrong"}`,
              timestamp: new Date().toISOString(),
            },
          ];
        });

        setStatus("ready");
        addLog(
          `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          "error",
        );
        toast.error("Failed to process prompt", {
          description:
            error instanceof Error ? error.message : "Please try again",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [input, session, isLoading, addLog],
  );

  useEffect(() => {
    if (
      !session ||
      status !== "ready" ||
      hasAutoScaffoldedRef.current ||
      messages.length > 1
    )
      return;

    if (!isEditMode && (appDescription || templateType !== "blank")) {
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
    isEditMode,
    sendPrompt,
  ]);

  const stopSession = useCallback(async () => {
    if (!session) return;

    try {
      await fetch(`/api/v1/app-builder/sessions/${session.id}`, {
        method: "DELETE",
      });
      setSession(null);
      setStatus("idle");
      setMessages([]);
      setConsoleLogs([]);

      const params = new URLSearchParams(searchParams.toString());
      params.delete("sessionId");
      const baseUrl = appIdFromUrl
        ? `/dashboard/apps/create?appId=${appIdFromUrl}`
        : "/dashboard/apps/create";
      router.replace(
        params.toString() ? `${baseUrl}&${params.toString()}` : baseUrl,
        { scroll: false },
      );
      sessionStorage.removeItem(messagesStorageKey);

      addLog("Session stopped", "info");
      toast.success("Session stopped");
    } catch {
      toast.error("Failed to stop session");
    }
  }, [session, addLog, searchParams, router, appIdFromUrl, messagesStorageKey]);

  const copySandboxUrl = useCallback(async () => {
    if (!session?.sandboxUrl) return;
    await navigator.clipboard.writeText(session.sandboxUrl);
    setCopied(true);
    toast.success("URL copied");
    setTimeout(() => setCopied(false), 2000);
  }, [session]);

  const backLink = isEditMode
    ? `/dashboard/apps/${appIdFromUrl}`
    : "/dashboard/apps";

  if (status === "not_configured") {
    return (
      <div className="max-w-4xl mx-auto py-10">
        <BrandCard className="relative shadow-lg shadow-black/50">
          <CornerBrackets size="sm" className="opacity-50" />
          <div className="relative z-10 p-8">
            <div className="max-w-2xl mx-auto text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-yellow-500/20 mb-6">
                <Settings className="h-8 w-8 text-yellow-500" />
              </div>

              <h2 className="text-2xl font-bold text-white mb-3">
                Sandbox Not Configured
              </h2>
              <p className="text-white/60 mb-6">
                The AI App Builder requires sandbox credentials to create
                development environments.
              </p>

              <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-left mb-6">
                <h3 className="font-semibold text-white mb-3">
                  Setup Instructions:
                </h3>
                <ol className="space-y-3 text-sm text-white/70">
                  <li className="flex gap-2">
                    <span className="text-[#FF5800] font-mono">1.</span>
                    <span>
                      Get a Vercel Access Token from{" "}
                      <a
                        href="https://vercel.com/account/tokens"
                        target="_blank"
                        rel="noopener"
                        className="text-[#FF5800] hover:underline"
                      >
                        vercel.com/account/tokens
                      </a>
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-[#FF5800] font-mono">2.</span>
                    <span>Find your Team ID in Vercel Dashboard → Settings</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-[#FF5800] font-mono">3.</span>
                    <span>
                      Find your Project ID in Project → Settings → General
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-[#FF5800] font-mono">4.</span>
                    <span>
                      Add to your{" "}
                      <code className="bg-white/10 px-1.5 py-0.5 rounded">
                        .env.local
                      </code>
                      :
                    </span>
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
                  onClick={() =>
                    window.open(
                      "https://vercel.com/docs/vercel-sandbox",
                      "_blank",
                    )
                  }
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
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
      </div>
    );
  }

  if (isRestoring || (sessionIdFromUrl && !session && status === "idle")) {
    return (
      <div className="max-w-4xl mx-auto py-10">
        <BrandCard className="relative">
          <CornerBrackets className="opacity-20" />
          <div className="relative z-10 p-8">
            <div className="max-w-md mx-auto text-center">
              <Loader2 className="h-12 w-12 animate-spin text-[#FF5800] mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">
                Restoring Session
              </h2>
              <p className="text-white/60">
                Loading your sandbox environment...
              </p>
            </div>
          </div>
        </BrandCard>
      </div>
    );
  }

  if (step === "setup" && !isEditMode) {
    return (
      <div className="max-w-4xl mx-auto py-10 space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href={backLink}
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
              <Link href={backLink}>
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

  if (status === "idle" && isEditMode) {
    return (
      <div className="max-w-4xl mx-auto py-10 space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href={backLink}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-white/60" />
          </Link>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: "#FF5800" }}
              />
              <h1
                className="text-3xl font-normal tracking-tight text-white"
                style={{ fontFamily: "var(--font-roboto-mono)" }}
              >
                {appData?.name || "Loading..."}
              </h1>
            </div>
            <p className="text-white/60">
              Edit your app with AI-powered code generation
            </p>
          </div>
        </div>

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
                Launch a sandbox environment to enhance your app with AI
                assistance.
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
      </div>
    );
  }

  if (status === "initializing") {
    const steps = [
      { key: "creating", label: "Creating sandbox instance" },
      { key: "installing", label: "Installing dependencies" },
      { key: "starting", label: "Starting dev server" },
    ];

    const currentStepIndex = steps.findIndex((s) => s.key === progressStep);

    return (
      <div className="max-w-4xl mx-auto py-10">
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

                  return (
                    <div
                      key={step.key}
                      className={`flex items-center gap-2 text-sm transition-all duration-300 ${
                        isComplete
                          ? "text-white/60"
                          : isCurrent
                            ? "text-white/80"
                            : "text-white/40"
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
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="max-w-4xl mx-auto py-10">
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
                {errorMessage ||
                  "There was an error starting the development environment."}
              </p>
              <Button onClick={startSession} variant="outline">
                Try Again
              </Button>
            </div>
          </div>
        </BrandCard>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/40">
        <div className="flex items-center gap-4">
          <Link
            href={backLink}
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
              {appData?.name || appName}
            </span>
            {isEditMode && (
              <span className="px-2 py-0.5 text-xs bg-[#FF5800]/20 text-[#FF5800] rounded">
                Editing
              </span>
            )}
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
          <span
            className={`flex items-center gap-1 text-xs ${
              timeRemaining === "Expired"
                ? "text-red-400"
                : parseInt(timeRemaining.split(":")[0] || "30") <= 5
                  ? "text-yellow-400"
                  : "text-white/40"
            }`}
          >
            <Timer className="h-3 w-3" />
            {timeRemaining
              ? timeRemaining === "Expired"
                ? "Expired"
                : timeRemaining
              : "..."}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={extendSession}
            disabled={isExtending || status !== "ready"}
            className="h-7 text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
          >
            {isExtending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            <span className="ml-1">15m</span>
          </Button>
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

      <div className="flex-1 flex overflow-hidden">
        <div
          className={`flex flex-col border-r border-white/10 bg-black/20 transition-all ${isFullscreen ? "w-0 overflow-hidden" : "w-1/2"}`}
        >
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-4"
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] p-4 ${
                    msg.role === "user"
                      ? "bg-cyan-500/20 border border-cyan-500/30"
                      : "bg-white/5 border border-white/10"
                  }`}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => (
                        <h1 className="text-xl font-bold text-white mb-3 pb-2 border-b border-white/10">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-lg font-semibold text-white mt-4 mb-2 flex items-center gap-2">
                          {children}
                        </h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-base font-medium text-cyan-300 mt-3 mb-1">
                          {children}
                        </h3>
                      ),
                      p: ({ children }) => (
                        <p className="text-sm text-white/80 mb-2 leading-relaxed">
                          {children}
                        </p>
                      ),
                      ul: ({ children }) => (
                        <ul className="space-y-1 mb-3 ml-1">{children}</ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="space-y-1 mb-3 ml-1 list-decimal list-inside">
                          {children}
                        </ol>
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
                        <pre className="bg-black/40 border border-white/10 rounded overflow-hidden my-3">
                          {children}
                        </pre>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold text-white">
                          {children}
                        </strong>
                      ),
                      em: ({ children }) => (
                        <em className="text-white/60 italic">{children}</em>
                      ),
                      a: ({ href, children }) => (
                        <a
                          href={href}
                          className="text-cyan-400 hover:text-cyan-300 underline"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {children}
                        </a>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-cyan-500/50 pl-3 my-2 text-white/60 italic">
                          {children}
                        </blockquote>
                      ),
                      hr: () => <hr className="border-white/10 my-4" />,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
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
                    <Loader2
                      className={`h-4 w-4 animate-spin ${generatingColor}`}
                    />
                    <span className={`text-sm ${generatingColor}`}>
                      {generatingMessage}
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

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

        <div className={`flex-1 flex flex-col ${isFullscreen ? "w-full" : ""}`}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-black/20">
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
            {previewTab === "console" && consoleLogs.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 ml-auto"
                onClick={() => setConsoleLogs([])}
                title="Clear console"
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            )}
            {previewTab === "preview" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 ml-auto"
                onClick={() => {
                  if (iframeRef.current && session) {
                    iframeRef.current.src = session.sandboxUrl;
                  }
                }}
                title="Refresh preview"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          <div className="flex-1 bg-white/5">
            {previewTab === "preview" ? (
              session?.sandboxUrl ? (
                <iframe
                  ref={iframeRef}
                  src={session.sandboxUrl}
                  className="w-full h-full border-0"
                  title="App Preview"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-cyan-400 mx-auto mb-4" />
                    <p className="text-white/60">Loading preview...</p>
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
                      let colorClass = "text-white/60";
                      let bgClass = "";

                      if (log.includes("[info]")) {
                        colorClass = "text-blue-400";
                      } else if (log.includes("[success]")) {
                        colorClass = "text-green-400";
                      } else if (
                        log.includes("[error]") ||
                        log.includes("Error") ||
                        log.includes("error")
                      ) {
                        colorClass = "text-red-400";
                        bgClass = "bg-red-500/10";
                      } else if (
                        log.includes("[warning]") ||
                        log.includes("⚠") ||
                        log.includes("Warning")
                      ) {
                        colorClass = "text-yellow-400";
                        bgClass = "bg-yellow-500/5";
                      } else if (log.includes("Progress:")) {
                        colorClass = "text-purple-400";
                      } else if (
                        log.includes("GET ") ||
                        log.includes("POST ") ||
                        log.includes("PUT ") ||
                        log.includes("DELETE ")
                      ) {
                        if (log.includes(" 2")) {
                          colorClass = "text-green-400/70";
                        } else if (log.includes(" 4") || log.includes(" 5")) {
                          colorClass = "text-red-400/70";
                        } else {
                          colorClass = "text-cyan-400/70";
                        }
                      } else if (log.includes("✓")) {
                        colorClass = "text-green-400/80";
                      } else if (
                        log.includes("Next.js") ||
                        log.includes("Turbopack")
                      ) {
                        colorClass = "text-white/80";
                      }

                      return (
                        <div
                          key={i}
                          className={`flex gap-2 hover:bg-white/5 px-1 rounded ${bgClass}`}
                        >
                          <span className="text-white/20 select-none w-5 text-right shrink-0">
                            {i + 1}
                          </span>
                          <pre
                            className={`whitespace-pre-wrap break-all ${colorClass}`}
                          >
                            {log}
                          </pre>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
