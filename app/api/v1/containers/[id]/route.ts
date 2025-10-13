import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import {
  getContainer,
  deleteContainer,
  updateContainerStatus,
} from "@/lib/queries/containers";
import { getCloudflareService } from "@/lib/services/cloudflare";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/containers/[id]
 * Get a specific container by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireAuthOrApiKey(request);

    const container = await getContainer(id, user.organization_id);

    if (!container) {
      return NextResponse.json(
        {
          success: false,
          error: "Container not found",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: container,
    });
  } catch (error) {
    console.error("Error fetching container:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch container",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/v1/containers/[id]
 * Delete a container and remove it from Cloudflare
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireAuthOrApiKey(request);

    // Get container details
    const container = await getContainer(id, user.organization_id);

    if (!container) {
      return NextResponse.json(
        {
          success: false,
          error: "Container not found",
        },
        { status: 404 },
      );
    }

    // Update status to deleting
    await updateContainerStatus(id, "deleting");

    // Delete from Cloudflare if it exists
    if (container.cloudflare_worker_id) {
      try {
        const cloudflare = getCloudflareService();
        await cloudflare.deleteContainer(container.cloudflare_worker_id);
      } catch (error) {
        console.error("Error deleting from Cloudflare:", error);
        // Continue with database deletion even if Cloudflare deletion fails
      }
    }

    // Delete from database
    const deleted = await deleteContainer(id, user.organization_id);

    if (!deleted) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to delete container",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Container deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting container:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to delete container",
      },
      { status: 500 },
    );
  }
}

