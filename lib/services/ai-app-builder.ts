import { sandboxService, type SandboxProgress } from "./sandbox";
import {
  buildFullAppPrompt,
  getExamplePrompts,
  type FullAppTemplateType,
} from "@/lib/fragments/prompt";
import { logger } from "@/lib/utils/logger";
import { dbRead, dbWrite } from "@/db/client";
import {
  appSandboxSessions,
  appBuilderPrompts,
  appTemplates,
  sessionFileSnapshots,
  type AppSandboxSession,
  type NewAppSandboxSession,
  type NewAppBuilderPrompt,
} from "@/db/schemas/app-sandboxes";
import { eq, desc, and, isNotNull, sql } from "drizzle-orm";
import { appsService } from "./apps";

const EXAMPLE_PROMPTS = {
  chat: getExamplePrompts("chat"),
  "agent-dashboard": getExamplePrompts("agent-dashboard"),
  "landing-page": getExamplePrompts("landing-page"),
  analytics: getExamplePrompts("analytics"),
  blank: getExamplePrompts("blank"),
};

export interface BuilderSessionConfig {
  userId: string;
  organizationId: string;
  appId?: string;
  appName?: string;
  appDescription?: string;
  initialPrompt?: string;
  templateType?:
    | "chat"
    | "agent-dashboard"
    | "landing-page"
    | "analytics"
    | "blank";
  includeMonetization?: boolean;
  includeAnalytics?: boolean;
  onProgress?: (progress: SandboxProgress) => void;
  onSandboxReady?: (session: BuilderSession) => void;
  onToolUse?: (tool: string, input: unknown, result: string) => void;
  onThinking?: (text: string) => void;
  abortSignal?: AbortSignal;
}

export type { SandboxProgress };

export interface BuilderSession {
  id: string;
  sandboxId: string;
  sandboxUrl: string;
  status: AppSandboxSession["status"];
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: string;
  }>;
  examplePrompts: string[];
  expiresAt: string | null;
  initialPromptResult?: PromptResult;
}

export interface PromptResult {
  success: boolean;
  output: string;
  filesAffected: string[];
  error?: string;
}

export class AIAppBuilderService {
  private async verifyOwnership(
    sessionId: string,
    userId: string
  ): Promise<AppSandboxSession> {
    const session = await dbRead.query.appSandboxSessions.findFirst({
      where: eq(appSandboxSessions.id, sessionId),
    });

    if (!session) throw new Error("Session not found");
    if (session.user_id !== userId)
      throw new Error("Access denied: You don't own this session");

    return session;
  }

  /**
   * Find the most recent session with file snapshots for an app.
   * Used to restore files when creating a new session for an existing app.
   */
  private async findPreviousSessionWithSnapshots(
    appId: string,
    organizationId: string,
    excludeSessionId?: string
  ): Promise<string | null> {
    logger.info("findPreviousSessionWithSnapshots: searching", { appId, organizationId, excludeSessionId });

    const conditions = [
      eq(appSandboxSessions.app_id, appId),
      eq(appSandboxSessions.organization_id, organizationId),
    ];

    if (excludeSessionId) {
      conditions.push(sql`${appSandboxSessions.id} != ${excludeSessionId}`);
    }

    const allSessions = await dbRead
      .select({
        sessionId: appSandboxSessions.id,
        appId: appSandboxSessions.app_id,
        status: appSandboxSessions.status,
      })
      .from(appSandboxSessions)
      .where(and(...conditions));

    logger.info("findPreviousSessionWithSnapshots: all sessions for app", {
      appId,
      sessionCount: allSessions.length,
      sessions: allSessions.map((s) => ({ id: s.sessionId, status: s.status })),
    });

    const sessionsWithSnapshots = await dbRead
      .select({
        sessionId: appSandboxSessions.id,
        snapshotCount: sql<number>`count(${sessionFileSnapshots.id})`.as(
          "snapshot_count"
        ),
      })
      .from(appSandboxSessions)
      .leftJoin(
        sessionFileSnapshots,
        eq(sessionFileSnapshots.sandbox_session_id, appSandboxSessions.id)
      )
      .where(and(...conditions))
      .groupBy(appSandboxSessions.id)
      .having(sql`count(${sessionFileSnapshots.id}) > 0`)
      .orderBy(desc(appSandboxSessions.created_at))
      .limit(1);

    logger.info("findPreviousSessionWithSnapshots: sessions with snapshots", {
      appId,
      count: sessionsWithSnapshots.length,
      result: sessionsWithSnapshots,
    });

    if (sessionsWithSnapshots.length === 0) return null;
    return sessionsWithSnapshots[0].sessionId;
  }

