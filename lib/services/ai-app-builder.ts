import { sandboxService, type SandboxProgress } from "./sandbox";
import { buildFullAppPrompt, getExamplePrompts, type FullAppTemplateType } from "@/lib/fragments/prompt";
import { logger } from "@/lib/utils/logger";
import { db } from "@/db/client";
import {
  appSandboxSessions,
  appBuilderPrompts,
  appTemplates,
  type AppSandboxSession,
  type NewAppSandboxSession,
  type NewAppBuilderPrompt,
} from "@/db/schemas/app-sandboxes";
import { eq, desc } from "drizzle-orm";

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
  templateType?: "chat" | "agent-dashboard" | "landing-page" | "analytics" | "blank";
  includeMonetization?: boolean;
  includeAnalytics?: boolean;
  onProgress?: (progress: SandboxProgress) => void;
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
}

export interface PromptResult {
  success: boolean;
  output: string;
  filesAffected: string[];
  error?: string;
}

export class AIAppBuilderService {
  private async verifyOwnership(sessionId: string, userId: string): Promise<AppSandboxSession> {
    const session = await db.query.appSandboxSessions.findFirst({
      where: eq(appSandboxSessions.id, sessionId),
    });

    if (!session) throw new Error("Session not found");
    if (session.user_id !== userId) throw new Error("Access denied: You don't own this session");

    return session;
  }

  async startSession(config: BuilderSessionConfig): Promise<BuilderSession> {
    const {
      userId,
      organizationId,
      appId,
      appName,
      appDescription,
      initialPrompt,
      templateType = "blank",
      includeMonetization = false,
      includeAnalytics = true,
      onProgress,
    } = config;

    logger.info("Starting AI App Builder session", { userId, templateType, appName });

    let templateUrl: string | undefined;
    if (templateType !== "blank") {
      const template = await db.query.appTemplates.findFirst({
        where: eq(appTemplates.slug, templateType),
      });
      templateUrl = template?.git_repo_url;
    }

    const sandboxData = await sandboxService.create({
      templateUrl,
      timeout: 30 * 60 * 1000,
      vcpus: 4,
      organizationId,
      projectId: appId,
      onProgress,
    });

    const systemPrompt = buildFullAppPrompt({
      templateType: templateType as FullAppTemplateType,
      includeMonetization,
      includeAnalytics,
    });

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const [session] = await db
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

    await db.insert(appBuilderPrompts).values({
      sandbox_session_id: session.id,
      role: "system",
      content: systemPrompt,
      status: "completed",
      completed_at: new Date(),
    } satisfies NewAppBuilderPrompt);

    const examplePrompts = EXAMPLE_PROMPTS[templateType] || EXAMPLE_PROMPTS.blank;

    logger.info("AI App Builder session started", {
      sessionId: session.id,
      sandboxId: sandboxData.sandboxId,
      sandboxUrl: sandboxData.sandboxUrl,
    });

    return {
      id: session.id,
      sandboxId: sandboxData.sandboxId,
      sandboxUrl: sandboxData.sandboxUrl,
      status: session.status as BuilderSession["status"],
      messages: [],
      examplePrompts,
    };
  }

  async sendPrompt(
    sessionId: string,
    prompt: string,
    userId: string,
    options: { onToolUse?: (tool: string, input: unknown, result: string) => void; onThinking?: (text: string) => void } = {}
  ): Promise<PromptResult> {
    logger.info("Sending prompt to AI App Builder", { sessionId, promptLength: prompt.length });

    const session = await this.verifyOwnership(sessionId, userId);

    if (!session.sandbox_id) throw new Error("Sandbox not available");
    if (session.status !== "ready") throw new Error(`Session is not ready. Current status: ${session.status}`);

    await db
      .update(appSandboxSessions)
      .set({ status: "generating", updated_at: new Date() })
      .where(eq(appSandboxSessions.id, sessionId));

    const [promptRecord] = await db
      .insert(appBuilderPrompts)
      .values({
        sandbox_session_id: sessionId,
        role: "user",
        content: prompt,
        status: "processing",
      } satisfies NewAppBuilderPrompt)
      .returning();

    const systemPromptRecord = await db.query.appBuilderPrompts.findFirst({
      where: eq(appBuilderPrompts.sandbox_session_id, sessionId),
      orderBy: [desc(appBuilderPrompts.created_at)],
    });

    const startTime = Date.now();
    const result = await sandboxService.executeClaudeCode(session.sandbox_id, prompt, {
      systemPrompt: systemPromptRecord?.content,
      onToolUse: options.onToolUse,
      onThinking: options.onThinking,
    });
    const durationMs = Date.now() - startTime;

    await db
      .update(appBuilderPrompts)
      .set({
        status: result.success ? "completed" : "error",
        files_affected: result.filesAffected,
        error_message: result.success ? null : result.output,
        completed_at: new Date(),
        duration_ms: durationMs,
      })
      .where(eq(appBuilderPrompts.id, promptRecord.id));

    await db.insert(appBuilderPrompts).values({
      sandbox_session_id: sessionId,
      role: "assistant",
      content: result.output,
      files_affected: result.filesAffected,
      status: "completed",
      completed_at: new Date(),
    } satisfies NewAppBuilderPrompt);

    const messages = (session.claude_messages as BuilderSession["messages"]) || [];
    messages.push(
      { role: "user", content: prompt, timestamp: new Date().toISOString() },
      { role: "assistant", content: result.output, timestamp: new Date().toISOString() }
    );

    await db
      .update(appSandboxSessions)
      .set({
        status: "ready",
        claude_messages: messages,
        generated_files: [
          ...(session.generated_files as Array<{ path: string; type: "created" | "modified" | "deleted"; timestamp: string }>) || [],
          ...result.filesAffected.map((path) => ({ path, type: "modified" as const, timestamp: new Date().toISOString() })),
        ],
        updated_at: new Date(),
      })
      .where(eq(appSandboxSessions.id, sessionId));

    logger.info("Prompt completed", { sessionId, success: result.success, filesAffected: result.filesAffected.length, durationMs });

    return result;
  }

