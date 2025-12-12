/**
 * Code Agent Service
 *
 * Core service for managing code agent sessions with full lifecycle support.
 * Provides:
 * - Session creation, management, and termination
 * - File operations (read, write, list, delete)
 * - Command execution (shell, python, javascript)
 * - Git operations (clone, commit, push, pull)
 * - Package management
 * - State snapshots and restoration
 */

import { db } from "@/db";
import { eq, and, desc, lt } from "drizzle-orm";
import {
  codeAgentSessions,
  codeAgentSnapshots,
  codeAgentCommands,
  type CodeAgentSession,
  type NewCodeAgentSession,
  type CodeAgentSnapshot,
  type NewCodeAgentSnapshot,
  type CodeAgentCommand,
  type NewCodeAgentCommand,
  type CodeAgentSessionStatus,
  type GitState,
} from "@/db/schemas/code-agent-sessions";
import { secretsService } from "@/lib/services/secrets";
import { creditsService } from "@/lib/services/credits";
import { logger } from "@/lib/utils/logger";
import { put, del } from "@vercel/blob";
import { vercelSandboxRuntime } from "./runtimes/vercel-sandbox";
import type {
  CreateSessionParams,
  SessionInfo,
  CommandResult,
  ExecuteCodeParams,
  RunCommandParams,
  ReadFileParams,
  WriteFileParams,
  ListFilesParams,
  DeleteFileParams,
  FileOperationResult,
  ListFilesResult,
  ReadFileResult,
  GitCloneParams,
  GitCommitParams,
  GitPushParams,
  GitPullParams,
  GitOperationResult,
  InstallPackagesParams,
  PackageOperationResult,
  CreateSnapshotParams,
  RestoreSnapshotParams,
  SnapshotInfo,
  SnapshotResult,
  RuntimeInstance,
  CodeAgentRuntime,
  CodeAgentEvent,
  CodeAgentEventHandler,
  CommandOptions,
} from "./types";

// =============================================================================
// CONSTANTS
// =============================================================================

const COST_PER_CPU_SECOND_CENTS = 0.001; // $0.00001 per CPU second
const COST_PER_API_CALL_CENTS = 0.01; // $0.0001 per API call
const DEFAULT_SESSION_TIMEOUT_SECONDS = 30 * 60; // 30 minutes
const MAX_SNAPSHOT_SIZE_BYTES = 100 * 1024 * 1024; // 100MB

// =============================================================================
// RUNTIME REGISTRY
// =============================================================================

const runtimes: Record<string, CodeAgentRuntime> = {
  vercel: vercelSandboxRuntime,
};

function getRuntime(type: string): CodeAgentRuntime {
  const runtime = runtimes[type];
  if (!runtime) {
    throw new Error(`Unknown runtime type: ${type}`);
  }
  return runtime;
}

// =============================================================================
// CODE AGENT SERVICE
// =============================================================================

class CodeAgentService {
  private eventHandlers: CodeAgentEventHandler[] = [];
  private activeInstances: Map<string, RuntimeInstance> = new Map();

  // ===========================================================================
  // EVENT HANDLING
  // ===========================================================================

  onEvent(handler: CodeAgentEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index > -1) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  private emit(event: CodeAgentEvent): void {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }

  // ===========================================================================
  // SESSION LIFECYCLE
  // ===========================================================================

