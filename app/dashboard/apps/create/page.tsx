"use client";

import { useState, useCallback, useRef, useEffect, useMemo, memo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useChatInput } from "@/lib/app-builder/store";
import { formatToolDisplay, getTimeString } from "@/lib/app-builder";
import { markdownComponents } from "@/lib/app-builder/markdown-components";
import type {
  Message,
  SessionData,
  SessionStatus,
  ProgressStep,
  TemplateType,
  AppData,
  GitStatusInfo,
  CommitInfo,
  TemplateOption,
  SourceType,
  SourceContext,
  PreviewTab,
} from "@/lib/app-builder/types";
import { ChatInput, HistoryTab } from "@/components/app-builder";

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
  Sparkles,
  RefreshCw,
  ExternalLink,
  ArrowLeft,
  ArrowRight,
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
  GitBranch,
  Save,
  History,
  Cloud,
  CloudOff,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Rocket,
  FolderCode,
  MessageSquare,
  FileCode,
  Globe,
  Wand2,
  DollarSign,
  LineChart,
  Menu,
  X,
  PanelLeftClose,
  PanelRightClose,
  MoreVertical,
  type LucideIcon,
} from "lucide-react";
import { SandboxFileExplorer } from "@/components/sandbox/sandbox-file-explorer";
import { toast } from "sonner";
import { BrandCard, CornerBrackets, BrandButton } from "@/components/brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Memoized chat message component to prevent re-renders when input changes
interface ChatMessageProps {
  msg: Message;
  index: number;
  session: SessionData | null;
  status: SessionStatus;
  sendPrompt: (promptText?: string) => void;
}

