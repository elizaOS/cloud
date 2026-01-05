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
  type AppSandboxSession,
  type NewAppSandboxSession,
  type NewAppBuilderPrompt,
} from "@/db/schemas/app-sandboxes";
import { eq, desc, and } from "drizzle-orm";
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

    // Determine API URL for sandbox
    // For local dev: use postMessage proxy bridge (no ngrok required!)
    // For production: use direct API URL
    const isLocalDev =
      process.env.NEXT_PUBLIC_APP_URL?.includes("localhost") ||
      process.env.NEXT_PUBLIC_APP_URL?.includes("127.0.0.1");

    const sandboxEnv: Record<string, string> = {};
    
    if (isLocalDev) {
      // Local development: Use postMessage proxy bridge
      // The sandbox will embed an iframe to /sandbox-proxy which forwards API calls to localhost
      const localServerUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      sandboxEnv.NEXT_PUBLIC_ELIZA_PROXY_URL = localServerUrl;
      
      // If ELIZA_API_URL is explicitly set (e.g., ngrok), use it as a direct API URL instead
      if (process.env.ELIZA_API_URL) {
        sandboxEnv.NEXT_PUBLIC_ELIZA_API_URL = process.env.ELIZA_API_URL;
        delete sandboxEnv.NEXT_PUBLIC_ELIZA_PROXY_URL; // Don't use proxy if direct URL is set
      }
      
      logger.info("Local dev mode: using postMessage proxy bridge", {
        proxyUrl: sandboxEnv.NEXT_PUBLIC_ELIZA_PROXY_URL,
        directUrl: sandboxEnv.NEXT_PUBLIC_ELIZA_API_URL,
      });
    } else {
      // Production: Use direct API URL
      const apiUrl = process.env.ELIZA_API_URL || process.env.NEXT_PUBLIC_APP_URL;
      if (apiUrl) {
        sandboxEnv.NEXT_PUBLIC_ELIZA_API_URL = apiUrl;
      }
    }

    if (appApiKey) {
      sandboxEnv.NEXT_PUBLIC_ELIZA_API_KEY = appApiKey;
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
    });

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
        updated_at: new Date(),
      })
      .where(eq(appSandboxSessions.id, sessionId));

    logger.info("Prompt completed", {
      sessionId,
      success: result.success,
      filesAffected: result.filesAffected.length,
      durationMs,
    });

    return result;
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

}

export const aiAppBuilderService = new AIAppBuilderService();
// Alias for backwards compatibility with existing imports
export const aiAppBuilder = aiAppBuilderService;
