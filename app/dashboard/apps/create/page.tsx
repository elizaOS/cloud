"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 1,
): Promise<Response> {
  const fetchOptions: RequestInit = {
    ...options,
    credentials: "include",
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);

      if (response.status === 401 && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
    }
  }

  throw lastError || new Error("Request failed after retries");
}
import {
  Loader2,
  Send,
  Sparkles,
  RefreshCw,
  ExternalLink,
  ArrowLeft,
  Bot,
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
  const initializationRef = useRef(false);
  const sessionActionsLogRef = useRef<{ tool: string; detail: string; timestamp: string; status: "active" | "done" }[]>([]);
  const initialThinkingIdRef = useRef<number | null>(null);

  const appIdFromUrl = searchParams.get("appId");
  const sessionIdFromUrl = searchParams.get("sessionId");
  const isEditMode = !!appIdFromUrl;

  const sourceContext: SourceContext | null = useMemo(() => {
    const sourceType = searchParams.get("source") as SourceType | null;
    const sourceId = searchParams.get("sourceId");
    const sourceName = searchParams.get("sourceName");
    if (sourceType && sourceId && sourceName) {
      return { type: sourceType, id: sourceId, name: sourceName };
    }
    return null;
  }, [searchParams]);

  const [isInitializing, setIsInitializing] = useState(isEditMode || !!sessionIdFromUrl);
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
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progressStep, setProgressStep] = useState<ProgressStep>("creating");
  const [previewTab, setPreviewTab] = useState<"preview" | "console">("preview");
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [isExtending, setIsExtending] = useState(false);
  const [snapshotInfo, setSnapshotInfo] = useState<{
    fileCount: number;
    totalSize: number;
    canRestore: boolean;
    lastBackup: string | null;
  } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<{
    current: number;
    total: number;
    filePath: string;
  } | null>(null);

  const messagesStorageKey = appIdFromUrl
    ? `app-builder-messages-${appIdFromUrl}`
    : `app-builder-messages-new`;

  useEffect(() => {
    if (initializationRef.current) return;
    initializationRef.current = true;

    const initialize = async () => {
      if (sessionIdFromUrl) {
        try {
          const response = await fetchWithRetry(
            `/api/v1/app-builder/sessions/${sessionIdFromUrl}`,
          );

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.session && data.session.sandboxUrl) {
              const restoredSession: SessionData = {
                id: data.session.id,
                sandboxId: data.session.sandboxId,
                sandboxUrl: data.session.sandboxUrl,
                status: data.session.status,
                examplePrompts: data.session.examplePrompts || [],
                expiresAt: data.session.expiresAt || null,
              };

              setSession(restoredSession);
              setStatus(data.session.status);
              setStep("building");

              const stored = sessionStorage.getItem(messagesStorageKey);
              if (stored) {
                try {
                  setMessages(JSON.parse(stored));
                } catch {
                  // Invalid stored data
                }
              }

              if (appIdFromUrl) {
                const appResponse = await fetchWithRetry(`/api/v1/apps/${appIdFromUrl}`);
                if (appResponse.ok) {
                  const appData = await appResponse.json();
                  if (appData.success && appData.app) {
                    setAppData(appData.app);
                    setAppName(appData.app.name);
                  }
                }
              }

              setIsInitializing(false);
              return;
            }
          }

          const params = new URLSearchParams(searchParams.toString());
          params.delete("sessionId");
          const newUrl = appIdFromUrl
            ? `/dashboard/apps/create?appId=${appIdFromUrl}`
            : "/dashboard/apps/create";
          router.replace(newUrl, { scroll: false });
          sessionStorage.removeItem(messagesStorageKey);

          if (appIdFromUrl) {
            await fetchAppDataAndSession();
          } else {
            setIsInitializing(false);
          }
          return;
        } catch {
          const params = new URLSearchParams(searchParams.toString());
          params.delete("sessionId");
          router.replace(`/dashboard/apps/create?${params.toString()}`, { scroll: false });
          sessionStorage.removeItem(messagesStorageKey);
        }
      }

      if (appIdFromUrl && !sessionIdFromUrl) {
        await fetchAppDataAndSession();
      } else {
        setIsInitializing(false);
      }
    };

    const fetchAppDataAndSession = async () => {
      try {
        const appResponse = await fetchWithRetry(`/api/v1/apps/${appIdFromUrl}`);
        if (!appResponse.ok) {
          toast.error("App not found");
          router.push("/dashboard/apps");
          return;
        }

        const appData = await appResponse.json();
        if (appData.success && appData.app) {
          setAppData(appData.app);
          setAppName(appData.app.name);
          setAppDescription(appData.app.description || "");
          setIncludeMonetization(appData.app.monetization_enabled || false);
        }

        const sessionResponse = await fetchWithRetry(
          `/api/v1/app-builder?appId=${appIdFromUrl}&limit=1&includeInactive=false`,
        );

        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json();
          if (sessionData.success && sessionData.sessions?.length > 0) {
            const existingSession = sessionData.sessions[0];
            router.replace(
              `/dashboard/apps/create?appId=${appIdFromUrl}&sessionId=${existingSession.id}`,
              { scroll: false },
            );
            initializationRef.current = false;
            return;
          }
        }

        setIsInitializing(false);
      } catch {
        toast.error("Failed to load app");
        router.push("/dashboard/apps");
      }
    };

    initialize();
  }, [appIdFromUrl, sessionIdFromUrl, router, searchParams, messagesStorageKey]);

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
    if (session?.expiresAt && !expiresAt) {
      setExpiresAt(new Date(session.expiresAt));
    }
  }, [session?.expiresAt, expiresAt]);

  useEffect(() => {
    if (status === "stopped" || status === "timeout") {
      setTimeRemaining(status === "timeout" ? "Expired" : "");
      return;
    }

    if (!expiresAt) {
      setTimeRemaining("");
      return;
    }

    let animationFrameId: number;
    let lastUpdate = 0;

    const updateCountdown = (timestamp: number) => {
      if (timestamp - lastUpdate >= 1000 || lastUpdate === 0) {
        lastUpdate = timestamp;
        const now = Date.now();
        const diff = expiresAt.getTime() - now;

        if (diff <= 0) {
          setTimeRemaining("Expired");
          setStatus("timeout");
          return;
        }

        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, "0")}`);
      }
      animationFrameId = requestAnimationFrame(updateCountdown);
    };

    animationFrameId = requestAnimationFrame(updateCountdown);
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [expiresAt, status]);

  const addLog = useCallback((message: string, level: string = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    setConsoleLogs((prev) => [...prev, `[${timestamp}] [${level}] ${message}`]);
  }, []);

  const extendSession = useCallback(async () => {
    if (!session || isExtending) return;

    setIsExtending(true);
    try {
      const response = await fetchWithRetry(
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

  const checkSnapshots = useCallback(async () => {
    if (!session) return;
    try {
      const response = await fetchWithRetry(
        `/api/v1/app-builder/sessions/${session.id}/snapshots`,
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setSnapshotInfo({
            fileCount: data.fileCount,
            totalSize: data.totalSize,
            canRestore: data.canRestore,
            lastBackup: data.lastBackup,
          });
        }
      }
    } catch {
      // Snapshot check failed, not critical
    }
  }, [session]);

  const restoreSession = useCallback(async () => {
    if (!session || isRestoring) return;

    setIsRestoring(true);
    setRestoreProgress(null);
    setStatus("initializing");
    setProgressStep("creating");
    addLog("Restoring session with saved files...", "info");

    try {
      const response = await fetchWithRetry(
        `/api/v1/app-builder/sessions/${session.id}/resume/stream`,
        { method: "POST" },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to restore session");
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
                addLog(`Progress: ${data.step} - ${data.message}`, "info");
              } else if (eventType === "restore_progress") {
                setRestoreProgress({
                  current: data.current,
                  total: data.total,
                  filePath: data.filePath,
                });
                addLog(`Restoring: ${data.filePath} (${data.current}/${data.total})`, "info");
              } else if (eventType === "complete") {
                setSession({
                  ...data.session,
                  expiresAt: data.session.expiresAt,
                });
                setStatus("ready");
                setStep("building");

                if (data.session.expiresAt) {
                  setExpiresAt(new Date(data.session.expiresAt));
                }

                if (data.session.messages) {
                  setMessages(data.session.messages);
                }

                setRestoreProgress(null);
                addLog("Session restored successfully!", "success");
                toast.success("Session restored!", {
                  description: "Your work has been restored. You can continue building.",
                });
              } else if (eventType === "error") {
                throw new Error(data.error || "Restoration failed");
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
      setErrorMessage(error instanceof Error ? error.message : "Restoration failed");
      toast.error("Failed to restore session", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      addLog(`Restoration failed: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
    } finally {
      setIsRestoring(false);
      setRestoreProgress(null);
    }
  }, [session, isRestoring, addLog]);

  useEffect(() => {
    if (status === "timeout" && session) {
      checkSnapshots();
    }
  }, [status, session, checkSnapshots]);

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
        const res = await fetchWithRetry(
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
    sessionActionsLogRef.current = [];

    const shouldAutoScaffold = !isEditMode && (appDescription || templateType !== "blank");
    const initialPrompt = shouldAutoScaffold
      ? appDescription
        ? `Set up the initial app structure based on these requirements:\n\n**Template:** ${templateType}\n**Description:** ${appDescription}\n\nPlease scaffold the project with all necessary components, pages, and styling to match this description.`
        : `Set up the initial ${templateType} app structure with all the core features, components, and styling.`
      : undefined;

    try {
      const response = await fetchWithRetry("/api/v1/app-builder/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: appIdFromUrl || undefined,
          appName: isEditMode ? undefined : appName,
          appDescription: isEditMode ? undefined : appDescription,
          initialPrompt,
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

              if (eventType === "heartbeat") {
                // Heartbeat received, connection is alive
                continue;
              } else if (eventType === "progress") {
                setProgressStep(data.step as ProgressStep);
                addLog(`Progress: ${data.step}`, "info");
              } else if (eventType === "sandbox_ready") {
                setSession(data.session);
                setStep("building");
                setStatus(data.hasInitialPrompt ? "generating" : "ready");

                if (data.session.expiresAt) {
                  setExpiresAt(new Date(data.session.expiresAt));
                }

                const displayName = isEditMode ? appData?.name || appName : appName;

                const newUrl = appIdFromUrl
                  ? `/dashboard/apps/create?appId=${appIdFromUrl}&sessionId=${data.session.id}`
                  : `/dashboard/apps/create?sessionId=${data.session.id}`;
                router.replace(newUrl, { scroll: false });

                addLog(`Sandbox ready at ${data.session.sandboxUrl}`, "success");

                if (data.hasInitialPrompt) {
                  const thinkingId = Date.now();
                  initialThinkingIdRef.current = thinkingId;

                  setMessages([
                    {
                      role: "user",
                      content: initialPrompt || "Set up the app",
                      timestamp: new Date().toISOString(),
                    },
                    {
                      role: "assistant",
                      content: `**Setting up ${displayName}**\n\n*Analyzing requirements and generating code...*`,
                      timestamp: new Date().toISOString(),
                      _thinkingId: thinkingId,
                    } as Message,
                  ]);
                } else {
                  const contextMessage = sourceContext
                    ? `\n\nI see you're building an app for **${sourceContext.name}** (${sourceContext.type}). I've pre-configured the template and settings to work with this integration.`
                    : "";
                  setMessages([
                    {
                      role: "assistant",
                      content: `**${isEditMode ? "Sandbox ready" : "Your sandbox is ready"} for ${displayName}!**

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
                  setIsLoading(false);
                  toast.success("Sandbox ready!", {
                    description: "Your development environment is ready.",
                  });
                }
              } else if (eventType === "thinking") {
                addLog("Planning changes...", "info");
              } else if (eventType === "tool_use") {
                const toolName = data.tool;
                let toolDisplay = "";
                let detail = "";

                if (toolName === "write_file") {
                  const path = data.input?.path || "file";
                  toolDisplay = "Writing file";
                  detail = path;
                } else if (toolName === "read_file") {
                  const path = data.input?.path || "file";
                  toolDisplay = "Reading file";
                  detail = path;
                } else if (toolName === "install_packages") {
                  const packages = data.input?.packages?.join(", ") || "packages";
                  toolDisplay = "Installing packages";
                  detail = packages;
                } else if (toolName === "check_build") {
                  toolDisplay = "Checking build";
                  detail = "Verifying project compiles";
                } else if (toolName === "list_files") {
                  const path = data.input?.path || ".";
                  toolDisplay = "Listing directory";
                  detail = path;
                } else if (toolName === "run_command") {
                  const cmd = data.input?.command || "command";
                  toolDisplay = "Running command";
                  detail = cmd;
                } else {
                  toolDisplay = toolName.replace(/_/g, " ");
                  detail = JSON.stringify(data.input || {}).slice(0, 50);
                }

                if (sessionActionsLogRef.current.length > 0) {
                  sessionActionsLogRef.current[sessionActionsLogRef.current.length - 1].status = "done";
                }
                const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
                sessionActionsLogRef.current.push({ tool: toolDisplay, detail, timestamp, status: "active" });
                addLog(`${toolName}: ${data.input?.path || data.input?.packages?.join(", ") || ""}`, "info");

                if (initialThinkingIdRef.current) {
                  const thinkingId = initialThinkingIdRef.current;
                  let progressContent = `**Setting up ${appName}**\n\n`;
                  sessionActionsLogRef.current.forEach((action) => {
                    const statusMarker = action.status === "active" ? "[RUNNING]" : "[DONE]";
                    progressContent += `\`${action.timestamp}\` ${statusMarker} **${action.tool}**\n`;
                    progressContent += `> \`${action.detail}\`\n\n`;
                  });
                  progressContent += `---\n\n*Working...*`;

                  setMessages((prev) =>
                    prev.map((m) =>
                      (m as Message & { _thinkingId?: number })._thinkingId === thinkingId
                        ? { ...m, content: progressContent }
                        : m
                    )
                  );
                }
              } else if (eventType === "complete") {
                setSession(data.session);
                setStatus("ready");

                if (data.session.initialPromptResult && initialThinkingIdRef.current) {
                  const thinkingId = initialThinkingIdRef.current;
                  initialThinkingIdRef.current = null;

                  sessionActionsLogRef.current.forEach((action) => {
                    action.status = "done";
                  });

                  let assistantContent = "";
                  if (data.session.initialPromptResult.output) {
                    assistantContent += data.session.initialPromptResult.output;
                  }

                  if (sessionActionsLogRef.current.length > 0) {
                    assistantContent += "\n\n---\n\n";
                    assistantContent += "**Operations Completed**\n\n";
                    sessionActionsLogRef.current.forEach((action) => {
                      assistantContent += `\`${action.timestamp}\` **${action.tool}**\n`;
                      assistantContent += `> \`${action.detail}\`\n\n`;
                    });
                  }

                  setMessages((prev) =>
                    prev.map((m) => {
                      if ((m as Message & { _thinkingId?: number })._thinkingId === thinkingId) {
                        const { _thinkingId: _, ...rest } = m as Message & { _thinkingId?: number };
                        return {
                          ...rest,
                          content: assistantContent,
                          filesAffected: data.session.initialPromptResult.filesAffected,
                        };
                      }
                      return m;
                    })
                  );

                  if (iframeRef.current && data.session.sandboxUrl) {
                    iframeRef.current.src = data.session.sandboxUrl;
                  }

                  toast.success("App scaffolded!", {
                    description: "Your app structure has been created.",
                  });
                }

                setIsLoading(false);
                addLog("Build complete", "success");
              } else if (eventType === "cancelled") {
                throw new Error("Session creation was cancelled");
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
    router,
  ]);

  const sendPrompt = useCallback(
    async (promptText?: string) => {
      const text = promptText || input.trim();
      if (!text || !session || isLoading) return;

      setIsLoading(true);
      setStatus("generating");

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
      const actionsLog: { tool: string; detail: string; timestamp: string; status: "active" | "done" }[] = [];

      const getTimeString = () => {
        return new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      };

      const buildProgressContent = (currentStatus?: string) => {
        let content = "**Processing your request**\n\n";

        if (actionsLog.length > 0) {
          actionsLog.forEach((action, idx) => {
            const isActive = action.status === "active";
            const statusMarker = isActive ? "[RUNNING]" : "[DONE]";
            content += `\`${action.timestamp}\` ${statusMarker} **${action.tool}**\n`;
            content += `> \`${action.detail}\`\n\n`;
          });
        }

        if (currentStatus) {
          content += `---\n\n*${currentStatus}*`;
        }

        return content;
      };

      const updateThinking = (currentStatus?: string) => {
        const content = buildProgressContent(currentStatus);
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
          content: "**Processing your request**\n\n*Analyzing...*",
          timestamp: new Date().toISOString(),
          _thinkingId: thinkingId,
        } as Message,
      ]);

      try {
        const response = await fetchWithRetry(
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

                if (eventType === "heartbeat") {
                  // Heartbeat received, connection is alive
                  continue;
                } else if (eventType === "thinking") {
                  updateThinking("Planning changes...");
                } else if (eventType === "tool_use") {
                  const toolName = data.tool;
                  let toolDisplay = "";
                  let detail = "";
                  let statusMsg = "Working...";

                  if (toolName === "write_file") {
                    const path = data.input?.path || "file";
                    toolDisplay = "Writing file";
                    detail = path;
                    statusMsg = `Writing ${path.split("/").pop()}...`;
                  } else if (toolName === "read_file") {
                    const path = data.input?.path || "file";
                    toolDisplay = "Reading file";
                    detail = path;
                    statusMsg = "Reading file...";
                  } else if (toolName === "install_packages") {
                    const packages = data.input?.packages?.join(", ") || "packages";
                    toolDisplay = "Installing packages";
                    detail = packages;
                    statusMsg = "Installing dependencies...";
                  } else if (toolName === "check_build") {
                    toolDisplay = "Checking build";
                    detail = "Verifying project compiles";
                    statusMsg = "Running build check...";
                  } else if (toolName === "list_files") {
                    const path = data.input?.path || ".";
                    toolDisplay = "Listing directory";
                    detail = path;
                    statusMsg = "Exploring project structure...";
                  } else if (toolName === "run_command") {
                    const cmd = data.input?.command || "command";
                    toolDisplay = "Running command";
                    detail = cmd;
                    statusMsg = "Executing command...";
                  } else {
                    toolDisplay = toolName.replace(/_/g, " ");
                    detail = JSON.stringify(data.input || {}).slice(0, 50);
                  }

                  if (actionsLog.length > 0) {
                    actionsLog[actionsLog.length - 1].status = "done";
                  }
                  actionsLog.push({ tool: toolDisplay, detail, timestamp: getTimeString(), status: "active" });
                  updateThinking(statusMsg);

                  addLog(
                    `${toolName}: ${data.input?.path || data.input?.packages?.join(", ") || ""}`,
                    "info",
                  );
                } else if (eventType === "complete") {
                  finalData = data;
                } else if (eventType === "cancelled") {
                  throw new Error("Operation was cancelled");
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

        actionsLog.forEach((action) => {
          action.status = "done";
        });

        setMessages((prev) => {
          return prev.map((m) => {
            if (m._thinkingId === thinkingId) {
              const { _thinkingId: _, ...rest } = m;

              let content = "";

              if (finalData.output) {
                content += finalData.output;
              }

              if (actionsLog.length > 0) {
                content += "\n\n---\n\n";
                content += "**Operations Completed**\n\n";
                actionsLog.forEach((action) => {
                  content += `\`${action.timestamp}\` **${action.tool}**\n`;
                  content += `> \`${action.detail}\`\n\n`;
                });
              }

              return {
                ...rest,
                content,
                filesAffected: finalData.filesAffected,
              };
            }
            return m;
          });
        });

        if (finalData.filesAffected && finalData.filesAffected.length > 0) {
          addLog(
            `Modified: ${finalData.filesAffected.join(", ")}`,
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
          return prev.map((m) => {
            if (m._thinkingId === thinkingId) {
              const { _thinkingId: _, ...rest } = m;

              let content = `**Error:** ${error instanceof Error ? error.message : "Something went wrong"}\n\n`;
              content += "The operation could not be completed. Please try again or modify your request.";

              if (actionsLog.length > 0) {
                content += "\n\n---\n\n";
                content += "**Attempted Actions**\n\n";
                actionsLog.forEach((action) => {
                  content += `\`${action.timestamp}\` **${action.tool}**\n`;
                  content += `> \`${action.detail}\`\n\n`;
                });
              }

              return {
                ...rest,
                content,
              };
            }
            return m;
          });
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

  
  const stopSession = useCallback(async () => {
    if (!session) return;

    try {
      await fetchWithRetry(`/api/v1/app-builder/sessions/${session.id}`, {
        method: "DELETE",
      });
      setSession(null);
      setStatus("idle");
      setMessages([]);
      setConsoleLogs([]);

      const newUrl = appIdFromUrl
        ? `/dashboard/apps/create?appId=${appIdFromUrl}`
        : "/dashboard/apps/create";
      router.replace(newUrl, { scroll: false });
      sessionStorage.removeItem(messagesStorageKey);

      addLog("Session stopped", "info");
      toast.success("Session stopped");
    } catch {
      toast.error("Failed to stop session");
    }
  }, [session, addLog, router, appIdFromUrl, messagesStorageKey]);

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

  if (isInitializing) {
    return (
      <div className="max-w-4xl mx-auto py-10">
        <BrandCard className="relative">
          <CornerBrackets className="opacity-20" />
          <div className="relative z-10 p-8">
            <div className="max-w-md mx-auto text-center">
              <Loader2 className="h-12 w-12 animate-spin text-[#FF5800] mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">
                {sessionIdFromUrl ? "Restoring Session" : "Loading"}
              </h2>
              <p className="text-white/60">
                {sessionIdFromUrl
                  ? "Loading your sandbox environment..."
                  : "Preparing app builder..."}
              </p>
            </div>
          </div>
        </BrandCard>
      </div>
    );
  }

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
                    <span>Find your Team ID in Vercel Dashboard Settings</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-[#FF5800] font-mono">3.</span>
                    <span>
                      Find your Project ID in Project Settings General
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
                <div className="flex items-center justify-between">
                  <Label className="text-white/70">App Name</Label>
                  <span
                    className={`text-xs ${
                      appName.length > 100
                        ? "text-red-400"
                        : appName.length > 80
                          ? "text-yellow-400"
                          : "text-white/40"
                    }`}
                  >
                    {appName.length}/100
                  </span>
                </div>
                <Input
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="My Awesome App"
                  className={`bg-black/40 border-white/20 text-white ${
                    appName.length > 100 ? "border-red-400/50 focus:border-red-400" : ""
                  }`}
                  maxLength={100}
                />
                {appName.length > 100 && (
                  <p className="text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Name exceeds 100 character limit
                  </p>
                )}
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
              <div className="flex items-center justify-between">
                <Label className="text-white/70">Description</Label>
                <span
                  className={`text-xs ${
                    appDescription.length > 500
                      ? "text-red-400"
                      : appDescription.length > 400
                        ? "text-yellow-400"
                        : "text-white/40"
                  }`}
                >
                  {appDescription.length}/500
                </span>
              </div>
              <Textarea
                value={appDescription}
                onChange={(e) => setAppDescription(e.target.value)}
                placeholder="Describe what your app should do..."
                className={`bg-black/40 border-white/20 text-white min-h-[100px] ${
                  appDescription.length > 500 ? "border-red-400/50 focus:border-red-400" : ""
                }`}
              />
              {appDescription.length > 500 && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Description exceeds 500 character limit
                </p>
              )}
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
                disabled={!appName.trim() || appName.length > 100 || isLoading || appDescription.length > 500}
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

  if (status === "idle" && isEditMode && !session) {
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
    <div className="fixed top-16 left-0 md:left-64 right-0 bottom-0 flex flex-col overflow-hidden bg-[#0A0A0A] z-10">
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/40">
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
          {timeRemaining && (
            <span
              className={`flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded ${
                timeRemaining === "Expired"
                  ? "text-red-400 bg-red-500/10"
                  : parseInt(timeRemaining.split(":")[0] || "30") <= 5
                    ? "text-yellow-400 bg-yellow-500/10"
                    : "text-white/60 bg-white/5"
              }`}
            >
              <Timer className="h-3 w-3" />
              {timeRemaining}
            </span>
          )}
          {status === "timeout" && snapshotInfo?.canRestore ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={restoreSession}
              disabled={isRestoring}
              className="h-7 text-xs text-green-400 hover:text-green-300 hover:bg-green-500/10"
            >
              {isRestoring ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              <span className="ml-1">Restore</span>
            </Button>
          ) : (
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
          )}
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

      {status === "timeout" && (
        <div className="absolute inset-0 top-[57px] bg-black/80 backdrop-blur-sm z-20 flex items-center justify-center">
          <BrandCard className="max-w-md mx-4">
            <CornerBrackets className="opacity-20" />
            <div className="relative z-10 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
                <Timer className="h-8 w-8 text-red-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">Session Expired</h2>
              <p className="text-sm text-white/60">
                Your sandbox session has timed out after 30 minutes of inactivity.
              </p>

              {snapshotInfo?.canRestore ? (
                <div className="space-y-3">
                  <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <p className="text-sm text-green-400 font-medium">
                      Good news! Your work has been saved.
                    </p>
                    <p className="text-xs text-white/50 mt-1">
                      {snapshotInfo.fileCount} files ({Math.round(snapshotInfo.totalSize / 1024)}KB) backed up
                    </p>
                  </div>

                  <Button
                    onClick={restoreSession}
                    disabled={isRestoring}
                    className="w-full bg-green-600 hover:bg-green-500 text-white"
                  >
                    {isRestoring ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {restoreProgress
                          ? `Restoring ${restoreProgress.current}/${restoreProgress.total}...`
                          : "Creating sandbox..."}
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Restore Session
                      </>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => router.push("/dashboard/apps")}
                    disabled={isRestoring}
                    className="w-full"
                  >
                    Return to Apps
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                    <p className="text-xs text-white/50">
                      {snapshotInfo === null
                        ? "Checking for saved files..."
                        : "No saved files found. You'll need to start fresh."}
                    </p>
                  </div>

                  <Button
                    onClick={startSession}
                    className="w-full bg-[#FF5800] hover:bg-[#FF5800]/80"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Start New Session
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => router.push("/dashboard/apps")}
                    className="w-full"
                  >
                    Return to Apps
                  </Button>
                </div>
              )}
            </div>
          </BrandCard>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div
          className={`flex flex-col border-r border-white/10 bg-black/20 transition-all overflow-hidden ${isFullscreen ? "w-0" : "w-1/2"}`}
        >
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-4"
          >
            {messages.map((msg, i) => {
              const isProcessing = !!(msg as Message & { _thinkingId?: number })._thinkingId;
              const msgTime = new Date(msg.timestamp).toLocaleTimeString("en-US", {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit"
              });

              return (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} w-full`}
              >
                <div
                  className={`p-4 ${
                    msg.role === "user"
                      ? "max-w-[75%] bg-cyan-500/20 border border-cyan-500/30"
                      : isProcessing
                        ? "w-full bg-purple-500/10 border border-purple-500/30"
                        : "w-full bg-white/5 border border-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      {isProcessing && (
                        <Loader2 className="h-3 w-3 animate-spin text-purple-400" />
                      )}
                      <span className={`text-xs font-medium ${
                        msg.role === "user" ? "text-cyan-400" : isProcessing ? "text-purple-400" : "text-white/50"
                      }`}>
                        {msg.role === "user" ? "You" : isProcessing ? "Processing" : "Assistant"}
                      </span>
                    </div>
                    <span className="text-xs text-white/30 font-mono">{msgTime}</span>
                  </div>
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
                          <span className="text-cyan-400 mt-1.5">-</span>
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
                      table: ({ children }) => (
                        <div className="overflow-x-auto my-3">
                          <table className="w-full text-xs border-collapse">
                            {children}
                          </table>
                        </div>
                      ),
                      thead: ({ children }) => (
                        <thead className="bg-white/5 border-b border-white/10">
                          {children}
                        </thead>
                      ),
                      tbody: ({ children }) => (
                        <tbody className="divide-y divide-white/5">
                          {children}
                        </tbody>
                      ),
                      tr: ({ children }) => (
                        <tr className="hover:bg-white/5 transition-colors">
                          {children}
                        </tr>
                      ),
                      th: ({ children }) => (
                        <th className="px-3 py-2 text-left text-white/70 font-medium">
                          {children}
                        </th>
                      ),
                      td: ({ children }) => (
                        <td className="px-3 py-2 text-white/60">
                          {children}
                        </td>
                      ),
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
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="flex-shrink-0 p-4 border-t border-white/10">
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

        <div className={`flex-1 flex flex-col overflow-hidden ${isFullscreen ? "w-full" : ""}`}>
          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-black/20">
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

          <div className="flex-1 bg-white/5 overflow-hidden">
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
              <div className="h-full bg-[#1a1a1a] overflow-y-auto overflow-x-hidden font-mono text-xs">
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