  async startSession(config: BuilderSessionConfig): Promise<BuilderSession> {
    const {
      userId,
      organizationId,
      appId: providedAppId,
      appName,
      appDescription,
      initialPrompt,
      templateType = "blank",
      includeMonetization = false,
      includeAnalytics = true,
      onProgress,
      onSandboxReady,
      onToolUse,
      onThinking,
      abortSignal,
    } = config;

    logger.info("Starting AI App Builder session", {
      userId,
      templateType,
      appName,
    });

    let appId = providedAppId;
    let appApiKey: string | undefined;

    if (!appId && appName) {
      const { app, apiKey } = await appsService.create({
        name: appName,
        description:
          appDescription || `AI-built app (template: ${templateType})`,
        organization_id: organizationId,
        created_by_user_id: userId,
        app_url: "https://placeholder.local",
        allowed_origins: ["*"],
      });
      appId = app.id;
      appApiKey = apiKey;
      logger.info("Created app for AI builder session", { appId, appName });
    } else if (appId) {
      appApiKey = await appsService.regenerateApiKey(appId);
      logger.info("Regenerated API key for existing app", { appId });
    }

    let templateUrl: string | undefined;
    if (templateType !== "blank") {
      const template = await dbRead.query.appTemplates.findFirst({
        where: eq(appTemplates.slug, templateType),
      });
      templateUrl = template?.git_repo_url;

      if (!templateUrl) {
        logger.info(
          "Template not found in database, using prompt-based template guidance",
          { templateType }
        );
      } else {
        logger.info("Using template from database", {
          templateType,
          templateUrl,
        });
      }
    }

    // Determine API URL for sandbox - ELIZA_API_URL required for local dev (use ngrok)
    const isLocalDev =
      process.env.NEXT_PUBLIC_APP_URL?.includes("localhost") ||
      process.env.NEXT_PUBLIC_APP_URL?.includes("127.0.0.1");

    const apiUrl = process.env.ELIZA_API_URL || process.env.NEXT_PUBLIC_APP_URL;

    if (!apiUrl || (isLocalDev && !process.env.ELIZA_API_URL)) {
      throw new Error(
        "ELIZA_API_URL environment variable is required for local development. " +
          "Run ngrok and set ELIZA_API_URL to your ngrok URL in .env.local"
      );
    }
    const sandboxEnv: Record<string, string> = {};
    if (appApiKey) {
      sandboxEnv.NEXT_PUBLIC_ELIZA_API_KEY = appApiKey;
      sandboxEnv.NEXT_PUBLIC_ELIZA_API_URL = apiUrl;
    }
    if (appId) {
      sandboxEnv.NEXT_PUBLIC_ELIZA_APP_ID = appId;
    }

    const sandboxData = await sandboxService.create({
      templateUrl,
      timeout: 30 * 60 * 1000,
      vcpus: 4,
      organizationId,
      projectId: appId,
      env: Object.keys(sandboxEnv).length > 0 ? sandboxEnv : undefined,
      onProgress,
    });

    const systemPrompt = buildFullAppPrompt({
      templateType: templateType as FullAppTemplateType,
      includeMonetization,
      includeAnalytics,
      customInstructions: appDescription
        ? `Build an app with the following requirements:\n${appDescription}`
        : initialPrompt
          ? `Initial request:\n${initialPrompt}`
          : undefined,
    });

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const [session] = await dbWrite
      .insert(appSandboxSessions)
      .values({
        user_id: userId,
        organization_id: organizationId,
        app_id: appId,
        sandbox_id: sandboxData.sandboxId,
        sandbox_url: sandboxData.sandboxUrl,
        status: "ready",
        app_name: appName,
        app_description: appDescription,
        initial_prompt: initialPrompt,
        template_type: templateType,
        build_config: { features: [], includeMonetization, includeAnalytics },
        claude_messages: [],
        started_at: new Date(),
        expires_at: expiresAt,
      } satisfies NewAppSandboxSession)
      .returning();

    // Restore files from previous session if this is an existing app
    let filesRestored = 0;
    if (appId) {
      const previousSessionId = await this.findPreviousSessionWithSnapshots(
        appId,
        organizationId,
        session.id
      );
      if (previousSessionId) {
        logger.info("Found previous session with snapshots, restoring files", {
          appId,
          previousSessionId,
          newSessionId: session.id,
        });

        onProgress?.({
          step: "restoring",
          message: "Restoring previous files",
        });

        try {
          const restoreResult = await sandboxService.restoreFiles(
            sandboxData.sandboxId,
            previousSessionId,
            {
              onProgress: (current, total, filePath) => {
                onProgress?.({
                  step: "restoring",
                  message: `Restoring ${filePath} (${current}/${total})`,
                });
              },
            }
          );

          filesRestored = restoreResult.filesRestored;
          logger.info("Files restored from previous session", {
            sessionId: session.id,
            previousSessionId,
            filesRestored,
          });
        } catch (restoreError) {
          logger.warn("Failed to restore files from previous session", {
            sessionId: session.id,
            previousSessionId,
            error: restoreError,
          });
          // Continue without restored files - sandbox is still usable
        }
      }
    }

    await dbWrite.insert(appBuilderPrompts).values({
      sandbox_session_id: session.id,
      role: "system",
      content: systemPrompt,
      status: "completed",
      completed_at: new Date(),
    } satisfies NewAppBuilderPrompt);

    const examplePrompts =
      EXAMPLE_PROMPTS[templateType] || EXAMPLE_PROMPTS.blank;

    logger.info("AI App Builder session started", {
      sessionId: session.id,
      sandboxId: sandboxData.sandboxId,
      sandboxUrl: sandboxData.sandboxUrl,
      filesRestored,
    });

    try {
      const backupResult = await sandboxService.backupFiles(
        sandboxData.sandboxId,
        session.id,
        { snapshotType: "auto" }
      );
      logger.info("Initial backup created after session start", {
        sessionId: session.id,
        filesBackedUp: backupResult.filesBackedUp,
        totalSize: backupResult.totalSize,
        filesRestored,
        templateType,
      });
    } catch (backupError) {
      logger.warn("Failed to create initial backup", {
        sessionId: session.id,
        error: backupError,
      });
    }

    const baseSession: BuilderSession = {
      id: session.id,
      sandboxId: sandboxData.sandboxId,
      sandboxUrl: sandboxData.sandboxUrl,
      status: "ready" as BuilderSession["status"],
      messages: [],
      examplePrompts,
      expiresAt: expiresAt.toISOString(),
    };

    if (onSandboxReady) {
      onSandboxReady(baseSession);
    }

    let initialPromptResult: PromptResult | undefined;
    let processedInitialPrompt: string | undefined;

    if (initialPrompt) {
      processedInitialPrompt = initialPrompt;
      logger.info("Executing initial prompt as part of session creation", {
        sessionId: session.id,
        promptLength: initialPrompt.length,
      });

      initialPromptResult = await this.sendPrompt(
        session.id,
        initialPrompt,
        userId,
        { onToolUse, onThinking, abortSignal }
      );

      logger.info("Initial prompt completed", {
        sessionId: session.id,
        success: initialPromptResult.success,
        filesAffected: initialPromptResult.filesAffected.length,
      });
    }

    const finalMessages: BuilderSession["messages"] = [];
    if (initialPromptResult && processedInitialPrompt) {
      finalMessages.push(
        {
          role: "user",
          content: processedInitialPrompt,
          timestamp: new Date().toISOString(),
        },
        {
          role: "assistant",
          content: initialPromptResult.output,
          timestamp: new Date().toISOString(),
        }
      );
    }

    return {
      id: session.id,
      sandboxId: sandboxData.sandboxId,
      sandboxUrl: sandboxData.sandboxUrl,
      status: "ready" as BuilderSession["status"],
      messages: finalMessages,
      examplePrompts,
      expiresAt: expiresAt.toISOString(),
      initialPromptResult,
    };
  }

