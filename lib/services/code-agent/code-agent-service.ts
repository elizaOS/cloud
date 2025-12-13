/**
 * Code Agent Service - Persistent sandbox sessions via Vercel Sandbox.
 * Requires: VERCEL_TOKEN/TEAM_ID/PROJECT_ID or VERCEL_OIDC_TOKEN, BLOB_READ_WRITE_TOKEN.
 * Note: instances Map is in-memory; use getSession() + connect() after cold starts.
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
  type NewCodeAgentCommand,
  type CodeAgentSessionStatus,
  type GitState,
} from "@/db/schemas/code-agent-sessions";
import { loadOrgSecrets, isSecretsConfigured } from "@/lib/services/secrets";
import { creditsService } from "@/lib/services/credits";
import { usageService } from "@/lib/services/usage";
import { hasSufficientCredits } from "@/lib/utils/credit-guard";
import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";
import { CacheInvalidation } from "@/lib/cache/invalidation";
import { logger } from "@/lib/utils/logger";
import { put, del } from "@vercel/blob";
import { vercelSandboxRuntime } from "./runtimes/vercel-sandbox";
import { dispatchWebhook, generateWebhookSecret } from "./webhooks";
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
} from "./types";

const COST_PER_CPU_SECOND_CENTS = 0.001;
const COST_PER_API_CALL_CENTS = 0.01;
const DEFAULT_SESSION_TIMEOUT_SECONDS = 30 * 60;
const MAX_SNAPSHOT_SIZE_BYTES = 100 * 1024 * 1024;

const runtimes: Record<string, CodeAgentRuntime> = { vercel: vercelSandboxRuntime };

class CodeAgentService {
  private handlers: CodeAgentEventHandler[] = [];
  private instances = new Map<string, RuntimeInstance>();

  onEvent(handler: CodeAgentEventHandler): () => void {
    this.handlers.push(handler);
    return () => { const i = this.handlers.indexOf(handler); if (i > -1) this.handlers.splice(i, 1); };
  }

  private emit(event: CodeAgentEvent) { this.handlers.forEach((h) => h(event)); }

  private async emitWithWebhook(event: CodeAgentEvent, session: CodeAgentSession) {
    this.emit(event);
    await dispatchWebhook(session, event);
  }

  private async refreshSession(sessionId: string): Promise<CodeAgentSession> {
    const s = await db.query.codeAgentSessions.findFirst({ where: eq(codeAgentSessions.id, sessionId) });
    if (!s) throw new Error("Session not found");
    return s;
  }

  async createSession(params: CreateSessionParams): Promise<SessionInfo> {
    const {
      organizationId,
      userId,
      name,
      description,
      runtimeType = "vercel",
      templateUrl,
      environmentVariables = {},
      loadOrgSecrets: shouldLoadSecrets = true,
      capabilities,
      expiresInSeconds = DEFAULT_SESSION_TIMEOUT_SECONDS,
      webhookUrl,
      webhookEvents,
    } = params;

    logger.info("[CodeAgentService] Creating session", { organizationId, runtimeType });

    const { sufficient, currentBalance } = await hasSufficientCredits(organizationId, 1.0);
    if (!sufficient) throw new Error(`Insufficient credits: $${currentBalance.toFixed(2)} < $1.00 minimum for session creation`);

    const secrets = shouldLoadSecrets && isSecretsConfigured()
      ? await loadOrgSecrets(organizationId)
      : {};
    const mergedEnv = { ...secrets, ...environmentVariables };
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
        status_message: "Initializing...",
        environment_variables: environmentVariables,
        secrets_loaded: Object.keys(secrets),
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
        webhook_url: webhookUrl,
        webhook_secret: webhookUrl ? generateWebhookSecret() : undefined,
        webhook_events: webhookEvents,
      } satisfies NewCodeAgentSession)
      .returning();

    await CacheInvalidation.onCodeAgentSessionMutation(session.id, organizationId);
    this.emit({ type: "session_created", sessionId: session.id });

    const runtime = runtimes[runtimeType];
    if (!runtime) throw new Error(`Unknown runtime: ${runtimeType}`);

    try {
      const instance = await runtime.create({
        templateUrl,
        timeout: expiresInSeconds * 1000,
        vcpus: 4,
        env: mergedEnv,
      });
      this.instances.set(session.id, instance);

      await db.update(codeAgentSessions).set({ runtime_id: instance.id, runtime_url: instance.url, status: "ready", status_message: "Ready", updated_at: new Date() }).where(eq(codeAgentSessions.id, session.id));
      await CacheInvalidation.onCodeAgentSessionMutation(session.id, organizationId);
      const updated = await this.refreshSession(session.id);
      await this.emitWithWebhook({ type: "session_ready", sessionId: session.id, url: instance.url }, updated);
      logger.info("[CodeAgentService] Session ready", { sessionId: session.id });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown";
      await db.update(codeAgentSessions).set({ status: "error", status_message: msg, updated_at: new Date() }).where(eq(codeAgentSessions.id, session.id));
      await CacheInvalidation.onCodeAgentSessionMutation(session.id, organizationId);
      await this.emitWithWebhook({ type: "session_error", sessionId: session.id, error: msg }, await this.refreshSession(session.id));
      throw error;
    }

    return this.formatSessionInfo(await this.refreshSession(session.id));
  }

  async getSession(sessionId: string, organizationId: string): Promise<SessionInfo | null> {
    const cacheKey = CacheKeys.codeAgent.session(sessionId);
    const cached = await cache.get<SessionInfo>(cacheKey);
    if (cached && cached.organizationId === organizationId) return cached;

    const session = await db.query.codeAgentSessions.findFirst({
      where: and(
        eq(codeAgentSessions.id, sessionId),
        eq(codeAgentSessions.organization_id, organizationId)
      ),
    });

    if (!session) return null;
    const info = this.formatSessionInfo(session);
    await cache.set(cacheKey, info, CacheTTL.codeAgent.session);
    return info;
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
      where: and(eq(codeAgentSessions.id, sessionId), eq(codeAgentSessions.organization_id, organizationId)),
    });
    if (!session) throw new Error("Session not found");
    if (session.status === "terminated") return;

    logger.info("[CodeAgentService] Terminating", { sessionId });
    try { await this.createSnapshot({ sessionId, name: "Pre-termination" }); } catch (e) { logger.warn("[CodeAgentService] Snapshot failed", { sessionId, error: e }); }

    if (session.runtime_id) {
      await runtimes[session.runtime_type].terminate(session.runtime_id);
      this.instances.delete(sessionId);
    }

    await db.update(codeAgentSessions).set({ status: "terminated", status_message: "Terminated", terminated_at: new Date(), updated_at: new Date() }).where(eq(codeAgentSessions.id, sessionId));
    await CacheInvalidation.onCodeAgentSessionMutation(sessionId, organizationId);
    await this.emitWithWebhook({ type: "session_terminated", sessionId }, await this.refreshSession(sessionId));
  }

  async runCommand(params: RunCommandParams): Promise<CommandResult> {
    const { sessionId, command, args, options } = params;
    const instance = await this.getActiveInstance(sessionId);
    const startTime = Date.now();

    const [rec] = await db.insert(codeAgentCommands).values({
      session_id: sessionId,
      command_type: "shell",
      command: args ? `${command} ${args.join(" ")}` : command,
      working_directory: options?.workingDirectory,
      status: "running",
      started_at: new Date(),
    } satisfies NewCodeAgentCommand).returning();

    this.emit({ type: "command_started", sessionId, commandId: rec.id });

    try {
      const result = await instance.runCommand(command, args, {
        cwd: options?.workingDirectory,
        env: options?.env,
        timeout: options?.timeout,
      });
      const durationMs = Date.now() - startTime;

      await db.update(codeAgentCommands).set({
        status: result.exitCode === 0 ? "success" : "error",
        exit_code: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration_ms: durationMs,
        completed_at: new Date(),
      }).where(eq(codeAgentCommands.id, rec.id));

      await this.updateSessionUsage(sessionId, { commandsExecuted: 1, apiCallsCount: 1 });

      const commandResult: CommandResult = {
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs,
      };
      this.emit({ type: "command_completed", sessionId, commandId: rec.id, result: commandResult });
      return commandResult;
    } catch (error) {
      await db.update(codeAgentCommands).set({
        status: "error",
        error_message: error instanceof Error ? error.message : "Unknown error",
        completed_at: new Date(),
      }).where(eq(codeAgentCommands.id, rec.id));
      throw error;
    }
  }

  async executeCode(params: ExecuteCodeParams): Promise<CommandResult> {
    const { sessionId, language, code, options } = params;
    const instance = await this.getActiveInstance(sessionId);
    const startTime = Date.now();
    const timeout = options?.timeout || 60000;

    const [rec] = await db.insert(codeAgentCommands).values({
      session_id: sessionId,
      command_type: language,
      command: code.substring(0, 1000),
      working_directory: options?.workingDirectory,
      status: "running",
      started_at: new Date(),
    } satisfies NewCodeAgentCommand).returning();

    this.emit({ type: "command_started", sessionId, commandId: rec.id });

    try {
      let result: { exitCode: number; stdout: string; stderr: string };
      const tempFile = `/tmp/code-${Date.now()}`;

      switch (language) {
        case "python":
          await instance.writeFile(`${tempFile}.py`, code);
          result = await instance.runCommand("python3", [`${tempFile}.py`], { cwd: options?.workingDirectory, timeout });
          await instance.runCommand("rm", ["-f", `${tempFile}.py`]);
          break;
        case "javascript":
        case "typescript": {
          const ext = language === "typescript" ? "ts" : "js";
          await instance.writeFile(`${tempFile}.${ext}`, code);
          const runner = language === "typescript" ? "npx tsx" : "node";
          result = await instance.runCommand("sh", ["-c", `${runner} ${tempFile}.${ext}`], { cwd: options?.workingDirectory, timeout });
          await instance.runCommand("rm", ["-f", `${tempFile}.${ext}`]);
          break;
        }
        case "shell":
          result = await instance.runCommand("sh", ["-c", code], { cwd: options?.workingDirectory, timeout });
          break;
        default:
          throw new Error(`Unsupported language: ${language}`);
      }

      const durationMs = Date.now() - startTime;
      await db.update(codeAgentCommands).set({
        status: result.exitCode === 0 ? "success" : "error",
        exit_code: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration_ms: durationMs,
        completed_at: new Date(),
      }).where(eq(codeAgentCommands.id, rec.id));

      await this.updateSessionUsage(sessionId, { commandsExecuted: 1, apiCallsCount: 1 });

      const commandResult: CommandResult = {
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs,
      };
      this.emit({ type: "command_completed", sessionId, commandId: rec.id, result: commandResult });
      return commandResult;
    } catch (error) {
      await db.update(codeAgentCommands).set({
        status: "error",
        error_message: error instanceof Error ? error.message : "Unknown error",
        completed_at: new Date(),
      }).where(eq(codeAgentCommands.id, rec.id));
      throw error;
    }
  }

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

    if (createDirectories) {
      const dir = path.split("/").slice(0, -1).join("/");
      if (dir) await instance.runCommand("mkdir", ["-p", dir]);
    }
    await instance.writeFile(path, content);
    await this.updateSessionUsage(sessionId, { apiCallsCount: 1, filesCreated: 1 });
    await db.insert(codeAgentCommands).values({
      session_id: sessionId, command_type: "write_file", command: path,
      arguments: { size: Buffer.byteLength(content, "utf-8") },
      status: "success", files_created: [path], completed_at: new Date(),
    } satisfies NewCodeAgentCommand);
    return { success: true, path };
  }

  async listFiles(params: ListFilesParams): Promise<ListFilesResult> {
    const { sessionId, path, recursive = true, maxDepth = 3 } = params;
    const instance = await this.getActiveInstance(sessionId);
    await this.updateSessionUsage(sessionId, { apiCallsCount: 1 });

    const entries = await instance.listFiles(path);
    const filtered = recursive ? entries : entries.filter((e) => {
      const rel = e.path.replace(path, "").replace(/^\//, "");
      return rel.split("/").length <= maxDepth;
    });
    return { success: true, path, entries: filtered };
  }

  async deleteFile(params: DeleteFileParams): Promise<FileOperationResult> {
    const { sessionId, path, recursive = false } = params;
    const instance = await this.getActiveInstance(sessionId);

    try {
      if (recursive) await instance.runCommand("rm", ["-rf", path]);
      else await instance.deleteFile(path);
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
      return { success: false, path, error: error instanceof Error ? error.message : "Unknown" };
    }
  }

  async gitClone(params: GitCloneParams): Promise<GitOperationResult> {
    const { sessionId, url, branch, depth, directory } = params;
    const args = ["clone"];
    if (branch) args.push("-b", branch);
    if (depth) args.push("--depth", String(depth));
    args.push(url);
    if (directory) args.push(directory);

    const result = await this.runCommand({ sessionId, command: "git", args });
    if (!result.success) return { success: false, message: "Clone failed", error: result.stderr };

    const gitState = await this.getGitState(sessionId);
    await db.update(codeAgentSessions).set({ git_state: gitState, updated_at: new Date() }).where(eq(codeAgentSessions.id, sessionId));
    return { success: true, message: `Cloned ${url}`, gitState };
  }

  async gitCommit(params: GitCommitParams): Promise<GitOperationResult> {
    const { sessionId, message, author } = params;
    await this.runCommand({ sessionId, command: "git", args: ["add", "-A"] });

    const args = ["commit", "-m", message];
    if (author) args.push("--author", `${author.name} <${author.email}>`);

    const result = await this.runCommand({ sessionId, command: "git", args });
    if (!result.success && !result.stderr.includes("nothing to commit")) {
      return { success: false, message: "Commit failed", error: result.stderr };
    }

    const gitState = await this.getGitState(sessionId);
    await db.update(codeAgentSessions).set({ git_state: gitState, updated_at: new Date() }).where(eq(codeAgentSessions.id, sessionId));
    return { success: true, message: result.success ? "Committed" : "Nothing to commit", gitState };
  }

  async gitPush(params: GitPushParams): Promise<GitOperationResult> {
    const { sessionId, remote = "origin", branch, force = false } = params;
    const args = ["push", remote];
    if (branch) args.push(branch);
    if (force) args.push("--force");

    const result = await this.runCommand({ sessionId, command: "git", args });
    if (!result.success) return { success: false, message: "Push failed", error: result.stderr };
    return { success: true, message: "Pushed", gitState: await this.getGitState(sessionId) };
  }

  async gitPull(params: GitPullParams): Promise<GitOperationResult> {
    const { sessionId, remote = "origin", branch } = params;
    const args = ["pull", remote];
    if (branch) args.push(branch);

    const result = await this.runCommand({ sessionId, command: "git", args });
    if (!result.success) return { success: false, message: "Pull failed", error: result.stderr };

    const gitState = await this.getGitState(sessionId);
    await db.update(codeAgentSessions).set({ git_state: gitState, updated_at: new Date() }).where(eq(codeAgentSessions.id, sessionId));
    return { success: true, message: "Pulled", gitState };
  }

  private async getGitState(sessionId: string): Promise<GitState> {
    const inst = await this.getActiveInstance(sessionId);
    const check = await inst.runCommand("git", ["rev-parse", "--git-dir"]);
    if (check.exitCode !== 0) return { isRepo: false };

    const [branchRes, hashRes, remoteRes, statusRes] = await Promise.all([
      inst.runCommand("git", ["branch", "--show-current"]),
      inst.runCommand("git", ["rev-parse", "HEAD"]),
      inst.runCommand("git", ["remote", "get-url", "origin"]),
      inst.runCommand("git", ["status", "--porcelain"]),
    ]);

    return {
      isRepo: true,
      branch: branchRes.stdout.trim() || undefined,
      commitHash: hashRes.exitCode === 0 ? hashRes.stdout.trim() : undefined,
      remoteUrl: remoteRes.exitCode === 0 ? remoteRes.stdout.trim() : undefined,
      hasUncommittedChanges: statusRes.stdout.trim().length > 0,
    };
  }

  async installPackages(params: InstallPackagesParams): Promise<PackageOperationResult> {
    const { sessionId, packages, manager = "npm", dev = false } = params;

    const cmds: Record<string, { cmd: string; args: string[] }> = {
      npm: { cmd: "npm", args: ["install", ...packages, ...(dev ? ["--save-dev"] : [])] },
      bun: { cmd: "bun", args: ["add", ...packages, ...(dev ? ["--dev"] : [])] },
      pip: { cmd: "pip", args: ["install", ...packages] },
      cargo: { cmd: "cargo", args: ["add", ...packages, ...(dev ? ["--dev"] : [])] },
    };

    const spec = cmds[manager];
    if (!spec) throw new Error(`Unknown package manager: ${manager}`);

    const result = await this.runCommand({ sessionId, command: spec.cmd, args: spec.args });
    return {
      success: result.success,
      packages,
      installedCount: result.success ? packages.length : 0,
      output: result.stdout + result.stderr,
      error: result.success ? undefined : result.stderr,
    };
  }

  async createSnapshot(params: CreateSnapshotParams): Promise<SnapshotResult> {
    const { sessionId, name, description } = params;
    const session = await db.query.codeAgentSessions.findFirst({ where: eq(codeAgentSessions.id, sessionId) });
    if (!session) throw new Error("Session not found");

    const instance = await this.getActiveInstance(sessionId);

    try {
      const files = await instance.listFiles("/app");
      const fileCount = files.filter((f) => f.type === "file").length;
      const archive = await instance.createArchive(["/app"]);

      if (archive.length > MAX_SNAPSHOT_SIZE_BYTES) {
        throw new Error(`Snapshot too large: ${archive.length} bytes`);
      }

      // NOTE: Vercel Blob only supports public access. We use a crypto-random path
      // segment to make URLs non-guessable. Do not log or expose snapshot URLs.
      const randomToken = crypto.randomUUID();
      const blob = await put(
        `snapshots/${session.organization_id}/${sessionId}/${randomToken}-${Date.now()}.tar.gz`,
        archive,
        { access: "public", contentType: "application/gzip" }
      );

      const gitState = await this.getGitState(sessionId);

      const [snapshot] = await db.insert(codeAgentSnapshots).values({
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
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      } satisfies NewCodeAgentSnapshot).returning();

      await db.update(codeAgentSessions).set({ latest_snapshot_id: snapshot.id, snapshot_count: session.snapshot_count + 1, updated_at: new Date() }).where(eq(codeAgentSessions.id, sessionId));
      await CacheInvalidation.onCodeAgentSessionMutation(sessionId, session.organization_id);
      await this.emitWithWebhook({ type: "snapshot_created", sessionId, snapshotId: snapshot.id }, await this.refreshSession(sessionId));
      logger.info("[CodeAgentService] Snapshot created", { sessionId, snapshotId: snapshot.id, fileCount });
      return { success: true, snapshot: this.formatSnapshotInfo(snapshot) };
    } catch (error) {
      logger.error("[CodeAgentService] Snapshot failed", { sessionId, error });
      return { success: false, error: error instanceof Error ? error.message : "Unknown" };
    }
  }

  async restoreSnapshot(params: RestoreSnapshotParams): Promise<SnapshotResult> {
    const { sessionId, snapshotId } = params;
    const session = await db.query.codeAgentSessions.findFirst({ where: eq(codeAgentSessions.id, sessionId) });
    if (!session) throw new Error("Session not found");

    const snapshot = await db.query.codeAgentSnapshots.findFirst({
      where: and(eq(codeAgentSnapshots.id, snapshotId), eq(codeAgentSnapshots.session_id, sessionId)),
    });
    if (!snapshot) throw new Error("Snapshot not found");
    if (!snapshot.is_valid) throw new Error(`Snapshot invalid: ${snapshot.validation_error}`);

    const instance = await this.getActiveInstance(sessionId);
    await db.update(codeAgentSessions).set({ status: "restoring", status_message: "Restoring...", updated_at: new Date() }).where(eq(codeAgentSessions.id, sessionId));

    try {
      await this.createSnapshot({ sessionId, name: "Pre-restore backup" });

      const response = await fetch(snapshot.storage_key);
      if (!response.ok) throw new Error("Failed to download snapshot");

      const archive = Buffer.from(await response.arrayBuffer());
      await instance.runCommand("rm", ["-rf", "/app/*"]);
      await instance.extractArchive(archive, "/");

      if (snapshot.environment_variables) {
        await db.update(codeAgentSessions).set({ environment_variables: snapshot.environment_variables as Record<string, string> }).where(eq(codeAgentSessions.id, sessionId));
      }

      await db.update(codeAgentSessions).set({
        status: "ready",
        status_message: "Restored",
        git_state: snapshot.git_state,
        working_directory: snapshot.working_directory || "/app",
        updated_at: new Date(),
      }).where(eq(codeAgentSessions.id, sessionId));

      this.emit({ type: "snapshot_restored", sessionId, snapshotId });
      return { success: true, snapshot: this.formatSnapshotInfo(snapshot) };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown";
      await db.update(codeAgentSessions).set({ status: "error", status_message: `Restore failed: ${msg}`, updated_at: new Date() }).where(eq(codeAgentSessions.id, sessionId));
      return { success: false, error: msg };
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
    const snapshot = await db.query.codeAgentSnapshots.findFirst({ where: eq(codeAgentSnapshots.id, snapshotId) });
    if (!snapshot) return;

    try { await del(snapshot.storage_key); } catch (e) { logger.warn("[CodeAgentService] Blob delete failed", { snapshotId, error: e }); }
    await db.delete(codeAgentSnapshots).where(eq(codeAgentSnapshots.id, snapshotId));
  }

  async cleanupExpiredSessions(): Promise<number> {
    const expired = await db.query.codeAgentSessions.findMany({
      where: and(lt(codeAgentSessions.expires_at, new Date()), eq(codeAgentSessions.status, "ready")),
    });

    let cleaned = 0;
    for (const s of expired) {
      try { await this.terminateSession(s.id, s.organization_id); cleaned++; }
      catch (e) { logger.error("[CodeAgentService] Cleanup failed", { sessionId: s.id, error: e }); }
    }
    return cleaned;
  }

  private async getActiveInstance(sessionId: string): Promise<RuntimeInstance> {
    const cached = this.instances.get(sessionId);
    if (cached) return cached;

    const session = await db.query.codeAgentSessions.findFirst({ where: eq(codeAgentSessions.id, sessionId) });
    if (!session) throw new Error("Session not found");
    if (session.status !== "ready" && session.status !== "executing") throw new Error(`Session not active: ${session.status}`);
    if (!session.runtime_id) throw new Error("No runtime");

    const runtime = runtimes[session.runtime_type];
    if (!runtime) throw new Error(`Unknown runtime: ${session.runtime_type}`);

    const instance = await runtime.connect(session.runtime_id);
    this.instances.set(sessionId, instance);
    return instance;
  }

  private async updateSessionUsage(sessionId: string, usage: {
    cpuSecondsUsed?: number;
    memoryMbPeak?: number;
    diskMbUsed?: number;
    apiCallsCount?: number;
    commandsExecuted?: number;
    filesCreated?: number;
    filesModified?: number;
  }): Promise<void> {
    const session = await db.query.codeAgentSessions.findFirst({ where: eq(codeAgentSessions.id, sessionId) });
    if (!session) return;

    const costCents = (usage.apiCallsCount || 0) * COST_PER_API_CALL_CENTS + (usage.cpuSecondsUsed || 0) * COST_PER_CPU_SECOND_CENTS;
    const costDollars = costCents / 100;

    if (costDollars > 0) {
      const deduction = await creditsService.deductCredits({
        organizationId: session.organization_id,
        amount: costDollars,
        description: `Code Agent: ${usage.commandsExecuted ? 'command' : 'api call'}`,
        metadata: { session_id: sessionId, user_id: session.user_id, api_calls: usage.apiCallsCount, commands: usage.commandsExecuted },
      });
      if (!deduction.success) throw new Error("Failed to deduct credits");

      await usageService.create({
        organization_id: session.organization_id, user_id: session.user_id, api_key_id: null, type: "code_agent",
        model: "vercel-sandbox", provider: "eliza-cloud", input_tokens: usage.commandsExecuted || 0, output_tokens: usage.apiCallsCount || 0,
        input_cost: String(costDollars / 2), output_cost: String(costDollars / 2), is_successful: true,
      });
    }

    await db.update(codeAgentSessions).set({
      last_activity_at: new Date(),
      updated_at: new Date(),
      cpu_seconds_used: session.cpu_seconds_used + (usage.cpuSecondsUsed || 0),
      memory_mb_peak: Math.max(session.memory_mb_peak, usage.memoryMbPeak || 0),
      disk_mb_used: usage.diskMbUsed ?? session.disk_mb_used,
      api_calls_count: session.api_calls_count + (usage.apiCallsCount || 0),
      commands_executed: session.commands_executed + (usage.commandsExecuted || 0),
      files_created: session.files_created + (usage.filesCreated || 0),
      files_modified: session.files_modified + (usage.filesModified || 0),
      estimated_cost_cents: session.estimated_cost_cents + Math.round(costCents),
    }).where(eq(codeAgentSessions.id, sessionId));
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

