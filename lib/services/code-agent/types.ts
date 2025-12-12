import type {
  CodeAgentSessionStatus,
  CodeAgentRuntimeType,
  CodeAgentLanguage,
  GitState,
  FileEntry,
  SessionCapabilities,
} from "@/db/schemas/code-agent-sessions";

export interface CreateSessionParams {
  organizationId: string;
  userId: string;
  name?: string;
  description?: string;
  runtimeType?: CodeAgentRuntimeType;
  templateUrl?: string;
  environmentVariables?: Record<string, string>;
  loadOrgSecrets?: boolean;
  capabilities?: Partial<SessionCapabilities>;
  expiresInSeconds?: number;
  webhookUrl?: string;
  webhookEvents?: string[];
}

export interface SessionInfo {
  id: string;
  organizationId: string;
  userId: string;
  name: string | null;
  status: CodeAgentSessionStatus;
  statusMessage: string | null;
  runtimeType: CodeAgentRuntimeType;
  runtimeUrl: string | null;
  workingDirectory: string;
  gitState: GitState | null;
  capabilities: SessionCapabilities;
  usage: SessionUsage;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date | null;
}

export interface SessionUsage {
  cpuSecondsUsed: number;
  memoryMbPeak: number;
  diskMbUsed: number;
  apiCallsCount: number;
  commandsExecuted: number;
  filesCreated: number;
  filesModified: number;
  estimatedCostCents: number;
}

export interface CommandOptions {
  workingDirectory?: string;
  timeout?: number;
  env?: Record<string, string>;
}

export interface CommandResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  filesAffected?: string[];
}

export interface ExecuteCodeParams {
  sessionId: string;
  language: CodeAgentLanguage;
  code: string;
  options?: CommandOptions;
}

export interface RunCommandParams {
  sessionId: string;
  command: string;
  args?: string[];
  options?: CommandOptions;
}

export interface ReadFileParams {
  sessionId: string;
  path: string;
}

export interface WriteFileParams {
  sessionId: string;
  path: string;
  content: string;
  createDirectories?: boolean;
}

export interface ListFilesParams {
  sessionId: string;
  path: string;
  recursive?: boolean;
  maxDepth?: number;
}

export interface DeleteFileParams {
  sessionId: string;
  path: string;
  recursive?: boolean;
}

export interface FileOperationResult {
  success: boolean;
  path: string;
  error?: string;
}

export interface ListFilesResult {
  success: boolean;
  path: string;
  entries: FileEntry[];
  error?: string;
}

export interface ReadFileResult {
  success: boolean;
  path: string;
  content: string;
  size: number;
  error?: string;
}

export interface GitCloneParams {
  sessionId: string;
  url: string;
  branch?: string;
  depth?: number;
  directory?: string;
}

export interface GitCommitParams {
  sessionId: string;
  message: string;
  author?: { name: string; email: string };
}

export interface GitPushParams {
  sessionId: string;
  remote?: string;
  branch?: string;
  force?: boolean;
}

export interface GitPullParams {
  sessionId: string;
  remote?: string;
  branch?: string;
}

export interface GitOperationResult {
  success: boolean;
  message: string;
  gitState?: GitState;
  error?: string;
}

export interface InstallPackagesParams {
  sessionId: string;
  packages: string[];
  manager?: "npm" | "pip" | "bun" | "cargo";
  dev?: boolean;
}

export interface PackageOperationResult {
  success: boolean;
  packages: string[];
  installedCount: number;
  output: string;
  error?: string;
}

export interface CreateSnapshotParams {
  sessionId: string;
  name?: string;
  description?: string;
}

export interface RestoreSnapshotParams {
  sessionId: string;
  snapshotId: string;
}

export interface SnapshotInfo {
  id: string;
  sessionId: string;
  name: string | null;
  description: string | null;
  snapshotType: "auto" | "manual" | "pre_restore";
  fileCount: number;
  totalSizeBytes: number;
  gitState: GitState | null;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface SnapshotResult {
  success: boolean;
  snapshot?: SnapshotInfo;
  error?: string;
}

export interface InterpreterParams {
  organizationId: string;
  userId: string;
  language: "python" | "javascript" | "typescript" | "shell";
  code: string;
  packages?: string[];
  timeout?: number;
}

export interface InterpreterResult {
  success: boolean;
  executionId: string;
  output: string;
  error?: string;
  exitCode: number;
  durationMs: number;
  memoryMbPeak?: number;
  costCents: number;
}

export interface CodeAgentRuntime {
  readonly type: CodeAgentRuntimeType;
  create(params: RuntimeCreateParams): Promise<RuntimeInstance>;
  connect(runtimeId: string): Promise<RuntimeInstance>;
  terminate(runtimeId: string): Promise<void>;
  isHealthy(runtimeId: string): Promise<boolean>;
  extendTimeout(runtimeId: string, durationMs: number): Promise<void>;
}

export interface RuntimeCreateParams {
  templateUrl?: string;
  timeout?: number;
  vcpus?: number;
  memoryMb?: number;
  ports?: number[];
  env?: Record<string, string>;
}

export interface RuntimeInstance {
  id: string;
  type: CodeAgentRuntimeType;
  url: string | null;
  status: "running" | "stopped" | "error";
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, content: string): Promise<void>;
  listFiles(path: string): Promise<FileEntry[]>;
  deleteFile(path: string): Promise<void>;
  runCommand(cmd: string, args?: string[], options?: { env?: Record<string, string>; cwd?: string; timeout?: number }): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  createArchive(paths: string[]): Promise<Buffer>;
  extractArchive(archive: Buffer, targetPath: string): Promise<void>;
  stop(): Promise<void>;
}

export type CodeAgentEvent =
  | { type: "session_created"; sessionId: string }
  | { type: "session_ready"; sessionId: string; url: string | null }
  | { type: "session_error"; sessionId: string; error: string }
  | { type: "session_terminated"; sessionId: string }
  | { type: "command_started"; sessionId: string; commandId: string }
  | { type: "command_output"; sessionId: string; commandId: string; output: string }
  | { type: "command_completed"; sessionId: string; commandId: string; result: CommandResult }
  | { type: "snapshot_created"; sessionId: string; snapshotId: string }
  | { type: "snapshot_restored"; sessionId: string; snapshotId: string };

export type CodeAgentEventHandler = (event: CodeAgentEvent) => void;