  async sendPrompt(
    sessionId: string,
    prompt: string,
    userId: string,
    options: {
      onToolUse?: (tool: string, input: unknown, result: string) => void;
      onThinking?: (text: string) => void;
      abortSignal?: AbortSignal;
    } = {}
  ): Promise<PromptResult> {
    logger.info("Sending prompt to AI App Builder", {
      sessionId,
      promptLength: prompt.length,
    });

    const session = await this.verifyOwnership(sessionId, userId);

    if (!session.sandbox_id) throw new Error("Sandbox not available");
    if (session.status !== "ready")
      throw new Error(
        `Session is not ready. Current status: ${session.status}`
      );

    await dbWrite
      .update(appSandboxSessions)
      .set({ status: "generating", updated_at: new Date() })
      .where(eq(appSandboxSessions.id, sessionId));

    const [promptRecord] = await dbWrite
      .insert(appBuilderPrompts)
      .values({
        sandbox_session_id: sessionId,
        role: "user",
        content: prompt,
        status: "processing",
      } satisfies NewAppBuilderPrompt)
      .returning();

    const systemPromptRecord = await dbRead.query.appBuilderPrompts.findFirst({
      where: and(
        eq(appBuilderPrompts.sandbox_session_id, sessionId),
        eq(appBuilderPrompts.role, "system")
      ),
    });

    const startTime = Date.now();
    const result = await sandboxService.executeClaudeCode(
      session.sandbox_id,
      prompt,
      {
        systemPrompt: systemPromptRecord?.content,
        onToolUse: options.onToolUse,
        onThinking: options.onThinking,
        abortSignal: options.abortSignal,
      }
    );
    const durationMs = Date.now() - startTime;

    await dbWrite
      .update(appBuilderPrompts)
      .set({
        status: result.success ? "completed" : "error",
        files_affected: result.filesAffected,
        error_message: result.success ? null : result.output,
        completed_at: new Date(),
        duration_ms: durationMs,
      })
      .where(eq(appBuilderPrompts.id, promptRecord.id));

    await dbWrite.insert(appBuilderPrompts).values({
      sandbox_session_id: sessionId,
      role: "assistant",
      content: result.output,
      files_affected: result.filesAffected,
      status: "completed",
      completed_at: new Date(),
    } satisfies NewAppBuilderPrompt);

    const messages =
      (session.claude_messages as BuilderSession["messages"]) || [];
    messages.push(
      { role: "user", content: prompt, timestamp: new Date().toISOString() },
      {
        role: "assistant",
        content: result.output,
        timestamp: new Date().toISOString(),
      }
    );

    await dbWrite
      .update(appSandboxSessions)
      .set({
        status: "ready",
        claude_messages: messages,
        generated_files: [
          ...((session.generated_files as Array<{
            path: string;
            type: "created" | "modified" | "deleted";
            timestamp: string;
          }>) || []),
          ...result.filesAffected.map((path) => ({
            path,
            type: "modified" as const,
            timestamp: new Date().toISOString(),
          })),
        ],
        updated_at: new Date(),
      })
      .where(eq(appSandboxSessions.id, sessionId));

    logger.info("Prompt completed", {
      sessionId,
      success: result.success,
      filesAffected: result.filesAffected.length,
      durationMs,
    });

    if (result.success && result.filesAffected.length > 0) {
      try {
        await sandboxService.backupFiles(session.sandbox_id, sessionId, {
          snapshotType: "prompt_complete",
          specificFiles: result.filesAffected,
        });
      } catch (backupError) {
        logger.warn("Failed to backup files after prompt", {
          sessionId,
          error: backupError,
        });
      }
    }

    return result;
  }

