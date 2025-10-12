import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import {
  listContainers,
  type NewContainer,
  deleteContainer,
} from "@/lib/queries/containers";
import {
  createContainerWithQuotaCheck,
  QuotaExceededError,
} from "@/lib/queries/container-quota";
import { deductCredits, addCredits } from "@/lib/queries/credits";
import { createUsageRecord } from "@/lib/queries/usage";
import { calculateDeploymentCost } from "@/lib/constants/pricing";
import { getCloudflareService } from "@/lib/services/cloudflare";
import { isFeatureConfigured } from "@/lib/config/env-validator";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createContainerSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  port: z.number().int().min(1).max(65535).default(3000),
  max_instances: z.number().int().min(1).max(10).default(1),
  environment_vars: z.record(z.string(), z.string()).optional(),
  health_check_path: z.string().default("/health"),
  
  // Bootstrapper architecture fields
  use_bootstrapper: z.boolean().optional().default(true), // Default to bootstrapper
  artifact_url: z.string().optional(),
  artifact_checksum: z.string().optional(),
  
  // Optional: Allow custom image tag for self-hosted bootstrapper images
  image_tag: z.string().optional().default("elizaos/bootstrapper:latest"),
});

/**
 * GET /api/v1/containers
 * List all containers for the authenticated user's organization
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKey(request);

    const containers = await listContainers(user.organization_id);

    return NextResponse.json({
      success: true,
      data: containers,
    });
  } catch (error) {
    console.error("Error fetching containers:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch containers",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/v1/containers
 * Create and deploy a new container
 * Rate limited: 5 deployments per 5 minutes
 */
async function handleCreateContainer(request: NextRequest) {
  try {
    // Check if container feature is configured
    if (!isFeatureConfigured("containers")) {
      return NextResponse.json(
        {
          success: false,
          error: "Container deployments are not configured. Please set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and R2 credentials.",
        },
        { status: 503 }
      );
    }

    const { user, apiKey } = await requireAuthOrApiKey(request);
    const body = await request.json();

    // Validate request body
    const validatedData = createContainerSchema.parse(body);

    // Prepare container data for bootstrapper architecture
    const containerData: NewContainer = {
      name: validatedData.name,
      description: validatedData.description,
      organization_id: user.organization_id,
      user_id: user.id,
      api_key_id: apiKey?.id || null,
      image_tag: validatedData.image_tag || "elizaos/bootstrapper:latest",
      port: validatedData.port,
      max_instances: validatedData.max_instances,
      environment_vars: validatedData.environment_vars || {},
      health_check_path: validatedData.health_check_path,
      status: "pending",
      // Store bootstrapper-specific fields in metadata
      metadata: {
        use_bootstrapper: validatedData.use_bootstrapper !== false,
        artifact_url: validatedData.artifact_url,
        artifact_checksum: validatedData.artifact_checksum,
      },
    };

    // Atomically check quota and create container
    // This prevents race conditions where multiple concurrent requests
    // could bypass quota limits or create duplicate names
    const container = await createContainerWithQuotaCheck(containerData);

    // Calculate deployment cost
    const deploymentCost = calculateDeploymentCost({
      maxInstances: validatedData.max_instances,
      includeUpload: false, // Upload is charged separately
    });

    // Deduct credits for deployment
    const creditResult = await deductCredits(
      user.organization_id,
      deploymentCost,
      `Container deployment: ${validatedData.name}`,
      user.id,
    );

    if (!creditResult.success) {
      // Delete the container record since we can't charge for it
      await deleteContainer(container.id, user.organization_id);

      return NextResponse.json(
        {
          success: false,
          error: `Insufficient credits. Required: ${deploymentCost}, Available: ${creditResult.newBalance}`,
          requiredCredits: deploymentCost,
          availableCredits: creditResult.newBalance,
        },
        { status: 402 }, // Payment Required
      );
    }

    // Create usage record for audit trail
    await createUsageRecord({
      organization_id: user.organization_id,
      user_id: user.id,
      api_key_id: apiKey?.id,
      type: "container_deployment",
      provider: "cloudflare",
      input_cost: deploymentCost,
      output_cost: 0,
      is_successful: true,
      metadata: {
        container_id: container.id,
        container_name: validatedData.name,
        max_instances: validatedData.max_instances,
        port: validatedData.port,
      },
    });

    // Start async deployment process (in real implementation, this would be a background job)
    deployContainerAsync(
      container.id,
      validatedData,
      deploymentCost,
      user.organization_id,
    ).catch((error) => {
      console.error("Async deployment failed:", error);
    });

    return NextResponse.json(
      {
        success: true,
        data: container,
        message:
          "Container deployment initiated. Check status for deployment progress.",
        creditsDeducted: deploymentCost,
        newCreditBalance: creditResult.newBalance,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating container:", error);

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: error.issues,
        },
        { status: 400 },
      );
    }

    // Handle quota exceeded errors
    if (error instanceof QuotaExceededError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          quota: {
            current: error.current,
            max: error.max,
          },
        },
        { status: 403 },
      );
    }

    // Handle duplicate container name errors (from unique constraint)
    if (
      error instanceof Error &&
      (error.message.includes("unique constraint") ||
        error.message.includes("duplicate key"))
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "A container with this name already exists in your organization",
        },
        { status: 409 },
      );
    }

    // Handle generic errors
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create container",
      },
      { status: 500 },
    );
  }
}

// Export rate-limited handler for POST
export const POST = withRateLimit(handleCreateContainer, RateLimitPresets.CRITICAL);

/**
 * Background deployment function
 * In production, this should be handled by a job queue
 */
async function deployContainerAsync(
  containerId: string,
  config: z.infer<typeof createContainerSchema>,
  deploymentCost: number,
  organizationId: string,
): Promise<void> {
  const { updateContainerStatus } = await import("@/lib/queries/containers");

  try {
    // Update status to building
    await updateContainerStatus(containerId, "building");

    // Initialize Cloudflare service
    const cloudflare = getCloudflareService();

    // Deploy to Cloudflare
    await updateContainerStatus(containerId, "deploying");

    // Note: Artifact download credentials are generated and injected
    // by the CloudflareService.deployContainerBinding() method
    const deployment = await cloudflare.deployContainer({
      name: config.name,
      imageTag: config.image_tag || "latest",
      port: config.port,
      maxInstances: config.max_instances,
      environmentVars: config.environment_vars,
      healthCheckPath: config.health_check_path,
      useBootstrapper: config.use_bootstrapper,
      artifactUrl: config.artifact_url,
      artifactChecksum: config.artifact_checksum,
    });

    // Update container with deployment info
    await updateContainerStatus(containerId, "running", {
      cloudflareWorkerId: deployment.workerId,
      cloudflareContainerId: deployment.containerId,
      cloudflareUrl: deployment.url,
      deploymentLog: `Deployed successfully to ${deployment.url}`,
    });
  } catch (error) {
    console.error("Deployment failed:", error);

    // Update container status to failed
    await updateContainerStatus(containerId, "failed", {
      errorMessage:
        error instanceof Error ? error.message : "Unknown deployment error",
      deploymentLog: `Deployment failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    });

    // Refund credits since deployment failed
    try {
      await addCredits(
        organizationId,
        deploymentCost,
        "refund",
        `Refund for failed container deployment: ${config.name}`,
      );
      console.log(`Refunded ${deploymentCost} credits for failed deployment of container ${containerId}`);
    } catch (refundError) {
      console.error("Failed to refund credits for failed deployment:", refundError);
      // Log but don't throw - the deployment failure is already handled
    }
  }
}

