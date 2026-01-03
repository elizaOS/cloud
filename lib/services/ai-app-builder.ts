import { sandboxService, type SandboxProgress } from "./sandbox";
import { getExamplePrompts } from "@/lib/fragments/prompt";
import { logger } from "@/lib/utils/logger";
import { dbRead, dbWrite } from "@/db/client";
import {
  appSandboxSessions,
  appBuilderPrompts,
  type AppSandboxSession,
} from "@/db/schemas/app-sandboxes";
import { apps } from "@/db/schemas/apps";
import { eq } from "drizzle-orm";
import { githubReposService, generateRepoName } from "./github-repos";

/**
 * AI App Builder Service
 * 
 * Uses GitHub for storage:
 * - Each app = one private GitHub repo
 * - Changes saved via git commit + push
 * - Restore = git clone
 * - Version history = git commits
 */

const EXAMPLE_PROMPTS: Record<string, string[]> = {
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
  onSandboxReady?: (session: BuilderSession) => void;
}

export type { SandboxProgress };

export interface BuilderSession {
  id: string;
  sandboxId: string;
  sandboxUrl: string;
  status: AppSandboxSession["status"];
  repoName: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string; timestamp: string }>;
  examplePrompts: string[];
  expiresAt: string | null;
}

export interface PromptResult {
  success: boolean;
  output: string;
  filesAffected: string[];
  commitSha?: string;
  error?: string;
}

export class AIAppBuilderService {
  async createSession(config: BuilderSessionConfig): Promise<BuilderSession> {
    const {
      userId,
      organizationId,
      appId,
      appName,
      appDescription,
      initialPrompt,
      templateType = "blank",
      includeMonetization = false,
      includeAnalytics = false,
      onProgress,
      onSandboxReady,
    } = config;

    logger.info("Creating app builder session", { userId, templateType });

    // Get or generate repo name
    const repoName = appId
      ? await this.getRepoName(appId)
      : generateRepoName(appName || `app-${Date.now()}`);

    // Create app if needed
    let finalAppId = appId;
    if (!finalAppId && appName) {
      const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
      const [app] = await dbWrite
        .insert(apps)
        .values({
          name: appName,
          slug: `${slug}-${Date.now()}`,
          description: appDescription,
          organization_id: organizationId,
          created_by_user_id: userId,
          app_url: "",
          github_repo: repoName,
        })
        .returning();
      finalAppId = app.id;
    }

    if (!finalAppId) {
      throw new Error("App ID required");
    }

    // Create session
    const [session] = await dbWrite
      .insert(appSandboxSessions)
      .values({
        user_id: userId,
        organization_id: organizationId,
        app_id: finalAppId,
        app_name: appName,
        app_description: appDescription,
        initial_prompt: initialPrompt,
        template_type: templateType,
        status: "initializing",
        build_config: { includeMonetization, includeAnalytics },
      })
      .returning();

    try {
      // Create repo if needed
      const repoExists = await githubReposService.getRepoInfo(repoName);
      if (!repoExists) {
        onProgress?.({ step: "creating", message: "Creating GitHub repository..." });
        await githubReposService.createAppRepo({
          name: repoName,
          description: appDescription || `ElizaCloud App: ${appName}`,
          isPrivate: true,
        });
      }

      // Create sandbox
      onProgress?.({ step: "creating", message: "Starting sandbox..." });
      const sandboxData = await sandboxService.create({
        repoName,
        timeout: 30 * 60 * 1000,
        vcpus: 4,
        env: { NEXT_PUBLIC_ELIZA_APP_ID: finalAppId },
        onProgress,
      });

      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      // Update session
      await dbWrite
        .update(appSandboxSessions)
        .set({
          sandbox_id: sandboxData.sandboxId,
          sandbox_url: sandboxData.sandboxUrl,
          status: "ready",
          started_at: new Date(),
          expires_at: expiresAt,
        })
        .where(eq(appSandboxSessions.id, session.id));

      // Update app URL
      await dbWrite
        .update(apps)
        .set({ app_url: sandboxData.sandboxUrl })
        .where(eq(apps.id, finalAppId));

      const builderSession: BuilderSession = {
        id: session.id,
        sandboxId: sandboxData.sandboxId,
        sandboxUrl: sandboxData.sandboxUrl,
        status: "ready",
        repoName,
        messages: [],
        examplePrompts: EXAMPLE_PROMPTS[templateType] || [],
        expiresAt: expiresAt.toISOString(),
      };

      onSandboxReady?.(builderSession);

      if (initialPrompt) {
        await this.processPrompt(session.id, userId, initialPrompt);
      }

      return builderSession;
    } catch (error) {
      await dbWrite
        .update(appSandboxSessions)
        .set({ status: "error", status_message: String(error) })
        .where(eq(appSandboxSessions.id, session.id));
      throw error;
    }
  }

