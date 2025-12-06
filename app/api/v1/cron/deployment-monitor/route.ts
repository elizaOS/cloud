import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { containers } from "@/db/schemas/containers";
import { inArray } from "drizzle-orm";
import { cloudFormationService } from "@/lib/services/cloudformation";
import { updateContainerStatus } from "@/lib/services/containers";
import { creditsService } from "@/lib/services/credits";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // 1 minute max

/**
 * Deployment Monitor Cron Handler
 *
 * Monitors containers in "building" or "deploying" status and updates
 * their status based on CloudFormation stack progress.
 *
 * This replaces the long-running wait in deployContainerAsync, making
 * the deployment flow compatible with Vercel serverless function limits.
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
    const deployingContainers = await db
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
      stackName: string | null;
      previousStatus: string;
      newStatus: string | null;
      error?: string;
    }> = [];

    for (const container of deployingContainers) {
      try {
        const stackName = container.cloudformation_stack_name;

        if (!stackName) {
          // Stack not yet created, skip this container
          logger.debug(
            `[Deployment Monitor] Container ${container.id} has no stack name yet, skipping`,
          );
          results.push({
            containerId: container.id,
            stackName: null,
            previousStatus: container.status,
            newStatus: null,
            error: "No stack name stored",
          });
          continue;
        }

        // Get stack status directly by name
        const stackStatus = await getStackStatusByName(stackName);

        if (!stackStatus) {
          logger.warn(
            `[Deployment Monitor] Stack ${stackName} not found for container ${container.id}`,
          );
          results.push({
            containerId: container.id,
            stackName,
            previousStatus: container.status,
            newStatus: null,
            error: "Stack not found",
          });
          continue;
        }

        logger.info(
          `[Deployment Monitor] Container ${container.id}: Stack ${stackName} is ${stackStatus.status}`,
        );

        if (
          stackStatus.status === "CREATE_COMPLETE" ||
          stackStatus.status === "UPDATE_COMPLETE"
        ) {
          // Stack completed successfully!
          const outputs = await cloudFormationService.getStackOutputs(
            container.organization_id,
            container.project_name,
          );

          if (outputs) {
            await updateContainerStatus(container.id, "running", {
              ecsServiceArn: outputs.serviceArn,
              ecsTaskDefinitionArn: outputs.taskDefinitionArn,
              ecsClusterArn: outputs.clusterArn,
              loadBalancerUrl: outputs.containerUrl,
              deploymentLog: `Deployed successfully! EC2: ${outputs.instancePublicIp}, URL: ${outputs.containerUrl}`,
            });

            logger.info(
              `[Deployment Monitor] ✅ Container ${container.id} deployed successfully: ${outputs.containerUrl}`,
            );

            results.push({
              containerId: container.id,
              stackName,
              previousStatus: container.status,
              newStatus: "running",
            });
          } else {
            // Stack complete but no outputs - unusual
            await updateContainerStatus(container.id, "running", {
              deploymentLog:
                "Stack completed but outputs not available. Container may still be starting.",
            });
            results.push({
              containerId: container.id,
              stackName,
              previousStatus: container.status,
              newStatus: "running",
              error: "No outputs available",
            });
          }
        } else if (
          stackStatus.status === "CREATE_FAILED" ||
          stackStatus.status === "ROLLBACK_COMPLETE" ||
          stackStatus.status === "ROLLBACK_FAILED" ||
          stackStatus.status === "DELETE_COMPLETE" ||
          stackStatus.status === "UPDATE_ROLLBACK_COMPLETE"
        ) {
          // Stack failed
          const failureReason =
            stackStatus.statusReason || "Stack creation failed";

          await updateContainerStatus(container.id, "failed", {
            errorMessage: failureReason,
            deploymentLog: `CloudFormation stack failed: ${failureReason}`,
          });

          // Refund credits
          try {
            // Calculate deployment cost (should match what was charged)
            const deploymentCost = 15; // Default cost - ideally retrieve from container metadata

            await creditsService.addCredits({
              organizationId: container.organization_id,
              amount: deploymentCost,
              description: `Refund for failed deployment: ${container.name}`,
              metadata: { type: "refund", reason: failureReason },
            });

            logger.info(
              `[Deployment Monitor] ✅ Refunded ${deploymentCost} credits for failed container ${container.id}`,
            );
          } catch (refundError) {
            logger.error(
              `[Deployment Monitor] ❌ Failed to refund credits for container ${container.id}:`,
              refundError,
            );
          }

          // Cleanup the failed stack
          try {
            await cloudFormationService.deleteUserStack(
              container.organization_id,
              container.project_name,
            );
            logger.info(
              `[Deployment Monitor] Initiated cleanup of failed stack ${stackName}`,
            );
          } catch (cleanupError) {
            logger.warn(
              `[Deployment Monitor] Failed to cleanup stack ${stackName}:`,
              cleanupError,
            );
          }

          results.push({
            containerId: container.id,
            stackName,
            previousStatus: container.status,
            newStatus: "failed",
            error: failureReason,
          });
        } else {
          // Stack still in progress (CREATE_IN_PROGRESS, etc.)
          logger.debug(
            `[Deployment Monitor] Container ${container.id}: Stack still in progress (${stackStatus.status})`,
          );
          results.push({
            containerId: container.id,
            stackName,
            previousStatus: container.status,
            newStatus: null, // No change
          });
        }
      } catch (containerError) {
        logger.error(
          `[Deployment Monitor] Error checking container ${container.id}:`,
          containerError,
        );
        results.push({
          containerId: container.id,
          stackName: container.cloudformation_stack_name,
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
 * Get CloudFormation stack status by stack name directly
 */
async function getStackStatusByName(
  stackName: string,
): Promise<{ status: string; statusReason?: string } | null> {
  try {
    const { DescribeStacksCommand, CloudFormationClient } =
      await import("@aws-sdk/client-cloudformation");

    const client = new CloudFormationClient({
      region: process.env.AWS_REGION || "us-east-1",
    });

    const command = new DescribeStacksCommand({
      StackName: stackName,
    });

    const response = await client.send(command);
    const stack = response.Stacks?.[0];

    if (!stack) {
      return null;
    }

    return {
      status: stack.StackStatus || "UNKNOWN",
      statusReason: stack.StackStatusReason,
    };
  } catch (error) {
    // Stack doesn't exist
    if (error instanceof Error && error.message.includes("does not exist")) {
      return null;
    }
    throw error;
  }
}

/**
 * GET /api/v1/cron/deployment-monitor
 * Vercel cron jobs use GET by default
 */
export async function GET(request: NextRequest) {
  return handleDeploymentMonitor(request);
}

/**
 * POST /api/v1/cron/deployment-monitor
 * Support POST for manual testing
 */
export async function POST(request: NextRequest) {
  return handleDeploymentMonitor(request);
}
