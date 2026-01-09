import { NextRequest, NextResponse } from "next/server";
import { dbRead } from "@/db/client";
import { apps } from "@/db/schemas/apps";
import { eq, and } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/v1/apps/[id]/public
 * 
 * Get public information about an app.
 * No authentication required - used for OAuth authorization screens.
 * 
 * Only returns non-sensitive information like name, description, logo.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const [app] = await dbRead
      .select({
        id: apps.id,
        name: apps.name,
        description: apps.description,
        logo_url: apps.logo_url,
        website_url: apps.website_url,
        is_active: apps.is_active,
        is_approved: apps.is_approved,
      })
      .from(apps)
      .where(
        and(
          eq(apps.id, id),
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

    return NextResponse.json({
      success: true,
      app: {
        id: app.id,
        name: app.name,
        description: app.description,
        logo_url: app.logo_url,
        website_url: app.website_url,
      },
    });
  } catch (error) {
    logger.error("Failed to get public app info:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to get app info",
      },
      { status: 500 },
    );
  }
}
