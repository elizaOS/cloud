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
  linked_character_ids?: string[];
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

export type PreviewTab = "preview" | "console" | "files" | "history" | "characters";

export interface SourceContextInfo {
  icon: LucideIcon;
  color: string;
  templateSuggestion: TemplateType;
}

/** Maximum number of console logs to retain */
export const MAX_CONSOLE_LOGS = 500;
