import { NextRequest, NextResponse } from "next/server";
import { dbRead } from "@/db/client";
import { containers } from "@/db/schemas/containers";
import { inArray } from "drizzle-orm";
import { dwsContainerService } from "@/lib/services/dws/containers";
import { updateContainerStatus } from "@/lib/services/containers";
import { creditsService } from "@/lib/services/credits";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 1 minute max

/**
 * Deployment Monitor Cron Handler
 *
 * Monitors containers in "building" or "deploying" status and updates
 * their status based on DWS container deployment progress.
 *
 * Schedule: Every minute
 */
async function handleDeploymentMonitor(request: NextRequest) {
  try {
    // Authenticate cron request
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      logger.error(
        "[Deployment Monitor] CRON_SECRET not configured - rejecting request for security",
      );
      return NextResponse.json(
        {
          success: false,
          error: "Server configuration error: CRON_SECRET not set",
        },
        { status: 500 },
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      logger.warn("[Deployment Monitor] Unauthorized request", {
        ip: request.headers.get("x-forwarded-for"),
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    logger.info("[Deployment Monitor] Starting deployment status check");

    // Get all containers that are being deployed
    const deployingContainers = await dbRead
      .select()
      .from(containers)
      .where(inArray(containers.status, ["building", "deploying"]));

    if (deployingContainers.length === 0) {
      logger.info("[Deployment Monitor] No containers in deployment state");
      return NextResponse.json({
        success: true,
        data: { monitored: 0, updated: 0, timestamp: new Date().toISOString() },
      });
    }

    logger.info(
      `[Deployment Monitor] Checking ${deployingContainers.length} containers`,
    );

    const results: Array<{
      containerId: string;
      dwsContainerId: string | null;
      previousStatus: string;
      newStatus: string | null;
      error?: string;
    }> = [];

    for (const container of deployingContainers) {
      try {
        const dwsContainerId = container.dws_container_id;

        if (!dwsContainerId) {
          // DWS container not yet created, skip
          logger.debug(
            `[Deployment Monitor] Container ${container.id} has no DWS container ID yet, skipping`,
          );
          results.push({
            containerId: container.id,
            dwsContainerId: null,
            previousStatus: container.status,
            newStatus: null,
            error: "No DWS container ID stored",
          });
          continue;
        }

        // Get DWS container status
        const dwsStatus = await dwsContainerService.getContainerStatus(dwsContainerId);

        if (!dwsStatus) {
          logger.warn(
            `[Deployment Monitor] DWS container ${dwsContainerId} not found for container ${container.id}`,
          );
          results.push({
            containerId: container.id,
            dwsContainerId,
            previousStatus: container.status,
            newStatus: null,
            error: "DWS container not found",
          });
          continue;
        }

        logger.info(
          `[Deployment Monitor] Container ${container.id}: DWS status is ${dwsStatus.status}`,
        );

        if (dwsStatus.status === "running") {
          // Container deployed successfully
          await updateContainerStatus(container.id, "running", {
            dwsContainerId,
            dwsEndpointUrl: dwsStatus.endpointUrl,
            dwsRegion: dwsStatus.region,
            deploymentLog: `Deployed successfully. URL: ${dwsStatus.endpointUrl}`,
          });

          logger.info(
            `[Deployment Monitor] Container ${container.id} deployed successfully: ${dwsStatus.endpointUrl}`,
          );

          results.push({
            containerId: container.id,
            dwsContainerId,
            previousStatus: container.status,
            newStatus: "running",
          });
        } else if (dwsStatus.status === "failed" || dwsStatus.status === "error") {
          // Container failed
          const failureReason = dwsStatus.error || "Container deployment failed";

          await updateContainerStatus(container.id, "failed", {
            errorMessage: failureReason,
            deploymentLog: `DWS container failed: ${failureReason}`,
          });

          // Refund credits
          try {
            const deploymentCost = 15; // Default cost
            await creditsService.addCredits({
              organizationId: container.organization_id,
              amount: deploymentCost,
              description: `Refund for failed deployment: ${container.name}`,
              metadata: { type: "refund", reason: failureReason },
            });

            logger.info(
              `[Deployment Monitor] Refunded ${deploymentCost} credits for failed container ${container.id}`,
            );
          } catch (refundError) {
            logger.error(
              `[Deployment Monitor] Failed to refund credits for container ${container.id}:`,
              refundError,
            );
          }

          // Cleanup the failed container
          try {
            await dwsContainerService.deleteContainer(dwsContainerId);
            logger.info(
              `[Deployment Monitor] Cleaned up failed DWS container ${dwsContainerId}`,
            );
          } catch (cleanupError) {
            logger.warn(
              `[Deployment Monitor] Failed to cleanup DWS container ${dwsContainerId}:`,
              cleanupError,
            );
          }

          results.push({
            containerId: container.id,
            dwsContainerId,
            previousStatus: container.status,
            newStatus: "failed",
            error: failureReason,
          });
        } else {
          // Container still deploying
          logger.debug(
            `[Deployment Monitor] Container ${container.id}: Still deploying (${dwsStatus.status})`,
          );
          results.push({
            containerId: container.id,
            dwsContainerId,
            previousStatus: container.status,
            newStatus: null,
          });
        }
      } catch (containerError) {
        logger.error(
          `[Deployment Monitor] Error checking container ${container.id}:`,
          containerError,
        );
        results.push({
          containerId: container.id,
          dwsContainerId: container.dws_container_id,
          previousStatus: container.status,
          newStatus: null,
          error:
            containerError instanceof Error
              ? containerError.message
              : "Unknown error",
        });
      }
    }

    const updatedCount = results.filter((r) => r.newStatus !== null).length;

    logger.info(
      `[Deployment Monitor] Completed: ${results.length} checked, ${updatedCount} updated`,
    );

    return NextResponse.json({
      success: true,
      data: {
        monitored: results.length,
        updated: updatedCount,
        timestamp: new Date().toISOString(),
        results,
      },
    });
  } catch (error) {
    logger.error(
      "[Deployment Monitor] Failed:",
      error instanceof Error ? error.message : String(error),
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Deployment monitor failed",
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/v1/cron/deployment-monitor
 * Cron job endpoint for monitoring container deployment status.
 * Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  return handleDeploymentMonitor(request);
}

/**
 * POST /api/v1/cron/deployment-monitor
 * Cron job endpoint for monitoring container deployment status (POST variant).
 * Protected by CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  return handleDeploymentMonitor(request);
}
