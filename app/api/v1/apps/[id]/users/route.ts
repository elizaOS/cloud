import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { appsService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/v1/apps/[id]/users
 * Get users for a specific app
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuthWithOrg();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!)
      : undefined;

    // Verify the app exists and belongs to the user's organization
    const existingApp = await appsService.getById(id);

    if (!existingApp) {
      return NextResponse.json(
        {
          success: false,
          error: "App not found",
        },
        { status: 404 },
      );
    }

    if (existingApp.organization_id !== user.organization_id) {
      return NextResponse.json(
        {
          success: false,
          error: "Access denied",
        },
        { status: 403 },
      );
    }

    // Get app users
    const appUsers = await appsService.getAppUsers(id, limit);

    return NextResponse.json({
      success: true,
      users: appUsers,
      total: appUsers.length,
    });
  } catch (error) {
    logger.error("Failed to get app users:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to get app users",
      },
      { status: 500 },
    );
  }
}