  async verifySessionOwnership(sessionId: string, userId: string): Promise<AppSandboxSession> {
    return this.verifyOwnership(sessionId, userId);
  }

  async getSession(sessionId: string, userId: string): Promise<BuilderSession | null> {
    const session = await this.verifyOwnership(sessionId, userId);

    const prompts = await db.query.appBuilderPrompts.findMany({
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

    const templateType = (session.template_type as keyof typeof EXAMPLE_PROMPTS) || "blank";
    const examplePrompts = EXAMPLE_PROMPTS[templateType] || EXAMPLE_PROMPTS.blank;

    return {
      id: session.id,
      sandboxId: session.sandbox_id || "",
      sandboxUrl: session.sandbox_url || "",
      status: session.status as BuilderSession["status"],
      messages,
      examplePrompts,
    };
  }

  async listSessions(userId: string, options: { limit?: number; includeInactive?: boolean } = {}): Promise<AppSandboxSession[]> {
    const { limit = 10, includeInactive = false } = options;

    const sessions = await db.query.appSandboxSessions.findMany({
      where: eq(appSandboxSessions.user_id, userId),
      orderBy: [desc(appSandboxSessions.created_at)],
      limit,
    });

    if (!includeInactive) {
      return sessions.filter((s) => s.status !== "stopped" && s.status !== "timeout");
    }

    return sessions;
  }

  async extendSession(sessionId: string, userId: string, durationMs: number = 15 * 60 * 1000): Promise<void> {
    const session = await this.verifyOwnership(sessionId, userId);

    if (!session.sandbox_id) throw new Error("Sandbox not available");

    await sandboxService.extendTimeout(session.sandbox_id, durationMs);

    const newExpiresAt = new Date(Date.now() + durationMs);
    await db
      .update(appSandboxSessions)
      .set({ expires_at: newExpiresAt, updated_at: new Date() })
      .where(eq(appSandboxSessions.id, sessionId));

    logger.info("Extended session timeout", { sessionId, newExpiresAt });
  }

  async getLogs(sessionId: string, userId: string, tail: number = 50): Promise<string[]> {
    const session = await this.verifyOwnership(sessionId, userId);
    if (!session.sandbox_id) return [];
    return sandboxService.getLogs(session.sandbox_id, tail);
  }

  async stopSession(sessionId: string, userId: string): Promise<void> {
    const session = await this.verifyOwnership(sessionId, userId);

    if (session.sandbox_id) {
      await sandboxService.stop(session.sandbox_id);
    }

    await db
      .update(appSandboxSessions)
      .set({ status: "stopped", stopped_at: new Date(), updated_at: new Date() })
      .where(eq(appSandboxSessions.id, sessionId));

    logger.info("Session stopped", { sessionId });
  }

  /**
   * Deploy a sandbox session to production
   * 
   * @experimental This feature is not yet available.
   * Currently in development - use export/download instead.
   */
  async deploySession(
    _sessionId: string,
    _userId: string,
    _config: { appName: string; appDescription?: string; appUrl?: string }
  ): Promise<{ appId: string; deploymentUrl: string }> {
    throw new Error(
      "Deployment is not yet available. Please use the export feature to download your app code, then deploy manually to your preferred hosting provider."
    );
  }
}

export const aiAppBuilderService = new AIAppBuilderService();
