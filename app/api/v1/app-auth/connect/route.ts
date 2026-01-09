import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { dbRead, dbWrite } from "@/db/client";
import { users } from "@/db/schemas/users";
import { apps, appUsers } from "@/db/schemas/apps";
import { eq, and } from "drizzle-orm";
import { verifyAuthTokenCached } from "@/lib/auth";
import { z } from "zod";

const ConnectSchema = z.object({
  appId: z.string().uuid(),
});

/**
 * POST /api/v1/app-auth/connect
 * 
 * Record a user-app connection during OAuth authorization.
 * Creates or updates the app_users record to track users who have
 * authorized the app.
 * 
 * Headers:
 * - Authorization: Bearer <token>
 * 
 * Body:
 * - appId: UUID of the app being authorized
 */
export async function POST(request: NextRequest) {
  try {
    // Get auth token
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Authorization header required" },
        { status: 401 },
      );
    }
    
    const token = authHeader.slice(7);
    
    // Verify the token with Privy
    const verifiedClaims = await verifyAuthTokenCached(token);
    
    if (!verifiedClaims) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired token" },
        { status: 401 },
      );
    }
    
    // Parse and validate body
    const body = await request.json();
    const validationResult = ConnectSchema.safeParse(body);
    
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
    
    const { appId } = validationResult.data;
    
    // Get user from database
    const [user] = await dbRead
      .select({
        id: users.id,
      })
      .from(users)
      .where(eq(users.privy_id, verifiedClaims.userId))
      .limit(1);
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 },
      );
    }
    
    // Verify app exists and is active
    const [app] = await dbRead
      .select({
        id: apps.id,
        name: apps.name,
      })
      .from(apps)
      .where(
        and(
          eq(apps.id, appId),
          eq(apps.is_active, true),
          eq(apps.is_approved, true),
        ),
      )
      .limit(1);
    
    if (!app) {
      return NextResponse.json(
        { success: false, error: "App not found" },
        { status: 404 },
      );
    }
    
    // Check if user-app connection already exists
    const [existingConnection] = await dbRead
      .select({
        id: appUsers.id,
      })
      .from(appUsers)
      .where(
        and(
          eq(appUsers.app_id, appId),
          eq(appUsers.user_id, user.id),
        ),
      )
      .limit(1);
    
    if (existingConnection) {
      // Update last_seen_at
      await dbWrite
        .update(appUsers)
        .set({
          last_seen_at: new Date(),
        })
        .where(eq(appUsers.id, existingConnection.id));
      
      logger.info("Updated app user connection", {
        userId: user.id,
        appId,
      });
    } else {
      // Create new connection
      await dbWrite.insert(appUsers).values({
        app_id: appId,
        user_id: user.id,
        signup_source: "oauth",
        ip_address: request.headers.get("x-forwarded-for")?.split(",")[0] || null,
        user_agent: request.headers.get("user-agent") || null,
      });
      
      // Increment app's total_users count
      await dbWrite
        .update(apps)
        .set({
          total_users: (app as any).total_users + 1,
        })
        .where(eq(apps.id, appId));
      
      logger.info("Created new app user connection", {
        userId: user.id,
        appId,
      });
    }
    
    return NextResponse.json({
      success: true,
      message: "Connected successfully",
    });
  } catch (error) {
    logger.error("App auth connect error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Connection failed",
      },
      { status: 500 },
    );
  }
}
