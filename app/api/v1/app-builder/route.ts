import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { aiAppBuilderService } from "@/lib/services/ai-app-builder";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";

const CreateSessionSchema = z.object({
  appId: z.string().uuid().optional(),
  appName: z.string().min(1).max(100).optional(),
  appDescription: z.string().max(500).optional(),
  initialPrompt: z.string().max(2000).optional(),
  templateType: z
    .enum(["chat", "agent-dashboard", "landing-page", "analytics", "blank"])
    .default("blank"),
  includeMonetization: z.boolean().default(false),
  includeAnalytics: z.boolean().default(true),
});

/**
 * GET /api/v1/app-builder
 * List all app builder sessions for the authenticated user
 */
export const GET = withRateLimit(async (request: NextRequest) => {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const includeInactive = searchParams.get("includeInactive") === "true";
    const appId = searchParams.get("appId") || undefined;

    const sessions = await aiAppBuilderService.listSessions(user.id, {
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
  windowMs: 3600000, // 1 hour
  maxRequests: process.env.NODE_ENV === "production" ? 5 : 100, // 5 sessions/hour in prod
};

/**
 * POST /api/v1/app-builder
 * Create a new app builder session
 * Rate limited: 5 sessions per hour per user
 */
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

    const session = await aiAppBuilderService.startSession({
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