  async createSession(params: CreateSessionParams): Promise<SessionInfo> {
    const {
      organizationId,
      userId,
      name,
      description,
      runtimeType = "vercel",
      templateUrl,
      environmentVariables = {},
      loadOrgSecrets = true,
      capabilities,
      expiresInSeconds = DEFAULT_SESSION_TIMEOUT_SECONDS,
    } = params;

    logger.info("[CodeAgentService] Creating session", {
      organizationId,
      userId,
      runtimeType,
    });

    // Check credits
    const balance = await creditsService.getBalance(organizationId);
    if (balance.balance < 1) {
      throw new Error("Insufficient credits to create code agent session");
    }

    // Load organization secrets if requested
    let secrets: Record<string, string> = {};
    if (loadOrgSecrets && secretsService.isConfigured) {
      secrets = await secretsService.getDecrypted({ organizationId });
    }

    const mergedEnv = { ...secrets, ...environmentVariables };
    const secretNames = Object.keys(secrets);

    // Create session record
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    const [session] = await db
      .insert(codeAgentSessions)
      .values({
        organization_id: organizationId,
        user_id: userId,
        name: name || null,
        description: description || null,
        runtime_type: runtimeType,
        status: "creating",
        status_message: "Initializing runtime environment...",
        environment_variables: environmentVariables,
        secrets_loaded: secretNames,
        capabilities: {
          languages: ["javascript", "typescript", "python", "shell"],
          hasGit: true,
          hasDocker: false,
          maxCpuSeconds: 3600,
          maxMemoryMb: 2048,
          maxDiskMb: 10240,
          networkAccess: true,
          ...capabilities,
        },
        expires_at: expiresAt,
      } satisfies NewCodeAgentSession)
      .returning();

    this.emit({ type: "session_created", sessionId: session.id });

    // Create runtime instance
    const runtime = getRuntime(runtimeType);

    let instance: RuntimeInstance;
    try {
      instance = await runtime.create({
        templateUrl,
        timeout: expiresInSeconds * 1000,
        vcpus: 4,
        env: mergedEnv,
      });

      this.activeInstances.set(session.id, instance);

      // Update session with runtime info
      await db
        .update(codeAgentSessions)
        .set({
          runtime_id: instance.id,
          runtime_url: instance.url,
          status: "ready",
          status_message: "Session ready",
          updated_at: new Date(),
        })
        .where(eq(codeAgentSessions.id, session.id));

      this.emit({
        type: "session_ready",
        sessionId: session.id,
        url: instance.url,
      });

      logger.info("[CodeAgentService] Session created", {
        sessionId: session.id,
        runtimeId: instance.id,
        url: instance.url,
      });
    } catch (error) {
      // Update session with error
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      await db
        .update(codeAgentSessions)
        .set({
          status: "error",
          status_message: errorMessage,
          updated_at: new Date(),
        })
        .where(eq(codeAgentSessions.id, session.id));

      this.emit({ type: "session_error", sessionId: session.id, error: errorMessage });

      throw error;
    }

    return this.formatSessionInfo(
      (await db.query.codeAgentSessions.findFirst({
        where: eq(codeAgentSessions.id, session.id),
      }))!
    );
  }

  async getSession(sessionId: string, organizationId: string): Promise<SessionInfo | null> {
    const session = await db.query.codeAgentSessions.findFirst({
      where: and(
        eq(codeAgentSessions.id, sessionId),
        eq(codeAgentSessions.organization_id, organizationId)
      ),
    });

    if (!session) return null;
    return this.formatSessionInfo(session);
  }

  async listSessions(
    organizationId: string,
    options?: { status?: CodeAgentSessionStatus; limit?: number }
  ): Promise<SessionInfo[]> {
    const conditions = [eq(codeAgentSessions.organization_id, organizationId)];

    if (options?.status) {
      conditions.push(eq(codeAgentSessions.status, options.status));
    }

    const sessions = await db.query.codeAgentSessions.findMany({
      where: and(...conditions),
      orderBy: [desc(codeAgentSessions.created_at)],
      limit: options?.limit || 50,
    });

    return sessions.map((s) => this.formatSessionInfo(s));
  }

