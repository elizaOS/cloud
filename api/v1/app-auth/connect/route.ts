import { and, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dbRead, dbWrite } from "@/db/client";
import { apps, appUsers } from "@/db/schemas/apps";
import { NotFoundError, nextJsonFromCaughtErrorWithHeaders } from "@/lib/api/errors";
import { requireAuthOrApiKey } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-App-Id, X-Request-ID",
  "Access-Control-Max-Age": "86400",
};

const ConnectSchema = z.object({
  appId: z.string().uuid(),
});

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * POST /api/v1/app-auth/connect
 *
 * Record a user-app connection during authorization. Accepts either a Privy
 * or Steward JWT (or API key) via the Authorization header.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(request);

    const body = await request.json();
    const parsed = ConnectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: parsed.error.format(),
        },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const { appId } = parsed.data;

    const [app] = await dbRead
      .select({ id: apps.id, name: apps.name })
      .from(apps)
      .where(and(eq(apps.id, appId), eq(apps.is_active, true), eq(apps.is_approved, true)))
      .limit(1);

    if (!app) {
      throw new NotFoundError("App not found");
    }

    const [existingConnection] = await dbRead
      .select({ id: appUsers.id })
      .from(appUsers)
      .where(and(eq(appUsers.app_id, appId), eq(appUsers.user_id, user.id)))
      .limit(1);

    if (existingConnection) {
      await dbWrite
        .update(appUsers)
        .set({ last_seen_at: new Date() })
        .where(eq(appUsers.id, existingConnection.id));

      logger.info("Updated app user connection", { userId: user.id, appId });
    } else {
      await dbWrite.insert(appUsers).values({
        app_id: appId,
        user_id: user.id,
        signup_source: "oauth",
        ip_address: request.headers.get("x-forwarded-for")?.split(",")[0] || null,
        user_agent: request.headers.get("user-agent") || null,
      });

      await dbWrite
        .update(apps)
        .set({ total_users: sql`COALESCE(${apps.total_users}, 0) + 1` })
        .where(eq(apps.id, appId));

      logger.info("Created new app user connection", { userId: user.id, appId });
    }

    return NextResponse.json(
      { success: true, message: "Connected successfully" },
      { headers: CORS_HEADERS },
    );
  } catch (error) {
    logger.error("App auth connect error:", error);
    return nextJsonFromCaughtErrorWithHeaders(error, CORS_HEADERS);
  }
}