  async resumeSession(
    sessionId: string,
    userId: string,
    options: {
      onProgress?: (progress: SandboxProgress) => void;
      onRestoreProgress?: (
        current: number,
        total: number,
        filePath: string
      ) => void;
    } = {}
  ): Promise<BuilderSession> {
    logger.info("Resuming session with file restoration", {
      sessionId,
      userId,
    });

    const session = await this.verifyOwnership(sessionId, userId);

    const hasSnapshots = await sandboxService.hasSnapshots(sessionId);
    if (!hasSnapshots) {
      throw new Error(
        "No saved files found to restore. Cannot resume session."
      );
    }

    const snapshotStats = await sandboxService.getSnapshotStats(sessionId);
    logger.info("Snapshot stats for resume", { sessionId, ...snapshotStats });

    await dbWrite
      .update(appSandboxSessions)
      .set({
        status: "initializing",
        status_message: "Creating new sandbox for restoration...",
        updated_at: new Date(),
      })
      .where(eq(appSandboxSessions.id, sessionId));

    options.onProgress?.({
      step: "creating",
      message: "Creating new sandbox...",
    });

    // Determine API URL for sandbox - ELIZA_API_URL required for local dev
    const isLocalDevResume =
      process.env.NEXT_PUBLIC_APP_URL?.includes("localhost") ||
      process.env.NEXT_PUBLIC_APP_URL?.includes("127.0.0.1");
    const resumeApiUrl =
      process.env.ELIZA_API_URL || process.env.NEXT_PUBLIC_APP_URL;

    if (!resumeApiUrl || (isLocalDevResume && !process.env.ELIZA_API_URL)) {
      throw new Error(
        "ELIZA_API_URL environment variable is required for local development. " +
          "Run ngrok and set ELIZA_API_URL to your ngrok URL in .env.local"
      );
    }

    const sandboxData = await sandboxService.create({
      organizationId: session.organization_id,
      projectId: session.app_id || undefined,
      env: session.app_id
        ? {
            NEXT_PUBLIC_ELIZA_API_KEY: await this.getApiKeyForApp(
              session.app_id
            ),
            NEXT_PUBLIC_ELIZA_API_URL: resumeApiUrl,
            NEXT_PUBLIC_ELIZA_APP_ID: session.app_id,
          }
        : undefined,
      onProgress: options.onProgress,
    });

    await dbWrite
      .update(appSandboxSessions)
      .set({
        sandbox_id: sandboxData.sandboxId,
        sandbox_url: sandboxData.sandboxUrl,
        status: "initializing",
        status_message: "Restoring files...",
        updated_at: new Date(),
      })
      .where(eq(appSandboxSessions.id, sessionId));

    options.onProgress?.({
      step: "installing",
      message: "Restoring your files...",
    });

    const restoreResult = await sandboxService.restoreFiles(
      sandboxData.sandboxId,
      sessionId,
      { onProgress: options.onRestoreProgress }
    );

    logger.info("Files restored", {
      sessionId,
      filesRestored: restoreResult.filesRestored,
      errors: restoreResult.errors.length,
    });

    await sandboxService.installDependenciesAndRestart(
      sandboxData.sandboxId,
      options.onProgress
    );
    logger.info("Dependencies installed and dev server restarted", { sessionId });

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await dbWrite
      .update(appSandboxSessions)
      .set({
        status: "ready",
        status_message: null,
        expires_at: expiresAt,
        updated_at: new Date(),
      })
      .where(eq(appSandboxSessions.id, sessionId));

    options.onProgress?.({
      step: "ready",
      message: `Restored ${restoreResult.filesRestored} files!`,
    });

    const examplePrompts =
      EXAMPLE_PROMPTS[session.template_type as keyof typeof EXAMPLE_PROMPTS] ||
      EXAMPLE_PROMPTS.blank;

    return {
      id: session.id,
      sandboxId: sandboxData.sandboxId,
      sandboxUrl: sandboxData.sandboxUrl,
      status: "ready",
      messages: (session.claude_messages as BuilderSession["messages"]) || [],
      examplePrompts,
      expiresAt: expiresAt.toISOString(),
    };
  }

