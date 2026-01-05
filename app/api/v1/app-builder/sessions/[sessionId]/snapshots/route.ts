import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { aiAppBuilder } from "@/lib/services/ai-app-builder";
import { appsService } from "@/lib/services/apps";
import { githubReposService } from "@/lib/services/github-repos";
import { logger } from "@/lib/utils/logger";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { sessionId } = await params;

    const session = await aiAppBuilder.verifySessionOwnership(sessionId, user.id);

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      );
    }

    let canRestore = false;
    let fileCount = 0;
    let totalSize = 0;
    let lastBackup: string | null = null;
    let githubRepo: string | null = null;

    if (session.app_id) {
      const app = await appsService.getById(session.app_id);

      if (app?.github_repo) {
        githubRepo = app.github_repo;
        canRestore = true;

        try {
          const repoName = app.github_repo.split("/").pop() || app.github_repo;
          const commits = await githubReposService.listCommits(repoName, { limit: 1 });

          if (commits.length > 0) {
            lastBackup = commits[0].date;
          }

          const repoInfo = await githubReposService.getRepoInfo(repoName);
          if (repoInfo) {
            fileCount = 1;
            totalSize = 0;
          }
        } catch (repoError) {
          logger.warn("Failed to fetch repo info for snapshots", {
            sessionId,
            appId: session.app_id,
            githubRepo: app.github_repo,
            error: repoError instanceof Error ? repoError.message : "Unknown error",
          });
        }

        logger.info("Session has Git-based storage available", {
          sessionId,
          appId: session.app_id,
          githubRepo: app.github_repo,
        });
      }
    }

    return NextResponse.json({
      success: true,
      fileCount,
      totalSize,
      canRestore,
      lastBackup,
      githubRepo,
      storageType: githubRepo ? "git" : "none",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get snapshot info";
    const status =
      message.includes("Unauthorized") || message.includes("Authentication")
        ? 401
        : message.includes("Access denied") || message.includes("don't own")
          ? 403
          : message.includes("not found")
            ? 404
            : 500;

    logger.error("Failed to get session snapshots", {
      error: message,
    });

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
