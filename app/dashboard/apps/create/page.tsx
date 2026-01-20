"use client";

import { useState, useCallback, useRef, useEffect, useMemo, memo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useChatInput, useModelSelection } from "@/lib/app-builder/store";
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
import {
  ChatInput,
  HistoryTab,
  SessionLoader,
  AgentPicker,
  WebTerminal,
} from "@/components/app-builder";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useThrottledStreamingUpdate } from "@/lib/hooks/use-throttled-streaming";

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
  X,
  MoreVertical,
  Users,
  type LucideIcon,
} from "lucide-react";
import { SandboxFileExplorer } from "@/components/sandbox/sandbox-file-explorer";
import { toast } from "sonner";
import { BrandCard, CornerBrackets } from "@/components/brand";
import {
  AnimatedCheck,
  AnimatedCheckmark,
  AnimatedOrbit,
  AnimatedLoadingRing,
} from "@/components/ui/animated-icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
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
  const msgTime = new Date(msg.timestamp)
    .toLocaleTimeString("en-US", {
      hour12: true,
      hour: "numeric",
      minute: "2-digit",
    })
    .toLowerCase();

  return (
    <div
      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} w-full group/message`}
      style={{
        animation: 'messageSlideIn 400ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
      }}
    >
      <div
        className={`relative transition-all duration-500 ease-out ${
          msg.role === "user"
            ? "max-w-[90%] xl:max-w-[85%] py-3 xl:py-3.5 px-4 xl:px-5 bg-gradient-to-br from-[#FF5800]/15 to-[#FF5800]/5 border border-[#FF5800]/25 rounded-2xl rounded-tr-sm shadow-lg shadow-[#FF5800]/5"
            : isProcessing
              ? "max-w-[95%] xl:max-w-[90%] py-3 xl:py-4 px-4 xl:px-5 bg-gradient-to-br from-[#FF5800]/[0.08] via-amber-500/[0.04] to-transparent border border-[#FF5800]/20 rounded-2xl rounded-tl-sm shadow-lg shadow-[#FF5800]/5"
              : "max-w-[95%] xl:max-w-[90%] py-3 xl:py-4 px-4 xl:px-5 bg-gradient-to-br from-white/[0.03] to-transparent border border-white/[0.06] rounded-2xl rounded-tl-sm"
        }`}
      >
        {/* Subtle glow for processing messages */}
        {isProcessing && (
          <div className="absolute inset-0 rounded-2xl rounded-tl-sm bg-gradient-to-br from-[#FF5800]/10 to-transparent blur-xl -z-10" />
        )}

        <div className="flex items-center justify-between mb-2 xl:mb-2.5">
          <div className="flex items-center gap-2 xl:gap-2.5">
            {isProcessing && (
              <div className="relative">
                <AnimatedOrbit size={14} className="text-[#FF5800]" />
                <div className="absolute inset-0 bg-[#FF5800] rounded-full blur-lg opacity-30" />
              </div>
            )}
            <span
              className={`text-[10px] xl:text-[11px] font-semibold tracking-wide uppercase ${
                msg.role === "user"
                  ? "text-white/70"
                  : isProcessing
                    ? "text-white/60"
                    : "text-white/40"
              }`}
              style={{ fontFamily: "var(--font-sf-pro)" }}
            >
              {msg.role === "user"
                ? "You"
                : isProcessing
                  ? "Building"
                  : "Eliza"}
            </span>
          </div>
          <span className="text-[9px] xl:text-[10px] text-white/35 font-medium opacity-100 xl:opacity-0 group-hover/message:opacity-100 transition-opacity duration-300">
            {msgTime}
          </span>
        </div>
        {/* Main content with smooth text reveal */}
        <div className="text-[13px] xl:text-[14px] leading-[1.7] xl:leading-[1.8] text-white/85 prose-pre:max-w-full prose-pre:overflow-x-auto text-reveal">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
          >
            {msg.content}
          </ReactMarkdown>
        </div>

        {/* Per-operation accordions with reasoning - smooth animated reveal */}
        {msg.role === "assistant" &&
          msg.operations &&
          msg.operations.length > 0 &&
          !isProcessing && (
            <div 
              className="mt-4 pt-3 border-t border-white/[0.06]"
              style={{
                animation: 'reasoningWaveIn 350ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
              }}
            >
              <p className="text-[9px] xl:text-[10px] text-white/30 mb-2.5 uppercase tracking-widest font-semibold">
                Completed Operations
              </p>
              <Accordion type="multiple" className="space-y-1.5">
                {msg.operations.map((op, idx) => (
                  <AccordionItem
                    key={idx}
                    value={`op-${idx}`}
                    className="operation-item border border-white/[0.06] rounded-lg bg-white/[0.01] overflow-hidden hover:border-white/[0.1] transition-colors duration-300"
                    style={{ animationDelay: `${idx * 80}ms` }}
                  >
                    <AccordionTrigger className="px-3 py-2.5 text-[12px] hover:no-underline hover:bg-white/[0.03] transition-all duration-200">
                      <div className="flex items-center gap-2.5 text-left w-full">
                        <AnimatedCheck 
                          size={14} 
                          className="text-emerald-400 flex-shrink-0" 
                          delay={idx * 80 + 200} 
                        />
                        <span className="font-medium text-white/85">
                          {op.tool}
                        </span>
                        <span className="text-[10px] text-white/45 font-mono truncate max-w-[200px]">
                          {op.detail}
                        </span>
                        <span className="text-[9px] text-white/25 ml-auto mr-3 font-mono">
                          {op.timestamp}
                        </span>
                      </div>
                    </AccordionTrigger>
                    {op.reasoning && (
                      <AccordionContent className="px-3 pb-3">
                        <div className="reasoning-reveal text-[11px] leading-[1.6] text-white/55 bg-black/25 rounded-lg p-3.5 max-h-[200px] overflow-y-auto border border-white/[0.04]">
                          <pre className="whitespace-pre-wrap font-sans">
                            {op.reasoning}
                          </pre>
                        </div>
                      </AccordionContent>
                    )}
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}

        {/* Fallback: overall reasoning accordion if no per-operation reasoning */}
        {msg.role === "assistant" &&
          msg.reasoning &&
          !msg.operations?.some((op) => op.reasoning) &&
          !isProcessing && (
            <Accordion 
              type="single" 
              collapsible 
              className="mt-3"
              style={{
                animation: 'reasoningWaveIn 400ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
              }}
            >
              <AccordionItem value="reasoning" className="border-white/10 operation-item">
                <AccordionTrigger className="py-2.5 text-[11px] xl:text-[12px] text-white/45 hover:text-white/70 hover:no-underline font-medium transition-colors duration-200">
                  <span className="flex items-center gap-2">
                    <span className="text-[14px]">💭</span>
                    <span>View all reasoning</span>
                    <span className="text-[10px] text-white/25 font-normal">
                      ({msg.reasoning.split(/\s+/).length} words)
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="reasoning-reveal text-[12px] leading-[1.6] text-white/55 bg-white/[0.02] rounded-lg px-3.5 py-3 max-h-[300px] overflow-y-auto border border-white/[0.04]">
                  <pre className="whitespace-pre-wrap font-sans text-[11px] xl:text-[12px]">
                    {msg.reasoning}
                  </pre>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        {i === 0 &&
          msg.role === "assistant" &&
          session?.examplePrompts &&
          session.examplePrompts.length > 0 && (
            <div 
              className="mt-4 xl:mt-5 pt-3 xl:pt-4 border-t border-white/[0.06]"
              style={{
                animation: 'reasoningWaveIn 450ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
                animationDelay: '200ms',
              }}
            >
              <p className="text-[9px] xl:text-[10px] text-white/30 mb-2 xl:mb-2.5 uppercase tracking-widest font-semibold">
                Try asking
              </p>
              <div className="flex flex-wrap gap-1.5 xl:gap-2">
                {session.examplePrompts.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => sendPrompt(prompt)}
                    disabled={status !== "ready"}
                    className="group/suggestion px-3 xl:px-3.5 py-1.5 xl:py-2 text-[11px] xl:text-[12px] bg-white/[0.02] hover:bg-[#FF5800]/10 border border-white/[0.06] hover:border-[#FF5800]/30 text-white/55 hover:text-white/90 rounded-xl transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed text-left touch-manipulation operation-item"
                    style={{ animationDelay: `${300 + idx * 60}ms` }}
                  >
                    <span className="group-hover/suggestion:text-[#FF5800]/80 transition-colors">
                      {prompt}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        {msg.filesAffected && msg.filesAffected.length > 0 && (
          <div 
            className="mt-3 xl:mt-4 pt-3 xl:pt-3.5 border-t border-white/[0.05]"
            style={{
              animation: 'reasoningWaveIn 400ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
              animationDelay: '100ms',
            }}
          >
            <p className="text-[9px] xl:text-[10px] text-white/25 mb-1.5 xl:mb-2 uppercase tracking-widest font-semibold">
              Modified
            </p>
            <div className="flex flex-wrap gap-1.5 pb-1">
              {msg.filesAffected.map((file, idx) => (
                <span
                  key={file}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] xl:text-[11px] bg-[#FF5800]/15 border border-[#FF5800]/25 text-white/90 font-mono rounded-md hover:bg-[#FF5800]/20 transition-colors duration-200"
                >
                  <FileCode className="h-2.5 w-2.5 flex-shrink-0 text-[#FF5800]/80" />
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
  const consoleLogsRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const initializationRef = useRef(false);
  const prevAppIdRef = useRef<string | null>(null);
  const prevSessionIdRef = useRef<string | null>(null);
  const sessionActionsLogRef = useRef<
    {
      tool: string;
      detail: string;
      timestamp: string;
      status: "pending" | "active" | "done";
      context?: string;
    }[]
  >([]);
  const initialThinkingIdRef = useRef<number | null>(null);
  const initialThinkingStreamIdRef = useRef<string | null>(null);
  // AbortController for cancelling ongoing AI generation
  const generationAbortControllerRef = useRef<AbortController | null>(null);

  // Throttled streaming for smooth thinking text updates (~30fps instead of every chunk)
  const {
    accumulateChunk: accumulateThinkingChunk,
    scheduleUpdate: scheduleThinkingUpdate,
    clearAll: clearThinkingBuffer,
    getText: getThinkingText,
  } = useThrottledStreamingUpdate();

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
  // Setup wizard steps: 1 = template, 2 = details, 3 = features, 4 = agents
  const [setupStep, setSetupStep] = useState<1 | 2 | 3 | 4>(1);
  const [appData, setAppData] = useState<AppData | null>(null);
  // Agent selection for the app
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [availableAgents, setAvailableAgents] = useState<
    Array<{
      id: string;
      name: string;
      username?: string | null;
      avatar_url?: string | null;
      bio?: string | string[];
      is_public?: boolean;
    }>
  >([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [appName, setAppName] = useState(
    sourceContext ? `${sourceContext.name} App` : "",
  );
  const [appDescription, setAppDescription] = useState(
    sourceContext
      ? `An app built with ${sourceContext.name} ${sourceContext.type}`
      : "",
  );
  // Name validation state
  const [nameValidation, setNameValidation] = useState<{
    isChecking: boolean;
    isAvailable: boolean | null;
    error: string | null;
    suggestedName: string | null;
  }>({
    isChecking: false,
    isAvailable: null,
    error: null,
    suggestedName: null,
  });
  const nameCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Minimum description length
  const MIN_DESCRIPTION_LENGTH = 10;

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progressStep, setProgressStep] = useState<ProgressStep>("creating");
  const [previewTab, setPreviewTab] = useState<PreviewTab>("preview");
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  // Track iframe loading state to prevent white flash
  const [iframeLoaded, setIframeLoaded] = useState(false);
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
  const [appSnapshotInfo, setAppSnapshotInfo] = useState<{
    githubRepo: string;
    lastBackup: string | null;
  } | null>(null);

  // GitHub-related state
  const [gitStatus, setGitStatus] = useState<GitStatusInfo | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployPhase, setDeployPhase] = useState<"saving" | "deploying" | null>(null);
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

  // ============================================================================
  // DEBOUNCED APP NAME AVAILABILITY CHECK
  // ============================================================================
  useEffect(() => {
    // Clear any pending timeout
    if (nameCheckTimeoutRef.current) {
      clearTimeout(nameCheckTimeoutRef.current);
    }

    const trimmedName = appName.trim();

    // Reset validation if name is empty or too short
    if (!trimmedName || trimmedName.length < 2) {
      setNameValidation({
        isChecking: false,
        isAvailable: null,
        error:
          trimmedName.length > 0 && trimmedName.length < 2
            ? "Name must be at least 2 characters"
            : null,
        suggestedName: null,
      });
      return;
    }

    // Set checking state
    setNameValidation((prev) => ({
      ...prev,
      isChecking: true,
      error: null,
    }));

    // Debounce the API call
    nameCheckTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch("/api/v1/apps/check-name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmedName }),
        });

        if (response.ok) {
          const data = await response.json();
          setNameValidation({
            isChecking: false,
            isAvailable: data.available,
            error: data.available
              ? null
              : data.conflictType === "subdomain"
                ? "This name would create a subdomain that is already in use"
                : "An app with this name already exists",
            suggestedName: data.suggestedName || null,
          });
        } else {
          setNameValidation({
            isChecking: false,
            isAvailable: null,
            error: null,
            suggestedName: null,
          });
        }
      } catch {
        setNameValidation({
          isChecking: false,
          isAvailable: null,
          error: null,
          suggestedName: null,
        });
      }
    }, 500); // 500ms debounce

    return () => {
      if (nameCheckTimeoutRef.current) {
        clearTimeout(nameCheckTimeoutRef.current);
      }
    };
  }, [appName]);

  // ============================================================================
  // FETCH USER'S AGENTS FOR APP AGENT SELECTION
  // ============================================================================
  useEffect(() => {
    // Only fetch when we reach the agents step (step 4) or when in building mode
    if (setupStep === 4 || step === "building") {
      const fetchAgents = async () => {
        if (availableAgents.length > 0) return; // Already fetched
        setLoadingAgents(true);
        try {
          const response = await fetchWithRetry(
            "/api/my-agents/characters?limit=100",
          );
          if (response.ok) {
            const data = await response.json();
            if (
              data.success &&
              data.data?.characters &&
              Array.isArray(data.data.characters)
            ) {
              setAvailableAgents(
                data.data.characters.map(
                  (agent: {
                    id: string;
                    name: string;
                    username?: string | null;
                    avatar_url?: string | null;
                    bio?: string | string[];
                    is_public?: boolean;
                  }) => ({
                    id: agent.id,
                    name: agent.name,
                    username: agent.username,
                    avatar_url: agent.avatar_url,
                    bio: agent.bio,
                    is_public: agent.is_public,
                  }),
                ),
              );
            }
          }
        } catch (error) {
          console.error("Failed to fetch agents:", error);
        } finally {
          setLoadingAgents(false);
        }
      };
      fetchAgents();
    }
  }, [setupStep, step, availableAgents.length]);

  // ============================================================================
  // SIMPLE INITIALIZATION FLOW
  // 1. New app (no appId) → show setup wizard
  // 2. Edit app (appId) → load app data, then start/connect to session
  // 3. Session in URL → try to connect, if expired/gone → start fresh
  // ============================================================================

  useEffect(() => {
    // Track URL changes
    const appChanged = prevAppIdRef.current !== appIdFromUrl;
    const sessionChanged = prevSessionIdRef.current !== sessionIdFromUrl;

    if (appChanged || sessionChanged) {
      prevAppIdRef.current = appIdFromUrl;
      prevSessionIdRef.current = sessionIdFromUrl;
      initializationRef.current = false;

      // Reset state for fresh load
      setSession(null);
      setMessages([]);
      setStatus("idle");
      setIsInitializing(!!appIdFromUrl || !!sessionIdFromUrl);
      setIframeLoaded(false);

      if (appChanged) {
        setAppData(null);
        setAppSnapshotInfo(null);
        setStep(appIdFromUrl ? "building" : "setup");
      }
    }

    if (initializationRef.current) return;
    initializationRef.current = true;

    // Main initialization logic
    const init = async () => {
      try {
        // CASE 1: Have a specific session ID - try to connect to it
        if (sessionIdFromUrl && appIdFromUrl) {
          const connected = await connectToSession(
            sessionIdFromUrl,
            appIdFromUrl,
          );
          if (connected) {
            setIsInitializing(false);
            return;
          }
          // Session is gone/expired - remove from URL and start fresh
          router.replace(`/dashboard/apps/create?appId=${appIdFromUrl}`, {
            scroll: false,
          });
          initializationRef.current = false;
          return;
        }

        // CASE 2: Have appId but no sessionId - load app and check for sessions
        if (appIdFromUrl) {
          await loadAppAndSession(appIdFromUrl);
        }

        setIsInitializing(false);
      } catch (error) {
        console.error("[AppBuilder] Initialization failed:", error);
        setIsInitializing(false);
        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Initialization failed",
        );
      }
    };

    // Connect to existing session - returns true if successful
    const connectToSession = async (
      sessionId: string,
      appId: string,
    ): Promise<boolean> => {
      // Fetch session and app data together
      const [sessionRes, appRes] = await Promise.all([
        fetchWithRetry(`/api/v1/app-builder/sessions/${sessionId}`),
        fetchWithRetry(`/api/v1/apps/${appId}`),
      ]);

      if (!sessionRes.ok) return false;
      const sessionData = await sessionRes.json();
      if (!sessionData.success || !sessionData.session) return false;

      // Load app data
      if (appRes.ok) {
        const appData = await appRes.json();
        if (appData.success && appData.app) {
          setAppData(appData.app);
          setAppName(appData.app.name);
        }
      }

      const sess = sessionData.session;
      const sessStatus = sess.status as SessionStatus;
      const isExpired = sessStatus === "timeout" || sessStatus === "stopped";

      // If session is expired, don't try to connect - start fresh instead
      // The startSession API will automatically clone from GitHub
      if (isExpired) {
        return false;
      }

      // Session looks valid - set up state
      setSession({
        id: sess.id,
        sandboxId: sess.sandboxId || "",
        sandboxUrl: sess.sandboxUrl || "",
        status: sessStatus,
        examplePrompts: sess.examplePrompts || [],
        expiresAt: sess.expiresAt || null,
      });
      setStep("building");

      // Restore messages
      const storedMsgs = sessionStorage.getItem(messagesStorageKey);
      if (storedMsgs) {
        try {
          setMessages(JSON.parse(storedMsgs));
        } catch {
          /* ignore */
        }
      }

      // Verify sandbox is actually reachable
      if (sessStatus === "ready" && sess.sandboxUrl) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          await fetch(sess.sandboxUrl, {
            method: "HEAD",
            mode: "no-cors",
            signal: controller.signal,
          });
          clearTimeout(timeout);
          setStatus("ready");
          setSandboxHealthy(true);
        } catch {
          // Sandbox not responding - needs recovery
          setStatus("recovering");
          setSandboxHealthy(false);
          healthCheckFailCountRef.current = 2;
        }
      } else {
        setStatus(sessStatus);
      }

      return true;
    };

    // Load app data and optionally redirect to existing session
    const loadAppAndSession = async (appId: string) => {
      // Fetch app first
      const appRes = await fetchWithRetry(`/api/v1/apps/${appId}`);
      if (!appRes.ok) {
        toast.error("App not found");
        router.push("/dashboard/apps");
        return;
      }

      const appData = await appRes.json();
      if (appData.success && appData.app) {
        setAppData(appData.app);
        setAppName(appData.app.name);
        setAppDescription(appData.app.description || "");
        setIncludeMonetization(appData.app.monetization_enabled || false);
      }

      // Check for existing active session
      const sessionRes = await fetchWithRetry(
        `/api/v1/app-builder?appId=${appId}&limit=1`,
      );
      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        if (sessionData.success && sessionData.sessions?.length > 0) {
          // Found active session - redirect to it
          router.replace(
            `/dashboard/apps/create?appId=${appId}&sessionId=${sessionData.sessions[0].id}`,
            { scroll: false },
          );
          initializationRef.current = false;
          return;
        }
      }

      // No active session - will auto-start via effect
    };

    init();
  }, [appIdFromUrl, sessionIdFromUrl, router, messagesStorageKey]);

  useEffect(() => {
    if (messages.length > 0) {
      sessionStorage.setItem(messagesStorageKey, JSON.stringify(messages));
    }
  }, [messages, messagesStorageKey]);

  // Auto-scroll chat messages to bottom when messages change or load
  useEffect(() => {
    if (messagesContainerRef.current && messages.length > 0) {
      // Use requestAnimationFrame + setTimeout to ensure DOM has fully rendered
      // This handles both new messages and restored messages on page refresh
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop =
              messagesContainerRef.current.scrollHeight;
          }
        }, 50);
      });
    }
  }, [messages, isLoading]);

  // Additional scroll on initialization complete (handles page refresh)
  useEffect(() => {
    if (
      !isInitializing &&
      messages.length > 0 &&
      messagesContainerRef.current
    ) {
      // Delay scroll to ensure layout is complete after initialization
      const timeoutId = setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop =
            messagesContainerRef.current.scrollHeight;
        }
      }, 150);
      return () => clearTimeout(timeoutId);
    }
  }, [isInitializing, messages.length]);

  // Auto-scroll console logs when new logs arrive
  useEffect(() => {
    if (consoleLogsRef.current && consoleLogs.length > 0) {
      consoleLogsRef.current.scrollTop = consoleLogsRef.current.scrollHeight;
    }
  }, [consoleLogs]);

  // Auto-scroll to bottom when switching to console tab
  useEffect(() => {
    if (
      previewTab === "console" &&
      consoleLogsRef.current &&
      consoleLogs.length > 0
    ) {
      // Use setTimeout to ensure DOM has rendered
      setTimeout(() => {
        if (consoleLogsRef.current) {
          consoleLogsRef.current.scrollTop =
            consoleLogsRef.current.scrollHeight;
        }
      }, 0);
    }
  }, [previewTab, consoleLogs.length]);

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
        if (data.filesCommitted > 0 && data.commitSha) {
          toast.success("Saved to GitHub", {
            description: `${data.filesCommitted} file(s) committed`,
          });
          addLog(
            `Saved to GitHub: ${data.commitSha.substring(0, 7)} (${data.filesCommitted} files)`,
            "success",
          );
        } else {
          toast.info("No changes to save", {
            description: "All files are already up to date",
          });
          addLog("No changes to commit - files already up to date", "info");
        }
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

    setIsDeploying(true);
    // First save any uncommitted changes
    if (gitStatus?.hasChanges) {
      setDeployPhase("saving");
      addLog("Saving changes before deploy...", "info");
      await saveToGitHub();
    }

    setDeployPhase("deploying");
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
      setDeployPhase(null);
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

                // Refresh git status after session restore
                checkGitStatus();
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

      // If the error indicates session is already ready, just set status to ready
      // This prevents infinite loops when trying to resume an already-ready session
      if (errorMsg.includes("Current status: ready")) {
        addLog("Session is already ready", "info");
        setStatus("ready");
        return;
      }

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
  }, [session, isRestoring, addLog, checkGitStatus]);

  // Auto-restore ref to prevent duplicate triggers
  const autoRestoreTriggeredRef = useRef(false);

  // Auto-restore when session times out - automatically restore sandbox if possible
  useEffect(() => {
    // Only trigger when status becomes "timeout"
    if (status !== "timeout") {
      // Reset the ref when status changes away from timeout
      autoRestoreTriggeredRef.current = false;
      return;
    }

    // Don't trigger if already restoring or already triggered
    if (isRestoring || autoRestoreTriggeredRef.current) return;

    // Don't trigger if no session
    if (!session) return;

    // Check if we can restore - either from snapshotInfo or directly from app's github repo
    const canAutoRestore =
      snapshotInfo?.canRestore ||
      !!appSnapshotInfo?.githubRepo ||
      !!appData?.github_repo;

    if (canAutoRestore) {
      // Mark as triggered to prevent re-entry
      autoRestoreTriggeredRef.current = true;

      // Auto-trigger restore after a short delay to ensure UI is ready
      const timer = setTimeout(() => {
        restoreSession();
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [
    status,
    session,
    isRestoring,
    snapshotInfo?.canRestore,
    appSnapshotInfo?.githubRepo,
    appData?.github_repo,
    restoreSession,
  ]);

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

                // Refresh git status after sandbox recovery
                checkGitStatus();
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

      // If the error indicates session is already ready, just set status to ready
      // This prevents infinite loops when trying to recover an already-ready session
      if (errorMsg.includes("Current status: ready")) {
        addLog("Session is already ready", "info");
        setStatus("ready");
        setSandboxHealthy(true);
        healthCheckFailCountRef.current = 0;
        toast.dismiss(toastId);
        return;
      }

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
  }, [session, addLog, checkGitStatus]);

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
    // Mark iframe as loaded to prevent white flash
    setIframeLoaded(true);
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
          linkedAgentIds:
            selectedAgentIds.length > 0 ? selectedAgentIds : undefined,
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
                  // Create stream ID for throttled accumulation and clear any previous buffer
                  const streamId = `initial-thinking-${thinkingId}`;
                  initialThinkingStreamIdRef.current = streamId;
                  clearThinkingBuffer();

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
              } else if (
                eventType === "thinking" ||
                eventType === "reasoning"
              ) {
                // Stream reasoning/thinking text to show chain of thought
                // "thinking" = regular text output, "reasoning" = deep CoT tokens
                const reasoningText = data.text || "";
                // Note: Not logging individual chunks - shown in UI only

                // Update the thinking message with accumulated reasoning using throttled updates
                if (
                  initialThinkingIdRef.current &&
                  initialThinkingStreamIdRef.current &&
                  reasoningText
                ) {
                  const thinkingId = initialThinkingIdRef.current;
                  const streamId = initialThinkingStreamIdRef.current;

                  // Accumulate chunk in buffer (prefix reasoning with 💭 to distinguish)
                  const chunkText =
                    eventType === "reasoning"
                      ? `💭 ${reasoningText}`
                      : reasoningText;
                  accumulateThinkingChunk(streamId, chunkText);

                  // Schedule throttled UI update
                  scheduleThinkingUpdate(streamId, (accumulatedText) => {
                    let content = `**Setting up ${appName}**\n\n`;
                    if (sessionActionsLogRef.current.length > 0) {
                      sessionActionsLogRef.current.forEach((action) => {
                        const statusMarker =
                          action.status === "active" ? "⏳" : "✓";
                        content += `${statusMarker} **${action.tool}**\n`;
                        content += `> \`${action.detail}\`\n`;
                        // Show reasoning inline with this action
                        if (action.context) {
                          const truncated =
                            action.context.length > 150
                              ? action.context.substring(0, 150).trim() + "..."
                              : action.context;
                          content += `> 💭 ${truncated.replace(/\n/g, " ")}\n`;
                        }
                        content += "\n";
                      });
                    }
                    // Show current streaming reasoning (new text since last action)
                    if (accumulatedText.trim()) {
                      content += `💭 *${accumulatedText.trim()}*\n`;
                    }

                    setMessages((prev) =>
                      prev.map((m) =>
                        (m as Message & { _thinkingId?: number })
                          ._thinkingId === thinkingId
                          ? { ...m, content }
                          : m,
                      ),
                    );
                  });
                }
              } else if (eventType === "tool_use") {
                const toolName = data.tool;
                const { display: toolDisplay, detail } = formatToolDisplay(
                  toolName,
                  data.input,
                );

                // Mark previous action as done
                if (sessionActionsLogRef.current.length > 0) {
                  sessionActionsLogRef.current[
                    sessionActionsLogRef.current.length - 1
                  ].status = "done";
                }

                // Capture current reasoning for this action (before clearing buffer)
                const streamId = initialThinkingStreamIdRef.current;
                const actionReasoning = streamId
                  ? getThinkingText(streamId).trim()
                  : undefined;

                // Add new action WITH its reasoning context
                sessionActionsLogRef.current.push({
                  tool: toolDisplay,
                  detail,
                  timestamp: new Date().toLocaleTimeString("en-US", {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  }),
                  status: "active",
                  context: actionReasoning || undefined,
                });

                // Clear buffer - reasoning is now attached to this action
                clearThinkingBuffer();

                addLog(
                  `${toolName}: ${data.input?.path || data.input?.packages?.join(", ") || ""}`,
                  "info",
                );

                if (initialThinkingIdRef.current) {
                  const thinkingId = initialThinkingIdRef.current;

                  // Build organized content showing each action with its inline reasoning
                  let progressContent = `**Setting up ${appName}**\n\n`;
                  sessionActionsLogRef.current.forEach((action) => {
                    const statusMarker =
                      action.status === "active" ? "⏳" : "✓";
                    progressContent += `${statusMarker} **${action.tool}**\n`;
                    progressContent += `> \`${action.detail}\`\n`;
                    // Show reasoning inline with this action
                    if (action.context) {
                      const truncated =
                        action.context.length > 150
                          ? action.context.substring(0, 150).trim() + "..."
                          : action.context;
                      progressContent += `> 💭 ${truncated.replace(/\n/g, " ")}\n`;
                    }
                    progressContent += "\n";
                  });

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

                if (
                  data.session.initialPromptResult &&
                  initialThinkingIdRef.current
                ) {
                  const thinkingId = initialThinkingIdRef.current;
                  initialThinkingIdRef.current = null;
                  initialThinkingStreamIdRef.current = null;
                  clearThinkingBuffer();

                  sessionActionsLogRef.current.forEach((action) => {
                    action.status = "done";
                  });

                  // Generate clean summary based on what was done
                  // AI's raw output goes in reasoning accordion for transparency
                  const result = data.session.initialPromptResult;
                  const fileCount = result.filesAffected?.length || 0;
                  const hasBuildErrors = result.output?.includes("BUILD ERRORS");

                  let assistantContent = "";
                  if (hasBuildErrors) {
                    assistantContent = `I've scaffolded your app but encountered some build errors that need fixing.\n\n⚠️ **Build Issues Detected**\n\nTry asking me to "fix the build errors" and I'll help resolve them.`;
                  } else if (fileCount > 0) {
                    assistantContent = `I've set up your **${appName}** app! Created ${fileCount} file${fileCount !== 1 ? "s" : ""} to get you started.\n\nCheck out the preview to see it in action!`;
                  } else {
                    assistantContent = `I've set up your app! Check out the preview to see it in action.`;
                  }

                  // Build operations array for accordion display (same format as sendPrompt)
                  const operations = sessionActionsLogRef.current.map(
                    (action) => ({
                      tool: action.tool,
                      detail: action.detail,
                      timestamp: action.timestamp,
                      reasoning: action.context, // Per-action reasoning
                    }),
                  );

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
                          operations, // Operations array for accordions
                          reasoning:
                            data.session.initialPromptResult.reasoning, // Fallback reasoning
                          filesAffected:
                            data.session.initialPromptResult.filesAffected,
                        };
                      }
                      return m;
                    }),
                  );

                  if (iframeRef.current && data.session.sandboxUrl) {
                    setIframeLoaded(false);
                    iframeRef.current.src = data.session.sandboxUrl;
                  }

                  toast.success("App scaffolded!", {
                    description: "Your app structure has been created.",
                  });
                }

                setIsLoading(false);
                addLog("Build complete", "success");

                // Refresh git status after initial scaffolding completes
                // (auto-commit may have already pushed changes to GitHub)
                checkGitStatus();
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
    selectedAgentIds,
    sourceContext,
    addLog,
    router,
    checkGitStatus,
    accumulateThinkingChunk,
    clearThinkingBuffer,
    scheduleThinkingUpdate,
  ]);

  // Auto-start session when in edit mode with no session
  // Skip the old "AI App Builder" intermediate screen - just start automatically
  const autoStartTriggeredRef = useRef(false);

  useEffect(() => {
    // Only auto-start if:
    // - We're in edit mode (have appId)
    // - App data is loaded
    // - No active session
    // - Not currently loading/restoring
    // - Haven't already triggered auto-start
    // - Initialization is complete (prevents race condition on page refresh)
    if (
      isEditMode &&
      appData &&
      !session &&
      status === "idle" &&
      !isLoading &&
      !isRestoring &&
      !isInitializing &&
      !autoStartTriggeredRef.current
    ) {
      autoStartTriggeredRef.current = true;
      startSession();
    }

    // Reset flag if we get a session or leave edit mode
    if (session || !isEditMode) {
      autoStartTriggeredRef.current = false;
    }
  }, [
    isEditMode,
    appData,
    session,
    status,
    isLoading,
    isRestoring,
    isInitializing,
    startSession,
  ]);

  const sendPrompt = useCallback(
    async (promptText?: string) => {
      // Get input and model from Zustand store for isolation
      const currentInput = useChatInput.getState().input;
      const selectedModel = useModelSelection.getState().selectedModel;
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
      const thinkingStreamId = `thinking-${thinkingId}`; // Unique ID for throttled accumulation
      const actionsLog: {
        tool: string;
        detail: string;
        timestamp: string;
        status: "pending" | "active" | "done";
        context?: string; // Associated thinking/reasoning text for this action
      }[] = [];

      // getTimeString is imported from @/lib/app-builder

      // Track current thinking preview for display during active processing
      let currentThinkingPreview = "";

      // Clear any previous thinking buffer
      clearThinkingBuffer();

      const buildLocalProgressContent = (
        newThinkingChunk?: string,
        currentStatus?: string,
      ) => {
        let content = "";

        // Show current status when no actions have started yet
        if (actionsLog.length === 0) {
          if (currentStatus) {
            content += `*${currentStatus}*`;
          } else if (currentThinkingPreview) {
            // Show actual reasoning text inline during planning phase
            content += `💭 *${currentThinkingPreview}*`;
          }
        }

        // Show operations list with reasoning context
        if (actionsLog.length > 0) {
          actionsLog.forEach((action, idx) => {
            const isActive =
              action.status === "active" || action.status === "pending";
            const statusIcon = isActive ? "⏳" : "✓";

            // Action display with status, tool, detail, and timestamp
            content += `${statusIcon} **${action.tool}**\n`;
            content += `\`${action.detail}\`\n`;
            content += `*${action.timestamp}*\n`;

            // Show reasoning context if available (the "why" behind this action)
            if (action.context) {
              // Truncate long reasoning for cleaner display during build
              const truncatedContext =
                action.context.length > 200
                  ? action.context.substring(0, 200).trim() + "..."
                  : action.context;
              content += `> 💭 ${truncatedContext.replace(/\n/g, " ")}\n`;
            }
            content += "\n";
          });

          // Note: Reasoning is shown inline with each action via action.context
          // We don't show a separate thinking preview blob at the bottom to avoid duplication
        }

        return content || "**Processing your request**\n\n*Analyzing...*";
      };

      // Update UI with current reasoning and status (called directly for non-thinking events)
      const updateThinking = (currentStatus?: string) => {
        const content = buildLocalProgressContent(undefined, currentStatus);
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

      // Throttled update for thinking text (~30fps for smooth appearance)
      const updateThinkingThrottled = (accumulatedText: string) => {
        // Track FULL thinking text - no truncation!
        currentThinkingPreview = accumulatedText;

        const content = buildLocalProgressContent(accumulatedText);
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

      // Create AbortController for this generation request
      generationAbortControllerRef.current = new AbortController();

      try {
        const response = await fetchWithRetry(
          `/api/v1/app-builder/sessions/${session.id}/prompts/stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: text, model: selectedModel }),
            signal: generationAbortControllerRef.current.signal,
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
          reasoning?: string; // Separate reasoning for collapsible display
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
                  // Stream the actual text output to UI
                  // Uses throttled updates (~30fps) to prevent UI flickering from rapid chunks
                  const reasoningText = data.text || "";
                  if (reasoningText) {
                    // Accumulate chunk without triggering re-render
                    accumulateThinkingChunk(thinkingStreamId, reasoningText);
                    // Schedule throttled UI update (~30fps for smooth text appearance)
                    scheduleThinkingUpdate(
                      thinkingStreamId,
                      updateThinkingThrottled,
                    );
                  }
                  // Note: Not logging individual chunks - shown in UI only
                } else if (eventType === "reasoning") {
                  // Deep reasoning / chain-of-thought tokens (internal thought process)
                  // These are the model's internal reasoning before producing output
                  const reasoningText = data.text || "";
                  if (reasoningText) {
                    // Prefix reasoning chunks with 💭 to distinguish from regular output
                    accumulateThinkingChunk(
                      thinkingStreamId,
                      `💭 ${reasoningText}`,
                    );
                    // Schedule throttled UI update (~30fps for smooth text appearance)
                    scheduleThinkingUpdate(
                      thinkingStreamId,
                      updateThinkingThrottled,
                    );
                  }
                } else if (eventType === "tool_start") {
                  // Instant feedback when tool begins (before execution)
                  const toolName = data.tool;
                  const {
                    display: toolDisplay,
                    detail,
                    statusMessage,
                  } = formatToolDisplay(toolName, data.input);

                  // Add as pending action WITH reasoning context for accordion display
                  // Use server's reasoningContext, fallback to client's accumulated thinking
                  const reasoningForAction =
                    data.reasoningContext || currentThinkingPreview || undefined;
                  actionsLog.push({
                    tool: toolDisplay,
                    detail,
                    timestamp: getTimeString(),
                    status: "pending",
                    context: reasoningForAction,
                  });

                  // Clear preview AND throttled buffer - reasoning is now attached to action
                  currentThinkingPreview = "";
                  clearThinkingBuffer(); // Reset the accumulator so we don't duplicate

                  updateThinking(`⏳ ${statusMessage}`);
                } else if (eventType === "tool_use") {
                  // Tool completed - update status
                  const toolName = data.tool;
                  const {
                    display: toolDisplay,
                    detail,
                    statusMessage,
                  } = formatToolDisplay(toolName, data.input);

                  // Find and update the pending action, or add new one if not found
                  const pendingIdx = actionsLog.findIndex(
                    (a) => a.status === "pending" && a.tool === toolDisplay,
                  );
                  if (pendingIdx >= 0) {
                    actionsLog[pendingIdx].status = "done";
                    // Clear thinking preview since action completed
                    currentThinkingPreview = "";
                  } else {
                    // Fallback: mark previous as done, add this one
                    if (actionsLog.length > 0) {
                      actionsLog[actionsLog.length - 1].status = "done";
                    }
                    // Add as completed action (no context - reasoning goes in final accordion)
                    actionsLog.push({
                      tool: toolDisplay,
                      detail,
                      timestamp: getTimeString(),
                      status: "done",
                    });
                  }
                  updateThinking(`✓ ${statusMessage}`);

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

              // Use the LLM's actual final summary when available
              // The AI produces a natural summary in finalData.output when it finishes
              const fileCount = finalData.filesAffected?.length || 0;
              const hasBuildErrors = finalData.output?.includes("BUILD ERRORS");
              
              // Check if we have a meaningful LLM summary (not just default/error text)
              const llmSummary = finalData.output?.trim();
              const hasLLMSummary = llmSummary && 
                llmSummary !== "Changes applied!" && 
                !llmSummary.startsWith("Error:") &&
                !hasBuildErrors;

              let content = "";
              if (hasBuildErrors) {
                content = `I've made changes but encountered some build errors.\n\n⚠️ **Build Issues Detected**\n\nTry asking me to "fix the build errors" and I'll help resolve them.`;
              } else if (hasLLMSummary) {
                // Use the LLM's natural summary
                content = llmSummary;
              } else if (fileCount > 0) {
                content = `Done! I've updated ${fileCount} file${fileCount !== 1 ? "s" : ""}. Check out the preview to see the changes.`;
              } else if (actionsLog.length > 0) {
                content = "I've completed your request.";
              } else {
                content = "Done!";
              }

              // Build operations list with per-action reasoning for accordions
              const operations = actionsLog.map((action) => ({
                tool: action.tool,
                detail: action.detail,
                timestamp: action.timestamp, // When the operation was performed
                reasoning: action.context, // Reasoning that led to this action
              }));

              return {
                ...rest,
                content,
                operations, // Per-operation data with reasoning for accordions
                reasoning: finalData.reasoning, // Overall reasoning as fallback
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
          setIframeLoaded(false);
          iframeRef.current.src = session.sandboxUrl;
        }

        setStatus("ready");

        // Refresh git status after prompt completes
        // (auto-commit may have already pushed changes to GitHub)
        checkGitStatus();
      } catch (error) {
        // Check if this was an abort/cancel
        const isAborted = error instanceof Error && (
          error.name === "AbortError" ||
          error.message.includes("aborted") ||
          error.message.includes("cancelled")
        );

        if (isAborted) {
          // Handle cancellation gracefully
          setMessages((prev) => {
            return prev.map((m) => {
              if (m._thinkingId === thinkingId) {
                const { _thinkingId: _, ...rest } = m;

                let content = "**Generation stopped**\n\n";
                content += "The operation was cancelled. You can start a new request when ready.";

                if (actionsLog.length > 0) {
                  content += "\n\n---\n\n";
                  content += "**Completed Actions**\n\n";
                  actionsLog.forEach((action) => {
                    if (action.status === "done") {
                      content += `\u2713 **${action.tool}**\n`;
                      content += `> \`${action.detail}\`\n\n`;
                    }
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
          addLog("Generation stopped by user", "info");
          toast.info("Generation stopped");
        } else {
          // Handle other errors
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
        }
      } finally {
        setIsLoading(false);
        // Clean up AbortController
        generationAbortControllerRef.current = null;
        // Always clean up throttled streaming buffer
        clearThinkingBuffer();
      }
    },
    [
      session,
      isLoading,
      addLog,
      checkGitStatus,
      clearThinkingBuffer,
      accumulateThinkingChunk,
      scheduleThinkingUpdate,
      getThinkingText,
    ],
  );

  // Stop the current AI generation (abort in-flight request)
  const stopGeneration = useCallback(() => {
    if (generationAbortControllerRef.current) {
      generationAbortControllerRef.current.abort();
      generationAbortControllerRef.current = null;
      // Immediately update UI state for responsive feedback
      setStatus("ready");
      setIsLoading(false);
      addLog("Generation stopped", "info");
      toast.info("Generation stopped");
    }
  }, [addLog]);

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

  // ============================================================================
  // SIMPLE VIEW STATE - Priority order matters!
  // 1. Loading states (initializing, starting) take precedence
  // 2. Then error states
  // 3. Then setup wizard
  // 4. Then building UI
  // ============================================================================
  const viewState = useMemo(() => {
    // Fetching data on page load
    if (isInitializing) return "initializing";

    // Manual restore in progress
    if (isRestoring) return "restoring";

    // Sandbox starting - check BEFORE setup so clicking "create" immediately shows starting
    if (status === "initializing") return "starting";

    // Error states
    if (status === "error") return "error";
    if (status === "not_configured") return "not_configured";

    // Edit mode waiting for data or session
    if (isEditMode && !appData) return "initializing";
    if (isEditMode && !session && status === "idle") return "starting";

    // New app setup wizard - only show if not already starting
    if (step === "setup" && !isEditMode && status === "idle") return "setup";

    // Everything else = building UI
    return "building";
  }, [isInitializing, isRestoring, status, step, isEditMode, appData, session]);

  // Simple loading states - just initializing or restoring
  if (viewState === "initializing" || viewState === "restoring") {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#0A0A0A] flex items-center justify-center py-12 animate-in fade-in duration-200">
        <SessionLoader
          mode={viewState}
          progressStep={progressStep}
          restoreProgress={restoreProgress}
          appName={appData?.name || appName}
          backLink={backLink}
          isRestoring={isRestoring}
          appGithubRepo={appData?.github_repo}
        />
      </div>
    );
  }

  if (viewState === "not_configured") {
    return (
      <div className="max-w-4xl mx-auto py-10 animate-in fade-in duration-300">
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

  if (viewState === "setup") {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#050507] animate-in fade-in duration-300">
        {/* Premium ambient background effects */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          {/* Primary morphing orb */}
          <div
            className="absolute top-1/4 -left-20 w-64 md:w-96 h-64 md:h-96 rounded-full blur-[120px] opacity-20 animate-liquid-orb"
            style={{ backgroundColor: selectedTemplate?.color || "#06B6D4" }}
          />
          {/* Secondary orb */}
          <div
            className="absolute bottom-1/4 -right-20 w-56 md:w-80 h-56 md:h-80 rounded-full blur-[100px] opacity-15 animate-liquid-orb"
            style={{
              backgroundColor: selectedTemplate?.color || "#8B5CF6",
              animationDelay: "-3s",
            }}
          />
          {/* Accent glow */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[200px] opacity-[0.07]"
            style={{ backgroundColor: "#FF5800" }}
          />
          {/* Subtle grid overlay */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                               linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
              backgroundSize: "60px 60px",
            }}
          />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 md:px-8 py-4 md:py-6">
          {/* Header - refined */}
          <div className="flex items-center justify-between mb-4 md:mb-6 animate-slide-in-left">
            <div className="flex items-center gap-3 md:gap-4">
              <Link
                href={backLink}
                className="group p-2 md:p-2.5 hover:bg-white/8 rounded-xl transition-all duration-300 border border-white/[0.06] hover:border-white/15 hover:scale-105"
              >
                <ArrowLeft className="h-4 w-4 text-white/50 group-hover:text-white/80 transition-colors" />
              </Link>
              <div className="flex items-center gap-2 md:gap-3">
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-r from-[#FF5800] via-amber-500 to-[#FF5800] rounded-xl blur-lg opacity-40 group-hover:opacity-60 transition-opacity" />
                  <div className="relative p-2 bg-gradient-to-br from-[#FF5800]/20 to-amber-500/10 rounded-xl border border-[#FF5800]/20">
                    <Sparkles className="h-4 w-4 md:h-5 md:w-5 text-[#FF5800]" />
                  </div>
                </div>
                <div>
                  <h1
                    className="text-lg md:text-xl font-bold tracking-tight text-white"
                    style={{ fontFamily: "var(--font-sf-pro)" }}
                  >
                    App Creator
                  </h1>
                  <p className="text-[10px] md:text-xs text-white/40 -mt-0.5 hidden md:block">
                    Build something amazing
                  </p>
                </div>
              </div>
            </div>

            {/* Mobile step indicator - Premium pills */}
            <div className="flex md:hidden items-center gap-1.5 p-1 bg-white/[0.03] rounded-full border border-white/[0.06]">
              {[1, 2, 3, 4].map((num) => (
                <div
                  key={num}
                  className={`rounded-full transition-all duration-500 ease-out ${
                    setupStep === num
                      ? "bg-gradient-to-r from-[#FF5800] to-amber-500 w-8 h-2 shadow-lg shadow-[#FF5800]/30"
                      : setupStep > num
                        ? "bg-[#FF5800]/60 w-2 h-2"
                        : "bg-white/15 w-2 h-2"
                  }`}
                />
              ))}
            </div>

            {/* Desktop step indicator - Premium tabs */}
            <div className="hidden md:flex items-center gap-1 p-1.5 bg-white/[0.02] rounded-2xl border border-white/[0.06] backdrop-blur-sm">
              {[
                { num: 1, label: "Template" },
                { num: 2, label: "Details" },
                { num: 3, label: "Features" },
                { num: 4, label: "Agents" },
              ].map((s, i) => (
                <div key={s.num} className="flex items-center">
                  <button
                    onClick={() => {
                      if (
                        s.num === 1 ||
                        (s.num === 2 && templateType) ||
                        (s.num === 3 && appName.trim()) ||
                        (s.num === 4 && appName.trim())
                      ) {
                        setSetupStep(s.num as 1 | 2 | 3 | 4);
                      }
                    }}
                    className={`group flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 ${
                      setupStep === s.num
                        ? "bg-gradient-to-r from-[#FF5800]/20 to-amber-500/10 border border-[#FF5800]/30 shadow-lg shadow-[#FF5800]/10"
                        : setupStep > s.num
                          ? "text-white/60 hover:text-white/80 hover:bg-white/[0.04]"
                          : "text-white/30 cursor-not-allowed"
                    }`}
                    disabled={s.num > 1 && !templateType && s.num !== setupStep}
                  >
                    <span
                      className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                        setupStep === s.num
                          ? "bg-gradient-to-br from-[#FF5800] to-amber-500 text-white shadow-md shadow-[#FF5800]/30"
                          : setupStep > s.num
                            ? "bg-[#FF5800]/20 text-[#FF5800]"
                            : "bg-white/[0.06] text-white/40"
                      }`}
                    >
                      {setupStep > s.num ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        s.num
                      )}
                    </span>
                    <span
                      className={`text-sm font-medium transition-colors ${
                        setupStep === s.num ? "text-white" : ""
                      }`}
                      style={{ fontFamily: "var(--font-sf-pro)" }}
                    >
                      {s.label}
                    </span>
                  </button>
                  {i < 3 && (
                    <div
                      className={`w-6 h-[2px] mx-0.5 rounded-full transition-all duration-500 ${
                        setupStep > s.num
                          ? "bg-gradient-to-r from-[#FF5800]/50 to-amber-500/50"
                          : "bg-white/[0.06]"
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
                  <div className="space-y-4 md:space-y-6">
                    {/* Header row with title and navigation */}
                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 md:gap-0 animate-stagger-fade stagger-1">
                      <div>
                        <h2
                          className="text-2xl md:text-3xl font-bold text-white tracking-tight"
                          style={{ fontFamily: "var(--font-sf-pro)" }}
                        >
                          What are you building?
                        </h2>
                        <p className="text-white/40 text-sm md:text-base mt-1">
                          Choose a foundation for your next masterpiece
                        </p>
                      </div>

                      {/* Carousel navigation - Premium */}
                      <div className="flex items-center justify-center md:justify-end gap-3 md:gap-4">
                        <button
                          onClick={() =>
                            setTemplatePage((p) => Math.max(0, p - 1))
                          }
                          disabled={templatePage === 0}
                          className="group p-2.5 md:p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-black/20"
                        >
                          <ChevronLeft className="h-4 w-4 md:h-5 md:w-5 text-white/50 group-hover:text-white/80 transition-colors" />
                        </button>
                        <div className="flex items-center gap-2">
                          {Array.from({ length: totalPages }).map((_, i) => (
                            <button
                              key={i}
                              onClick={() => setTemplatePage(i)}
                              className={`rounded-full transition-all duration-500 ease-out ${
                                i === templatePage
                                  ? "bg-gradient-to-r from-[#FF5800] to-amber-500 w-8 h-2 shadow-lg shadow-[#FF5800]/30"
                                  : "bg-white/20 hover:bg-white/40 w-2 h-2"
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
                          className="group p-2.5 md:p-3 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-black/20"
                        >
                          <ChevronRight className="h-4 w-4 md:h-5 md:w-5 text-white/50 group-hover:text-white/80 transition-colors" />
                        </button>
                      </div>
                    </div>

                    {/* Template cards - Premium glass cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
                      {visibleTemplates.map((template, idx) => {
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
                            className={`group relative p-4 md:p-6 rounded-2xl md:rounded-3xl text-left transition-all duration-500 border touch-manipulation animate-stagger-fade ${
                              isSelected
                                ? "bg-gradient-to-br from-white/[0.08] to-white/[0.02] border-white/20 scale-[1.02] shadow-2xl"
                                : isDisabled
                                  ? "bg-white/[0.01] border-white/[0.04] opacity-50 cursor-not-allowed"
                                  : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/15 hover:shadow-xl hover:shadow-black/30 active:scale-[0.98]"
                            }`}
                            style={{ animationDelay: `${idx * 0.08}s` }}
                          >
                            {/* Premium glow effect on selected */}
                            {isSelected && (
                              <>
                                <div
                                  className="absolute inset-0 rounded-2xl md:rounded-3xl blur-2xl opacity-25 -z-10 animate-glow-pulse"
                                  style={{ backgroundColor: template.color }}
                                />
                                <div
                                  className="absolute inset-[1px] rounded-2xl md:rounded-3xl opacity-10 -z-10"
                                  style={{
                                    background: `linear-gradient(135deg, ${template.color}40 0%, transparent 50%, ${template.color}20 100%)`,
                                  }}
                                />
                              </>
                            )}

                            {/* Coming soon badge - Premium */}
                            {isDisabled && (
                              <div className="absolute top-3 right-3 md:top-4 md:right-4 px-2.5 py-1 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-full backdrop-blur-sm">
                                <span className="text-[9px] md:text-[10px] font-semibold text-amber-400 tracking-wide uppercase">
                                  Soon
                                </span>
                              </div>
                            )}

                            {/* Selection indicator - Premium checkbox */}
                            {!isDisabled && (
                              <div
                                className={`absolute top-3 right-3 md:top-4 md:right-4 w-5 h-5 md:w-6 md:h-6 rounded-lg transition-all duration-300 flex items-center justify-center ${
                                  isSelected
                                    ? "bg-gradient-to-br from-[#FF5800] to-amber-500 shadow-lg shadow-[#FF5800]/30"
                                    : "border-2 border-white/15 group-hover:border-white/30 bg-white/[0.02]"
                                }`}
                              >
                                {isSelected && (
                                  <Check
                                    className="h-3 w-3 md:h-3.5 md:w-3.5 text-white"
                                    strokeWidth={3}
                                  />
                                )}
                              </div>
                            )}

                            {/* Icon - Premium with glow */}
                            <div className="relative mb-3 md:mb-4">
                              <div
                                className={`inline-flex p-2.5 md:p-3.5 rounded-xl md:rounded-2xl transition-all duration-500 ${
                                  isSelected
                                    ? "scale-110"
                                    : "group-hover:scale-105 group-hover:rotate-2"
                                }`}
                                style={{
                                  backgroundColor: `${template.color}15`,
                                  boxShadow: isSelected
                                    ? `0 0 30px ${template.color}40, inset 0 0 20px ${template.color}10`
                                    : `inset 0 0 20px ${template.color}05`,
                                }}
                              >
                                <Icon
                                  className="h-5 w-5 md:h-7 md:w-7 transition-all duration-300"
                                  style={{ color: template.color }}
                                />
                              </div>
                              {isSelected && (
                                <div
                                  className="absolute inset-0 rounded-xl md:rounded-2xl blur-xl opacity-40"
                                  style={{ backgroundColor: template.color }}
                                />
                              )}
                            </div>

                            {/* Content */}
                            <h3
                              className="text-sm md:text-lg font-bold text-white mb-1 md:mb-1.5 pr-8 tracking-tight"
                              style={{ fontFamily: "var(--font-sf-pro)" }}
                            >
                              {template.label}
                            </h3>
                            <p className="text-xs md:text-sm text-white/45 mb-3 md:mb-4 line-clamp-2 leading-relaxed">
                              {template.description}
                            </p>

                            {/* Features - Premium pills */}
                            <div className="hidden md:flex flex-wrap gap-2">
                              {template.features.map((feature) => (
                                <span
                                  key={feature}
                                  className="px-2.5 py-1 text-[10px] font-medium bg-white/[0.04] border border-white/[0.08] rounded-lg text-white/50 transition-colors group-hover:text-white/70 group-hover:border-white/15"
                                >
                                  {feature}
                                </span>
                              ))}
                            </div>

                            {/* Tech stack on hover/selected - Premium reveal */}
                            <div
                              className={`hidden md:block mt-4 pt-4 border-t border-white/[0.06] transition-all duration-500 ${
                                isSelected
                                  ? "opacity-100 translate-y-0"
                                  : "opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                {template.techStack.map((tech, i) => (
                                  <span
                                    key={tech}
                                    className="text-[10px] text-white/35 font-medium"
                                  >
                                    {tech}
                                    {i < template.techStack.length - 1 && (
                                      <span className="ml-3 text-white/15">
                                        •
                                      </span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Continue button row - Premium */}
                    <div className="flex flex-col-reverse md:flex-row items-stretch md:items-center justify-between gap-4 pt-4 animate-stagger-fade stagger-5">
                      <div className="text-center md:text-left">
                        {selectedTemplate ? (
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                            <selectedTemplate.icon
                              className="h-3.5 w-3.5"
                              style={{ color: selectedTemplate.color }}
                            />
                            <span className="text-xs text-white/50">
                              Selected:
                            </span>
                            <span className="text-xs text-white/80 font-medium">
                              {selectedTemplate.label}
                            </span>
                          </div>
                        ) : (
                          <p className="text-sm text-white/35">
                            Select a template to continue
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => setSetupStep(2)}
                        disabled={
                          !templateType ||
                          TEMPLATE_OPTIONS.find((t) => t.value === templateType)
                            ?.comingSoon
                        }
                        className="btn-premium group relative flex items-center justify-center gap-2.5 px-8 md:px-10 py-3 md:py-3.5 bg-gradient-to-r from-[#FF5800] to-amber-500 rounded-xl text-white text-sm md:text-base font-semibold disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none touch-manipulation"
                        style={{ fontFamily: "var(--font-sf-pro)" }}
                      >
                        <span className="relative z-10 flex items-center gap-2">
                          Continue
                          <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
                        </span>
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#FF5800] via-amber-500 to-[#FF5800] opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl -z-10" />
                      </button>
                    </div>
                  </div>
                );
              })()}
          </div>

          {/* STEP 2: App Details - Premium */}
          <div
            className={`transition-all duration-500 ${setupStep === 2 ? "opacity-100" : "opacity-0 absolute pointer-events-none"}`}
          >
            {setupStep === 2 && (
              <div className="max-w-2xl mx-auto space-y-4 md:space-y-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 md:gap-0 animate-stagger-fade stagger-1">
                  <div>
                    <h2
                      className="text-2xl md:text-3xl font-bold text-white tracking-tight"
                      style={{ fontFamily: "var(--font-sf-pro)" }}
                    >
                      Name your creation
                    </h2>
                    <p className="text-white/40 text-sm md:text-base mt-1">
                      Give it a memorable identity
                    </p>
                  </div>
                  {/* Selected template preview - Premium pill */}
                  {selectedTemplate && (
                    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm w-fit">
                      <div
                        className="p-1.5 rounded-lg"
                        style={{
                          backgroundColor: `${selectedTemplate.color}20`,
                        }}
                      >
                        <selectedTemplate.icon
                          className="h-3.5 w-3.5"
                          style={{ color: selectedTemplate.color }}
                        />
                      </div>
                      <span className="text-xs text-white/60 font-medium">
                        {selectedTemplate.label}
                      </span>
                      <button
                        onClick={() => setSetupStep(1)}
                        className="text-[10px] text-[#FF5800]/70 hover:text-[#FF5800] transition-colors font-medium"
                      >
                        Change
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-4 md:space-y-5 p-4 md:p-6 rounded-2xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/[0.06] backdrop-blur-sm animate-stagger-fade stagger-2">
                  {/* App Name - Premium input with validation */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-white/60 text-xs font-medium tracking-wide uppercase">
                        App Name <span className="text-red-400">*</span>
                      </Label>
                      <div className="flex items-center gap-2">
                        {nameValidation.isChecking && (
                          <Loader2 className="h-3 w-3 animate-spin text-white/40" />
                        )}
                        {!nameValidation.isChecking &&
                          nameValidation.isAvailable === true &&
                          appName.trim().length >= 2 && (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                              <Check className="h-3 w-3" />
                              Available
                            </span>
                          )}
                        {!nameValidation.isChecking &&
                          nameValidation.isAvailable === false && (
                            <span className="flex items-center gap-1 text-[10px] text-red-400">
                              <AlertCircle className="h-3 w-3" />
                              Taken
                            </span>
                          )}
                        <span
                          className={`text-[10px] font-mono transition-colors ${
                            appName.length > 100
                              ? "text-red-400"
                              : appName.length > 80
                                ? "text-amber-400"
                                : "text-white/25"
                          }`}
                        >
                          {appName.length}/100
                        </span>
                      </div>
                    </div>
                    <Input
                      value={appName}
                      onChange={(e) => setAppName(e.target.value)}
                      placeholder="My Awesome App"
                      className={`h-12 bg-black/30 text-white text-base placeholder:text-white/20 rounded-xl transition-all duration-300 ${
                        nameValidation.error
                          ? "border-red-500/50 focus:border-red-500/70 focus:ring-2 focus:ring-red-500/10"
                          : nameValidation.isAvailable === true &&
                              appName.trim().length >= 2
                            ? "border-emerald-500/30 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10"
                            : "border-white/[0.08] focus:border-[#FF5800]/50 focus:ring-2 focus:ring-[#FF5800]/10"
                      }`}
                      maxLength={100}
                      style={{ fontFamily: "var(--font-sf-pro)" }}
                    />
                    {nameValidation.error && (
                      <p className="text-xs text-red-400 flex items-center gap-1.5 animate-scale-fade">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {nameValidation.error}
                        {nameValidation.suggestedName && (
                          <button
                            type="button"
                            onClick={() =>
                              setAppName(nameValidation.suggestedName!)
                            }
                            className="ml-1 text-[#FF5800] hover:underline"
                          >
                            Try &quot;{nameValidation.suggestedName}&quot;
                          </button>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Description - Premium textarea with validation */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-white/60 text-xs font-medium tracking-wide uppercase">
                        Description <span className="text-red-400">*</span>
                      </Label>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={generateAIDescription}
                          disabled={isGeneratingDescription || !appName.trim()}
                          className="group flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold bg-gradient-to-r from-[#FF5800]/15 to-amber-500/10 border border-[#FF5800]/25 rounded-lg text-[#FF5800] hover:text-amber-400 transition-all hover:scale-105 hover:border-[#FF5800]/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                        >
                          {isGeneratingDescription ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Wand2 className="h-3 w-3 group-hover:rotate-12 transition-transform" />
                          )}
                          <span className="tracking-wide">AI ASSIST</span>
                        </button>
                        <span
                          className={`text-[10px] font-mono transition-colors ${
                            appDescription.length <
                                  MIN_DESCRIPTION_LENGTH &&
                                appDescription.length > 0
                              ? "text-amber-400"
                              : "text-white/25"
                          }`}
                        >
                          {appDescription.length} chars
                        </span>
                      </div>
                    </div>
                    <Textarea
                      value={appDescription}
                      onChange={(e) => setAppDescription(e.target.value)}
                      placeholder="Describe what your app should do... (minimum 10 characters)"
                      className={`min-h-[120px] bg-black/30 text-white text-sm placeholder:text-white/20 rounded-xl resize-none transition-all duration-300 leading-relaxed ${
                        appDescription.length > 0 &&
                            appDescription.length < MIN_DESCRIPTION_LENGTH
                          ? "border-amber-500/30 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/10"
                          : appDescription.length >= MIN_DESCRIPTION_LENGTH
                            ? "border-emerald-500/30 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/10"
                            : "border-white/[0.08] focus:border-[#FF5800]/50 focus:ring-2 focus:ring-[#FF5800]/10"
                      }`}
                    />
                    {appDescription.length > 0 &&
                      appDescription.length < MIN_DESCRIPTION_LENGTH && (
                        <p className="text-xs text-amber-400 flex items-center gap-1.5 animate-scale-fade">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Description must be at least {
                            MIN_DESCRIPTION_LENGTH
                          }{" "}
                          characters (
                          {MIN_DESCRIPTION_LENGTH - appDescription.length} more
                          needed)
                        </p>
                      )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 md:pt-4 animate-stagger-fade stagger-3">
                  <button
                    onClick={() => setSetupStep(1)}
                    className="group flex items-center gap-2 px-3 md:px-4 py-2 text-xs md:text-sm text-white/50 hover:text-white transition-colors rounded-lg hover:bg-white/[0.03]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
                    Back
                  </button>
                  <button
                    onClick={() => setSetupStep(3)}
                    disabled={
                      !appName.trim() ||
                      appName.trim().length < 2 ||
                      appName.length > 100 ||
                      nameValidation.isChecking ||
                      nameValidation.isAvailable === false ||
                      appDescription.length < MIN_DESCRIPTION_LENGTH
                    }
                    className="btn-premium group relative flex items-center gap-2.5 px-6 md:px-8 py-2.5 md:py-3 bg-gradient-to-r from-[#FF5800] to-amber-500 rounded-xl text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none touch-manipulation"
                    style={{ fontFamily: "var(--font-sf-pro)" }}
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      {nameValidation.isChecking ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        <>
                          Continue
                          <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
                        </>
                      )}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* STEP 3: Features - Premium */}
          <div
            className={`transition-all duration-500 ${setupStep === 3 ? "opacity-100" : "opacity-0 absolute pointer-events-none"}`}
          >
            {setupStep === 3 && (
              <div className="max-w-2xl mx-auto space-y-4 md:space-y-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 md:gap-0 animate-stagger-fade stagger-1">
                  <div>
                    <h2
                      className="text-2xl md:text-3xl font-bold text-white tracking-tight"
                      style={{ fontFamily: "var(--font-sf-pro)" }}
                    >
                      Power-ups
                    </h2>
                    <p className="text-white/40 text-sm md:text-base mt-1">
                      Supercharge with built-in integrations
                    </p>
                  </div>
                  {/* App summary - Premium */}
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm w-fit">
                    {selectedTemplate && (
                      <div
                        className="p-1.5 rounded-lg"
                        style={{
                          backgroundColor: `${selectedTemplate.color}20`,
                        }}
                      >
                        <selectedTemplate.icon
                          className="h-3.5 w-3.5"
                          style={{ color: selectedTemplate.color }}
                        />
                      </div>
                    )}
                    <span className="text-xs text-white/60 font-medium truncate max-w-[150px]">
                      {appName || "Your App"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:gap-4">
                  {/* Monetization - Premium toggle card */}
                  <button
                    onClick={() => setIncludeMonetization(!includeMonetization)}
                    className={`group relative p-4 md:p-5 rounded-2xl text-left transition-all duration-500 border touch-manipulation animate-stagger-fade stagger-2 ${
                      includeMonetization
                        ? "bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 border-emerald-500/30 shadow-lg shadow-emerald-500/10"
                        : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/15"
                    }`}
                  >
                    {includeMonetization && (
                      <div className="absolute inset-0 rounded-2xl bg-emerald-500/5 blur-xl -z-10" />
                    )}
                    <div className="flex items-center justify-between mb-3">
                      <div
                        className={`p-2.5 rounded-xl transition-all duration-300 ${
                          includeMonetization
                            ? "bg-emerald-500/20 shadow-lg shadow-emerald-500/20"
                            : "bg-white/[0.04]"
                        }`}
                      >
                        <DollarSign
                          className={`h-5 w-5 transition-colors ${
                            includeMonetization
                              ? "text-emerald-400"
                              : "text-white/40"
                          }`}
                        />
                      </div>
                      {/* Premium toggle switch */}
                      <div
                        className={`w-10 h-6 rounded-full transition-all duration-300 flex items-center p-1 ${
                          includeMonetization
                            ? "bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-lg shadow-emerald-500/30"
                            : "bg-white/10"
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${
                            includeMonetization
                              ? "translate-x-4"
                              : "translate-x-0"
                          }`}
                        />
                      </div>
                    </div>
                    <h3
                      className="text-sm md:text-base font-semibold text-white"
                      style={{ fontFamily: "var(--font-sf-pro)" }}
                    >
                      Monetization
                    </h3>
                    <p className="text-xs text-white/45 mt-1 leading-relaxed">
                      Accept payments & subscriptions
                    </p>
                    <div className="hidden md:flex gap-1.5 mt-3">
                      <span className="px-2 py-1 text-[10px] font-medium bg-white/[0.04] border border-white/[0.08] rounded-lg text-white/40">
                        Stripe
                      </span>
                      <span className="px-2 py-1 text-[10px] font-medium bg-white/[0.04] border border-white/[0.08] rounded-lg text-white/40">
                        Billing
                      </span>
                    </div>
                  </button>

                  {/* Analytics - Premium toggle card */}
                  <button
                    onClick={() => setIncludeAnalytics(!includeAnalytics)}
                    className={`group relative p-4 md:p-5 rounded-2xl text-left transition-all duration-500 border touch-manipulation animate-stagger-fade stagger-3 ${
                      includeAnalytics
                        ? "bg-gradient-to-br from-blue-500/15 to-blue-500/5 border-blue-500/30 shadow-lg shadow-blue-500/10"
                        : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/15"
                    }`}
                  >
                    {includeAnalytics && (
                      <div className="absolute inset-0 rounded-2xl bg-blue-500/5 blur-xl -z-10" />
                    )}
                    <div className="flex items-center justify-between mb-3">
                      <div
                        className={`p-2.5 rounded-xl transition-all duration-300 ${
                          includeAnalytics
                            ? "bg-blue-500/20 shadow-lg shadow-blue-500/20"
                            : "bg-white/[0.04]"
                        }`}
                      >
                        <LineChart
                          className={`h-5 w-5 transition-colors ${
                            includeAnalytics ? "text-blue-400" : "text-white/40"
                          }`}
                        />
                      </div>
                      {/* Premium toggle switch */}
                      <div
                        className={`w-10 h-6 rounded-full transition-all duration-300 flex items-center p-1 ${
                          includeAnalytics
                            ? "bg-gradient-to-r from-blue-500 to-blue-400 shadow-lg shadow-blue-500/30"
                            : "bg-white/10"
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${
                            includeAnalytics ? "translate-x-4" : "translate-x-0"
                          }`}
                        />
                      </div>
                    </div>
                    <h3
                      className="text-sm md:text-base font-semibold text-white"
                      style={{ fontFamily: "var(--font-sf-pro)" }}
                    >
                      Analytics
                    </h3>
                    <p className="text-xs text-white/45 mt-1 leading-relaxed">
                      Track users & events in real-time
                    </p>
                    <div className="hidden md:flex gap-1.5 mt-3">
                      <span className="px-2 py-1 text-[10px] font-medium bg-white/[0.04] border border-white/[0.08] rounded-lg text-white/40">
                        Real-time
                      </span>
                      <span className="px-2 py-1 text-[10px] font-medium bg-white/[0.04] border border-white/[0.08] rounded-lg text-white/40">
                        Events
                      </span>
                    </div>
                  </button>
                </div>

                <div className="flex items-center justify-between pt-3 md:pt-4 animate-stagger-fade stagger-4">
                  <button
                    onClick={() => setSetupStep(2)}
                    className="group flex items-center gap-2 px-3 md:px-4 py-2 text-xs md:text-sm text-white/50 hover:text-white transition-colors rounded-lg hover:bg-white/[0.03]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
                    Back
                  </button>
                  <button
                    onClick={() => setSetupStep(4)}
                    className="btn-premium group relative flex items-center gap-2.5 px-6 md:px-8 py-2.5 md:py-3 bg-gradient-to-r from-[#FF5800] to-amber-500 rounded-xl text-white text-sm font-semibold touch-manipulation"
                    style={{ fontFamily: "var(--font-sf-pro)" }}
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      Continue
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* STEP 4: Agent Selection - Premium */}
          <div
            className={`transition-all duration-500 ${setupStep === 4 ? "opacity-100" : "opacity-0 absolute pointer-events-none"}`}
          >
            {setupStep === 4 && (
              <div className="max-w-2xl mx-auto space-y-4 md:space-y-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-3 md:gap-0 animate-stagger-fade stagger-1">
                  <div>
                    <h2
                      className="text-2xl md:text-3xl font-bold text-white tracking-tight"
                      style={{ fontFamily: "var(--font-sf-pro)" }}
                    >
                      Add AI Agents
                    </h2>
                    <p className="text-white/40 text-sm md:text-base mt-1">
                      Choose agents to power your app (optional)
                    </p>
                  </div>
                  {/* App summary - Premium */}
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm w-fit">
                    {selectedTemplate && (
                      <div
                        className="p-1.5 rounded-lg"
                        style={{
                          backgroundColor: `${selectedTemplate.color}20`,
                        }}
                      >
                        <selectedTemplate.icon
                          className="h-3.5 w-3.5"
                          style={{ color: selectedTemplate.color }}
                        />
                      </div>
                    )}
                    <span className="text-xs text-white/60 font-medium truncate max-w-[150px]">
                      {appName || "Your App"}
                    </span>
                  </div>
                </div>

                {/* Agent Picker - Premium container */}
                <div className="p-5 md:p-6 rounded-2xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/[0.06] backdrop-blur-sm animate-stagger-fade stagger-2">
                  <AgentPicker
                    agents={availableAgents}
                    selectedIds={selectedAgentIds}
                    onSelectionChange={setSelectedAgentIds}
                    maxSelection={4}
                    loading={loadingAgents}
                  />
                </div>

                {/* Skip note - Premium */}
                {availableAgents.length === 0 && !loadingAgents && (
                  <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 to-amber-500/5 border border-amber-500/20 animate-stagger-fade stagger-3">
                    <p className="text-sm text-amber-300/80 leading-relaxed">
                      <span className="font-semibold">No agents yet?</span> No
                      worries — you can skip this step and add agents later from
                      the app builder.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 md:pt-4 animate-stagger-fade stagger-4">
                  <button
                    onClick={() => setSetupStep(3)}
                    className="group flex items-center gap-2 px-3 md:px-4 py-2 text-xs md:text-sm text-white/50 hover:text-white transition-colors rounded-lg hover:bg-white/[0.03]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
                    Back
                  </button>
                  <div className="flex items-center gap-3">
                    {selectedAgentIds.length === 0 &&
                      availableAgents.length > 0 && (
                        <button
                          onClick={startSession}
                          disabled={isLoading}
                          className="text-xs text-white/40 hover:text-white/70 transition-colors font-medium"
                        >
                          Skip for now
                        </button>
                      )}
                    {/* Premium Launch Button */}
                    <button
                      onClick={startSession}
                      disabled={isLoading}
                      className="group relative flex items-center gap-2.5 px-6 md:px-8 py-3 md:py-3.5 rounded-xl text-white text-sm font-semibold transition-all duration-500 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 overflow-hidden touch-manipulation"
                      style={{ fontFamily: "var(--font-sf-pro)" }}
                    >
                      {/* Animated gradient background */}
                      <div className="absolute inset-0 bg-gradient-to-r from-[#FF5800] via-amber-500 to-[#FF5800] bg-[length:200%_100%] animate-[shimmer_3s_linear_infinite]" />
                      {/* Inner border glow */}
                      <div className="absolute inset-[1px] rounded-[10px] bg-gradient-to-b from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      {/* Outer glow effect */}
                      <div className="absolute inset-0 bg-gradient-to-r from-[#FF5800] to-amber-500 blur-xl opacity-50 group-hover:opacity-70 transition-opacity -z-10" />
                      <span className="relative flex items-center gap-2.5">
                        {isLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="hidden sm:inline tracking-wide">
                              Launching Sandbox...
                            </span>
                            <span className="sm:hidden">...</span>
                          </>
                        ) : (
                          <>
                            <Rocket className="h-4 w-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300" />
                            <span className="hidden sm:inline tracking-wide">
                              {selectedAgentIds.length > 0
                                ? `Launch with ${selectedAgentIds.length} Agent${selectedAgentIds.length > 1 ? "s" : ""}`
                                : "Start Building"}
                            </span>
                            <span className="sm:hidden">Start</span>
                          </>
                        )}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Summary footer - Premium */}
                <div className="flex items-center justify-center gap-4 pt-4 md:pt-6 animate-stagger-fade stagger-5">
                  {[
                    "Live sandbox",
                    "Hot reload",
                    "AI assist",
                    "GitHub sync",
                  ].map((feature, i) => (
                    <div key={feature} className="flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-[#FF5800]/50" />
                      <span className="text-[10px] md:text-xs text-white/25 font-medium">
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>
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

  // Show unified loader for starting sandbox
  if (viewState === "starting") {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#0A0A0A] flex items-center justify-center py-12 animate-in fade-in duration-200">
        <SessionLoader
          mode="starting"
          progressStep={progressStep}
          appName={appData?.name || appName}
          backLink={backLink}
        />
      </div>
    );
  }

  // Error state
  if (viewState === "error") {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-[#0A0A0A] flex items-center justify-center py-12 animate-in fade-in duration-200">
        <SessionLoader
          mode="error"
          errorMessage={errorMessage}
          backLink={backLink}
          onRetry={startSession}
          onBack={() => router.push("/dashboard/apps")}
        />
      </div>
    );
  }

  return (
    <div className="fixed top-16 left-0 md:left-64 right-0 bottom-0 flex flex-col overflow-hidden bg-[#050507] z-10 animate-in fade-in duration-300">
      {/* MOBILE/TABLET TOOLBAR - visible up to xl (1280px) to include iPad Pro */}
      <div className="flex-shrink-0 flex xl:hidden items-center justify-between px-3 py-2.5 border-b border-white/[0.06] bg-black/60 backdrop-blur-xl">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Link
            href={backLink}
            className="p-1.5 hover:bg-white/10 rounded-md transition-colors flex-shrink-0"
          >
            <ArrowLeft className="h-4 w-4 text-white/60" />
          </Link>
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-6 h-6 flex items-center justify-center bg-gradient-to-br from-[#FF5800] to-amber-600 rounded flex-shrink-0">
              <span
                className="text-white font-bold text-[10px]"
                style={{ fontFamily: "var(--font-sf-pro)" }}
              >
                {(appData?.name || appName || "A").charAt(0).toUpperCase()}
              </span>
            </div>
            <span
              className="text-xs text-white font-medium truncate"
              style={{ fontFamily: "var(--font-sf-pro)" }}
            >
              {appData?.name || appName}
            </span>
          </div>
        </div>

        {/* Mobile Panel Toggle - Premium */}
        <div className="flex items-center gap-1.5 mx-2 p-1 bg-white/[0.02] rounded-xl border border-white/[0.04]">
          <button
            onClick={() => setMobilePanel("chat")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-300 ${
              mobilePanel === "chat"
                ? "bg-gradient-to-r from-[#FF5800]/20 to-amber-500/10 text-white border border-[#FF5800]/25"
                : "text-white/45 hover:text-white/70"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Chat
          </button>
          <button
            onClick={() => setMobilePanel("preview")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-300 ${
              mobilePanel === "preview"
                ? "bg-gradient-to-r from-[#FF5800]/20 to-amber-500/10 text-white border border-[#FF5800]/25"
                : "text-white/45 hover:text-white/70"
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
                    {isDeploying ? (deployPhase === "saving" ? "Saving to GitHub..." : "Deploying...") : "Deploy"}
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
      <div className="flex-shrink-0 hidden xl:flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] bg-black/60 backdrop-blur-xl">
        <div className="flex items-center gap-5">
          <Link
            href={backLink}
            className="group p-2.5 hover:bg-white/[0.06] rounded-xl transition-all duration-300 border border-transparent hover:border-white/10"
          >
            <ArrowLeft className="h-4 w-4 text-white/50 group-hover:text-white/80 transition-colors" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-[#FF5800] blur-md opacity-40" />
              <div className="relative w-8 h-8 flex items-center justify-center bg-gradient-to-br from-[#FF5800] to-amber-600 rounded-md border border-[#FF5800]/50 shadow-lg shadow-[#FF5800]/20">
                <span
                  className="text-white font-bold text-sm"
                  style={{ fontFamily: "var(--font-sf-pro)" }}
                >
                  {(appData?.name || appName || "A").charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
            <span
              className="text-sm text-white font-semibold tracking-tight"
              style={{ fontFamily: "var(--font-sf-pro)" }}
            >
              {appData?.name || appName}
            </span>
            {isEditMode && (
              <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest bg-white/10 text-white/70 rounded border border-white/10">
                Editor
              </span>
            )}
          </div>
          {sourceContext && (
            <div
              className="px-2 py-1 text-xs border rounded"
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
          {/* Deploy Button - Simple, clean */}
          {(status === "ready" || status === "recovering") && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={deployToProduction}
                disabled={isDeploying || status === "recovering"}
                className="h-7 text-xs bg-[#FF5800]/10 text-[#FF5800] hover:bg-[#FF5800]/20 border border-[#FF5800]/20"
              >
                {isDeploying ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Rocket className="h-3 w-3" />
                )}
                <span className="ml-1.5">
                  {isDeploying ? (deployPhase === "saving" ? "Saving to GitHub..." : "Deploying...") : "Deploy"}
                </span>
              </Button>
              {productionUrl && (
                <a
                  href={productionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-7 px-2.5 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-md flex items-center gap-1.5 border border-emerald-500/20"
                  title={`View live at ${productionUrl}`}
                >
                  <Globe className="h-3 w-3" />
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

      {/* Auto-recovery indicator - Premium banner */}
      {status === "recovering" && !isRestoring && (
        <div className="absolute top-[49px] xl:top-[57px] left-0 right-0 z-20 bg-gradient-to-r from-[#FF5800]/20 via-amber-500/15 to-[#FF5800]/20 border-b border-[#FF5800]/30 backdrop-blur-sm">
          <div className="flex items-center justify-center gap-3 xl:gap-4 px-4 xl:px-5 py-2 xl:py-2.5">
            <div className="relative">
              <Loader2 className="h-4 w-4 xl:h-4.5 xl:w-4.5 animate-spin text-[#FF5800] flex-shrink-0" />
              <div className="absolute inset-0 bg-[#FF5800] rounded-full blur-md opacity-40" />
            </div>
            <span
              className="text-xs xl:text-sm text-white/90 font-medium"
              style={{ fontFamily: "var(--font-sf-pro)" }}
            >
              Reconnecting to sandbox...
            </span>
            <span className="text-[10px] xl:text-xs text-white/40 hidden sm:inline">
              This happens automatically
            </span>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* CHAT PANEL - visible on desktop (w-1/2), toggled on mobile/tablet */}
        <div
          className={`flex flex-col border-r border-white/[0.04] bg-gradient-to-b from-[#0a0a0b] to-[#080809] transition-all overflow-hidden ${
            isFullscreen
              ? "w-0 hidden"
              : mobilePanel === "chat"
                ? "w-full xl:w-1/2"
                : "hidden xl:flex xl:w-1/2"
          }`}
        >
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto pt-4 xl:pt-6 px-4 xl:px-6 pb-6 xl:pb-8 space-y-4 xl:space-y-5 scrollbar-thin scrollbar-thumb-white/15 scrollbar-track-transparent hover:scrollbar-thumb-white/25"
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
            {/* Scroll anchor with extra space for file chips visibility */}
            <div ref={messagesEndRef} className="h-4" />
          </div>

          {/* Isolated ChatInput component - uses Zustand for zero re-renders on typing */}
          <ChatInput onSendPrompt={sendPrompt} onStopGeneration={stopGeneration} status={status} />
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
                  <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[10px] min-w-[18px] text-center tabular-nums">
                    {commitHistory.length > 99 ? "99+" : commitHistory.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setPreviewTab("agents")}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  previewTab === "agents"
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Agents
                {selectedAgentIds.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-violet-500/20 text-violet-400 rounded-full text-[10px] min-w-[18px] text-center">
                    {selectedAgentIds.length}
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
                      setIframeLoaded(false);
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

          {/* Desktop Preview Tabs - Clean & Minimal */}
          <div className="flex-shrink-0 hidden xl:flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] bg-black/30">
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setPreviewTab("preview")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  previewTab === "preview"
                    ? "text-white bg-white/10 border-b-2 border-[#FF5800]"
                    : "text-white/50 hover:text-white/70 hover:bg-white/[0.03]"
                }`}
              >
                <Monitor className="h-3.5 w-3.5" />
                Preview
              </button>
              <button
                onClick={() => setPreviewTab("console")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  previewTab === "console"
                    ? "text-white bg-white/10 border-b-2 border-[#FF5800]"
                    : "text-white/50 hover:text-white/70 hover:bg-white/[0.03]"
                }`}
              >
                <Terminal className="h-3.5 w-3.5" />
                Console
                {consoleLogs.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] font-semibold tabular-nums rounded">
                    {consoleLogs.length > 99 ? "99+" : consoleLogs.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setPreviewTab("files")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  previewTab === "files"
                    ? "text-white bg-white/10 border-b-2 border-[#FF5800]"
                    : "text-white/50 hover:text-white/70 hover:bg-white/[0.03]"
                }`}
              >
                <FolderCode className="h-3.5 w-3.5" />
                Files
              </button>
              <button
                onClick={() => setPreviewTab("history")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  previewTab === "history"
                    ? "text-white bg-white/10 border-b-2 border-[#FF5800]"
                    : "text-white/50 hover:text-white/70 hover:bg-white/[0.03]"
                }`}
              >
                <History className="h-3.5 w-3.5" />
                History
                {commitHistory.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold tabular-nums rounded">
                    {commitHistory.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setPreviewTab("agents")}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  previewTab === "agents"
                    ? "text-white bg-white/10 border-b-2 border-[#FF5800]"
                    : "text-white/50 hover:text-white/70 hover:bg-white/[0.03]"
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Agents
                {selectedAgentIds.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-violet-500/20 text-violet-400 text-[10px] font-semibold tabular-nums rounded">
                    {selectedAgentIds.length}
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
                    setIframeLoaded(false);
                    iframeRef.current.src = session.sandboxUrl;
                  }
                }}
                title="Refresh preview"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          <div className="flex-1 bg-gradient-to-br from-white/[0.03] to-transparent overflow-hidden relative">
            {/* Preview iframe - always mounted when session exists to prevent reload flicker */}
            {session?.sandboxUrl && (
              <div
                className={`absolute inset-0 transition-opacity duration-300 ${
                  previewTab === "preview"
                    ? "opacity-100 z-10"
                    : "opacity-0 z-0 pointer-events-none"
                }`}
              >
                {/* Loading overlay - Premium */}
                <div
                  className={`absolute inset-0 bg-gradient-to-br from-[#0a0a0b] to-[#080809] flex items-center justify-center transition-opacity duration-500 ${
                    iframeLoaded && previewTab === "preview"
                      ? "opacity-0 pointer-events-none"
                      : "opacity-100"
                  }`}
                >
                  <div className="text-center">
                    <div className="relative inline-block mb-5">
                      <Loader2 className="h-10 w-10 animate-spin text-[#FF5800] mx-auto" />
                      <div className="absolute inset-0 bg-[#FF5800] rounded-full blur-xl opacity-30 animate-pulse" />
                    </div>
                    <p
                      className="text-white/60 text-sm font-medium"
                      style={{ fontFamily: "var(--font-sf-pro)" }}
                    >
                      Loading preview...
                    </p>
                    <p className="text-white/25 text-xs mt-1">
                      Your app is starting up
                    </p>
                  </div>
                </div>
                <iframe
                  ref={iframeRef}
                  src={session.sandboxUrl}
                  className="w-full h-full border-0"
                  title="App Preview"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  onError={handleIframeError}
                  onLoad={handleIframeLoad}
                />
              </div>
            )}

            {/* Preview loading state when no session - Premium */}
            {!session?.sandboxUrl && previewTab === "preview" && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-gradient-to-br from-[#0a0a0b] to-[#080809]">
                <div className="text-center">
                  <div className="relative inline-block mb-5">
                    <Loader2 className="h-10 w-10 animate-spin text-[#FF5800] mx-auto" />
                    <div className="absolute inset-0 bg-[#FF5800] rounded-full blur-xl opacity-30 animate-pulse" />
                  </div>
                  <p
                    className="text-white/60 text-sm font-medium"
                    style={{ fontFamily: "var(--font-sf-pro)" }}
                  >
                    Starting sandbox...
                  </p>
                  <p className="text-white/25 text-xs mt-1">
                    This usually takes 10-20 seconds
                  </p>
                </div>
              </div>
            )}

            {/* Files tab */}
            {previewTab === "files" &&
              (session?.id ? (
                <SandboxFileExplorer
                  sessionId={session.id}
                  className="h-full animate-in fade-in duration-200"
                />
              ) : (
                <div className="flex items-center justify-center h-full animate-in fade-in duration-200">
                  <div className="text-center text-white/30">
                    <FolderCode className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Session not ready</p>
                  </div>
                </div>
              ))}

            {/* History tab */}
            {previewTab === "history" &&
              (session?.id ? (
                <HistoryTab
                  sessionId={session.id}
                  className="h-full animate-in fade-in duration-200"
                  currentCommitSha={gitStatus?.currentCommitSha}
                  onRollbackComplete={() => {
                    // Refresh the iframe after rollback
                    if (iframeRef.current && session?.sandboxUrl) {
                      setIframeLoaded(false);
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
                <div className="flex items-center justify-center h-full animate-in fade-in duration-200">
                  <div className="text-center text-white/30">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Session not ready</p>
                  </div>
                </div>
              ))}

            {/* Agents tab */}
            {previewTab === "agents" && (
              <div className="h-full p-4 overflow-auto animate-in fade-in duration-200">
                <AgentPicker
                  agents={availableAgents}
                  selectedIds={selectedAgentIds}
                  onSelectionChange={async (ids) => {
                    setSelectedAgentIds(ids);
                    // Save to app if we have an app ID
                    if (appData?.id) {
                      try {
                        await fetchWithRetry(`/api/v1/apps/${appData.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ linked_character_ids: ids }),
                        });
                        toast.success(
                          ids.length > 0 ? "Agents updated" : "Agents removed",
                        );
                      } catch (error) {
                        console.error("Failed to update agents:", error);
                        toast.error("Failed to update agents");
                      }
                    }
                  }}
                  maxSelection={4}
                  loading={loadingAgents}
                />
              </div>
            )}

            {/* Console tab - Split screen: Logs (top) + Terminal (bottom) */}
            {previewTab === "console" && (
              <ResizablePanelGroup
                direction="vertical"
                className="h-full animate-in fade-in duration-200"
              >
                {/* Logs Panel - Top */}
                <ResizablePanel defaultSize={60} minSize={20}>
                  <div className="h-full flex flex-col">
                    {/* Logs Header */}
                    <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] bg-black/20">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-green-500/70 animate-pulse" />
                        <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">
                          Logs
                        </span>
                        {consoleLogs.length > 0 && (
                          <span className="text-[10px] text-white/30 tabular-nums">
                            ({consoleLogs.length})
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Logs Content */}
                    <div
                      ref={consoleLogsRef}
                      className="flex-1 bg-gradient-to-b from-[#0d0d0f] to-[#0a0a0b] overflow-y-auto overflow-x-hidden font-mono text-xs scrollbar-thin scrollbar-thumb-white/15 scrollbar-track-transparent hover:scrollbar-thumb-white/25"
                    >
                      {consoleLogs.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-white/25">
                          <div className="text-center">
                            <div className="relative inline-block mb-4">
                              <Terminal className="h-8 w-8 mx-auto opacity-40" />
                              <div className="absolute inset-0 bg-[#FF5800] blur-xl opacity-10" />
                            </div>
                            <p
                              className="text-xs font-medium"
                              style={{ fontFamily: "var(--font-sf-pro)" }}
                            >
                              No logs yet
                            </p>
                            <p className="text-[10px] text-white/15 mt-1">
                              Logs will appear here during builds
                            </p>
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
                                <span className="text-white/20 select-none w-5 text-right shrink-0 text-[10px]">
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
                  </div>
                </ResizablePanel>

                {/* Resizable Handle */}
                <ResizableHandle
                  withHandle
                  className="bg-white/[0.04] hover:bg-[#FF5800]/30 transition-colors data-[resize-handle-active]:bg-[#FF5800]/50"
                />

                {/* Terminal Panel - Bottom */}
                <ResizablePanel defaultSize={40} minSize={15}>
                  <div className="h-full flex flex-col">
                    {/* Terminal Header */}
                    <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] bg-black/30">
                      <div className="flex items-center gap-2">
                        <Terminal className="h-3 w-3 text-[#FF5800]" />
                        <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">
                          Terminal
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-white/20">
                          Type <code className="text-[#FF5800]/70">help</code> for commands
                        </span>
                      </div>
                    </div>
                    {/* Terminal Content */}
                    <div className="flex-1 min-h-0">
                      <WebTerminal
                        sessionId={session?.id}
                        sandboxUrl={session?.sandboxUrl}
                        disabled={!session}
                        className="h-full"
                      />
                    </div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
