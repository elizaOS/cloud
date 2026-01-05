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
  // DEPRECATED: sessionFileSnapshots - File storage now uses GitHub repos
  // sessionFileSnapshots,
  type AppSandboxSession,
  type NewAppSandboxSession,
  type NewAppBuilderPrompt,
} from "@/db/schemas/app-sandboxes";
import { eq, desc, and, isNotNull, sql } from "drizzle-orm";
import { appsService } from "./apps";
import { githubReposService } from "./github-repos";

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
   * DEPRECATED: DB-based file snapshots are no longer used.
   * File storage is now handled via GitHub repos (see github-repos.ts).
   * Each app has its own GitHub repository for version control.
   *
   * To restore files for an existing app, the app's github_repo should be used
   * as the templateUrl when creating a new sandbox.
   */
  private async findPreviousSessionWithSnapshots(
    appId: string,
    organizationId: string,
    excludeSessionId?: string
  ): Promise<string | null> {
    logger.info("findPreviousSessionWithSnapshots: DEPRECATED - File storage now uses GitHub repos", {
      appId,
      organizationId,
      excludeSessionId,
      migration: "Use app.github_repo as templateUrl when creating sandbox",
    });

    // DB-based snapshots are deprecated - return null
    // File restoration should be done via git clone from app's GitHub repo
    return null;
  }

  /* ===========================================================================
   * DEPRECATED: DB-BASED findPreviousSessionWithSnapshots - Kept for reference
   * ===========================================================================
  private async findPreviousSessionWithSnapshots_DEPRECATED(
    appId: string,
    organizationId: string,
    excludeSessionId?: string
  ): Promise<string | null> {
    const conditions = [
      eq(appSandboxSessions.app_id, appId),
      eq(appSandboxSessions.organization_id, organizationId),
    ];

    if (excludeSessionId) {
      conditions.push(sql\`\${appSandboxSessions.id} != \${excludeSessionId}\`);
    }

    const sessionsWithSnapshots = await dbRead
      .select({
        sessionId: appSandboxSessions.id,
        snapshotCount: sql<number>\`count(\${sessionFileSnapshots.id})\`.as("snapshot_count"),
      })
      .from(appSandboxSessions)
      .leftJoin(sessionFileSnapshots, eq(sessionFileSnapshots.sandbox_session_id, appSandboxSessions.id))
      .where(and(...conditions))
      .groupBy(appSandboxSessions.id)
      .having(sql\`count(\${sessionFileSnapshots.id}) > 0\`)
      .orderBy(desc(appSandboxSessions.created_at))
      .limit(1);

    if (sessionsWithSnapshots.length === 0) return null;
    return sessionsWithSnapshots[0].sessionId;
  }
  */

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

      try {
        const repoName = githubReposService.generateRepoName(app.id, app.slug);
        const repoInfo = await githubReposService.createAppRepo({
          name: repoName,
          description: `ElizaCloud App: ${appName}`,
          isPrivate: true,
        });

        await appsService.update(app.id, {
          github_repo: repoInfo.fullName,
        });

        logger.info("Created GitHub repo for app", {
          appId: app.id,
          githubRepo: repoInfo.fullName,
        });
      } catch (repoError) {
        logger.error("Failed to create GitHub repo for app", {
          appId: app.id,
          error: repoError instanceof Error ? repoError.message : "Unknown error",
        });
      }
    } else if (appId) {
      appApiKey = await appsService.regenerateApiKey(appId);
      logger.info("Regenerated API key for existing app", { appId });
    }

    let templateUrl: string | undefined;
    if (templateType !== "blank") {
      const template = await dbRead.query.appTemplates.findFirst({
        where: eq(appTemplates.slug, templateType),
      });

      if (template?.github_repo) {
        templateUrl = `https://github.com/${template.github_repo}.git`;
        logger.info("Using template from database", {
          templateType,
          githubRepo: template.github_repo,
          templateUrl,
        });
      } else {
        logger.info(
          "Template not found in database, using prompt-based template guidance",
          { templateType }
        );
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

    // ===========================================================================
    // GIT-BASED STORAGE: File restoration is now done via git clone.
    // When creating a sandbox for an existing app with a github_repo, the repo
    // URL is passed as templateUrl to sandboxService.create().
    // The old DB-based snapshot restore logic below is commented out.
    // ===========================================================================
    const filesRestored = 0; // Files are restored via git clone, not DB snapshots

    /* DEPRECATED: DB-BASED FILE RESTORATION
    if (appId) {
      const previousSessionId = await this.findPreviousSessionWithSnapshots(
        appId,
        organizationId,
        session.id
      );
      if (previousSessionId) {
        // ... DB-based restore logic ...
      }
    }
    */

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

    // ===========================================================================
    // GIT-BASED STORAGE: Initial backup is deprecated.
    // Files are persisted via git commits to the app's GitHub repo.
    // ===========================================================================
    /* DEPRECATED: DB-BASED INITIAL BACKUP
    const maxInitialBackupAttempts = 2;
    const initialBackupRetryDelayMs = 1500;
    let initialBackupSuccess = false;

    for (let attempt = 1; attempt <= maxInitialBackupAttempts && !initialBackupSuccess; attempt++) {
      try {
        const backupResult = await sandboxService.backupFiles(sandboxData.sandboxId, session.id, { snapshotType: "auto" });
        // ... DB-based backup logic ...
      } catch (backupError) {
        // ... error handling ...
      }
    }
    */

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

    // ===========================================================================
    // GIT-BASED STORAGE: Post-prompt backup is deprecated.
    // Files are persisted via git commits to the app's GitHub repo.
    // ===========================================================================
    if (result.filesAffected.length > 0) {
      logger.info("GIT-BASED STORAGE: Files affected by prompt - use git commit to persist", {
        sessionId,
        filesAffected: result.filesAffected,
        migration: "Use git add && git commit to persist changes to app.github_repo",
      });
    }

    /* DEPRECATED: DB-BASED POST-PROMPT BACKUP
    if (result.filesAffected.length > 0) {
      const maxBackupAttempts = 3;
      for (let backupAttempt = 1; backupAttempt <= maxBackupAttempts; backupAttempt++) {
        try {
          const backupResult = await sandboxService.backupFiles(session.sandbox_id, sessionId, {
            snapshotType: "prompt_complete",
            specificFiles: result.filesAffected,
          });
          // ... DB-based backup logic ...
        } catch (backupError) {
          // ... error handling ...
        }
      }
    }
    */

    return result;
  }

  // ===========================================================================
  // GIT-BASED STORAGE: resumeSession now uses GitHub repos for file restoration.
  // Files are restored by cloning the app's GitHub repo when creating the sandbox.
  // ===========================================================================
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
    logger.info("Resuming session with Git-based file restoration", {
      sessionId,
      userId,
    });

    const session = await this.verifyOwnership(sessionId, userId);

    // GIT-BASED STORAGE: Get the app's GitHub repo for file restoration
    let templateUrl: string | undefined;
    let filesCanBeRestored = false;

    if (session.app_id) {
      const app = await appsService.getById(session.app_id);

      if (app?.github_repo) {
        templateUrl = githubReposService.getAuthenticatedCloneUrl(app.github_repo);
        filesCanBeRestored = true;
        logger.info("Using GitHub repo for file restoration", {
          sessionId,
          appId: session.app_id,
          githubRepo: app.github_repo,
        });
      } else if (app) {
        logger.info("App has no GitHub repo, creating one now", {
          sessionId,
          appId: session.app_id,
        });

        try {
          const repoName = githubReposService.generateRepoName(app.id, app.slug);
          const repoInfo = await githubReposService.createAppRepo({
            name: repoName,
            description: `ElizaCloud App: ${app.name}`,
            isPrivate: true,
          });

          await appsService.update(app.id, {
            github_repo: repoInfo.fullName,
          });

          logger.info("Created GitHub repo for existing app", {
            appId: app.id,
            githubRepo: repoInfo.fullName,
          });

          options.onProgress?.({
            step: "creating",
            message: "Created repository for future backups. Starting fresh session...",
          });
        } catch (repoError) {
          logger.warn("Failed to create GitHub repo for existing app", {
            appId: app.id,
            error: repoError instanceof Error ? repoError.message : "Unknown error",
          });
        }
      }
    }

    if (!filesCanBeRestored) {
      logger.info("No files to restore - starting fresh session", { sessionId });
      options.onProgress?.({
        step: "creating",
        message: "No backup found. Starting fresh session...",
      });
    }

    await dbWrite
      .update(appSandboxSessions)
      .set({
        status: "initializing",
        status_message: "Creating new sandbox and cloning repository...",
        updated_at: new Date(),
      })
      .where(eq(appSandboxSessions.id, sessionId));

    options.onProgress?.({
      step: "creating",
      message: "Creating new sandbox and cloning repository...",
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

    // GIT-BASED STORAGE: Pass templateUrl to clone the app's GitHub repo
    const sandboxData = await sandboxService.create({
      organizationId: session.organization_id,
      projectId: session.app_id || undefined,
      templateUrl, // Clone from GitHub repo
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
        status_message: "Installing dependencies...",
        updated_at: new Date(),
      })
      .where(eq(appSandboxSessions.id, sessionId));

    options.onProgress?.({
      step: "installing",
      message: "Installing dependencies...",
    });

    logger.info("Files restored via git clone", {
      sessionId,
      templateUrl: templateUrl ? "***" : undefined, // Don't log full URL with token
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
      message: "Session restored from Git repository!",
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

  // ===========================================================================
  // GIT-BASED STORAGE: triggerBackup is deprecated.
  // Use git commit to persist changes to the app's GitHub repo.
  // ===========================================================================
  async triggerBackup(
    sessionId: string,
    userId: string,
    snapshotType: "auto" | "manual" | "pre_expiry" = "manual"
  ): Promise<{ filesBackedUp: number; totalSize: number }> {
    await this.verifyOwnership(sessionId, userId);
    logger.info("triggerBackup: DEPRECATED - Use git commit to persist changes", {
      sessionId,
      snapshotType,
      migration: "Use git add && git commit && git push to persist changes to app.github_repo",
    });
    // Return empty result - backup is now done via git commits
    return { filesBackedUp: 0, totalSize: 0 };
  }

  // ===========================================================================
  // GIT-BASED STORAGE: getSessionSnapshotInfo is deprecated.
  // Use git log to view file history in the app's GitHub repo.
  // ===========================================================================
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
    logger.info("getSessionSnapshotInfo: DEPRECATED - Use git log to view file history", {
      sessionId,
      migration: "Use githubReposService.listCommits() for version history",
    });
    // Return empty stats - use git history instead
    return {
      fileCount: 0,
      totalSize: 0,
      lastBackup: null,
      canRestore: false,
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

  async getVersionHistory(
    sessionId: string,
    userId: string
  ): Promise<Array<{
    sha: string;
    message: string;
    author: string;
    date: string;
    url: string;
  }>> {
    const session = await this.verifyOwnership(sessionId, userId);

    if (!session.app_id) {
      logger.info("getVersionHistory: No app associated with session", { sessionId });
      return [];
    }

    const app = await appsService.getById(session.app_id);
    if (!app?.github_repo) {
      logger.info("getVersionHistory: No GitHub repo for app", { sessionId, appId: session.app_id });
      return [];
    }

    try {
      const repoName = app.github_repo.split("/").pop() || app.github_repo;
      const commits = await githubReposService.listCommits(repoName, { limit: 20 });
      return commits;
    } catch (error) {
      logger.warn("getVersionHistory: Failed to fetch commits", {
        sessionId,
        appId: session.app_id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return [];
    }
  }

  // ===========================================================================
  // GIT-BASED STORAGE: getAppSnapshotInfo now checks for GitHub repo instead.
  // Returns info about whether the app has a GitHub repo for version control.
  // ===========================================================================
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
    githubRepo?: string;
  }> {
    logger.info("getAppSnapshotInfo: Checking for GitHub repo", { appId, userId, organizationId });

    // GIT-BASED STORAGE: Check if app has a GitHub repo
    const app = await appsService.getById(appId);

    if (app?.github_repo) {
      logger.info("getAppSnapshotInfo: App has GitHub repo for version control", {
        appId,
        githubRepo: app.github_repo,
      });

      // Return info indicating Git-based storage is available
      return {
        hasSnapshots: true, // Has GitHub repo = can restore
        fileCount: 0, // Use git to get actual file count
        totalSize: 0, // Use git to get actual size
        lastBackup: null, // Use git log to get last commit
        sessionId: null,
        githubRepo: app.github_repo,
      };
    }

    logger.info("getAppSnapshotInfo: No GitHub repo found for app", { appId });
    return {
      hasSnapshots: false,
      fileCount: 0,
      totalSize: 0,
      lastBackup: null,
      sessionId: null,
    };
  }

  // ===========================================================================
  // GIT-BASED STORAGE: debugAppSnapshots is deprecated.
  // DB-based snapshots are no longer used - use GitHub repo for version control.
  // ===========================================================================
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
    message: string;
  }> {
    logger.info("debugAppSnapshots: DEPRECATED - DB snapshots no longer used", {
      appId,
      organizationId,
      migration: "Use GitHub repo and git history for version control",
    });

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

    // DB-based snapshots are deprecated - return empty snapshot counts
    const snapshotsPerSession = sessionsForThisApp.map((s) => ({
      sessionId: s.id,
      snapshotCount: 0, // DB snapshots deprecated
    }));

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
      message: "DEPRECATED: DB-based snapshots are no longer used. Use GitHub repo and git history for version control.",
    };
  }
}

export const aiAppBuilderService = new AIAppBuilderService();

// Export alias for backward compatibility
export const aiAppBuilder = aiAppBuilderService;
