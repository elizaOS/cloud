import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { appsService } from "@/lib/services/apps";
import { logger } from "@/lib/utils/logger";

/**
 * GET /api/v1/apps/[id]/analytics/requests
 * Gets detailed request logs and statistics for an app.
 *
 * Query Parameters:
 * - `view`: "logs" | "stats" | "visitors" | "timeline" (default: "stats")
 * - `period`: "hourly" | "daily" | "monthly" (for timeline view)
 * - `start_date`: Start date for filtering (ISO string)
 * - `end_date`: End date for filtering (ISO string)
 * - `request_type`: Filter by type (chat, image, etc.)
 * - `source`: Filter by source (api_key, sandbox_preview, embed)
 * - `limit`: Number of records (default: 50)
 * - `offset`: Pagination offset (default: 0)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    const existingApp = await appsService.getById(id);

    if (!existingApp) {
      return NextResponse.json(
        { success: false, error: "App not found" },
        { status: 404 },
      );
    }

    if (existingApp.organization_id !== user.organization_id) {
      return NextResponse.json(
        { success: false, error: "Access denied" },
        { status: 403 },
      );
    }

    const view = searchParams.get("view") || "stats";
    const startDate = searchParams.get("start_date")
      ? new Date(searchParams.get("start_date")!)
      : undefined;
    const endDate = searchParams.get("end_date")
      ? new Date(searchParams.get("end_date")!)
      : undefined;
    const requestType = searchParams.get("request_type") || undefined;
    const source = searchParams.get("source") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    switch (view) {
      case "logs": {
        const result = await appsService.getRecentRequests(id, {
          limit,
          offset,
          requestType,
          source,
          startDate,
          endDate,
        });
        return NextResponse.json({
          success: true,
          requests: result.requests,
          total: result.total,
          pagination: { limit, offset },
        });
      }

      case "visitors": {
        const visitors = await appsService.getTopVisitors(
          id,
          limit,
          startDate,
          endDate,
        );
        return NextResponse.json({
          success: true,
          visitors,
        });
      }

      case "timeline": {
        const periodType = (searchParams.get("period") || "daily") as
          | "hourly"
          | "daily"
          | "monthly";
        const timelineStart = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const timelineEnd = endDate || new Date();

        const timeline = await appsService.getRequestsOverTime(
          id,
          periodType,
          timelineStart,
          timelineEnd,
        );
        return NextResponse.json({
          success: true,
          timeline,
          period: {
            type: periodType,
            start: timelineStart.toISOString(),
            end: timelineEnd.toISOString(),
          },
        });
      }

      case "stats":
      default: {
        const stats = await appsService.getRequestStats(id, startDate, endDate);
        return NextResponse.json({
          success: true,
          stats,
        });
      }
    }
  } catch (error) {
    logger.error("Failed to get app request analytics:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get request analytics",
      },
      { status: 500 },
    );
  }
}
