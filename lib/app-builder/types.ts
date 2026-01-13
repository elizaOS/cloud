/**
 * App Builder Types
 *
 * Shared type definitions for the app builder feature.
 */

import type { LucideIcon } from "lucide-react";

export type TemplateType =
  | "chat"
  | "agent-dashboard"
  | "landing-page"
  | "blank"
  | "mcp-service"
  | "a2a-agent";

export type SessionStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "generating"
  | "error"
  | "stopped"
  | "timeout"
  | "not_configured"
  | "recovering";

export type ProgressStep =
  | "creating"
  | "installing"
  | "starting"
  | "restoring"
  | "ready"
  | "error";

export type SourceType = "agent" | "workflow" | "service" | "standalone";

export interface Message {
  role: "user" | "assistant";
  content: string;
  filesAffected?: string[];
  timestamp: string;
  _thinkingId?: number;
}

export interface SessionData {
  id: string;
  sandboxId: string;
  sandboxUrl: string;
  status: SessionStatus;
  examplePrompts: string[];
  expiresAt: string | null;
  appId?: string;
  githubRepo?: string | null;
}

export interface SourceContext {
  type: SourceType;
  id: string;
  name: string;
}

export interface AppData {
  id: string;
  name: string;
  description: string | null;
  monetization_enabled?: boolean;
  github_repo?: string | null;
  linked_agent_ids?: string[];
}

export interface GitStatusInfo {
  hasChanges: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  currentCommitSha: string | null;
  lastSavedCommitSha: string | null;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
}

export interface TemplateOption {
  value: TemplateType;
  label: string;
  description: string;
  longDescription: string;
  icon: LucideIcon;
  color: string;
  gradient: string;
  features: string[];
  techStack: string[];
  comingSoon?: boolean;
}

export interface SnapshotInfo {
  canRestore: boolean;
  githubRepo: string | null;
  lastBackup: string | null;
}

export interface AppSnapshotInfo {
  githubRepo: string;
  lastBackup: string | null;
}

export interface RestoreProgress {
  current: number;
  total: number;
  filePath: string;
}

export type PreviewTab = "preview" | "console" | "files" | "history" | "agents";

export interface SourceContextInfo {
  icon: LucideIcon;
  color: string;
  templateSuggestion: TemplateType;
}

/** Maximum number of console logs to retain */
export const MAX_CONSOLE_LOGS = 500;

/**
 * Available AI models for the App Builder.
 * These are accessible through the AI Gateway.
 */
export interface AppBuilderModel {
  id: string;
  name: string;
  description: string;
  provider: string;
}

/**
 * Default models available for App Builder.
 * Matches the models available in chat for consistency.
 */
export const APP_BUILDER_MODELS: AppBuilderModel[] = [
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    description: "Best for complex coding tasks with excellent reasoning",
    provider: "Anthropic",
  },
  {
    id: "openai/gpt-5.2",
    name: "GPT-5.2",
    description: "OpenAI's most capable multimodal model",
    provider: "OpenAI",
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    description: "Fast and capable for most coding tasks",
    provider: "Anthropic",
  },
  {
    id: "google/gemini-3-flash",
    name: "Gemini 3 Flash",
    description: "Google's fast multimodal model",
    provider: "Google",
  },
];

export const DEFAULT_APP_BUILDER_MODEL = "anthropic/claude-sonnet-4.5";
