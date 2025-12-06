import { NextRequest, NextResponse } from "next/server";
import { requireAuthWithOrg } from "@/lib/auth";
import { appsService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/v1/apps/[id]/analytics
 * Get analytics for a specific app
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuthWithOrg();
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const periodType = (searchParams.get("period") || "daily") as
      | "hourly"
      | "daily"
      | "monthly";
    const startDate = searchParams.get("start_date")
      ? new Date(searchParams.get("start_date")!)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: 30 days ago
    const endDate = searchParams.get("end_date")
      ? new Date(searchParams.get("end_date")!)
      : new Date(); // Default: now

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

    // Get analytics
    const analytics = await appsService.getAnalytics(
      id,
      periodType,
      startDate,
      endDate,
    );

    // Get total stats
    const totalStats = await appsService.getTotalStats(id);

    return NextResponse.json({
      success: true,
      analytics,
      totalStats,
      period: {
        type: periodType,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    });
  } catch (error) {
    logger.error("Failed to get app analytics:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get app analytics",
      },
      { status: 500 },
    );
  }
}
