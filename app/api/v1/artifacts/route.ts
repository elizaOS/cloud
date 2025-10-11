import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { db } from "@/db/drizzle";
import { artifacts } from "@/db/sass/schema";
import { eq, desc, and } from "drizzle-orm";

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
    const projectArtifacts = await db
      .select()
      .from(artifacts)
      .where(
        and(
          eq(artifacts.organization_id, user.organization_id),
          eq(artifacts.project_id, projectId)
        )
      )
      .orderBy(desc(artifacts.created_at))
      .limit(20);

    return NextResponse.json({
      success: true,
      data: projectArtifacts,
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
