/**
 * AI App Builder Service
 *
 * Orchestrates the AI-powered app building process using
 * Vercel Sandbox and Claude Code CLI.
 */

import { sandboxService, type SandboxSessionData, type SandboxProgress } from "./sandbox";
import { buildSystemPrompt, EXAMPLE_PROMPTS } from "@/lib/config/claude-prompts";
import { logger } from "@/lib/utils/logger";
import { db } from "@/db/client";
import {
  appSandboxSessions,
  appBuilderPrompts,
  appTemplates,
  type AppSandboxSession,
  type NewAppSandboxSession,
  type AppBuilderPrompt,
  type NewAppBuilderPrompt,
} from "@/db/schemas/app-sandboxes";
import { eq, desc } from "drizzle-orm";

export interface BuilderSessionConfig {
  userId: string;
  organizationId: string;
  appId?: string; // For editing existing apps
  appName?: string;
  appDescription?: string;
  initialPrompt?: string;
  templateType?: "chat" | "agent-dashboard" | "landing-page" | "analytics" | "blank";
  includeMonetization?: boolean;
  includeAnalytics?: boolean;
  onProgress?: (progress: SandboxProgress) => void;
}

// Re-export SandboxProgress for consumers
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

/**
 * AI App Builder service for managing app building sessions
 */
export class AIAppBuilderService {
  /**
   * Start a new builder session
   */
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

    logger.info("Starting AI App Builder session", {
      userId,
      templateType,
      appName,
    });

