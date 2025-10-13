import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getContainerHealthStatus } from "@/lib/services/health-monitor";
import { db } from "@/db/drizzle";
import { containers } from "@/db/sass/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/containers/[id]/health
 * Get health status for a specific container
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuthOrApiKey(request);
    const { id: containerId } = await params;

    // Verify container belongs to user's organization
    const container = await db
      .select()
      .from(containers)
      .where(eq(containers.id, containerId))
      .limit(1);

    if (container.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Container not found",
        },
        { status: 404 }
      );
    }

    if (container[0].organization_id !== user.organization_id) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized access to container",
        },
        { status: 403 }
      );
    }

    // Perform health check
    const healthStatus = await getContainerHealthStatus(containerId);

    if (!healthStatus) {
      return NextResponse.json(
        {
          success: false,
          error: "Unable to perform health check - container may not have a URL",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        containerId: healthStatus.containerId,
        healthy: healthStatus.healthy,
        statusCode: healthStatus.statusCode,
        responseTime: healthStatus.responseTime,
        error: healthStatus.error,
        checkedAt: healthStatus.checkedAt,
        containerStatus: container[0].status,
        lastHealthCheck: container[0].last_health_check,
      },
    });
  } catch (error) {
    console.error("Error checking container health:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to check container health",
      },
      { status: 500 }
    );
  }
}