  async resumeSession(
    sessionId: string,
    userId: string,
    onProgress?: (progress: SandboxProgress) => void
  ): Promise<BuilderSession> {
    const session = await this.verifyOwnership(sessionId, userId);

    if (!session.app_id) {
      throw new Error("Session has no associated app");
    }

    const app = await dbRead.query.apps.findFirst({
      where: eq(apps.id, session.app_id),
    });

    if (!app?.github_repo) {
      throw new Error("App has no GitHub repository");
    }

    logger.info("Resuming session", { sessionId, repoName: app.github_repo });
    onProgress?.({ step: "creating", message: "Resuming from GitHub..." });

    const sandboxData = await sandboxService.create({
      repoName: app.github_repo,
      timeout: 30 * 60 * 1000,
      vcpus: 4,
      env: { NEXT_PUBLIC_ELIZA_APP_ID: session.app_id },
      onProgress,
    });

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await dbWrite
      .update(appSandboxSessions)
      .set({
        sandbox_id: sandboxData.sandboxId,
        sandbox_url: sandboxData.sandboxUrl,
        status: "ready",
        started_at: new Date(),
        expires_at: expiresAt,
      })
      .where(eq(appSandboxSessions.id, sessionId));

    const prompts = await dbRead.query.appBuilderPrompts.findMany({
      where: eq(appBuilderPrompts.sandbox_session_id, sessionId),
      orderBy: (p, { asc }) => [asc(p.created_at)],
    });

    return {
      id: sessionId,
      sandboxId: sandboxData.sandboxId,
      sandboxUrl: sandboxData.sandboxUrl,
      status: "ready",
      repoName: app.github_repo,
      messages: prompts.map((p) => ({
        role: p.role,
        content: p.content,
        timestamp: p.created_at.toISOString(),
      })),
      examplePrompts: EXAMPLE_PROMPTS[session.template_type as string] || [],
      expiresAt: expiresAt.toISOString(),
    };
  }

  async processPrompt(sessionId: string, userId: string, prompt: string): Promise<PromptResult> {
    const session = await this.verifyOwnership(sessionId, userId);

    if (!session.sandbox_id) {
      throw new Error("No active sandbox");
    }

    await dbWrite
      .update(appSandboxSessions)
      .set({ status: "generating" })
      .where(eq(appSandboxSessions.id, sessionId));

    await dbWrite.insert(appBuilderPrompts).values({
      sandbox_session_id: sessionId,
      role: "user",
      content: prompt,
      status: "completed",
    });

    try {
      // Placeholder for AI processing
      const result = { output: `Processed: ${prompt}`, filesAffected: [] as string[] };

      let commitSha = "";
      if (result.filesAffected.length > 0) {
        const commit = await sandboxService.commitAndPush(
          session.sandbox_id,
          `AI: ${prompt.slice(0, 50)}...`
        );
        commitSha = commit.commitSha;
      }

      await dbWrite.insert(appBuilderPrompts).values({
        sandbox_session_id: sessionId,
        role: "assistant",
        content: result.output,
        files_affected: result.filesAffected,
        commit_sha: commitSha || null,
        status: "completed",
      });

      await dbWrite
        .update(appSandboxSessions)
        .set({ status: "ready", last_commit_sha: commitSha || session.last_commit_sha })
        .where(eq(appSandboxSessions.id, sessionId));

      return { success: true, output: result.output, filesAffected: result.filesAffected, commitSha };
    } catch (error) {
      await dbWrite
        .update(appSandboxSessions)
        .set({ status: "ready" })
        .where(eq(appSandboxSessions.id, sessionId));

      return { success: false, output: "", filesAffected: [], error: String(error) };
    }
  }

  async getSession(sessionId: string, userId: string): Promise<BuilderSession | null> {
    const session = await this.verifyOwnership(sessionId, userId);

    const app = session.app_id
      ? await dbRead.query.apps.findFirst({ where: eq(apps.id, session.app_id) })
      : null;

    const prompts = await dbRead.query.appBuilderPrompts.findMany({
      where: eq(appBuilderPrompts.sandbox_session_id, sessionId),
      orderBy: (p, { asc }) => [asc(p.created_at)],
    });

    return {
      id: session.id,
      sandboxId: session.sandbox_id || "",
      sandboxUrl: session.sandbox_url || "",
      status: session.status,
      repoName: app?.github_repo || "",
      messages: prompts.map((p) => ({
        role: p.role,
        content: p.content,
        timestamp: p.created_at.toISOString(),
      })),
      examplePrompts: EXAMPLE_PROMPTS[session.template_type as string] || [],
      expiresAt: session.expires_at?.toISOString() || null,
    };
  }

  async getVersionHistory(sessionId: string, userId: string) {
    const session = await this.verifyOwnership(sessionId, userId);
    if (!session.app_id) return [];

    const app = await dbRead.query.apps.findFirst({ where: eq(apps.id, session.app_id) });
    if (!app?.github_repo) return [];

    return githubReposService.listCommits(app.github_repo, { limit: 50 });
  }

  async stopSession(sessionId: string, userId: string): Promise<void> {
    const session = await this.verifyOwnership(sessionId, userId);

    if (session.sandbox_id) {
      try {
        await sandboxService.commitAndPush(session.sandbox_id, "Auto-save before session end");
      } catch {
        // Ignore
      }
      await sandboxService.stop(session.sandbox_id);
    }

    await dbWrite
      .update(appSandboxSessions)
      .set({ status: "stopped", stopped_at: new Date() })
      .where(eq(appSandboxSessions.id, sessionId));
  }

  private async verifyOwnership(sessionId: string, userId: string): Promise<AppSandboxSession> {
    const session = await dbRead.query.appSandboxSessions.findFirst({
      where: eq(appSandboxSessions.id, sessionId),
    });
    if (!session) throw new Error("Session not found");
    if (session.user_id !== userId) throw new Error("Access denied");
    return session;
  }

  private async getRepoName(appId: string): Promise<string> {
    const app = await dbRead.query.apps.findFirst({ where: eq(apps.id, appId) });
    return app?.github_repo || generateRepoName(app?.slug || appId);
  }
}

export const aiAppBuilder = new AIAppBuilderService();
