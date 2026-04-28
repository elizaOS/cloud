import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { dbRead } from "@/db/client";
import { apps } from "@/db/schemas/apps";
import { nextJsonFromCaughtErrorWithHeaders } from "@/lib/api/errors";
import { requireAuthOrApiKey } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-App-Id, X-Request-ID",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * GET /api/v1/app-auth/session
 *
 * Returns the current user (id, email, name, avatar, created_at) for an
 * authenticated request. Accepts Privy or Steward JWT or an API key.
 * If X-App-Id is supplied, the referenced app is also returned.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(request);

    const appId = request.headers.get("X-App-Id");
    let appInfo: { id: string; name: string } | null = null;
    if (appId) {
      const [app] = await dbRead
        .select({ id: apps.id, name: apps.name })
        .from(apps)
        .where(eq(apps.id, appId))
        .limit(1);
      if (app) appInfo = app;
    }

    logger.info("App auth session verified", { userId: user.id, appId });

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          createdAt: user.created_at,
        },
        app: appInfo,
      },
      { headers: CORS_HEADERS },
    );
  } catch (error) {
    logger.error("App auth session error:", error);
    return nextJsonFromCaughtErrorWithHeaders(error, CORS_HEADERS);
  }
}