  private async getApiKeyForApp(appId: string): Promise<string> {
    try {
      return await appsService.regenerateApiKey(appId);
    } catch {
      return "";
    }
  }

  async triggerBackup(
    sessionId: string,
    userId: string,
    snapshotType: "auto" | "manual" | "pre_expiry" = "manual"
  ): Promise<{ filesBackedUp: number; totalSize: number }> {
    const session = await this.verifyOwnership(sessionId, userId);
    if (!session.sandbox_id) {
      throw new Error("No active sandbox to backup");
    }
    return sandboxService.backupFiles(session.sandbox_id, sessionId, {
      snapshotType,
    });
  }

  async getSessionSnapshotInfo(
    sessionId: string,
    userId: string
  ): Promise<{
    fileCount: number;
    totalSize: number;
    lastBackup: Date | null;
    canRestore: boolean;
  }> {
    await this.verifyOwnership(sessionId, userId);
    const stats = await sandboxService.getSnapshotStats(sessionId);
    return {
      ...stats,
      canRestore: stats.fileCount > 0,
    };
  }

  async verifySessionOwnership(
    sessionId: string,
    userId: string
  ): Promise<AppSandboxSession> {
    return this.verifyOwnership(sessionId, userId);
  }

  async getSession(
    sessionId: string,
    userId: string
  ): Promise<BuilderSession | null> {
    const session = await this.verifyOwnership(sessionId, userId);

    let currentStatus = session.status;

    if (session.expires_at && new Date(session.expires_at) < new Date()) {
      currentStatus = "timeout";
      await dbWrite
        .update(appSandboxSessions)
        .set({ status: "timeout", updated_at: new Date() })
        .where(eq(appSandboxSessions.id, sessionId));
      logger.info("Session marked as timeout due to expiration", { sessionId });
    } else if (
      session.sandbox_id &&
      currentStatus !== "stopped" &&
      currentStatus !== "timeout"
    ) {
      const sandboxStatus = sandboxService.getStatus(session.sandbox_id);
      if (sandboxStatus === "unknown") {
        currentStatus = "timeout";
        await dbWrite
          .update(appSandboxSessions)
          .set({ status: "timeout", updated_at: new Date() })
          .where(eq(appSandboxSessions.id, sessionId));
        logger.info("Session marked as timeout due to missing sandbox", {
          sessionId,
          sandboxId: session.sandbox_id,
        });
      }
    }

    const prompts = await dbRead.query.appBuilderPrompts.findMany({
      where: eq(appBuilderPrompts.sandbox_session_id, sessionId),
      orderBy: [desc(appBuilderPrompts.created_at)],
    });

    const messages = prompts
      .filter((p) => p.role !== "system")
      .map((p) => ({
        role: p.role as "user" | "assistant",
        content: p.content,
        timestamp: p.created_at.toISOString(),
      }))
      .reverse();

    const templateType =
      (session.template_type as keyof typeof EXAMPLE_PROMPTS) || "blank";
    const examplePrompts =
      EXAMPLE_PROMPTS[templateType] || EXAMPLE_PROMPTS.blank;

    return {
      id: session.id,
      sandboxId: session.sandbox_id || "",
      sandboxUrl: session.sandbox_url || "",
      status: currentStatus as BuilderSession["status"],
      messages,
      examplePrompts,
      expiresAt: session.expires_at?.toISOString() || null,
    };
  }

