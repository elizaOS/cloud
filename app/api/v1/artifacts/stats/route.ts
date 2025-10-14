import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getArtifactStats } from "@/lib/services/artifact-cleanup";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/artifacts/stats
 * Get artifact statistics for the user's organization
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(request);

    const stats = await getArtifactStats(user.organization_id);

    return NextResponse.json({
      success: true,
      data: {
        ...stats,
        totalSizeMB: (stats.totalSizeBytes / 1024 / 1024).toFixed(2),
      },
    });
  } catch (error) {
    console.error("Error getting artifact stats:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get stats",
      },
      { status: 500 },
    );
  }
}