const ChatMessage = memo(function ChatMessage({
  msg,
  index: i,
  session,
  status,
  sendPrompt,
}: ChatMessageProps) {
  const isProcessing = !!msg._thinkingId;
  const msgTime = new Date(msg.timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} w-full group/message`}
    >
      <div
        className={`${
          msg.role === "user"
            ? "max-w-[90%] xl:max-w-[85%] py-2 xl:py-2.5 px-3 xl:px-4 bg-[#FF5800]/10 border border-[#FF5800]/20 rounded-2xl rounded-tr-md"
            : isProcessing
              ? "max-w-[95%] xl:max-w-[90%] py-2.5 xl:py-3 px-3 xl:px-4 bg-gradient-to-br from-violet-500/[0.06] to-transparent border border-violet-400/[0.12] rounded-2xl rounded-tl-md"
              : "max-w-[95%] xl:max-w-[90%] py-2.5 xl:py-3 px-3 xl:px-4 bg-white/[0.015] border border-white/[0.05] rounded-2xl rounded-tl-md"
        }`}
      >
        <div className="flex items-center justify-between mb-1 xl:mb-1.5">
          <div className="flex items-center gap-1.5 xl:gap-2">
            {isProcessing && (
              <Loader2 className="h-2.5 w-2.5 xl:h-3 xl:w-3 animate-spin text-violet-400" />
            )}
            <span
              className={`text-[10px] xl:text-[11px] ${
                msg.role === "user"
                  ? "text-[#FF5800]/70"
                  : isProcessing
                    ? "text-violet-300/70"
                    : "text-white/35"
              }`}
            >
              {msg.role === "user"
                ? "You"
                : isProcessing
                  ? "Building"
                  : "Assistant"}
            </span>
          </div>
          <span className="text-[9px] xl:text-[10px] text-white/20 font-mono opacity-100 xl:opacity-0 group-hover/message:opacity-100 transition-opacity">
            {msgTime}
          </span>
        </div>
        <div className="text-[13px] xl:text-[14px] leading-[1.6] xl:leading-[1.7] text-white/80 prose-pre:max-w-full prose-pre:overflow-x-auto">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {msg.content}
          </ReactMarkdown>
        </div>
        {i === 0 &&
          msg.role === "assistant" &&
          session?.examplePrompts &&
          session.examplePrompts.length > 0 && (
            <div className="mt-3 xl:mt-4 pt-2.5 xl:pt-3 border-t border-white/[0.05]">
              <p className="text-[9px] xl:text-[10px] text-white/35 mb-1.5 xl:mb-2 uppercase tracking-wider">
                Suggestions
              </p>
              <div className="flex flex-wrap gap-1 xl:gap-1.5">
                {session.examplePrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendPrompt(prompt)}
                    disabled={status !== "ready"}
                    className="px-2 xl:px-2.5 py-1 xl:py-1.5 text-[11px] xl:text-[12px] bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-white/[0.15] text-white/60 hover:text-white/80 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed text-left touch-manipulation"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
        {msg.filesAffected && msg.filesAffected.length > 0 && (
          <div className="mt-2.5 xl:mt-3 pt-2 xl:pt-2.5 border-t border-white/[0.04]">
            <p className="text-[9px] xl:text-[10px] text-white/30 mb-1 xl:mb-1.5 uppercase tracking-wider">
              Changed
            </p>
            <div className="flex flex-wrap gap-1">
              {msg.filesAffected.map((file) => (
                <span
                  key={file}
                  className="px-1.5 xl:px-2 py-0.5 text-[9px] xl:text-[10px] bg-[#FF5800]/10 border border-[#FF5800]/20 text-white/70 font-mono rounded truncate max-w-full"
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
});

// Template options with icons - icon field uses LucideIcon type from types.ts
const TEMPLATE_OPTIONS: (TemplateOption & { icon: LucideIcon })[] = [
  {
    value: "blank",
    label: "Blank Canvas",
    description: "Start from scratch",
    longDescription:
      "A clean slate with Next.js, React, and Tailwind CSS ready to go. Build anything you can imagine.",
    icon: FileCode,
    color: "#64748B",
    gradient: "from-slate-500 to-slate-700",
    features: ["Full flexibility", "Minimal setup", "Your vision"],
    techStack: ["Next.js", "React", "Tailwind"],
  },
  {
    value: "chat",
    label: "AI Chat App",
    description: "Conversational AI interface",
    longDescription:
      "A sleek chat interface with real-time streaming, conversation history, and AI model integration.",
    icon: MessageSquare,
    color: "#06B6D4",
    gradient: "from-cyan-500 to-blue-600",
    features: ["Real-time streaming", "Message history", "Model switching"],
    techStack: ["Next.js", "OpenAI", "Vercel AI SDK"],
  },
  {
    value: "landing-page",
    label: "Landing Page",
    description: "Marketing & conversion",
    longDescription:
      "Beautiful, conversion-optimized landing page with hero sections, features, and call-to-actions.",
    icon: Globe,
    color: "#8B5CF6",
    gradient: "from-violet-500 to-purple-600",
    features: ["Hero sections", "Responsive design", "CTA blocks"],
    techStack: ["Next.js", "Framer Motion", "Tailwind"],
  },
  {
    value: "mcp-service",
    label: "MCP Service",
    description: "Model Context Protocol",
    longDescription:
      "Build a Model Context Protocol server that extends AI capabilities with custom tools and resources.",
    icon: Puzzle,
    color: "#F59E0B",
    gradient: "from-amber-500 to-orange-600",
    features: ["Tool definitions", "Resource providers", "AI integration"],
    techStack: ["MCP SDK", "TypeScript", "Node.js"],
    comingSoon: true,
  },
  {
    value: "a2a-agent",
    label: "A2A Agent",
    description: "Agent-to-Agent protocol",
    longDescription:
      "Create an agent endpoint that can communicate with other AI agents using standardized protocols.",
    icon: Workflow,
    color: "#EC4899",
    gradient: "from-pink-500 to-rose-600",
    features: ["Agent protocol", "Task handling", "Multi-agent comms"],
    techStack: ["A2A Protocol", "TypeScript", "elizaOS"],
    comingSoon: true,
  },
  {
    value: "agent-dashboard",
    label: "Agent Dashboard",
    description: "Manage AI agents",
    longDescription:
      "A control center to monitor, configure, and interact with your AI agents in real-time.",
    icon: Bot,
    color: "#0B35F1",
    gradient: "from-blue-600 to-indigo-700",
    features: ["Agent monitoring", "Config editor", "Live chat"],
    techStack: ["Next.js", "WebSocket", "elizaOS"],
    comingSoon: true,
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
  const prevAppIdRef = useRef<string | null>(null);
  const prevSessionIdRef = useRef<string | null>(null);
  const sessionActionsLogRef = useRef<
    {
      tool: string;
      detail: string;
      timestamp: string;
      status: "active" | "done";
    }[]
  >([]);
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

  const [isInitializing, setIsInitializing] = useState(
    isEditMode || !!sessionIdFromUrl,
  );
  const [step, setStep] = useState<"setup" | "building">(
    isEditMode ? "building" : "setup",
  );
  // Setup wizard steps: 1 = template, 2 = details, 3 = features
  const [setupStep, setSetupStep] = useState<1 | 2 | 3>(1);
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
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [templatePage, setTemplatePage] = useState(0);
  const TEMPLATES_PER_PAGE = 4;

  const [session, setSession] = useState<SessionData | null>(null);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  // Input is managed by Zustand for isolated re-renders - see useChatInput
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Mobile panel state - 'chat' or 'preview' to toggle which panel is visible on mobile
  const [mobilePanel, setMobilePanel] = useState<"chat" | "preview">("chat");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progressStep, setProgressStep] = useState<ProgressStep>("creating");
  const [previewTab, setPreviewTab] = useState<PreviewTab>("preview");
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [isExtending, setIsExtending] = useState(false);
  const [snapshotInfo, setSnapshotInfo] = useState<{
    canRestore: boolean;
    githubRepo: string | null;
    lastBackup: string | null;
  } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<{
    current: number;
    total: number;
    filePath: string;
  } | null>(null);
  // Track if we just loaded a session that needs user action (timeout/expired)
  // This prevents jarring layout flash between loading card and full UI overlay
  const [showStandaloneTimeout, setShowStandaloneTimeout] = useState(false);
  const [appSnapshotInfo, setAppSnapshotInfo] = useState<{
    githubRepo: string;
    lastBackup: string | null;
  } | null>(null);

  // GitHub-related state
  const [gitStatus, setGitStatus] = useState<GitStatusInfo | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  const [lastDeployTime, setLastDeployTime] = useState<Date | null>(null);
  const [productionUrl, setProductionUrl] = useState<string | null>(null);
  const [commitHistory, setCommitHistory] = useState<CommitInfo[]>([]);

  // Sandbox health tracking for automatic recovery
  const [sandboxHealthy, setSandboxHealthy] = useState(true);
  const healthCheckFailCountRef = useRef(0);
  const isRecoveringRef = useRef(false);
  const lastHealthCheckRef = useRef<number>(0);

  const messagesStorageKey = appIdFromUrl
    ? `app-builder-messages-${appIdFromUrl}`
    : `app-builder-messages-new`;

  useEffect(() => {
    // Track URL parameter changes
    const appChanged = prevAppIdRef.current !== appIdFromUrl;
    const sessionChanged = prevSessionIdRef.current !== sessionIdFromUrl;

    if (appChanged || sessionChanged) {
      prevAppIdRef.current = appIdFromUrl;
      prevSessionIdRef.current = sessionIdFromUrl;
      initializationRef.current = false;

      // Reset state when URL changes
      setSession(null);
      setMessages([]);
      setStatus("idle");
      setIsInitializing(!!appIdFromUrl || !!sessionIdFromUrl);

      if (appChanged) {
        setAppData(null);
        setAppSnapshotInfo(null);
        setStep(appIdFromUrl ? "building" : "setup");
      }
    }

    if (initializationRef.current) return;
    initializationRef.current = true;

    const loadPage = async () => {
      // Case 1: Session ID in URL - restore that specific session
      if (sessionIdFromUrl) {
        const restored = await tryRestoreSession(sessionIdFromUrl);
        if (restored) {
          setIsInitializing(false);
          return;
        }
        // Session invalid - remove from URL and continue
        removeSessionFromUrl();
      }

      // Case 2: App ID in URL - load app and check for existing sessions
      if (appIdFromUrl) {
        await loadAppData(appIdFromUrl);
      }

      setIsInitializing(false);
    };

    const tryRestoreSession = async (sessionId: string): Promise<boolean> => {
      try {
        const response = await fetchWithRetry(
          `/api/v1/app-builder/sessions/${sessionId}`,
        );
        if (!response.ok) return false;

        const data = await response.json();
        if (!data.success || !data.session) return false;

        const sessionStatus = data.session.status as SessionStatus;
        const isExpiredOrStopped =
          sessionStatus === "timeout" || sessionStatus === "stopped";

        // Session must have a sandbox URL or be expired/stopped to be valid
        if (!data.session.sandboxUrl && !isExpiredOrStopped) return false;

        // Restore session state first
        const sessionData = {
          id: data.session.id,
          sandboxId: data.session.sandboxId || "",
          sandboxUrl: data.session.sandboxUrl || "",
          status: sessionStatus,
          examplePrompts: data.session.examplePrompts || [],
          expiresAt: data.session.expiresAt || null,
        };

        setSession(sessionData);
        setStep("building");

        // Restore messages from session or sessionStorage
        if (isExpiredOrStopped && data.session.messages?.length > 0) {
          setMessages(data.session.messages);
        } else {
          const stored = sessionStorage.getItem(messagesStorageKey);
          if (stored) {
            try {
              setMessages(JSON.parse(stored));
            } catch (parseError) {
              console.warn(
                "[AppBuilder] Failed to parse stored messages:",
                parseError,
              );
            }
          }
        }

        // Load app data if we have appId
        if (appIdFromUrl) {
          const appResponse = await fetchWithRetry(
            `/api/v1/apps/${appIdFromUrl}`,
          );
          if (appResponse.ok) {
            const appData = await appResponse.json();
            if (appData.success && appData.app) {
              setAppData(appData.app);
              setAppName(appData.app.name);
            }
          }
        }

        // If session is supposedly "ready", verify sandbox is actually healthy
        // Otherwise, auto-trigger recovery in the background
        if (sessionStatus === "ready" && data.session.sandboxUrl) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            await fetch(data.session.sandboxUrl, {
              method: "HEAD",
              mode: "no-cors",
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            // Sandbox is healthy, set status to ready
            setStatus("ready");
            setSandboxHealthy(true);
          } catch (healthCheckError) {
            // Sandbox is not responding - set to recovering and let the
            // health check useEffect handle auto-recovery
            console.warn(
              "[AppBuilder] Sandbox health check failed, initiating recovery:",
              healthCheckError,
            );
            setStatus("recovering");
            setSandboxHealthy(false);
            healthCheckFailCountRef.current = 2;
          }
        } else {
          setStatus(sessionStatus);
          // If session is expired/stopped, show standalone timeout card to avoid layout flash
          if (sessionStatus === "timeout" || sessionStatus === "stopped") {
            setShowStandaloneTimeout(true);
          }
        }

        return true;
      } catch (restoreError) {
        console.warn("[AppBuilder] Session restore failed:", restoreError);
        return false;
      }
    };

    const removeSessionFromUrl = () => {
      const newUrl = appIdFromUrl
        ? `/dashboard/apps/create?appId=${appIdFromUrl}`
        : "/dashboard/apps/create";
      router.replace(newUrl, { scroll: false });
      sessionStorage.removeItem(messagesStorageKey);
    };

    const loadAppData = async (appId: string) => {
      try {
        // Fetch app details first (must complete before other checks)
        const appResponse = await fetchWithRetry(`/api/v1/apps/${appId}`);
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

        // Run session and snapshot checks in parallel for faster loading
        const [sessionResponse, snapshotResponse] = await Promise.all([
          fetchWithRetry(
            `/api/v1/app-builder?appId=${appId}&limit=1&includeInactive=true`,
          ),
          fetchWithRetry(
            `/api/v1/app-builder?appId=${appId}&checkSnapshots=true`,
          ),
        ]);

        // Process session response
        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json();
          if (sessionData.success && sessionData.sessions?.length > 0) {
            // Redirect to existing session
            router.replace(
              `/dashboard/apps/create?appId=${appId}&sessionId=${sessionData.sessions[0].id}`,
              { scroll: false },
            );
            initializationRef.current = false;
            return;
          }
        }

        // Process snapshot response
        if (snapshotResponse.ok) {
          const snapshotData = await snapshotResponse.json();
          if (snapshotData.success && snapshotData.snapshotInfo) {
            setAppSnapshotInfo(snapshotData.snapshotInfo);
          }
        }
      } catch (loadError) {
        console.error("[AppBuilder] Failed to load app data:", loadError);
        toast.error("Failed to load app");
        router.push("/dashboard/apps");
      }
    };

    loadPage();
  }, [appIdFromUrl, sessionIdFromUrl, router, messagesStorageKey]);

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
    // Limit console logs to prevent memory issues
    setConsoleLogs((prev) => [
      ...prev.slice(-499),
      `[${timestamp}] [${level}] ${message}`,
    ]);
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

      const data = await response.json();
      if (data.expiresAt) {
        setExpiresAt(new Date(data.expiresAt));
      }
      addLog("Session extended by 15 minutes", "success");
      toast.success("Session extended", {
        description: "Your session has been extended by 15 minutes.",
      });
    } catch (extendError) {
      console.warn("[AppBuilder] Failed to extend session:", extendError);
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
            canRestore: data.canRestore,
            githubRepo: data.githubRepo,
            lastBackup: data.lastBackup,
          });
        }
      }
    } catch (snapshotError) {
      // Snapshot check failed, not critical but log for debugging
      console.warn("[AppBuilder] Snapshot check failed:", snapshotError);
    }
  }, [session]);

  // GitHub-related functions
  const checkGitStatus = useCallback(async () => {
    if (!session) return;
    try {
      const response = await fetchWithRetry(
        `/api/v1/app-builder/sessions/${session.id}/commit`,
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setGitStatus({
            hasChanges: data.hasChanges,
            staged: data.staged || [],
            unstaged: data.unstaged || [],
            untracked: data.untracked || [],
            currentCommitSha: data.currentCommitSha,
            lastSavedCommitSha: data.lastSavedCommitSha,
          });
        }
      }
    } catch (gitStatusError) {
      // Git status check failed, not critical but log for debugging
      console.warn("[AppBuilder] Git status check failed:", gitStatusError);
    }
  }, [session]);

  const fetchCommitHistory = useCallback(async () => {
    if (!session) return;
    try {
      const response = await fetchWithRetry(
        `/api/v1/app-builder/sessions/${session.id}/history`,
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.commits) {
          setCommitHistory(data.commits);
        }
      }
    } catch (historyError) {
      // Commit history fetch failed, not critical but log for debugging
      console.warn("[AppBuilder] Commit history fetch failed:", historyError);
    }
  }, [session]);

  const saveToGitHub = useCallback(async () => {
    if (!session || isSaving) return;

    setIsSaving(true);
    try {
      const response = await fetchWithRetry(
        `/api/v1/app-builder/sessions/${session.id}/commit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `Manual save at ${new Date().toLocaleString()}`,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save");
      }

      const data = await response.json();
      if (data.success) {
        setLastSaveTime(new Date());
        toast.success("Saved to GitHub", {
          description: `${data.filesCommitted} file(s) committed`,
        });
        addLog(
          `Saved to GitHub: ${data.commitSha?.substring(0, 7)}`,
          "success",
        );
        // Refresh git status
        await checkGitStatus();
        // Refresh commit history
        await fetchCommitHistory();
      }
    } catch (error) {
      toast.error("Failed to save", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      addLog(
        `Save failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    } finally {
      setIsSaving(false);
    }
  }, [session, isSaving, addLog, checkGitStatus, fetchCommitHistory]);

  // Deploy to production
  const deployToProduction = useCallback(async () => {
    if (!appData?.id || isDeploying) return;

    // First save any uncommitted changes
    if (gitStatus?.hasChanges) {
      addLog("Saving changes before deploy...", "info");
      await saveToGitHub();
    }

    setIsDeploying(true);
    try {
      const response = await fetchWithRetry(
        `/api/v1/apps/${appData.id}/deploy`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: "production" }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to deploy");
      }

      const data = await response.json();
      if (data.success) {
        setLastDeployTime(new Date());
        if (data.productionUrl) {
          setProductionUrl(data.productionUrl);
        }
        toast.success("Deployment started!", {
          description: data.productionUrl
            ? `Deploying to ${data.productionUrl}`
            : "Your app is being deployed to production",
          action: data.productionUrl
            ? {
                label: "Open",
                onClick: () => window.open(data.productionUrl, "_blank"),
              }
            : undefined,
        });
        addLog(`Deployment started: ${data.deploymentId}`, "success");
      }
    } catch (error) {
      toast.error("Deployment failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      addLog(
        `Deploy failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    } finally {
      setIsDeploying(false);
    }
  }, [appData?.id, isDeploying, gitStatus?.hasChanges, saveToGitHub, addLog]);

  // Fetch production URL on load
  useEffect(() => {
    if (!appData?.id) return;

    const fetchDeploymentInfo = async () => {
      try {
        const response = await fetchWithRetry(
          `/api/v1/apps/${appData.id}/deploy`,
        );
        if (response.ok) {
          const data = await response.json();
          if (data.productionUrl) {
            setProductionUrl(data.productionUrl);
          }
        }
      } catch (deployInfoError) {
        // Not critical but log for debugging
        console.warn(
          "[AppBuilder] Deployment info fetch failed:",
          deployInfoError,
        );
      }
    };

    fetchDeploymentInfo();
  }, [appData?.id]);

  // Fetch git status periodically when session is ready
  useEffect(() => {
    if (status !== "ready" || !session || !appData?.github_repo) return;

    // Initial fetch - run both in parallel for faster load
    Promise.all([checkGitStatus(), fetchCommitHistory()]).catch(() => {
      // Silently handle errors - these are non-critical
    });

    // Poll every 30 seconds
    const interval = setInterval(() => {
      checkGitStatus();
    }, 30000);

    return () => clearInterval(interval);
  }, [
    status,
    session,
    appData?.github_repo,
    checkGitStatus,
    fetchCommitHistory,
  ]);

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
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to restore session");
        }
        throw new Error(`Failed to restore session (HTTP ${response.status})`);
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
                addLog(
                  `Restoring: ${data.filePath} (${data.current}/${data.total})`,
                  "info",
                );
              } else if (eventType === "complete") {
                setSession({
                  ...data.session,
                  expiresAt: data.session.expiresAt,
                });
                setStatus("ready");
                setStep("building");
                setShowStandaloneTimeout(false);

                if (data.session.expiresAt) {
                  setExpiresAt(new Date(data.session.expiresAt));
                }

                if (data.session.messages) {
                  setMessages(data.session.messages);
                }

                setRestoreProgress(null);
                addLog("Session restored successfully!", "success");
                toast.success("Session restored!", {
                  description:
                    "Your work has been restored. You can continue building.",
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
      const errorMsg =
        error instanceof Error ? error.message : "Restoration failed";
      addLog(`Restoration failed: ${errorMsg}`, "error");

      // Set status to show "Start New Session" option
      // This will create a fresh session that clones from GitHub
      setStatus("timeout");
      setSnapshotInfo({
        canRestore: false,
        githubRepo: null,
        lastBackup: null,
      });
      toast.error("Could not resume session", {
        description:
          "Click 'Start New Session' to restore your code from GitHub.",
      });
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

  // Auto-recovery function - runs silently in background
  const autoRecoverSession = useCallback(async () => {
    if (isRecoveringRef.current || !session) return;
    isRecoveringRef.current = true;

    setStatus("recovering");
    setProgressStep("creating");
    addLog("Sandbox connection lost, auto-recovering...", "info");

    // Show a non-blocking toast notification
    const toastId = toast.loading("Reconnecting to sandbox...", {
      description: "This happens automatically - no action needed",
    });

    try {
      const response = await fetchWithRetry(
        `/api/v1/app-builder/sessions/${session.id}/resume/stream`,
        { method: "POST" },
      );

      if (!response.ok) {
        throw new Error(`Failed to recover session (HTTP ${response.status})`);
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
              } else if (eventType === "complete") {
                setSession({
                  ...data.session,
                  expiresAt: data.session.expiresAt,
                });
                setStatus("ready");
                setShowStandaloneTimeout(false);
                setSandboxHealthy(true);
                healthCheckFailCountRef.current = 0;

                if (data.session.expiresAt) {
                  setExpiresAt(new Date(data.session.expiresAt));
                }

                toast.success("Sandbox reconnected!", {
                  id: toastId,
                  description: "You can continue building.",
                });
                addLog("Auto-recovery complete", "success");
              } else if (eventType === "error") {
                throw new Error(data.error || "Recovery failed");
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
      const errorMsg =
        error instanceof Error ? error.message : "Recovery failed";
      addLog(`Auto-recovery failed: ${errorMsg}`, "error");

      // Only show timeout status if recovery truly failed
      // This will display the recovery UI as a fallback
      setStatus("timeout");
      toast.error("Could not reconnect", {
        id: toastId,
        description: "Click 'Restore' to try again.",
      });
    } finally {
      isRecoveringRef.current = false;
    }
  }, [session, addLog]);

  // Sandbox health check - detects when sandbox dies and auto-recovers
  useEffect(() => {
    // Only check health when we think sandbox is ready
    if (!session?.sandboxUrl || status !== "ready") {
      return;
    }

    const checkSandboxHealth = async () => {
      // Throttle checks - don't check more than once every 5 seconds
      const now = Date.now();
      if (now - lastHealthCheckRef.current < 5000) return;
      lastHealthCheckRef.current = now;

      try {
        // Try to fetch the sandbox URL with no-cors mode first (just to test connectivity)
        // We can't read the response body due to CORS, but we can detect network errors
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(session.sandboxUrl, {
          method: "HEAD",
          mode: "no-cors",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        // If we got here, the request completed (even if opaque)
        // Reset fail counter on success
        healthCheckFailCountRef.current = 0;
        setSandboxHealthy(true);
      } catch (error) {
        // Network error or timeout - sandbox may be dead
        healthCheckFailCountRef.current++;

        // After 2 consecutive failures, trigger auto-recovery
        if (healthCheckFailCountRef.current >= 2 && !isRecoveringRef.current) {
          setSandboxHealthy(false);
          addLog(
            `Sandbox health check failed (${healthCheckFailCountRef.current}x), initiating recovery...`,
            "warning",
          );
          autoRecoverSession();
        }
      }
    };

    // Check health every 15 seconds
    const interval = setInterval(checkSandboxHealth, 15000);

    // Initial check after a short delay
    const initialCheck = setTimeout(checkSandboxHealth, 3000);

    return () => {
      clearInterval(interval);
      clearTimeout(initialCheck);
    };
  }, [session?.sandboxUrl, status, autoRecoverSession, addLog]);

  // Handle iframe load errors - triggers auto-recovery
  const handleIframeError = useCallback(() => {
    if (status === "ready" && session && !isRecoveringRef.current) {
      healthCheckFailCountRef.current = 2; // Immediately trigger recovery
      setSandboxHealthy(false);
      addLog("Preview failed to load, initiating recovery...", "warning");
      autoRecoverSession();
    }
  }, [status, session, autoRecoverSession, addLog]);

  // Handle iframe load success - reset health tracking
  const handleIframeLoad = useCallback(() => {
    if (status === "ready") {
      healthCheckFailCountRef.current = 0;
      setSandboxHealthy(true);
    }
  }, [status]);

  // Trigger auto-recovery when status becomes "recovering"
  useEffect(() => {
    if (status === "recovering" && !isRecoveringRef.current && session) {
      autoRecoverSession();
    }
  }, [status, session, autoRecoverSession]);

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
      } catch (logsError) {
        // Network errors during log polling are expected, log only in debug
        if (process.env.NODE_ENV === "development") {
          console.debug("[AppBuilder] Log polling error:", logsError);
        }
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

    const shouldAutoScaffold =
      !isEditMode && (appDescription || templateType !== "blank");
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
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
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
        throw new Error(`Failed to start session (HTTP ${response.status})`);
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

                // Set app data from session for new apps
                if (data.session.appId && !appData) {
                  setAppData({
                    id: data.session.appId,
                    name: appName,
                    description: appDescription || null,
                    github_repo: data.session.githubRepo,
                  });
                }

                const displayName = isEditMode
                  ? appData?.name || appName
                  : appName;

                // Use appId from URL or from newly created session
                const effectiveAppId = appIdFromUrl || data.session.appId;
                const newUrl = effectiveAppId
                  ? `/dashboard/apps/create?appId=${effectiveAppId}&sessionId=${data.session.id}`
                  : `/dashboard/apps/create?sessionId=${data.session.id}`;

                // Update refs BEFORE router.replace to prevent the initialization
                // effect from detecting this as a "session change" and resetting state
                // (which causes the flash-to-recovery-then-back jank on new app creation)
                prevSessionIdRef.current = data.session.id;
                if (effectiveAppId) {
                  prevAppIdRef.current = effectiveAppId;
                }

                router.replace(newUrl, { scroll: false });

                addLog(
                  `Sandbox ready at ${data.session.sandboxUrl}`,
                  "success",
                );

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
                // Stream actual reasoning text to show chain of thought
                const reasoningText = data.text || "Planning changes...";
                addLog(`💭 ${reasoningText.substring(0, 80)}...`, "info");

                // Update the thinking message with the reasoning
                if (initialThinkingIdRef.current) {
                  const thinkingId = initialThinkingIdRef.current;
                  setMessages((prev) =>
                    prev.map((m) =>
                      (m as Message & { _thinkingId?: number })._thinkingId ===
                      thinkingId
                        ? {
                            ...m,
                            content: `**Setting up ${appName}**\n\n💭 *${reasoningText.substring(0, 200)}${reasoningText.length > 200 ? "..." : ""}*\n\n---\n\n*Thinking...*`,
                          }
                        : m,
                    ),
                  );
                }
              } else if (eventType === "tool_use") {
                const toolName = data.tool;
                const { display: toolDisplay, detail } = formatToolDisplay(
                  toolName,
                  data.input,
                );

                if (sessionActionsLogRef.current.length > 0) {
                  sessionActionsLogRef.current[
                    sessionActionsLogRef.current.length - 1
                  ].status = "done";
                }
                const timestamp = new Date().toLocaleTimeString("en-US", {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                });
                sessionActionsLogRef.current.push({
                  tool: toolDisplay,
                  detail,
                  timestamp,
                  status: "active",
                });
                addLog(
                  `${toolName}: ${data.input?.path || data.input?.packages?.join(", ") || ""}`,
                  "info",
                );

                if (initialThinkingIdRef.current) {
                  const thinkingId = initialThinkingIdRef.current;
                  let progressContent = `**Setting up ${appName}**\n\n`;
                  sessionActionsLogRef.current.forEach((action) => {
                    const statusMarker =
                      action.status === "active" ? "⏳" : "✓";
                    progressContent += `\`${action.timestamp}\` ${statusMarker} **${action.tool}**\n`;
                    progressContent += `> \`${action.detail}\`\n\n`;
                  });
                  progressContent += `---\n\n*Working...*`;

                  setMessages((prev) =>
                    prev.map((m) =>
                      (m as Message & { _thinkingId?: number })._thinkingId ===
                      thinkingId
                        ? { ...m, content: progressContent }
                        : m,
                    ),
                  );
                }
              } else if (eventType === "complete") {
                setSession(data.session);
                setStatus("ready");
                setShowStandaloneTimeout(false);

                if (
                  data.session.initialPromptResult &&
                  initialThinkingIdRef.current
                ) {
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
                      assistantContent += `\`${action.timestamp}\` ✓ **${action.tool}**\n`;
                      assistantContent += `> \`${action.detail}\`\n\n`;
                    });
                  }

                  setMessages((prev) =>
                    prev.map((m) => {
                      if (
                        (m as Message & { _thinkingId?: number })
                          ._thinkingId === thinkingId
                      ) {
                        const { _thinkingId: _, ...rest } = m as Message & {
                          _thinkingId?: number;
                        };
                        return {
                          ...rest,
                          content: assistantContent,
                          filesAffected:
                            data.session.initialPromptResult.filesAffected,
                        };
                      }
                      return m;
                    }),
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
      // Get input from Zustand store for isolation
      const currentInput = useChatInput.getState().input;
      const text = promptText || currentInput.trim();
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
      // Clear input using Zustand
      useChatInput.getState().clearInput();

      const thinkingId = Date.now();
      const actionsLog: {
        tool: string;
        detail: string;
        timestamp: string;
        status: "active" | "done";
      }[] = [];

      // getTimeString is imported from @/lib/app-builder

      // Track current reasoning text for display
      let currentReasoning = "";

      const buildLocalProgressContent = (currentStatus?: string) => {
        let content = "**Processing your request**\n\n";

        // Show current chain-of-thought reasoning
        if (currentReasoning) {
          content += `💭 *${currentReasoning.substring(0, 200)}${currentReasoning.length > 200 ? "..." : ""}*\n\n`;
        }

        if (actionsLog.length > 0) {
          actionsLog.forEach((action) => {
            const isActive = action.status === "active";
            const statusMarker = isActive ? "⏳" : "✓";
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
        const content = buildLocalProgressContent(currentStatus);
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
                  // Stream the actual reasoning/thinking text to UI for chain-of-thought visibility
                  const reasoningText = data.text || "Planning changes...";
                  currentReasoning = reasoningText;
                  updateThinking("Analyzing...");
                  addLog(
                    `💭 ${reasoningText.substring(0, 80)}${reasoningText.length > 80 ? "..." : ""}`,
                    "info",
                  );
                } else if (eventType === "tool_use") {
                  const toolName = data.tool;
                  const {
                    display: toolDisplay,
                    detail,
                    statusMessage,
                  } = formatToolDisplay(toolName, data.input);

                  if (actionsLog.length > 0) {
                    actionsLog[actionsLog.length - 1].status = "done";
                  }
                  actionsLog.push({
                    tool: toolDisplay,
                    detail,
                    timestamp: getTimeString(),
                    status: "active",
                  });
                  updateThinking(statusMessage);

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
                  content += `\`${action.timestamp}\` ✓ **${action.tool}**\n`;
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
          addLog(`Modified: ${finalData.filesAffected.join(", ")}`, "success");
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
              content +=
                "The operation could not be completed. Please try again or modify your request.";

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
    [session, isLoading, addLog],
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
    } catch (stopError) {
      console.error("[AppBuilder] Failed to stop session:", stopError);
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
      <div className="max-w-4xl mx-auto py-10 animate-in fade-in duration-200">
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

  // Show standalone timeout card instead of full UI with overlay - prevents layout flash
  if (
    showStandaloneTimeout &&
    (status === "timeout" || status === "stopped") &&
    !isRestoring
  ) {
    return (
      <div className="max-w-4xl mx-auto py-10 animate-in fade-in duration-300">
        <BrandCard className="relative">
          <CornerBrackets className="opacity-20" />
          <div className="relative z-10 p-8">
            <div className="max-w-md mx-auto text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto">
                <Timer className="h-8 w-8 text-amber-400" />
              </div>
              <h2 className="text-xl font-bold text-white">Session Expired</h2>
              <p className="text-white/60">
                Your sandbox session has timed out. Your code is safely saved
                and can be restored.
              </p>

              {snapshotInfo?.canRestore ? (
                <div className="space-y-3 pt-2">
                  <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <p className="text-sm text-green-400 font-medium">
                      Your code is saved to GitHub
                    </p>
                    {snapshotInfo.githubRepo && (
                      <p className="text-xs text-white/50 mt-1">
                        <span className="font-mono">
                          {snapshotInfo.githubRepo.split("/").pop()}
                        </span>
                        {snapshotInfo.lastBackup && (
                          <>
                            {" "}
                            · Last updated{" "}
                            {new Date(
                              snapshotInfo.lastBackup,
                            ).toLocaleDateString()}
                          </>
                        )}
                      </p>
                    )}
                  </div>

                  <Button
                    onClick={restoreSession}
                    className="w-full bg-green-600 hover:bg-green-500 text-white"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Restore & Continue
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowStandaloneTimeout(false);
                      router.push("/dashboard/apps");
                    }}
                    className="w-full"
                  >
                    Return to Apps
                  </Button>
                </div>
              ) : appSnapshotInfo?.githubRepo ? (
                <div className="space-y-3 pt-2">
                  <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <p className="text-sm text-green-400 font-medium">
                      Your code is saved to GitHub
                    </p>
                    <p className="text-xs text-white/50 mt-1">
                      <span className="font-mono">
                        {appSnapshotInfo.githubRepo.split("/").pop()}
                      </span>
                    </p>
                  </div>

                  <Button
                    onClick={restoreSession}
                    className="w-full bg-green-600 hover:bg-green-500 text-white"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Restore & Continue
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowStandaloneTimeout(false);
                      router.push("/dashboard/apps");
                    }}
                    className="w-full"
                  >
                    Return to Apps
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  <p className="text-xs text-white/40">
                    Start a new session to continue building.
                  </p>
                  <Button
                    onClick={() => {
                      setShowStandaloneTimeout(false);
                      startSession();
                    }}
                    className="w-full"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Start New Session
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowStandaloneTimeout(false);
                      router.push("/dashboard/apps");
                    }}
                    className="w-full"
                  >
                    Return to Apps
                  </Button>
                </div>
              )}
            </div>
          </div>
        </BrandCard>
      </div>
    );
  }

  // If restoring from standalone timeout, show the unified restore progress card
  if (showStandaloneTimeout && isRestoring) {
    return (
      <div className="max-w-4xl mx-auto py-10 animate-in fade-in duration-300">
        <BrandCard className="relative">
          <CornerBrackets className="opacity-20" />
          <div className="relative z-10 p-8">
            <div className="max-w-md mx-auto text-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-green-400 mx-auto" />
              <h2 className="text-xl font-bold text-white">
                Restoring Session
              </h2>
              <p className="text-white/60">
                Setting up your development environment and restoring your
                files...
              </p>

              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                <p className="text-sm text-green-400 font-medium">
                  {restoreProgress
                    ? `Restoring ${restoreProgress.current}/${restoreProgress.total}...`
                    : progressStep === "creating"
                      ? "Creating sandbox..."
                      : progressStep === "installing"
                        ? "Installing dependencies..."
                        : progressStep === "starting"
                          ? "Starting dev server..."
                          : progressStep === "restoring"
                            ? "Restoring files..."
                            : "Preparing..."}
                </p>
                {snapshotInfo?.githubRepo && (
                  <p className="text-xs text-white/50 mt-1">
                    From{" "}
                    <span className="font-mono">
                      {snapshotInfo.githubRepo.split("/").pop()}
                    </span>
                  </p>
                )}
              </div>
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

  // AI Description generation
  const generateAIDescription = async () => {
    if (!appName.trim()) {
      toast.error("Please enter an app name first");
      return;
    }

    setIsGeneratingDescription(true);
    const selectedTemplateInfo = TEMPLATE_OPTIONS.find(
      (t) => t.value === templateType,
    );

    try {
      const response = await fetchWithRetry("/api/v1/generate-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Generate a concise, professional app description (2-3 sentences, under 200 characters) for an app called "${appName}". The app is based on the "${selectedTemplateInfo?.label || templateType}" template which is designed for: ${selectedTemplateInfo?.longDescription || "general web applications"}. Focus on the value proposition and key features.`,
          maxTokens: 150,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate description");
      }

      const data = await response.json();
      if (data.success && data.prompts?.[0]) {
        setAppDescription(data.prompts[0]);
        toast.success("Description generated!");
      } else {
        throw new Error("Invalid response from API");
      }
    } catch (error) {
      console.warn("[generateAIDescription] Failed to generate:", error);
      // Fallback to template-based descriptions
      const fallbackDescriptions: Record<TemplateType, string> = {
        blank: `${appName} - A custom application built with modern web technologies.`,
        chat: `${appName} - An intelligent conversational AI application with real-time responses.`,
        "landing-page": `${appName} - A conversion-optimized landing page with compelling visuals.`,
        "mcp-service": `${appName} - A Model Context Protocol service extending AI capabilities.`,
        "a2a-agent": `${appName} - An Agent-to-Agent protocol endpoint for AI coordination.`,
        "agent-dashboard": `${appName} - A control center for monitoring and configuring AI agents.`,
      };
      setAppDescription(
        fallbackDescriptions[templateType] || fallbackDescriptions.blank,
      );
      toast.success("Description generated!");
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  // Get the selected template data
  const selectedTemplate = TEMPLATE_OPTIONS.find(
    (t) => t.value === templateType,
  );

  if (step === "setup" && !isEditMode && status !== "initializing") {
    return (
      <div className="min-h-screen bg-[#0A0A0A]">
        {/* Ambient background effects */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute top-1/3 -left-32 w-48 md:w-72 h-48 md:h-72 rounded-full blur-[100px] opacity-15"
            style={{ backgroundColor: selectedTemplate?.color || "#06B6D4" }}
          />
          <div
            className="absolute bottom-1/3 -right-32 w-48 md:w-72 h-48 md:h-72 rounded-full blur-[100px] opacity-10"
            style={{ backgroundColor: selectedTemplate?.color || "#8B5CF6" }}
          />
        </div>

        <div className="relative max-w-6xl mx-auto px-3 md:px-6 py-3 md:py-5">
          {/* Header - compact */}
          <div className="flex items-center justify-between mb-3 md:mb-5">
            <div className="flex items-center gap-2 md:gap-3">
              <Link
                href={backLink}
                className="p-1.5 md:p-2 hover:bg-white/10 rounded-lg transition-all duration-300 border border-white/5 hover:border-white/20"
              >
                <ArrowLeft className="h-4 w-4 text-white/60" />
              </Link>
              <div className="flex items-center gap-1.5 md:gap-2">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-violet-500 rounded-full blur-sm opacity-50" />
                  <Sparkles className="relative h-4 w-4 md:h-5 md:w-5 text-white" />
                </div>
                <h1 className="text-base md:text-xl font-semibold tracking-tight text-white">
                  App Creator
                </h1>
              </div>
            </div>

            {/* Mobile step indicator */}
            <div className="flex md:hidden items-center gap-1">
              {[1, 2, 3].map((num) => (
                <div
                  key={num}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    setupStep === num
                      ? "bg-gradient-to-r from-cyan-500 to-violet-500 w-6"
                      : setupStep > num
                        ? "bg-white/40 w-3"
                        : "bg-white/10 w-3"
                  }`}
                />
              ))}
            </div>

            {/* Desktop step indicator */}
            <div className="hidden md:flex items-center gap-2">
              {[
                { num: 1, label: "Template" },
                { num: 2, label: "Details" },
                { num: 3, label: "Features" },
              ].map((s, i) => (
                <div key={s.num} className="flex items-center">
                  <button
                    onClick={() => {
                      if (
                        s.num === 1 ||
                        (s.num === 2 && templateType) ||
                        (s.num === 3 && appName.trim())
                      ) {
                        setSetupStep(s.num as 1 | 2 | 3);
                      }
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-300 ${
                      setupStep === s.num
                        ? "bg-white/10 border border-white/20"
                        : setupStep > s.num
                          ? "text-white/60 hover:text-white/80"
                          : "text-white/30"
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-300 ${
                        setupStep === s.num
                          ? "bg-gradient-to-r from-cyan-500 to-violet-500 text-white"
                          : setupStep > s.num
                            ? "bg-white/20 text-white"
                            : "bg-white/5 text-white/40"
                      }`}
                    >
                      {setupStep > s.num ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        s.num
                      )}
                    </span>
                    <span
                      className={`text-sm ${setupStep === s.num ? "text-white" : ""}`}
                    >
                      {s.label}
                    </span>
                  </button>
                  {i < 2 && (
                    <div
                      className={`w-8 h-px mx-1 transition-colors duration-300 ${
                        setupStep > s.num ? "bg-white/30" : "bg-white/10"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {sourceContext && (
            <div
              className="mb-3 md:mb-4 p-2.5 md:p-3 rounded-lg border-l-2 bg-black/30 border border-white/5"
              style={{
                borderLeftColor: SOURCE_CONTEXT_INFO[sourceContext.type].color,
              }}
            >
              <div className="flex items-center gap-2">
                {(() => {
                  const Icon = SOURCE_CONTEXT_INFO[sourceContext.type].icon;
                  return (
                    <Icon
                      className="h-3.5 w-3.5 md:h-4 md:w-4"
                      style={{
                        color: SOURCE_CONTEXT_INFO[sourceContext.type].color,
                      }}
                    />
                  );
                })()}
                <p className="text-[11px] md:text-xs text-white/70">
                  Building for{" "}
                  <span className="text-white font-medium">
                    {sourceContext.name}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* STEP 1: Template Selection */}
          <div
            className={`transition-all duration-500 ${setupStep === 1 ? "opacity-100" : "opacity-0 absolute pointer-events-none"}`}
          >
            {setupStep === 1 &&
              (() => {
                const totalPages = Math.ceil(
                  TEMPLATE_OPTIONS.length / TEMPLATES_PER_PAGE,
                );
                const visibleTemplates = TEMPLATE_OPTIONS.slice(
                  templatePage * TEMPLATES_PER_PAGE,
                  (templatePage + 1) * TEMPLATES_PER_PAGE,
                );

                return (
                  <div className="space-y-3 md:space-y-5">
                    {/* Header row with title and navigation */}
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-0">
                      <div>
                        <h2 className="text-xl md:text-2xl font-bold text-white">
                          What are you building?
                        </h2>
                        <p className="text-white/50 text-xs md:text-sm">
                          Choose a template to kickstart your project
                        </p>
                      </div>

                      {/* Carousel navigation */}
                      <div className="flex items-center justify-center md:justify-end gap-2 md:gap-3">
                        <button
                          onClick={() =>
                            setTemplatePage((p) => Math.max(0, p - 1))
                          }
                          disabled={templatePage === 0}
                          className="p-2 md:p-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:scale-105"
                        >
                          <ChevronLeft className="h-4 w-4 md:h-5 md:w-5 text-white/70" />
                        </button>
                        <div className="flex items-center gap-1.5 md:gap-2">
                          {Array.from({ length: totalPages }).map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setTemplatePage(i)}
                              className={`h-1.5 md:h-2 rounded-full transition-all duration-300 ${
                                i === templatePage
                                  ? "bg-white/70 w-5 md:w-6"
                                  : "bg-white/20 hover:bg-white/40 w-1.5 md:w-2"
                              }`}
                            />
                          ))}
                        </div>
                        <button
                          onClick={() =>
                            setTemplatePage((p) =>
                              Math.min(totalPages - 1, p + 1),
                            )
                          }
                          disabled={templatePage >= totalPages - 1}
                          className="p-2 md:p-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:scale-105"
                        >
                          <ChevronRight className="h-4 w-4 md:h-5 md:w-5 text-white/70" />
                        </button>
                      </div>
                    </div>

                    {/* Template cards - larger, more detailed */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-4">
                      {visibleTemplates.map((template) => {
                        const Icon = template.icon;
                        const isSelected = templateType === template.value;
                        const isDisabled = template.comingSoon;

                        return (
                          <button
                            key={template.value}
                            onClick={() => {
                              if (!isDisabled) {
                                setTemplateType(template.value);
                              }
                            }}
                            disabled={isDisabled}
                            className={`group relative p-3 md:p-5 rounded-xl md:rounded-2xl text-left transition-all duration-300 border touch-manipulation ${
                              isSelected
                                ? "bg-white/10 border-white/30 scale-[1.02]"
                                : isDisabled
                                  ? "bg-white/[0.02] border-white/5 opacity-50 cursor-not-allowed"
                                  : "bg-white/[0.02] border-white/10 hover:bg-white/[0.05] hover:border-white/20 active:scale-[0.98]"
                            }`}
                          >
                            {/* Glow effect on selected */}
                            {isSelected && (
                              <div
                                className="absolute inset-0 rounded-xl md:rounded-2xl blur-xl opacity-20 -z-10"
                                style={{ backgroundColor: template.color }}
                              />
                            )}

                            {/* Coming soon badge */}
                            {isDisabled && (
                              <div className="absolute top-2 right-2 md:top-3 md:right-3 px-1.5 md:px-2 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded-full">
                                <span className="text-[8px] md:text-[10px] font-medium text-amber-400">
                                  Soon
                                </span>
                              </div>
                            )}

                            {/* Selection indicator */}
                            {!isDisabled && (
                              <div
                                className={`absolute top-2.5 right-2.5 md:top-4 md:right-4 w-4 h-4 md:w-5 md:h-5 rounded-full border-2 transition-all duration-300 flex items-center justify-center ${
                                  isSelected
                                    ? "border-white bg-white"
                                    : "border-white/20 group-hover:border-white/40"
                                }`}
                              >
                                {isSelected && (
                                  <Check className="h-2.5 w-2.5 md:h-3 md:w-3 text-black" />
                                )}
                              </div>
                            )}

                            {/* Icon */}
                            <div
                              className={`inline-flex p-2 md:p-3 rounded-lg md:rounded-xl mb-2 md:mb-3 transition-all duration-300 ${
                                isSelected
                                  ? "scale-110"
                                  : "group-hover:scale-105"
                              }`}
                              style={{
                                backgroundColor: `${template.color}20`,
                                boxShadow: isSelected
                                  ? `0 0 20px ${template.color}40`
                                  : undefined,
                              }}
                            >
                              <Icon
                                className="h-4 w-4 md:h-6 md:w-6 transition-colors duration-300"
                                style={{ color: template.color }}
                              />
                            </div>

                            {/* Content */}
                            <h3 className="text-sm md:text-base font-semibold text-white mb-0.5 md:mb-1 pr-6">
                              {template.label}
                            </h3>
                            <p className="text-xs md:text-sm text-white/50 mb-2 md:mb-3 line-clamp-2">
                              {template.description}
                            </p>

                            {/* Features - hidden on mobile to save space */}
                            <div className="hidden md:flex flex-wrap gap-1.5">
                              {template.features.map((feature) => (
                                <span
                                  key={feature}
                                  className="px-2 py-0.5 text-[10px] font-medium bg-white/5 border border-white/10 rounded-full text-white/60"
                                >
                                  {feature}
                                </span>
                              ))}
                            </div>

                            {/* Tech stack on hover/selected - desktop only */}
                            <div
                              className={`hidden md:block mt-3 pt-3 border-t border-white/5 transition-all duration-300 ${
                                isSelected
                                  ? "opacity-100"
                                  : "opacity-0 group-hover:opacity-100"
                              }`}
                            >
                              <div className="flex gap-2">
                                {template.techStack.map((tech) => (
                                  <span
                                    key={tech}
                                    className="text-[10px] text-white/40"
                                  >
                                    {tech}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Continue button row */}
                    <div className="flex flex-col-reverse md:flex-row items-stretch md:items-center justify-between gap-3 pt-2">
                      <p className="text-xs md:text-sm text-white/40 text-center md:text-left">
                        {selectedTemplate ? (
                          <>
                            Selected:{" "}
                            <span className="text-white/60 font-medium">
                              {selectedTemplate.label}
                            </span>
                          </>
                        ) : (
                          "Select a template to continue"
                        )}
                      </p>
                      <button
                        onClick={() => setSetupStep(2)}
                        disabled={
                          !templateType ||
                          TEMPLATE_OPTIONS.find((t) => t.value === templateType)
                            ?.comingSoon
                        }
                        className="group flex items-center justify-center gap-2 px-6 md:px-8 py-2.5 md:py-3 bg-gradient-to-r from-cyan-500 to-violet-500 rounded-xl text-white text-sm md:text-base font-medium transition-all duration-300 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 hover:shadow-lg hover:shadow-violet-500/25 touch-manipulation"
                      >
                        Continue
                        <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>
                  </div>
                );
              })()}
          </div>

          {/* STEP 2: App Details */}
          <div
            className={`transition-all duration-500 ${setupStep === 2 ? "opacity-100" : "opacity-0 absolute pointer-events-none"}`}
          >
            {setupStep === 2 && (
              <div className="max-w-2xl mx-auto space-y-3 md:space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-0">
                  <div>
                    <h2 className="text-xl md:text-2xl font-bold text-white">
                      Tell us about your app
                    </h2>
                    <p className="text-white/50 text-xs md:text-sm">
                      Give your creation a name and description
                    </p>
                  </div>
                  {/* Selected template preview */}
                  {selectedTemplate && (
                    <div className="flex items-center gap-2 px-2.5 md:px-3 py-1 md:py-1.5 rounded-lg bg-white/5 border border-white/10 w-fit">
                      <selectedTemplate.icon
                        className="h-3.5 w-3.5 md:h-4 md:w-4"
                        style={{ color: selectedTemplate.color }}
                      />
                      <span className="text-[11px] md:text-xs text-white/60">
                        {selectedTemplate.label}
                      </span>
                      <button
                        onClick={() => setSetupStep(1)}
                        className="text-[10px] text-white/40 hover:text-white/60 underline"
                      >
                        change
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-3 md:space-y-4 p-3 md:p-5 rounded-xl bg-white/[0.02] border border-white/10">
                  {/* App Name */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-white/70 text-xs">App Name</Label>
                      <span
                        className={`text-[10px] transition-colors ${
                          appName.length > 100
                            ? "text-red-400"
                            : appName.length > 80
                              ? "text-yellow-400"
                              : "text-white/30"
                        }`}
                      >
                        {appName.length}/100
                      </span>
                    </div>
                    <Input
                      value={appName}
                      onChange={(e) => setAppName(e.target.value)}
                      placeholder="My Awesome App"
                      className="h-10 bg-black/40 border-white/10 text-white placeholder:text-white/20 focus:border-white/30 rounded-lg"
                      maxLength={100}
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-white/70 text-xs">
                        Description
                      </Label>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={generateAIDescription}
                          disabled={isGeneratingDescription || !appName.trim()}
                          className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-gradient-to-r from-violet-500/20 to-cyan-500/20 border border-violet-500/30 rounded text-violet-300 hover:text-violet-200 transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                        >
                          {isGeneratingDescription ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : (
                            <Wand2 className="h-2.5 w-2.5" />
                          )}
                          AI Assist
                        </button>
                        <span
                          className={`text-[10px] transition-colors ${
                            appDescription.length > 500
                              ? "text-red-400"
                              : appDescription.length > 400
                                ? "text-yellow-400"
                                : "text-white/30"
                          }`}
                        >
                          {appDescription.length}/500
                        </span>
                      </div>
                    </div>
                    <Textarea
                      value={appDescription}
                      onChange={(e) => setAppDescription(e.target.value)}
                      placeholder="Describe what your app should do... or let AI help you write it"
                      className="min-h-[100px] bg-black/40 border-white/10 text-white text-sm placeholder:text-white/20 focus:border-white/30 rounded-lg resize-none"
                    />
                    {appDescription.length > 500 && (
                      <p className="text-xs text-red-400 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Description exceeds 500 character limit
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 md:pt-3">
                  <button
                    onClick={() => setSetupStep(1)}
                    className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 text-[11px] md:text-xs text-white/60 hover:text-white transition-colors"
                  >
                    <ArrowLeft className="h-3 w-3 md:h-3.5 md:w-3.5" />
                    Back
                  </button>
                  <button
                    onClick={() => setSetupStep(3)}
                    disabled={
                      !appName.trim() ||
                      appName.length > 100 ||
                      appDescription.length > 500
                    }
                    className="group flex items-center gap-2 px-5 md:px-6 py-2 md:py-2.5 bg-gradient-to-r from-cyan-500 to-violet-500 rounded-lg text-white text-sm font-medium transition-all duration-300 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105 hover:shadow-lg hover:shadow-violet-500/25 touch-manipulation"
                  >
                    Continue
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* STEP 3: Features */}
          <div
            className={`transition-all duration-500 ${setupStep === 3 ? "opacity-100" : "opacity-0 absolute pointer-events-none"}`}
          >
            {setupStep === 3 && (
              <div className="max-w-2xl mx-auto space-y-3 md:space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-0">
                  <div>
                    <h2 className="text-xl md:text-2xl font-bold text-white">
                      Supercharge your app
                    </h2>
                    <p className="text-white/50 text-xs md:text-sm">
                      Add powerful features to your project
                    </p>
                  </div>
                  {/* App summary */}
                  <div className="flex items-center gap-2 px-2.5 md:px-3 py-1 md:py-1.5 rounded-lg bg-white/5 border border-white/10 w-fit">
                    {selectedTemplate && (
                      <selectedTemplate.icon
                        className="h-3.5 w-3.5 md:h-4 md:w-4"
                        style={{ color: selectedTemplate.color }}
                      />
                    )}
                    <span className="text-[11px] md:text-xs text-white/70 truncate max-w-[150px]">
                      {appName || "Your App"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 md:gap-3">
                  {/* Monetization */}
                  <button
                    onClick={() => setIncludeMonetization(!includeMonetization)}
                    className={`p-3 md:p-4 rounded-xl text-left transition-all duration-300 border touch-manipulation ${
                      includeMonetization
                        ? "bg-emerald-500/10 border-emerald-500/30"
                        : "bg-white/[0.02] border-white/10 hover:bg-white/[0.04] hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5 md:mb-2">
                      <div
                        className={`p-1.5 md:p-2 rounded-lg transition-colors ${
                          includeMonetization
                            ? "bg-emerald-500/20"
                            : "bg-white/5"
                        }`}
                      >
                        <DollarSign
                          className={`h-3.5 w-3.5 md:h-4 md:w-4 ${
                            includeMonetization
                              ? "text-emerald-400"
                              : "text-white/40"
                          }`}
                        />
                      </div>
                      <div
                        className={`w-7 h-4 md:w-8 md:h-5 rounded-full transition-colors duration-300 flex items-center ${
                          includeMonetization
                            ? "bg-emerald-500 justify-end"
                            : "bg-white/10 justify-start"
                        }`}
                      >
                        <div className="w-2.5 h-2.5 md:w-3 md:h-3 mx-0.5 md:mx-1 rounded-full bg-white transition-all" />
                      </div>
                    </div>
                    <h3 className="text-xs md:text-sm font-medium text-white">
                      Monetization
                    </h3>
                    <p className="text-[10px] md:text-xs text-white/50 mt-0.5">
                      Payments & subscriptions
                    </p>
                    <div className="hidden md:flex gap-1 mt-2">
                      <span className="px-1.5 py-0.5 text-[9px] bg-white/5 border border-white/10 rounded text-white/40">
                        Stripe
                      </span>
                      <span className="px-1.5 py-0.5 text-[9px] bg-white/5 border border-white/10 rounded text-white/40">
                        Billing
                      </span>
                    </div>
                  </button>

                  {/* Analytics */}
                  <button
                    onClick={() => setIncludeAnalytics(!includeAnalytics)}
                    className={`p-3 md:p-4 rounded-xl text-left transition-all duration-300 border touch-manipulation ${
                      includeAnalytics
                        ? "bg-blue-500/10 border-blue-500/30"
                        : "bg-white/[0.02] border-white/10 hover:bg-white/[0.04] hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5 md:mb-2">
                      <div
                        className={`p-1.5 md:p-2 rounded-lg transition-colors ${
                          includeAnalytics ? "bg-blue-500/20" : "bg-white/5"
                        }`}
                      >
                        <LineChart
                          className={`h-3.5 w-3.5 md:h-4 md:w-4 ${
                            includeAnalytics ? "text-blue-400" : "text-white/40"
                          }`}
                        />
                      </div>
                      <div
                        className={`w-7 h-4 md:w-8 md:h-5 rounded-full transition-colors duration-300 flex items-center ${
                          includeAnalytics
                            ? "bg-blue-500 justify-end"
                            : "bg-white/10 justify-start"
                        }`}
                      >
                        <div className="w-2.5 h-2.5 md:w-3 md:h-3 mx-0.5 md:mx-1 rounded-full bg-white transition-all" />
                      </div>
                    </div>
                    <h3 className="text-xs md:text-sm font-medium text-white">
                      Analytics
                    </h3>
                    <p className="text-[10px] md:text-xs text-white/50 mt-0.5">
                      Track users & events
                    </p>
                    <div className="hidden md:flex gap-1 mt-2">
                      <span className="px-1.5 py-0.5 text-[9px] bg-white/5 border border-white/10 rounded text-white/40">
                        Real-time
                      </span>
                      <span className="px-1.5 py-0.5 text-[9px] bg-white/5 border border-white/10 rounded text-white/40">
                        Events
                      </span>
                    </div>
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 md:pt-3">
                  <button
                    onClick={() => setSetupStep(2)}
                    className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 text-[11px] md:text-xs text-white/60 hover:text-white transition-colors"
                  >
                    <ArrowLeft className="h-3 w-3 md:h-3.5 md:w-3.5" />
                    Back
                  </button>
                  <button
                    onClick={startSession}
                    disabled={isLoading}
                    className="group relative flex items-center gap-2 px-5 md:px-6 py-2 md:py-2.5 rounded-lg text-white text-sm font-medium transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 overflow-hidden touch-manipulation"
                  >
                    {/* Animated gradient background */}
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-violet-500 to-cyan-500 bg-[length:200%_100%] animate-[shimmer_2s_linear_infinite]" />
                    {/* Glow effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-violet-500 blur-lg opacity-40 group-hover:opacity-60 transition-opacity" />
                    <span className="relative flex items-center gap-2">
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="hidden sm:inline">Launching...</span>
                          <span className="sm:hidden">...</span>
                        </>
                      ) : (
                        <>
                          <Rocket className="h-4 w-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                          <span className="hidden sm:inline">
                            Start Building
                          </span>
                          <span className="sm:hidden">Start</span>
                        </>
                      )}
                    </span>
                  </button>
                </div>

                {/* Summary footer */}
                <p className="text-center text-[9px] md:text-[10px] text-white/25 pt-2 md:pt-3">
                  Live sandbox • Hot reload • AI assistance • GitHub integration
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Shimmer animation */}
        <style jsx global>{`
          @keyframes shimmer {
            0% {
              background-position: 200% 0;
            }
            100% {
              background-position: -200% 0;
            }
          }
        `}</style>
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

              {appSnapshotInfo ? (
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg mb-6">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <RefreshCw className="h-4 w-4 text-green-400" />
                    <p className="text-sm text-green-400 font-medium">
                      Code saved to GitHub
                    </p>
                  </div>
                  <p className="text-xs text-white/50">
                    Your code will be restored from{" "}
                    <span className="font-mono text-green-400/80">
                      {appSnapshotInfo.githubRepo.split("/").pop()}
                    </span>
                    {appSnapshotInfo.lastBackup && (
                      <>
                        {" "}
                        (last updated{" "}
                        {new Date(
                          appSnapshotInfo.lastBackup,
                        ).toLocaleDateString()}
                        )
                      </>
                    )}
                  </p>
                </div>
              ) : appData?.github_repo ? (
                <p className="text-xs text-white/40 mb-4">
                  No previous work found for this app.
                </p>
              ) : null}

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
                ) : appSnapshotInfo || appData?.github_repo ? (
                  <>
                    <RefreshCw className="h-5 w-5 mr-2" />
                    Start Building
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

  if (status === "initializing" && !isRestoring) {
    const steps = [
      { key: "creating", label: "Creating sandbox instance" },
      { key: "installing", label: "Installing dependencies" },
      { key: "starting", label: "Starting dev server" },
    ];

    const currentStepIndex = steps.findIndex((s) => s.key === progressStep);

    return (
      <div className="max-w-4xl mx-auto py-10 animate-in fade-in duration-200">
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
      <div className="max-w-4xl mx-auto py-10 animate-in fade-in duration-200">
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
    <div className="fixed top-16 left-0 md:left-64 right-0 bottom-0 flex flex-col overflow-hidden bg-[#0A0A0A] z-10 animate-in fade-in duration-300">
      {/* MOBILE/TABLET TOOLBAR - visible up to xl (1280px) to include iPad Pro */}
      <div className="flex-shrink-0 flex xl:hidden items-center justify-between px-2 py-2 border-b border-white/10 bg-black/40">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Link
            href={backLink}
            className="p-1.5 hover:bg-white/10 rounded-md transition-colors flex-shrink-0"
          >
            <ArrowLeft className="h-4 w-4 text-white/60" />
          </Link>
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Sparkles className="h-3.5 w-3.5 text-cyan-400 flex-shrink-0" />
            <span
              className="text-xs text-white truncate"
              style={{ fontFamily: "var(--font-roboto-mono)" }}
            >
              {appData?.name || appName}
            </span>
          </div>
        </div>

        {/* Mobile Panel Toggle */}
        <div className="flex items-center gap-1 mx-2">
          <button
            onClick={() => setMobilePanel("chat")}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              mobilePanel === "chat"
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                : "text-white/50 hover:text-white/70 hover:bg-white/5"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Chat
          </button>
          <button
            onClick={() => setMobilePanel("preview")}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              mobilePanel === "preview"
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                : "text-white/50 hover:text-white/70 hover:bg-white/5"
            }`}
          >
            <Monitor className="h-3.5 w-3.5" />
            Preview
          </button>
        </div>

        {/* Mobile Actions Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1.5 hover:bg-white/10 rounded-md transition-colors flex-shrink-0">
              <MoreVertical className="h-5 w-5 text-white/60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 bg-[#1a1a1a] border-white/10"
          >
            {/* Timer & Session */}
            {timeRemaining && (
              <>
                <div className="px-2 py-1.5 flex items-center gap-2">
                  <Timer
                    className={`h-3.5 w-3.5 ${
                      timeRemaining === "Expired"
                        ? "text-red-400"
                        : parseInt(timeRemaining.split(":")[0] || "30") <= 5
                          ? "text-yellow-400"
                          : "text-white/60"
                    }`}
                  />
                  <span
                    className={`text-xs font-mono ${
                      timeRemaining === "Expired"
                        ? "text-red-400"
                        : parseInt(timeRemaining.split(":")[0] || "30") <= 5
                          ? "text-yellow-400"
                          : "text-white/60"
                    }`}
                  >
                    {timeRemaining} remaining
                  </span>
                </div>
                <DropdownMenuSeparator className="bg-white/10" />
              </>
            )}

            {/* Session Actions */}
            {status === "timeout" && snapshotInfo?.canRestore ? (
              <DropdownMenuItem
                onClick={restoreSession}
                disabled={isRestoring}
                className="text-green-400 focus:text-green-400 focus:bg-green-500/10"
              >
                {isRestoring ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Restore Session
              </DropdownMenuItem>
            ) : (
              status !== "timeout" && (
                <DropdownMenuItem
                  onClick={extendSession}
                  disabled={isExtending || status !== "ready"}
                  className="text-cyan-400 focus:text-cyan-400 focus:bg-cyan-500/10"
                >
                  {isExtending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Extend +15 minutes
                </DropdownMenuItem>
              )
            )}

            {/* GitHub Actions */}
            {(status === "ready" || status === "recovering") &&
              appData?.github_repo && (
                <>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem
                    onClick={saveToGitHub}
                    disabled={
                      isSaving ||
                      !gitStatus?.hasChanges ||
                      status === "recovering"
                    }
                    className={
                      gitStatus?.hasChanges
                        ? "text-green-400 focus:text-green-400 focus:bg-green-500/10"
                        : ""
                    }
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {isSaving
                      ? "Saving..."
                      : gitStatus?.hasChanges
                        ? "Save to GitHub"
                        : "Saved"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={deployToProduction}
                    disabled={isDeploying || status === "recovering"}
                    className="text-[#FF5800] focus:text-[#FF5800] focus:bg-[#FF5800]/10"
                  >
                    {isDeploying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Rocket className="h-4 w-4" />
                    )}
                    {isDeploying ? "Deploying..." : "Deploy"}
                  </DropdownMenuItem>
                  {productionUrl && (
                    <DropdownMenuItem asChild>
                      <a
                        href={productionUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 focus:text-cyan-400"
                      >
                        <ExternalLink className="h-4 w-4" />
                        View Live Site
                      </a>
                    </DropdownMenuItem>
                  )}
                </>
              )}

            {/* GitHub Repo Link */}
            {appData?.github_repo && (
              <DropdownMenuItem asChild>
                <a
                  href={`https://github.com/${appData.github_repo}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/70"
                >
                  <GitBranch className="h-4 w-4" />
                  View on GitHub
                </a>
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator className="bg-white/10" />

            {/* Sandbox Actions */}
            {session?.sandboxUrl && (
              <>
                <DropdownMenuItem onClick={copySandboxUrl}>
                  {copied ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copied ? "Copied!" : "Copy Preview URL"}
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a
                    href={session.sandboxUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open in New Tab
                  </a>
                </DropdownMenuItem>
              </>
            )}

            {/* Stop Session */}
            {(status === "ready" || status === "recovering") && (
              <>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem
                  onClick={stopSession}
                  disabled={status === "recovering"}
                  className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
                >
                  <Square className="h-4 w-4" />
                  Stop Session
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* DESKTOP TOOLBAR - visible from xl (1280px) and up */}
      <div className="flex-shrink-0 hidden xl:flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/40">
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
          {/* GitHub repo indicator */}
          {appData?.github_repo ? (
            <a
              href={`https://github.com/${appData.github_repo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2 py-1 text-xs bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-colors rounded"
              title="View on GitHub"
            >
              <GitBranch className="h-3 w-3" />
              <span style={{ fontFamily: "var(--font-roboto-mono)" }}>
                {appData.github_repo.split("/").pop()}
              </span>
              <Cloud className="h-3 w-3" />
            </a>
          ) : status === "ready" || status === "recovering" ? (
            <div
              className="flex items-center gap-1.5 px-2 py-1 text-xs bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 rounded"
              title="GitHub not configured"
            >
              <CloudOff className="h-3 w-3" />
              <span>No GitHub</span>
            </div>
          ) : null}
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
          ) : status === "recovering" ? (
            <Button
              variant="ghost"
              size="sm"
              disabled
              className="h-7 text-xs text-cyan-400"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="ml-1">Reconnecting...</span>
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
          {/* GitHub Save Button */}
          {(status === "ready" || status === "recovering") &&
            appData?.github_repo && (
              <>
                <div className="w-px h-4 bg-white/10" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={saveToGitHub}
                  disabled={
                    isSaving ||
                    !gitStatus?.hasChanges ||
                    status === "recovering"
                  }
                  className={`h-7 text-xs ${
                    gitStatus?.hasChanges && status !== "recovering"
                      ? "text-green-400 hover:text-green-300 hover:bg-green-500/10"
                      : "text-white/40 hover:bg-white/5"
                  }`}
                  title={
                    status === "recovering"
                      ? "Reconnecting..."
                      : gitStatus?.hasChanges
                        ? "Save changes to GitHub"
                        : "No unsaved changes"
                  }
                >
                  {isSaving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                  <span className="ml-1">
                    {isSaving
                      ? "Saving..."
                      : gitStatus?.hasChanges
                        ? "Save"
                        : "Saved"}
                  </span>
                </Button>
                {/* Deploy to Production Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={deployToProduction}
                  disabled={isDeploying || status === "recovering"}
                  className="h-7 text-xs text-[#FF5800] hover:text-[#FF7033] hover:bg-[#FF5800]/10"
                  title={
                    status === "recovering"
                      ? "Reconnecting..."
                      : productionUrl
                        ? `Deploy to ${productionUrl}`
                        : "Deploy to production"
                  }
                >
                  {isDeploying ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Rocket className="h-3 w-3" />
                  )}
                  <span className="ml-1">
                    {isDeploying ? "Deploying..." : "Deploy"}
                  </span>
                </Button>
                {/* Production URL Link */}
                {productionUrl && (
                  <a
                    href={productionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-7 px-2 text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded flex items-center gap-1"
                    title={`View live at ${productionUrl}`}
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>Live</span>
                  </a>
                )}
                <div className="w-px h-4 bg-white/10" />
              </>
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
          {(status === "ready" || status === "recovering") && (
            <button
              onClick={stopSession}
              disabled={status === "recovering"}
              className="p-2 hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                status === "recovering" ? "Reconnecting..." : "Stop session"
              }
            >
              <Square className="h-4 w-4 text-red-400" />
            </button>
          )}
        </div>
      </div>

      {/* Auto-recovery indicator - non-blocking banner */}
      {status === "recovering" && !isRestoring && (
        <div className="absolute top-[49px] xl:top-[57px] left-0 right-0 z-20 bg-gradient-to-r from-cyan-500/20 via-violet-500/20 to-cyan-500/20 border-b border-cyan-500/30">
          <div className="flex items-center justify-center gap-2 xl:gap-3 px-3 xl:px-4 py-1.5 xl:py-2">
            <Loader2 className="h-3.5 w-3.5 xl:h-4 xl:w-4 animate-spin text-cyan-400 flex-shrink-0" />
            <span className="text-xs xl:text-sm text-white/80">
              Reconnecting...
            </span>
            <span className="text-[10px] xl:text-xs text-white/50 hidden sm:inline">
              This happens automatically
            </span>
          </div>
        </div>
      )}

      {/* Full overlay only for timeout/manual restore - not for auto-recovery */}
      {(status === "timeout" || isRestoring) && (
        <div className="absolute inset-0 top-[49px] xl:top-[57px] bg-black/80 backdrop-blur-sm z-20 flex items-center justify-center p-4">
          <BrandCard className="max-w-md w-full">
            <CornerBrackets className="opacity-20" />
            <div className="relative z-10 text-center space-y-3 xl:space-y-4 p-4 xl:p-6">
              <div
                className={`w-12 h-12 xl:w-16 xl:h-16 rounded-full ${isRestoring ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20"} border flex items-center justify-center mx-auto`}
              >
                {isRestoring ? (
                  <Loader2 className="h-6 w-6 xl:h-8 xl:w-8 text-green-400 animate-spin" />
                ) : (
                  <Timer className="h-6 w-6 xl:h-8 xl:w-8 text-red-400" />
                )}
              </div>
              <h2 className="text-lg xl:text-xl font-semibold text-white">
                {isRestoring ? "Restoring Session" : "Session Expired"}
              </h2>
              <p className="text-xs xl:text-sm text-white/60">
                {isRestoring
                  ? "Setting up your development environment and restoring your files..."
                  : "Your sandbox session has timed out after 30 minutes of inactivity."}
              </p>

              {isRestoring ? (
                <div className="space-y-3">
                  <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <p className="text-sm text-green-400 font-medium">
                      Restoring your code...
                    </p>
                    {snapshotInfo?.githubRepo && (
                      <p className="text-xs text-white/50 mt-1">
                        From{" "}
                        <span className="font-mono">
                          {snapshotInfo.githubRepo.split("/").pop()}
                        </span>
                      </p>
                    )}
                  </div>

                  <Button
                    disabled
                    className="w-full bg-green-600 text-white cursor-wait"
                  >
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {restoreProgress
                      ? `Restoring ${restoreProgress.current}/${restoreProgress.total}...`
                      : progressStep === "creating"
                        ? "Creating sandbox..."
                        : progressStep === "installing"
                          ? "Installing dependencies..."
                          : progressStep === "starting"
                            ? "Starting dev server..."
                            : progressStep === "restoring"
                              ? "Restoring files..."
                              : "Preparing..."}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => router.push("/dashboard/apps")}
                    disabled
                    className="w-full opacity-50"
                  >
                    Return to Apps
                  </Button>
                </div>
              ) : snapshotInfo?.canRestore ? (
                <div className="space-y-3">
                  <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <p className="text-sm text-green-400 font-medium">
                      Your code is saved to GitHub
                    </p>
                    <p className="text-xs text-white/50 mt-1">
                      <span className="font-mono">
                        {snapshotInfo.githubRepo?.split("/").pop()}
                      </span>
                      {snapshotInfo.lastBackup && (
                        <>
                          {" "}
                          · Last updated{" "}
                          {new Date(
                            snapshotInfo.lastBackup,
                          ).toLocaleDateString()}
                        </>
                      )}
                    </p>
                  </div>

                  <Button
                    onClick={restoreSession}
                    disabled={isRestoring}
                    className="w-full bg-green-600 hover:bg-green-500 text-white"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Restore & Continue
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
                        ? "Checking for saved code..."
                        : "No saved code found. Start fresh."}
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
        {/* CHAT PANEL - visible on desktop (w-1/2), toggled on mobile/tablet */}
        <div
          className={`flex flex-col border-r border-white/[0.04] bg-[#0a0a0b] transition-all overflow-hidden ${
            isFullscreen
              ? "w-0 hidden"
              : mobilePanel === "chat"
                ? "w-full xl:w-1/2"
                : "hidden xl:flex xl:w-1/2"
          }`}
        >
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto p-3 xl:p-5 space-y-3 xl:space-y-4"
          >
            {messages.map((msg, i) => (
              <ChatMessage
                key={`${msg.timestamp}-${i}`}
                msg={msg}
                index={i}
                session={session}
                status={status}
                sendPrompt={sendPrompt}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Isolated ChatInput component - uses Zustand for zero re-renders on typing */}
          <ChatInput onSendPrompt={sendPrompt} status={status} />
        </div>

        {/* PREVIEW PANEL - visible on desktop (flex-1), toggled on mobile/tablet */}
        <div
          className={`flex-1 flex flex-col overflow-hidden ${
            isFullscreen
              ? "w-full"
              : mobilePanel === "preview"
                ? "w-full xl:flex"
                : "hidden xl:flex"
          }`}
        >
          {/* Mobile/Tablet Preview Tabs */}
          <div className="flex-shrink-0 flex xl:hidden items-center gap-1.5 px-2 py-2 border-b border-white/10 bg-black/20 overflow-x-auto">
            <div className="flex bg-white/5 rounded-md p-0.5 flex-shrink-0">
              <button
                onClick={() => setPreviewTab("preview")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
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
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  previewTab === "console"
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                <Terminal className="h-3.5 w-3.5" />
                Console
                {consoleLogs.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-[#FF5800]/20 text-[#FF5800] rounded-full text-[10px] min-w-[18px] text-center">
                    {consoleLogs.length > 99 ? "99+" : consoleLogs.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setPreviewTab("files")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  previewTab === "files"
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                <FolderCode className="h-3.5 w-3.5" />
                Files
              </button>
              <button
                onClick={() => setPreviewTab("history")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  previewTab === "history"
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                <History className="h-3.5 w-3.5" />
                History
                {commitHistory.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded-full text-[10px] min-w-[18px] text-center">
                    {commitHistory.length > 99 ? "99+" : commitHistory.length}
                  </span>
                )}
              </button>
            </div>
            {/* Mobile/Tablet action buttons */}
            <div className="flex items-center gap-1 ml-auto flex-shrink-0">
              {previewTab === "console" && consoleLogs.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setConsoleLogs([])}
                  title="Clear console"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
              {previewTab === "preview" && (
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
              )}
            </div>
          </div>

          {/* Desktop Preview Tabs */}
          <div className="flex-shrink-0 hidden xl:flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-black/20">
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
              <button
                onClick={() => setPreviewTab("files")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  previewTab === "files"
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                <FolderCode className="h-3.5 w-3.5" />
                Files
              </button>
              <button
                onClick={() => setPreviewTab("history")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  previewTab === "history"
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                <History className="h-3.5 w-3.5" />
                History
                {commitHistory.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded-full text-[10px]">
                    {commitHistory.length}
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
                  onError={handleIframeError}
                  onLoad={handleIframeLoad}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-cyan-400 mx-auto mb-4" />
                    <p className="text-white/60">Loading preview...</p>
                  </div>
                </div>
              )
            ) : previewTab === "files" ? (
              session?.id ? (
                <SandboxFileExplorer
                  sessionId={session.id}
                  className="h-full"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-white/30">
                    <FolderCode className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Session not ready</p>
                  </div>
                </div>
              )
            ) : previewTab === "history" ? (
              session?.id ? (
                <HistoryTab
                  sessionId={session.id}
                  className="h-full"
                  currentCommitSha={gitStatus?.currentCommitSha}
                  onRollbackComplete={() => {
                    // Refresh the iframe after rollback
                    if (iframeRef.current && session?.sandboxUrl) {
                      iframeRef.current.src = session.sandboxUrl;
                    }
                    // Refresh git status
                    checkGitStatus();
                    // Refresh commit history
                    fetchCommitHistory();
                    addLog("Rolled back to previous version", "success");
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center text-white/30">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Session not ready</p>
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
