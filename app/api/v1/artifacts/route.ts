import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { artifactsService } from "@/lib/services";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/artifacts
 * List artifacts for a project
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(request);
    
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    
    if (!projectId) {
      return NextResponse.json(
        {
          success: false,
          error: "projectId query parameter is required",
        },
        { status: 400 }
      );
    }

    // Fetch artifacts for the project
    const projectArtifacts = await artifactsService.listByProject(
      user.organization_id,
      projectId,
    );

    return NextResponse.json({
      success: true,
      data: projectArtifacts.slice(0, 20), // Limit to 20 most recent
    });
  } catch (error) {
    console.error("Error fetching artifacts:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch artifacts",
      },
      { status: 500 }
    );
  }
}