  async terminateSession(sessionId: string, organizationId: string): Promise<void> {
    const session = await db.query.codeAgentSessions.findFirst({
      where: and(
        eq(codeAgentSessions.id, sessionId),
        eq(codeAgentSessions.organization_id, organizationId)
      ),
    });

    if (!session) {
      throw new Error("Session not found");
    }

    if (session.status === "terminated") {
      return;
    }

    logger.info("[CodeAgentService] Terminating session", { sessionId });

    // Create final snapshot before termination
    try {
      await this.createSnapshot({
        sessionId,
        name: "Pre-termination snapshot",
        description: "Automatic snapshot before session termination",
      });
    } catch {
      // Ignore snapshot errors during termination
    }

    // Terminate runtime
    if (session.runtime_id) {
      const runtime = getRuntime(session.runtime_type);
      await runtime.terminate(session.runtime_id);
      this.activeInstances.delete(sessionId);
    }

    // Update session
    await db
      .update(codeAgentSessions)
      .set({
        status: "terminated",
        status_message: "Session terminated",
        terminated_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(codeAgentSessions.id, sessionId));

    this.emit({ type: "session_terminated", sessionId });
  }

  // ===========================================================================
  // COMMAND EXECUTION
  // ===========================================================================

  async runCommand(params: RunCommandParams): Promise<CommandResult> {
    const { sessionId, command, args, options } = params;

    const instance = await this.getActiveInstance(sessionId);
    const startTime = Date.now();

    // Record command
    const [commandRecord] = await db
      .insert(codeAgentCommands)
      .values({
        session_id: sessionId,
        command_type: "shell",
        command: args ? `${command} ${args.join(" ")}` : command,
        working_directory: options?.workingDirectory,
        status: "running",
        started_at: new Date(),
      } satisfies NewCodeAgentCommand)
      .returning();

    this.emit({
      type: "command_started",
      sessionId,
      commandId: commandRecord.id,
    });

    try {
      const result = await instance.runCommand(command, args, {
        cwd: options?.workingDirectory,
        env: options?.env,
        timeout: options?.timeout,
      });

      const durationMs = Date.now() - startTime;

      // Update command record
      await db
        .update(codeAgentCommands)
        .set({
          status: result.exitCode === 0 ? "success" : "error",
          exit_code: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          duration_ms: durationMs,
          completed_at: new Date(),
        })
        .where(eq(codeAgentCommands.id, commandRecord.id));

      // Update session usage
      await this.updateSessionUsage(sessionId, {
        commandsExecuted: 1,
        apiCallsCount: 1,
      });

      const commandResult: CommandResult = {
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs,
      };

      this.emit({
        type: "command_completed",
        sessionId,
        commandId: commandRecord.id,
        result: commandResult,
      });

      return commandResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      await db
        .update(codeAgentCommands)
        .set({
          status: "error",
          error_message: errorMessage,
          completed_at: new Date(),
        })
        .where(eq(codeAgentCommands.id, commandRecord.id));

      throw error;
    }
  }

  async executeCode(params: ExecuteCodeParams): Promise<CommandResult> {
    const { sessionId, language, code, options } = params;

    const instance = await this.getActiveInstance(sessionId);
    const startTime = Date.now();

    // Record command
    const [commandRecord] = await db
      .insert(codeAgentCommands)
      .values({
        session_id: sessionId,
        command_type: language,
        command: code.substring(0, 1000), // Truncate for storage
        working_directory: options?.workingDirectory,
        status: "running",
        started_at: new Date(),
      } satisfies NewCodeAgentCommand)
      .returning();

    this.emit({
      type: "command_started",
      sessionId,
      commandId: commandRecord.id,
    });

    try {
      let result: { exitCode: number; stdout: string; stderr: string };

      switch (language) {
        case "python": {
          // Write code to temp file and execute
          const tempFile = `/tmp/code-${Date.now()}.py`;
          await instance.writeFile(tempFile, code);
          result = await instance.runCommand("python3", [tempFile], {
            cwd: options?.workingDirectory,
            timeout: options?.timeout || 60000,
          });
          await instance.runCommand("rm", ["-f", tempFile]);
          break;
        }

        case "javascript":
        case "typescript": {
          const ext = language === "typescript" ? "ts" : "js";
          const tempFile = `/tmp/code-${Date.now()}.${ext}`;
          await instance.writeFile(tempFile, code);

          const runner = language === "typescript" ? "npx tsx" : "node";
          result = await instance.runCommand("sh", ["-c", `${runner} ${tempFile}`], {
            cwd: options?.workingDirectory,
            timeout: options?.timeout || 60000,
          });
          await instance.runCommand("rm", ["-f", tempFile]);
          break;
        }

        case "shell": {
          result = await instance.runCommand("sh", ["-c", code], {
            cwd: options?.workingDirectory,
            timeout: options?.timeout || 60000,
          });
          break;
        }

        default:
          throw new Error(`Unsupported language: ${language}`);
      }

      const durationMs = Date.now() - startTime;

      await db
        .update(codeAgentCommands)
        .set({
          status: result.exitCode === 0 ? "success" : "error",
          exit_code: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          duration_ms: durationMs,
          completed_at: new Date(),
        })
        .where(eq(codeAgentCommands.id, commandRecord.id));

      await this.updateSessionUsage(sessionId, {
        commandsExecuted: 1,
        apiCallsCount: 1,
      });

      const commandResult: CommandResult = {
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs,
      };

      this.emit({
        type: "command_completed",
        sessionId,
        commandId: commandRecord.id,
        result: commandResult,
      });

      return commandResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      await db
        .update(codeAgentCommands)
        .set({
          status: "error",
          error_message: errorMessage,
          completed_at: new Date(),
        })
        .where(eq(codeAgentCommands.id, commandRecord.id));

      throw error;
    }
  }

  // ===========================================================================
  // FILE OPERATIONS
  // ===========================================================================

  async readFile(params: ReadFileParams): Promise<ReadFileResult> {
    const { sessionId, path } = params;
    const instance = await this.getActiveInstance(sessionId);

    await this.updateSessionUsage(sessionId, { apiCallsCount: 1 });

    const content = await instance.readFile(path);

    if (content === null) {
      return {
        success: false,
        path,
        content: "",
        size: 0,
        error: "File not found",
      };
    }

    return {
      success: true,
      path,
      content,
      size: Buffer.byteLength(content, "utf-8"),
    };
  }

  async writeFile(params: WriteFileParams): Promise<FileOperationResult> {
    const { sessionId, path, content, createDirectories = true } = params;
    const instance = await this.getActiveInstance(sessionId);

    try {
      if (createDirectories) {
        const dir = path.split("/").slice(0, -1).join("/");
        if (dir) {
          await instance.runCommand("mkdir", ["-p", dir]);
        }
      }

      await instance.writeFile(path, content);

      await this.updateSessionUsage(sessionId, {
        apiCallsCount: 1,
        filesCreated: 1,
      });

      // Record file operation
      await db.insert(codeAgentCommands).values({
        session_id: sessionId,
        command_type: "write_file",
        command: path,
        arguments: { size: Buffer.byteLength(content, "utf-8") },
        status: "success",
        files_created: [path],
        completed_at: new Date(),
      } satisfies NewCodeAgentCommand);

      return { success: true, path };
    } catch (error) {
      return {
        success: false,
        path,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async listFiles(params: ListFilesParams): Promise<ListFilesResult> {
    const { sessionId, path, recursive = true, maxDepth = 3 } = params;
    const instance = await this.getActiveInstance(sessionId);

    await this.updateSessionUsage(sessionId, { apiCallsCount: 1 });

    try {
      const entries = await instance.listFiles(path);

      // Filter by depth if not recursive
      const filteredEntries = recursive
        ? entries
        : entries.filter((e) => {
            const relativePath = e.path.replace(path, "").replace(/^\//, "");
            const depth = relativePath.split("/").length;
            return depth <= maxDepth;
          });

      return { success: true, path, entries: filteredEntries };
    } catch (error) {
      return {
        success: false,
        path,
        entries: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async deleteFile(params: DeleteFileParams): Promise<FileOperationResult> {
    const { sessionId, path, recursive = false } = params;
    const instance = await this.getActiveInstance(sessionId);

    try {
      if (recursive) {
        await instance.runCommand("rm", ["-rf", path]);
      } else {
        await instance.deleteFile(path);
      }

      await this.updateSessionUsage(sessionId, { apiCallsCount: 1 });

      await db.insert(codeAgentCommands).values({
        session_id: sessionId,
        command_type: "delete_file",
        command: path,
        status: "success",
        files_deleted: [path],
        completed_at: new Date(),
      } satisfies NewCodeAgentCommand);

      return { success: true, path };
    } catch (error) {
      return {
        success: false,
        path,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ===========================================================================
  // GIT OPERATIONS
  // ===========================================================================

  async gitClone(params: GitCloneParams): Promise<GitOperationResult> {
    const { sessionId, url, branch, depth, directory } = params;

    const args = ["clone"];
    if (branch) args.push("-b", branch);
    if (depth) args.push("--depth", String(depth));
    args.push(url);
    if (directory) args.push(directory);

    const result = await this.runCommand({
      sessionId,
      command: "git",
      args,
    });

    if (!result.success) {
      return {
        success: false,
        message: "Clone failed",
        error: result.stderr,
      };
    }

    const gitState = await this.getGitState(sessionId);

    await db
      .update(codeAgentSessions)
      .set({ git_state: gitState, updated_at: new Date() })
      .where(eq(codeAgentSessions.id, sessionId));

    return {
      success: true,
      message: `Cloned ${url}`,
      gitState,
    };
  }

  async gitCommit(params: GitCommitParams): Promise<GitOperationResult> {
    const { sessionId, message, author } = params;

    // Stage all changes
    await this.runCommand({
      sessionId,
      command: "git",
      args: ["add", "-A"],
    });

    // Commit
    const args = ["commit", "-m", message];
    if (author) {
      args.push("--author", `${author.name} <${author.email}>`);
    }

    const result = await this.runCommand({
      sessionId,
      command: "git",
      args,
    });

    if (!result.success && !result.stderr.includes("nothing to commit")) {
      return {
        success: false,
        message: "Commit failed",
        error: result.stderr,
      };
    }

    const gitState = await this.getGitState(sessionId);

    await db
      .update(codeAgentSessions)
      .set({ git_state: gitState, updated_at: new Date() })
      .where(eq(codeAgentSessions.id, sessionId));

    return {
      success: true,
      message: result.success ? "Changes committed" : "Nothing to commit",
      gitState,
    };
  }

  async gitPush(params: GitPushParams): Promise<GitOperationResult> {
    const { sessionId, remote = "origin", branch, force = false } = params;

    const args = ["push", remote];
    if (branch) args.push(branch);
    if (force) args.push("--force");

    const result = await this.runCommand({
      sessionId,
      command: "git",
      args,
    });

    if (!result.success) {
      return {
        success: false,
        message: "Push failed",
        error: result.stderr,
      };
    }

    return {
      success: true,
      message: "Changes pushed",
      gitState: await this.getGitState(sessionId),
    };
  }

  async gitPull(params: GitPullParams): Promise<GitOperationResult> {
    const { sessionId, remote = "origin", branch } = params;

    const args = ["pull", remote];
    if (branch) args.push(branch);

    const result = await this.runCommand({
      sessionId,
      command: "git",
      args,
    });

    if (!result.success) {
      return {
        success: false,
        message: "Pull failed",
        error: result.stderr,
      };
    }

    const gitState = await this.getGitState(sessionId);

    await db
      .update(codeAgentSessions)
      .set({ git_state: gitState, updated_at: new Date() })
      .where(eq(codeAgentSessions.id, sessionId));

    return {
      success: true,
      message: "Changes pulled",
      gitState,
    };
  }

  private async getGitState(sessionId: string): Promise<GitState> {
    const instance = await this.getActiveInstance(sessionId);

    // Check if it's a git repo
    const gitCheck = await instance.runCommand("git", ["rev-parse", "--git-dir"]);
    if (gitCheck.exitCode !== 0) {
      return { isRepo: false };
    }

    // Get branch
    const branchResult = await instance.runCommand("git", ["branch", "--show-current"]);
    const branch = branchResult.stdout.trim() || undefined;

    // Get commit hash
    const hashResult = await instance.runCommand("git", ["rev-parse", "HEAD"]);
    const commitHash = hashResult.exitCode === 0 ? hashResult.stdout.trim() : undefined;

    // Get remote URL
    const remoteResult = await instance.runCommand("git", [
      "remote",
      "get-url",
      "origin",
    ]);
    const remoteUrl = remoteResult.exitCode === 0 ? remoteResult.stdout.trim() : undefined;

    // Check for uncommitted changes
    const statusResult = await instance.runCommand("git", ["status", "--porcelain"]);
    const hasUncommittedChanges = statusResult.stdout.trim().length > 0;

    return {
      isRepo: true,
      branch,
      commitHash,
      remoteUrl,
      hasUncommittedChanges,
    };
  }

  // ===========================================================================
  // PACKAGE MANAGEMENT
  // ===========================================================================

  async installPackages(params: InstallPackagesParams): Promise<PackageOperationResult> {
    const { sessionId, packages, manager = "npm", dev = false } = params;

    let command: string;
    let args: string[];

    switch (manager) {
      case "npm":
        command = "npm";
        args = ["install", ...packages];
        if (dev) args.push("--save-dev");
        break;

      case "bun":
        command = "bun";
        args = ["add", ...packages];
        if (dev) args.push("--dev");
        break;

      case "pip":
        command = "pip";
        args = ["install", ...packages];
        break;

      case "cargo":
        command = "cargo";
        args = ["add", ...packages];
        if (dev) args.push("--dev");
        break;

      default:
        throw new Error(`Unknown package manager: ${manager}`);
    }

    const result = await this.runCommand({ sessionId, command, args });

    return {
      success: result.success,
      packages,
      installedCount: result.success ? packages.length : 0,
      output: result.stdout + result.stderr,
      error: result.success ? undefined : result.stderr,
    };
  }

  // ===========================================================================
  // SNAPSHOTS
  // ===========================================================================

  async createSnapshot(params: CreateSnapshotParams): Promise<SnapshotResult> {
    const { sessionId, name, description } = params;

    const session = await db.query.codeAgentSessions.findFirst({
      where: eq(codeAgentSessions.id, sessionId),
    });

    if (!session) {
      throw new Error("Session not found");
    }

    const instance = await this.getActiveInstance(sessionId);

    logger.info("[CodeAgentService] Creating snapshot", { sessionId, name });

    try {
      // Get file list
      const files = await instance.listFiles("/app");
      const fileCount = files.filter((f) => f.type === "file").length;

      // Create archive
      const archive = await instance.createArchive(["/app"]);

      if (archive.length > MAX_SNAPSHOT_SIZE_BYTES) {
        throw new Error(
          `Snapshot too large: ${archive.length} bytes (max: ${MAX_SNAPSHOT_SIZE_BYTES})`
        );
      }

      // Upload to blob storage
      const storageKey = `snapshots/${session.organization_id}/${sessionId}/${Date.now()}.tar.gz`;

      const blob = await put(storageKey, archive, {
        access: "public",
        contentType: "application/gzip",
      });

      // Get git state
      const gitState = await this.getGitState(sessionId);

      // Create snapshot record
      const [snapshot] = await db
        .insert(codeAgentSnapshots)
        .values({
          session_id: sessionId,
          name: name || null,
          description: description || null,
          snapshot_type: "manual",
          storage_backend: "vercel_blob",
          storage_key: blob.url,
          file_count: fileCount,
          total_size_bytes: archive.length,
          file_manifest: files,
          git_state: gitState,
          environment_variables: session.environment_variables,
          working_directory: session.working_directory,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        } satisfies NewCodeAgentSnapshot)
        .returning();

      // Update session
      await db
        .update(codeAgentSessions)
        .set({
          latest_snapshot_id: snapshot.id,
          snapshot_count: session.snapshot_count + 1,
          updated_at: new Date(),
        })
        .where(eq(codeAgentSessions.id, sessionId));

      this.emit({ type: "snapshot_created", sessionId, snapshotId: snapshot.id });

      logger.info("[CodeAgentService] Snapshot created", {
        sessionId,
        snapshotId: snapshot.id,
        fileCount,
        sizeBytes: archive.length,
      });

      return {
        success: true,
        snapshot: this.formatSnapshotInfo(snapshot),
      };
    } catch (error) {
      logger.error("[CodeAgentService] Snapshot creation failed", {
        sessionId,
        error,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async restoreSnapshot(params: RestoreSnapshotParams): Promise<SnapshotResult> {
    const { sessionId, snapshotId } = params;

    const session = await db.query.codeAgentSessions.findFirst({
      where: eq(codeAgentSessions.id, sessionId),
    });

    if (!session) {
      throw new Error("Session not found");
    }

    const snapshot = await db.query.codeAgentSnapshots.findFirst({
      where: and(
        eq(codeAgentSnapshots.id, snapshotId),
        eq(codeAgentSnapshots.session_id, sessionId)
      ),
    });

    if (!snapshot) {
      throw new Error("Snapshot not found");
    }

    if (!snapshot.is_valid) {
      throw new Error(`Snapshot is invalid: ${snapshot.validation_error}`);
    }

    const instance = await this.getActiveInstance(sessionId);

    logger.info("[CodeAgentService] Restoring snapshot", { sessionId, snapshotId });

    // Update session status
    await db
      .update(codeAgentSessions)
      .set({
        status: "restoring",
        status_message: "Restoring from snapshot...",
        updated_at: new Date(),
      })
      .where(eq(codeAgentSessions.id, sessionId));

    try {
      // Create pre-restore snapshot
      await this.createSnapshot({
        sessionId,
        name: "Pre-restore backup",
        description: `Automatic backup before restoring from ${snapshotId}`,
      });

      // Download archive
      const response = await fetch(snapshot.storage_key);
      if (!response.ok) {
        throw new Error("Failed to download snapshot");
      }

      const archive = Buffer.from(await response.arrayBuffer());

      // Clear existing files
      await instance.runCommand("rm", ["-rf", "/app/*"]);

      // Extract archive
      await instance.extractArchive(archive, "/");

      // Restore environment variables
      if (snapshot.environment_variables) {
        await db
          .update(codeAgentSessions)
          .set({
            environment_variables: snapshot.environment_variables as Record<string, string>,
          })
          .where(eq(codeAgentSessions.id, sessionId));
      }

      // Update session
      await db
        .update(codeAgentSessions)
        .set({
          status: "ready",
          status_message: "Snapshot restored",
          git_state: snapshot.git_state,
          working_directory: snapshot.working_directory || "/app",
          updated_at: new Date(),
        })
        .where(eq(codeAgentSessions.id, sessionId));

      this.emit({ type: "snapshot_restored", sessionId, snapshotId });

      logger.info("[CodeAgentService] Snapshot restored", { sessionId, snapshotId });

      return {
        success: true,
        snapshot: this.formatSnapshotInfo(snapshot),
      };
    } catch (error) {
      logger.error("[CodeAgentService] Snapshot restoration failed", {
        sessionId,
        snapshotId,
        error,
      });

      await db
        .update(codeAgentSessions)
        .set({
          status: "error",
          status_message: `Restore failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          updated_at: new Date(),
        })
        .where(eq(codeAgentSessions.id, sessionId));

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async listSnapshots(sessionId: string): Promise<SnapshotInfo[]> {
    const snapshots = await db.query.codeAgentSnapshots.findMany({
      where: eq(codeAgentSnapshots.session_id, sessionId),
      orderBy: [desc(codeAgentSnapshots.created_at)],
    });

    return snapshots.map((s) => this.formatSnapshotInfo(s));
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    const snapshot = await db.query.codeAgentSnapshots.findFirst({
      where: eq(codeAgentSnapshots.id, snapshotId),
    });

    if (!snapshot) return;

    // Delete from blob storage
    try {
      await del(snapshot.storage_key);
    } catch {
      // Ignore deletion errors
    }

    // Delete record
    await db
      .delete(codeAgentSnapshots)
      .where(eq(codeAgentSnapshots.id, snapshotId));
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  async cleanupExpiredSessions(): Promise<number> {
    const expiredSessions = await db.query.codeAgentSessions.findMany({
      where: and(
        lt(codeAgentSessions.expires_at, new Date()),
        eq(codeAgentSessions.status, "ready")
      ),
    });

    let cleaned = 0;

    for (const session of expiredSessions) {
      try {
        await this.terminateSession(session.id, session.organization_id);
        cleaned++;
      } catch (error) {
        logger.error("[CodeAgentService] Failed to cleanup session", {
          sessionId: session.id,
          error,
        });
      }
    }

    logger.info("[CodeAgentService] Cleanup completed", { cleaned });
    return cleaned;
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private async getActiveInstance(sessionId: string): Promise<RuntimeInstance> {
    // Check cache first
    let instance = this.activeInstances.get(sessionId);
    if (instance) return instance;

    // Load session and connect to runtime
    const session = await db.query.codeAgentSessions.findFirst({
      where: eq(codeAgentSessions.id, sessionId),
    });

    if (!session) {
      throw new Error("Session not found");
    }

    if (session.status !== "ready" && session.status !== "executing") {
      throw new Error(`Session is not active: ${session.status}`);
    }

    if (!session.runtime_id) {
      throw new Error("Session has no runtime");
    }

    const runtime = getRuntime(session.runtime_type);
    instance = await runtime.connect(session.runtime_id);
    this.activeInstances.set(sessionId, instance);

    return instance;
  }

  private async updateSessionUsage(
    sessionId: string,
    usage: Partial<{
      cpuSecondsUsed: number;
      memoryMbPeak: number;
      diskMbUsed: number;
      apiCallsCount: number;
      commandsExecuted: number;
      filesCreated: number;
      filesModified: number;
    }>
  ): Promise<void> {
    const session = await db.query.codeAgentSessions.findFirst({
      where: eq(codeAgentSessions.id, sessionId),
    });

    if (!session) return;

    const updates: Partial<CodeAgentSession> = {
      last_activity_at: new Date(),
      updated_at: new Date(),
    };

    if (usage.cpuSecondsUsed) {
      updates.cpu_seconds_used = session.cpu_seconds_used + usage.cpuSecondsUsed;
    }
    if (usage.memoryMbPeak && usage.memoryMbPeak > session.memory_mb_peak) {
      updates.memory_mb_peak = usage.memoryMbPeak;
    }
    if (usage.diskMbUsed) {
      updates.disk_mb_used = usage.diskMbUsed;
    }
    if (usage.apiCallsCount) {
      updates.api_calls_count = session.api_calls_count + usage.apiCallsCount;
    }
    if (usage.commandsExecuted) {
      updates.commands_executed = session.commands_executed + usage.commandsExecuted;
    }
    if (usage.filesCreated) {
      updates.files_created = session.files_created + usage.filesCreated;
    }
    if (usage.filesModified) {
      updates.files_modified = session.files_modified + usage.filesModified;
    }

    // Update cost estimate
    const newApiCalls = usage.apiCallsCount || 0;
    const newCpuSeconds = usage.cpuSecondsUsed || 0;
    const additionalCost = Math.round(
      newApiCalls * COST_PER_API_CALL_CENTS + newCpuSeconds * COST_PER_CPU_SECOND_CENTS
    );
    updates.estimated_cost_cents = session.estimated_cost_cents + additionalCost;

    await db
      .update(codeAgentSessions)
      .set(updates)
      .where(eq(codeAgentSessions.id, sessionId));
  }

  private formatSessionInfo(session: CodeAgentSession): SessionInfo {
    return {
      id: session.id,
      organizationId: session.organization_id,
      userId: session.user_id,
      name: session.name,
      status: session.status,
      statusMessage: session.status_message,
      runtimeType: session.runtime_type,
      runtimeUrl: session.runtime_url,
      workingDirectory: session.working_directory || "/app",
      gitState: session.git_state,
      capabilities: session.capabilities,
      usage: {
        cpuSecondsUsed: session.cpu_seconds_used,
        memoryMbPeak: session.memory_mb_peak,
        diskMbUsed: session.disk_mb_used,
        apiCallsCount: session.api_calls_count,
        commandsExecuted: session.commands_executed,
        filesCreated: session.files_created,
        filesModified: session.files_modified,
        estimatedCostCents: session.estimated_cost_cents,
      },
      createdAt: session.created_at,
      lastActivityAt: session.last_activity_at,
      expiresAt: session.expires_at,
    };
  }

  private formatSnapshotInfo(snapshot: CodeAgentSnapshot): SnapshotInfo {
    return {
      id: snapshot.id,
      sessionId: snapshot.session_id,
      name: snapshot.name,
      description: snapshot.description,
      snapshotType: snapshot.snapshot_type,
      fileCount: snapshot.file_count,
      totalSizeBytes: snapshot.total_size_bytes,
      gitState: snapshot.git_state,
      createdAt: snapshot.created_at,
      expiresAt: snapshot.expires_at,
    };
  }
}

export const codeAgentService = new CodeAgentService();

