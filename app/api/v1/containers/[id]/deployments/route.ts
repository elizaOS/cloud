import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { containersService } from "@/lib/services/containers";
import { usageRecordsRepository } from "@/db/repositories/usage-records";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/containers/[id]/deployments
 * Retrieves deployment history for a specific container from usage records.
 *
 * @param request - The Next.js request object.
 * @param params - Route parameters containing the container ID.
 * @returns Deployment history with status, costs, and metadata.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    // Verify container belongs to user's organization
    const container = await containersService.getById(
      id,
      user.organization_id!,
    );

    if (!container) {
      return NextResponse.json(
        {
          success: false,
          error: "Container not found",
        },
        { status: 404 },
      );
    }

    // Get deployment history from usage records
    // Note: This needs a custom query since we're filtering by type and metadata
    // For now, we'll use the repository's list method and filter in memory
    // A better approach would be to add a specific repository method for this
    const allRecords = await usageRecordsRepository.listByOrganization(
      user.organization_id!,
      50,
    );

    // Filter for container deployments
    const deployments = allRecords.filter(
      (record) => record.type === "container_deployment",
    );

    // Filter for this specific container
    const containerDeployments = deployments.filter(
      (d) =>
        (d.metadata as Record<string, string> | null)?.container_id === id ||
        (d.metadata as Record<string, string> | null)?.container_name ===
          container.name,
    );

    // Enhance with container status snapshots
    const enhancedHistory = containerDeployments.map((deployment) => ({
      id: deployment.id,
      status: deployment.is_successful ? "success" : "failed",
      cost: deployment.input_cost,
      error: deployment.error_message,
      metadata: {
        container_id: (deployment.metadata as Record<string, string> | null)
          ?.container_id,
        container_name: (deployment.metadata as Record<string, string> | null)
          ?.container_name,
        desired_count: (deployment.metadata as Record<string, string> | null)
          ?.desired_count,
        cpu: (deployment.metadata as Record<string, string> | null)?.cpu,
        memory: (deployment.metadata as Record<string, string> | null)?.memory,
        port: (deployment.metadata as Record<string, string> | null)?.port,
        image_tag: container.image_tag,
        ecs_service_arn: container.ecs_service_arn,
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
          load_balancer_url: container.load_balancer_url,
          ecs_service_arn: container.ecs_service_arn,
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
      { status: 500 },
    );
  }
}
