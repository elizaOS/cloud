import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { listContainers } from "@/lib/queries/containers";
import {
  CONTAINER_PRICING,
  CONTAINER_LIMITS,
  getMaxContainersForOrg,
  calculateDeploymentCost,
} from "@/lib/constants/pricing";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/containers/quota
 * Get container quota and pricing information for the authenticated user's organization
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(request);

    // Get current container count
    const existingContainers = await listContainers(user.organization_id);
    const currentCount = existingContainers.length;

    // Get max allowed containers
    const maxContainers = getMaxContainersForOrg(
      user.organization.credit_balance,
      user.organization.settings as Record<string, unknown> | undefined,
    );

    // Calculate costs
    const baseCost = calculateDeploymentCost({
      maxInstances: 1,
      includeUpload: false,
    });

    return NextResponse.json({
      success: true,
      data: {
        quota: {
          current: currentCount,
          max: maxContainers,
          remaining: Math.max(0, maxContainers - currentCount),
          percentage: (currentCount / maxContainers) * 100,
        },
        credits: {
          balance: user.organization.credit_balance,
          canDeploy: user.organization.credit_balance >= baseCost,
        },
        pricing: {
          imageUpload: CONTAINER_PRICING.IMAGE_UPLOAD,
          deployment: baseCost,
          totalForNewContainer: baseCost + CONTAINER_PRICING.IMAGE_UPLOAD,
          perHour: CONTAINER_PRICING.RUNNING_COST_PER_HOUR,
          perDay: CONTAINER_PRICING.RUNNING_COST_PER_DAY,
          perAdditionalInstance: CONTAINER_PRICING.COST_PER_ADDITIONAL_INSTANCE,
        },
        limits: {
          maxImageSize: CONTAINER_LIMITS.MAX_IMAGE_SIZE_BYTES,
          maxInstancesPerContainer: CONTAINER_LIMITS.MAX_INSTANCES_PER_CONTAINER,
          maxEnvVars: CONTAINER_LIMITS.MAX_ENV_VARS,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching quota:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch quota",
      },
      { status: 500 },
    );
  }
}

