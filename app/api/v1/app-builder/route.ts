import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { aiAppBuilderService as aiAppBuilder } from "@/lib/services/ai-app-builder";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

const CreateSessionSchema = z.object({
  appId: z.string().uuid().optional(),
  appName: z.string().min(1).max(100).optional(),
  appDescription: z.string().max(500).optional(),
  initialPrompt: z.string().max(2000).optional(),
  templateType: z
    .enum([
      "chat",
      "agent-dashboard",
      "landing-page",
      "analytics",
      "blank",
      "mcp-service",
      "a2a-agent",
    ])
    .default("blank"),
  includeMonetization: z.boolean().default(false),
  includeAnalytics: z.boolean().default(true),
});

export const GET = withRateLimit(async (request: NextRequest) => {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const searchParams = request.nextUrl.searchParams;
    const appId = searchParams.get("appId") || undefined;
    const checkSnapshots = searchParams.get("checkSnapshots") === "true";

    if (checkSnapshots && appId) {
      logger.info("Checking snapshots for app", { appId, userId: user.id, organizationId: user.organization_id });

      const debugInfo = searchParams.get("debug") === "true";

      const snapshotInfo = await aiAppBuilder.getAppSnapshotInfo(
        appId,
        user.id,
        user.organization_id
      );
      logger.info("Snapshot info result", { appId, snapshotInfo });

      if (debugInfo) {
        const debugData = await aiAppBuilder.debugAppSnapshots(
          appId,
          user.organization_id
        );
        return NextResponse.json({
          success: true,
          snapshotInfo,
          debug: debugData,
        });
      }

      return NextResponse.json({
        success: true,
        snapshotInfo,
      });
    }

    const rawLimit = parseInt(searchParams.get("limit") || "10", 10);
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 10 : rawLimit, 1), 100);
    const includeInactive = searchParams.get("includeInactive") === "true";

    const sessions = await aiAppBuilder.listSessions(user.id, {
      limit,
      includeInactive,
      appId,
    });

    return NextResponse.json({
      success: true,
      sessions: sessions.map((s) => ({
        id: s.id,
        sandboxId: s.sandbox_id,
        sandboxUrl: s.sandbox_url,
        status: s.status,
        appName: s.app_name,
        templateType: s.template_type,
        createdAt: s.created_at,
        expiresAt: s.expires_at,
      })),
    });
  } catch (error) {
    logger.error("Failed to list app builder sessions", { error });
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to list sessions",
      },
      { status: 500 },
    );
  }
}, RateLimitPresets.STANDARD);

const SESSION_CREATE_LIMIT = {
  windowMs: 3600000,
  maxRequests: process.env.NODE_ENV === "production" ? 5 : 100,
};

export const POST = withRateLimit(async (request: NextRequest) => {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const body = await request.json();
    const validationResult = CreateSessionSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: validationResult.error.format(),
        },
        { status: 400 },
      );
    }

    const data = validationResult.data;

    const session = await aiAppBuilder.startSession({
      userId: user.id,
      organizationId: user.organization_id,
      appId: data.appId,
      appName: data.appName,
      appDescription: data.appDescription,
      initialPrompt: data.initialPrompt,
      templateType: data.templateType,
      includeMonetization: data.includeMonetization,
      includeAnalytics: data.includeAnalytics,
    });

    logger.info("Created app builder session", {
      sessionId: session.id,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      session: {
        id: session.id,
        sandboxId: session.sandboxId,
        sandboxUrl: session.sandboxUrl,
        status: session.status,
        examplePrompts: session.examplePrompts,
      },
    });
  } catch (error) {
    logger.error("Failed to create app builder session", { error });
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create session",
      },
      { status: 500 },
    );
  }
}, SESSION_CREATE_LIMIT);
