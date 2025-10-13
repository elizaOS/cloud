import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getContainer } from "@/lib/queries/containers";
import { db } from "@/db/drizzle";
import { usageRecords } from "@/db/sass/schema";
import { eq, and, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/containers/[id]/deployments
 * Get deployment history for a specific container
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

    // Get deployment history from usage records
    const deployments = await db
      .select({
        id: usageRecords.id,
        type: usageRecords.type,
        provider: usageRecords.provider,
        cost: usageRecords.input_cost,
        is_successful: usageRecords.is_successful,
        error_message: usageRecords.error_message,
        metadata: usageRecords.metadata,
        created_at: usageRecords.created_at,
        duration_ms: usageRecords.duration_ms,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.organization_id, user.organization_id),
          eq(usageRecords.type, "container_deployment")
        )
      )
      .orderBy(desc(usageRecords.created_at))
      .limit(50);

    // Filter for this specific container
    const containerDeployments = deployments.filter(
      (d) => d.metadata?.container_id === id || d.metadata?.container_name === container.name
    );

    // Enhance with container status snapshots
    const enhancedHistory = containerDeployments.map((deployment) => ({
      id: deployment.id,
      status: deployment.is_successful ? "success" : "failed",
      cost: deployment.cost,
      error: deployment.error_message,
      metadata: {
        container_id: deployment.metadata?.container_id,
        container_name: deployment.metadata?.container_name,
        max_instances: deployment.metadata?.max_instances,
        port: deployment.metadata?.port,
        image_tag: container.image_tag,
        cloudflare_worker_id: container.cloudflare_worker_id,
      },
      deployed_at: deployment.created_at,
      duration_ms: deployment.duration_ms,
    }));

    return NextResponse.json({
      success: true,
      data: {
        container: {
          id: container.id,
          name: container.name,
          current_status: container.status,
          cloudflare_url: container.cloudflare_url,
        },
        deployments: enhancedHistory,
        total: enhancedHistory.length,
      },
    });
  } catch (error) {
    console.error("Error fetching deployment history:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch deployment history",
      },
      { status: 500 }
    );
  }
}

