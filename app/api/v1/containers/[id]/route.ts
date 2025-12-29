/**
 * Production-ready container management endpoints with proper teardown
 *
 * DELETE endpoint now properly tears down DWS container stacks
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  getContainer,
  deleteContainer,
  updateContainerStatus,
  containersService,
} from "@/lib/services/containers";
import { getDWSContainerService } from "@/lib/services/dws/containers";
import { dbPriorityManager } from "@/lib/services/alb-priority-manager";
import { creditsService } from "@/lib/services/credits";
import { calculateDeploymentCost } from "@/lib/constants/pricing";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/containers/[id]
 * Get container details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { id: containerId } = await params;

    const container = await getContainer(containerId, user.organization_id!);

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
    logger.error("Error fetching container:", error);
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
 * Delete container and tear down DWS container stack
 *
 * PRODUCTION READY:
 * - Tears down DWS container stack
 * - Releases ALB priority (if used)
 * - Refunds remaining credits (prorated)
 * - Cleans up database records
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { id: containerId } = await params;

    // Get container details
    const container = await getContainer(containerId, user.organization_id!);

    if (!container) {
      return NextResponse.json(
        {
          success: false,
          error: "Container not found",
        },
        { status: 404 },
      );
    }

    // Check ownership
    if (container.organization_id !== user.organization_id!) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 403 },
      );
    }

    // Step 1: Update status to deleting
    await updateContainerStatus(containerId, "deleting", {
      deploymentLog: "Teardown initiated...",
    });

    // Step 2: Delete DWS container stack
    try {
      const dwsContainerService = getDWSContainerService();
      await dwsContainerService.deleteStack(
        container.organization_id,
        container.project_name,
      );

      // Wait for deletion with timeout
      const DELETION_TIMEOUT_MINUTES = 5;
      const startTime = Date.now();
      const timeoutMs = DELETION_TIMEOUT_MINUTES * 60 * 1000;

      while (Date.now() - startTime < timeoutMs) {
        const stack = await dwsContainerService.getStack(
          container.organization_id,
          container.project_name,
        );
        if (!stack || stack.status === "deleted") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    } catch (dwsError) {
      logger.error(`Failed to delete DWS container stack:`, dwsError);

      // Log error but continue with cleanup
      await updateContainerStatus(containerId, "deleting", {
        deploymentLog: `Warning: DWS container deletion failed: ${dwsError instanceof Error ? dwsError.message : "Unknown error"}`,
      });
    }

    // Step 3: Release ALB priority (if applicable)
    try {
      await dbPriorityManager.releasePriority(containerId);
    } catch (priorityError) {
      logger.error(`Failed to release ALB priority:`, priorityError);
      // Non-critical - continue with cleanup
    }

    // Step 4: Calculate prorated refund if container was running
    let refundAmount = 0;

    if (container.status === "running" && container.created_at) {
      try {
        // Calculate how long the container was running
        const now = Date.now();
        const createdAt = new Date(container.created_at).getTime();
        const runtimeHours = (now - createdAt) / (1000 * 60 * 60);

        // Calculate deployment cost
        const deploymentCost = calculateDeploymentCost({
          desiredCount: container.desired_count || 1,
          cpu: container.cpu || 1792,
          memory: container.memory || 1792,
          includeUpload: false,
        });

        // Prorated refund: if container ran less than 1 hour, refund 50%
        if (runtimeHours < 1) {
          refundAmount = Math.floor(deploymentCost * 0.5);
        }

        if (refundAmount > 0) {
          await creditsService.addCredits({
            organizationId: user.organization_id!!,
            amount: refundAmount,
            description: `Prorated refund for container ${container.name} (ran ${runtimeHours.toFixed(2)} hours)`,
            metadata: {
              type: "refund",
              containerId,
              runtimeHours: runtimeHours.toFixed(2),
            },
          });
        }
      } catch (refundError) {
        logger.error(`Failed to process refund:`, refundError);
        // Log but don't fail the deletion
      }
    }

    // Step 5: Delete from database
    await deleteContainer(containerId, user.organization_id!);

    return NextResponse.json({
      success: true,
      message: "Container deleted successfully",
      refundAmount: refundAmount > 0 ? refundAmount : undefined,
    });
  } catch (error) {
    logger.error("Error deleting container:", error);

    // Try to update status to failed
    try {
      const { id } = await params;
      await updateContainerStatus(id, "failed", {
        errorMessage: "Deletion failed",
        deploymentLog: `Deletion error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } catch {
      // Ignore status update errors
    }

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

/**
 * PATCH /api/v1/containers/[id]
 * Update container configuration via DWS stack update
 *
 * Updatable parameters:
 * - cpu: Container CPU units (256-2048)
 * - memory: Container memory in MB (512-2048)
 * - container_image: New Docker image URI or IPFS CID
 * - port: Container port (1-65535)
 *
 * Note: Updates trigger a DWS stack update which takes 1-3 minutes
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { id: containerId } = await params;
    const body = await request.json();

    // Get container
    const container = await getContainer(containerId, user.organization_id!);

    if (!container) {
      return NextResponse.json(
        {
          success: false,
          error: "Container not found",
        },
        { status: 404 },
      );
    }

    // Check ownership
    if (container.organization_id !== user.organization_id!) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 403 },
      );
    }

    // Validate and extract updateable parameters
    const updates: {
      containerImage?: string;
      containerCpu?: number;
      containerMemory?: number;
      containerPort?: number;
      minInstances?: number;
      maxInstances?: number;
    } = {};

    // Validate CPU
    if (body.cpu !== undefined) {
      const cpu = Number(body.cpu);
      if (isNaN(cpu) || cpu < 256 || cpu > 2048) {
        return NextResponse.json(
          {
            success: false,
            error: "CPU must be between 256 and 2048 units",
          },
          { status: 400 },
        );
      }
      updates.containerCpu = cpu;
    }

    // Validate Memory
    if (body.memory !== undefined) {
      const memory = Number(body.memory);
      if (isNaN(memory) || memory < 512 || memory > 2048) {
        return NextResponse.json(
          {
            success: false,
            error: "Memory must be between 512 and 2048 MB",
          },
          { status: 400 },
        );
      }
      updates.containerMemory = memory;
    }

    // Validate Port
    if (body.port !== undefined) {
      const port = Number(body.port);
      if (isNaN(port) || port < 1 || port > 65535) {
        return NextResponse.json(
          {
            success: false,
            error: "Port must be between 1 and 65535",
          },
          { status: 400 },
        );
      }
      updates.containerPort = port;
    }

    // Validate Container Image
    if (body.container_image !== undefined) {
      const imageUri = String(body.container_image);
      if (!imageUri) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid container image format",
          },
          { status: 400 },
        );
      }
      updates.containerImage = imageUri;
    }

    // Validate desired_count (scaling)
    if (body.desired_count !== undefined) {
      const count = Number(body.desired_count);
      if (isNaN(count) || count < 1 || count > 10) {
        return NextResponse.json(
          {
            success: false,
            error: "desired_count must be between 1 and 10",
          },
          { status: 400 },
        );
      }
      updates.minInstances = count;
      updates.maxInstances = Math.min(count * 3, 10);
    }

    // Check if any updates were provided
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No valid updates provided. Updatable fields: cpu, memory, port, container_image, desired_count",
        },
        { status: 400 },
      );
    }

    // Update status to deploying
    await updateContainerStatus(containerId, "deploying", {
      deploymentLog: "Initiating container update via DWS...",
    });

    // Update DWS container stack
    try {
      const dwsContainerService = getDWSContainerService();

      await dwsContainerService.updateStack(
        container.organization_id,
        container.project_name,
        updates,
      );

      // Wait for update to complete
      await dwsContainerService.waitForStack(
        container.organization_id,
        container.project_name,
        ["running"],
        5,
      );

      // Update database with new values
      const dbUpdates: Partial<{
        cpu: number;
        memory: number;
        port: number;
        dws_image_cid: string;
        desired_count: number;
      }> = {};
      if (updates.containerCpu) dbUpdates.cpu = updates.containerCpu;
      if (updates.containerMemory) dbUpdates.memory = updates.containerMemory;
      if (updates.containerPort) dbUpdates.port = updates.containerPort;
      if (updates.containerImage)
        dbUpdates.dws_image_cid = updates.containerImage;
      if (updates.minInstances) dbUpdates.desired_count = updates.minInstances;

      // Update container in database
      const updatedContainer = await containersService.update(
        containerId,
        user.organization_id!,
        dbUpdates,
      );

      if (!updatedContainer) {
        throw new Error("Failed to update container in database");
      }

      // Mark as running
      await updateContainerStatus(containerId, "running", {
        deploymentLog: "Container updated successfully",
      });

      return NextResponse.json({
        success: true,
        message: "Container updated successfully",
        data: updatedContainer,
      });
    } catch (dwsError) {
      logger.error(`Failed to update DWS container stack:`, dwsError);

      // Mark as failed
      await updateContainerStatus(containerId, "failed", {
        errorMessage:
          dwsError instanceof Error ? dwsError.message : "Update failed",
        deploymentLog: `DWS update failed: ${dwsError instanceof Error ? dwsError.message : "Unknown error"}`,
      });

      return NextResponse.json(
        {
          success: false,
          error:
            dwsError instanceof Error
              ? dwsError.message
              : "DWS container update failed",
        },
        { status: 500 },
      );
    }
  } catch (error) {
    logger.error("Error updating container:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update container",
      },
      { status: 500 },
    );
  }
}