    try {
      // Get template URL if using a template
      let templateUrl: string | undefined;
      if (templateType !== "blank") {
        const template = await db.query.appTemplates.findFirst({
          where: eq(appTemplates.slug, templateType),
        });
        templateUrl = template?.git_repo_url;
      }

      // Create the sandbox
      const sandboxData = await sandboxService.create({
        templateUrl,
        timeout: 30 * 60 * 1000, // 30 minutes
        vcpus: 4,
        env: {
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
        },
        onProgress,
      });

      // Build the system prompt
      const systemPrompt = buildSystemPrompt({
        templateType,
        includeMonetization,
        includeAnalytics,
      });

      // Calculate expiration time
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      // Create the session record
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
          build_config: {
            features: [],
            includeMonetization,
            includeAnalytics,
          },
          claude_messages: [],
          started_at: new Date(),
          expires_at: expiresAt,
        } satisfies NewAppSandboxSession)
        .returning();

      // Store the system prompt as the first message
      await db.insert(appBuilderPrompts).values({
        sandbox_session_id: session.id,
        role: "system",
        content: systemPrompt,
        status: "completed",
        completed_at: new Date(),
      } satisfies NewAppBuilderPrompt);

      // Get example prompts for this template
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
    } catch (error) {
      logger.error("Failed to start AI App Builder session", { error });
      throw error;
    }
  }

  /**
   * Send a prompt to Claude Code in the sandbox
   */
  async sendPrompt(sessionId: string, prompt: string): Promise<PromptResult> {
    logger.info("Sending prompt to AI App Builder", {
      sessionId,
      promptLength: prompt.length,
    });

    // Get the session
    const session = await db.query.appSandboxSessions.findFirst({
      where: eq(appSandboxSessions.id, sessionId),
    });

    if (!session || !session.sandbox_id) {
      throw new Error("Session not found or sandbox not available");
    }

    if (session.status !== "ready") {
      throw new Error(`Session is not ready. Current status: ${session.status}`);
    }

    try {
      // Update session status to generating
      await db
        .update(appSandboxSessions)
        .set({
          status: "generating",
          updated_at: new Date(),
        })
        .where(eq(appSandboxSessions.id, sessionId));

      // Create the prompt record
      const [promptRecord] = await db
        .insert(appBuilderPrompts)
        .values({
          sandbox_session_id: sessionId,
          role: "user",
          content: prompt,
          status: "processing",
        } satisfies NewAppBuilderPrompt)
        .returning();

      // Get the system prompt
      const systemPromptRecord = await db.query.appBuilderPrompts.findFirst({
        where: eq(appBuilderPrompts.sandbox_session_id, sessionId),
        orderBy: [desc(appBuilderPrompts.created_at)],
      });

      // Execute Claude Code
      const startTime = Date.now();
      const result = await sandboxService.executeClaudeCode(
        session.sandbox_id,
        prompt,
        {
          systemPrompt: systemPromptRecord?.content,
        }
      );

      const durationMs = Date.now() - startTime;

      // Update the prompt record with the result
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

      // Add assistant response
      await db.insert(appBuilderPrompts).values({
        sandbox_session_id: sessionId,
        role: "assistant",
        content: result.output,
        files_affected: result.filesAffected,
        status: "completed",
        completed_at: new Date(),
      } satisfies NewAppBuilderPrompt);

      // Update session
      const messages = (session.claude_messages as BuilderSession["messages"]) || [];
      messages.push(
        { role: "user", content: prompt, timestamp: new Date().toISOString() },
        {
          role: "assistant",
          content: result.output,
          timestamp: new Date().toISOString(),
        }
      );

      await db
        .update(appSandboxSessions)
        .set({
          status: "ready",
          claude_messages: messages,
          generated_files: [
            ...(session.generated_files as Array<{
              path: string;
              type: string;
              timestamp: string;
            }>) || [],
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

      return result;
    } catch (error) {
      // Update session status to error
      await db
        .update(appSandboxSessions)
        .set({
          status: "error",
          status_message: error instanceof Error ? error.message : "Unknown error",
          updated_at: new Date(),
        })
        .where(eq(appSandboxSessions.id, sessionId));

      logger.error("Prompt execution failed", { sessionId, error });
      throw error;
    }
  }

  /**
   * Get session details
   */
  async getSession(sessionId: string): Promise<BuilderSession | null> {
    const session = await db.query.appSandboxSessions.findFirst({
      where: eq(appSandboxSessions.id, sessionId),
    });

    if (!session) {
      return null;
    }

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

  /**
   * List sessions for a user
   */
  async listSessions(
    userId: string,
    options: { limit?: number; includeInactive?: boolean } = {}
  ): Promise<AppSandboxSession[]> {
    const { limit = 10, includeInactive = false } = options;

    const conditions = [eq(appSandboxSessions.user_id, userId)];

    const sessions = await db.query.appSandboxSessions.findMany({
      where: eq(appSandboxSessions.user_id, userId),
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

  /**
   * Extend session timeout
   */
  async extendSession(sessionId: string, durationMs: number = 15 * 60 * 1000): Promise<void> {
    const session = await db.query.appSandboxSessions.findFirst({
      where: eq(appSandboxSessions.id, sessionId),
    });

    if (!session || !session.sandbox_id) {
      throw new Error("Session not found");
    }

    await sandboxService.extendTimeout(session.sandbox_id, durationMs);

    const newExpiresAt = new Date(Date.now() + durationMs);
    await db
      .update(appSandboxSessions)
      .set({
        expires_at: newExpiresAt,
        updated_at: new Date(),
      })
      .where(eq(appSandboxSessions.id, sessionId));

    logger.info("Extended session timeout", { sessionId, newExpiresAt });
  }

  /**
   * Stop a session and cleanup the sandbox
   */

  async getLogs(sessionId: string, tail: number = 50): Promise<string[]> {
    const session = await this.getSession(sessionId);
    if (!session) return [];
    return sandboxService.getLogs(session.sandboxId, tail);
  }
  async stopSession(sessionId: string): Promise<void> {
    const session = await db.query.appSandboxSessions.findFirst({
      where: eq(appSandboxSessions.id, sessionId),
    });

    if (!session) {
      throw new Error("Session not found");
    }

    if (session.sandbox_id) {
      await sandboxService.stop(session.sandbox_id);
    }

    await db
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
   * Deploy the app from sandbox to production
   * Creates a new App record and deploys to Vercel
   */
  async deploySession(
    sessionId: string,
    config: {
      appName: string;
      appDescription?: string;
      appUrl?: string;
    }
  ): Promise<{ appId: string; deploymentUrl: string }> {
    const session = await db.query.appSandboxSessions.findFirst({
      where: eq(appSandboxSessions.id, sessionId),
    });

    if (!session || !session.sandbox_id) {
      throw new Error("Session not found or sandbox not available");
    }

    // TODO: Implement deployment logic
    // 1. Export files from sandbox
    // 2. Create Git repository
    // 3. Deploy to Vercel
    // 4. Create App record in database

    logger.info("Deploying session", { sessionId, appName: config.appName });

    throw new Error("Deployment not yet implemented");
  }
}

// Export singleton instance
export const aiAppBuilderService = new AIAppBuilderService();