  async listSessions(
    userId: string,
    options: { limit?: number; includeInactive?: boolean; appId?: string } = {}
  ): Promise<AppSandboxSession[]> {
    const { limit = 10, includeInactive = false, appId } = options;

    const conditions = [eq(appSandboxSessions.user_id, userId)];
    if (appId) {
      conditions.push(eq(appSandboxSessions.app_id, appId));
    }

    const sessions = await dbRead.query.appSandboxSessions.findMany({
      where: conditions.length > 1 ? and(...conditions) : conditions[0],
      orderBy: [desc(appSandboxSessions.created_at)],
      limit,
    });

    if (!includeInactive) {
      return sessions.filter(
        (s) => s.status !== "stopped" && s.status !== "timeout"
      );
    }

    return sessions;
  }

  async extendSession(
    sessionId: string,
    userId: string,
    durationMs: number = 15 * 60 * 1000
  ): Promise<{ expiresAt: Date }> {
    const session = await this.verifyOwnership(sessionId, userId);

    if (!session.sandbox_id) throw new Error("Sandbox not available");

    await sandboxService.extendTimeout(session.sandbox_id, durationMs);

    const currentExpiresAt = session.expires_at
      ? new Date(session.expires_at)
      : new Date();
    const baseTime =
      currentExpiresAt.getTime() > Date.now()
        ? currentExpiresAt.getTime()
        : Date.now();
    const newExpiresAt = new Date(baseTime + durationMs);

    await dbWrite
      .update(appSandboxSessions)
      .set({ expires_at: newExpiresAt, updated_at: new Date() })
      .where(eq(appSandboxSessions.id, sessionId));

    logger.info("Extended session timeout", {
      sessionId,
      previousExpiresAt: currentExpiresAt,
      newExpiresAt,
      addedMs: durationMs,
    });

    return { expiresAt: newExpiresAt };
  }

  async getLogs(
    sessionId: string,
    userId: string,
    tail = 50
  ): Promise<string[]> {
    const session = await this.verifyOwnership(sessionId, userId);
    if (!session.sandbox_id) return [];
    return sandboxService.getLogs(session.sandbox_id, tail);
  }

