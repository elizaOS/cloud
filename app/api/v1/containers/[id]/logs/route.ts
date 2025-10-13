import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getContainer } from "@/lib/queries/containers";
import { getCloudflareService } from "@/lib/services/cloudflare";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/containers/[id]/logs
 * Get container logs from Cloudflare
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireAuthOrApiKey(request);

    // Verify container belongs to user's organization
    const container = await getContainer(id, user.organization_id);

    if (!container) {
      return NextResponse.json(
        {
          success: false,
          error: "Container not found",
        },
        { status: 404 }
      );
    }

    // Check if container has a Cloudflare worker ID
    if (!container.cloudflare_worker_id) {
      return NextResponse.json(
        {
          success: false,
          error: "Container has not been deployed to Cloudflare yet",
        },
        { status: 400 }
      );
    }

    // Get logs from Cloudflare
    const cloudflare = getCloudflareService();
    const rawLogs = await cloudflare.getContainerLogs(container.cloudflare_worker_id);

    // Parse query parameters for filtering
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "100");
    const levelFilter = searchParams.get("level"); // error, warn, info, debug
    const since = searchParams.get("since"); // ISO timestamp

    // Parse logs if they're strings (convert to structured format)
    // Cloudflare may return logs as strings or objects depending on API version
    const logs: Array<{ timestamp: string; level: string; message: string; metadata?: Record<string, unknown> }> = 
      rawLogs.map((log) => {
        if (typeof log === 'string') {
          // Simple string logs - parse or return as-is
          return {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: log,
          };
        }
        // Already structured
        return log as { timestamp: string; level: string; message: string; metadata?: Record<string, unknown> };
      });

    // Filter logs
    let filteredLogs = logs;

    if (since) {
      const sinceDate = new Date(since);
      filteredLogs = filteredLogs.filter((log) => {
        const logDate = new Date(log.timestamp || 0);
        return logDate >= sinceDate;
      });
    }

    if (levelFilter) {
      filteredLogs = filteredLogs.filter((log) => log.level === levelFilter);
    }

    const limitedLogs = filteredLogs.slice(0, limit);

    return NextResponse.json({
      success: true,
      data: {
        container: {
          id: container.id,
          name: container.name,
          status: container.status,
          cloudflare_worker_id: container.cloudflare_worker_id,
        },
        logs: limitedLogs,
        total: limitedLogs.length,
        available: logs.length,
        filters: {
          limit,
          level: levelFilter,
          since,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching container logs:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch container logs",
      },
      { status: 500 }
    );
  }
}