  async stopSession(sessionId: string, userId: string): Promise<void> {
    const session = await this.verifyOwnership(sessionId, userId);

    if (session.sandbox_id) {
      await sandboxService.stop(session.sandbox_id);
    }

    await dbWrite
      .update(appSandboxSessions)
      .set({
        status: "stopped",
        stopped_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(appSandboxSessions.id, sessionId));

    logger.info("Session stopped", { sessionId });
  }

  /**
   * Reset session status back to "ready" after an error.
   * This allows the user to try sending another prompt.
   */
  async resetSessionStatus(sessionId: string, userId: string): Promise<void> {
    await this.verifyOwnership(sessionId, userId);

    await dbWrite
      .update(appSandboxSessions)
      .set({
        status: "ready",
        updated_at: new Date(),
      })
      .where(eq(appSandboxSessions.id, sessionId));

    logger.info("Session status reset to ready", { sessionId });
  }

  async deploySession(
    _sessionId: string,
    _userId: string,
    _config: { appName: string; appDescription?: string; appUrl?: string }
  ): Promise<{ appId: string; deploymentUrl: string }> {
    throw new Error(
      "Deployment is not yet available. Please use the export feature to download your app code, then deploy manually to your preferred hosting provider."
    );
  }

  async getAppSnapshotInfo(
    appId: string,
    userId: string,
    organizationId: string
  ): Promise<{
    hasSnapshots: boolean;
    fileCount: number;
    totalSize: number;
    lastBackup: Date | null;
    sessionId: string | null;
  }> {
    logger.info("getAppSnapshotInfo called", { appId, userId, organizationId });

    const previousSessionId = await this.findPreviousSessionWithSnapshots(
      appId,
      organizationId
    );

    logger.info("findPreviousSessionWithSnapshots result", { appId, previousSessionId });

    if (!previousSessionId) {
      return {
        hasSnapshots: false,
        fileCount: 0,
        totalSize: 0,
        lastBackup: null,
        sessionId: null,
      };
    }

    const stats = await sandboxService.getSnapshotStats(previousSessionId);
    logger.info("getSnapshotStats result", { previousSessionId, stats });

    return {
      hasSnapshots: stats.fileCount > 0,
      ...stats,
      sessionId: previousSessionId,
    };
  }

  async debugAppSnapshots(
    appId: string,
    organizationId: string
  ): Promise<{
    allSessions: Array<{
      id: string;
      status: string;
      appId: string | null;
      createdAt: Date;
    }>;
    sessionsForThisApp: Array<{
      id: string;
      status: string;
      appId: string | null;
      createdAt: Date;
    }>;
    snapshotsPerSession: Array<{
      sessionId: string;
      snapshotCount: number;
    }>;
  }> {
    const allSessions = await dbRead
      .select({
        id: appSandboxSessions.id,
        status: appSandboxSessions.status,
        appId: appSandboxSessions.app_id,
        organizationId: appSandboxSessions.organization_id,
        createdAt: appSandboxSessions.created_at,
      })
      .from(appSandboxSessions)
      .where(eq(appSandboxSessions.organization_id, organizationId))
      .orderBy(desc(appSandboxSessions.created_at))
      .limit(20);

    const sessionsForThisApp = allSessions.filter((s) => s.appId === appId);

    const snapshotsPerSession: Array<{
      sessionId: string;
      snapshotCount: number;
    }> = [];

    for (const session of sessionsForThisApp) {
      const snapshots = await dbRead
        .select({ id: sessionFileSnapshots.id })
        .from(sessionFileSnapshots)
        .where(eq(sessionFileSnapshots.sandbox_session_id, session.id));

      snapshotsPerSession.push({
        sessionId: session.id,
        snapshotCount: snapshots.length,
      });
    }

    return {
      allSessions: allSessions.map((s) => ({
        id: s.id,
        status: s.status || "unknown",
        appId: s.appId,
        createdAt: s.createdAt,
      })),
      sessionsForThisApp: sessionsForThisApp.map((s) => ({
        id: s.id,
        status: s.status || "unknown",
        appId: s.appId,
        createdAt: s.createdAt,
      })),
      snapshotsPerSession,
    };
  }
}

export const aiAppBuilderService = new AIAppBuilderService();
