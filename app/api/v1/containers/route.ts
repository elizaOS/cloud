import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import {
  creditsService,
  usageService,
  containersService,
  listContainers,
  deleteContainer,
  updateContainerStatus,
  QuotaExceededError,
  type NewContainer,
} from "@/lib/services";
import { creditEventEmitter } from "@/lib/events/credit-events";
import {
  calculateDeploymentCost,
  CONTAINER_LIMITS,
} from "@/lib/constants/pricing";
import { isFeatureConfigured } from "@/lib/config/env-validator";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createContainerSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  port: z.number().int().min(1).max(65535).default(3000),
  desired_count: z.number().int().min(1).max(10).default(1),
  cpu: z.number().int().min(256).max(2048).default(1792), // CPU units (1792 = 1.75 vCPU, 87.5% of t3g.small)
  memory: z.number().int().min(512).max(2048).default(1792), // Memory in MB (1792 = 1.75 GB, 87.5% of t3g.small)
  environment_vars: z.record(z.string(), z.string()).optional(),
  health_check_path: z.string().default("/health"),

  // ECR image fields
  ecr_image_uri: z.string(), // Required: Full ECR image URI with tag
  ecr_repository_uri: z.string().optional(),
  image_tag: z.string().optional(),
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
          error instanceof Error ? error.message : "Failed to fetch containers",
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
          error:
            "Container deployments are not configured. Please set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and ECS configuration.",
        },
        { status: 503 },
      );
    }

    const { user, apiKey } = await requireAuthOrApiKey(request);
    const body = await request.json();

    // Validate request body
    const validatedData = createContainerSchema.parse(body);

    // Validate environment variables count and size
    if (validatedData.environment_vars) {
      const envVarCount = Object.keys(validatedData.environment_vars).length;
      if (envVarCount > CONTAINER_LIMITS.MAX_ENV_VARS) {
        return NextResponse.json(
          {
            success: false,
            error: `Too many environment variables. Maximum ${CONTAINER_LIMITS.MAX_ENV_VARS} allowed, got ${envVarCount}`,
            details: {
              limit: CONTAINER_LIMITS.MAX_ENV_VARS,
              provided: envVarCount,
            },
          },
          { status: 400 },
        );
      }

      // Validate each env var name and value size
      for (const [key, value] of Object.entries(
        validatedData.environment_vars,
      )) {
        // Validate key format
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
          return NextResponse.json(
            {
              success: false,
              error: `Invalid environment variable name: '${key}'. Must start with letter/underscore and contain only alphanumeric and underscores.`,
            },
            { status: 400 },
          );
        }

        // Validate value size
        const valueSize = Buffer.byteLength(value, "utf8");
        if (valueSize > CONTAINER_LIMITS.MAX_ENV_VAR_SIZE) {
          return NextResponse.json(
            {
              success: false,
              error: `Environment variable '${key}' value exceeds maximum size of ${CONTAINER_LIMITS.MAX_ENV_VAR_SIZE} bytes (got ${valueSize} bytes)`,
            },
            { status: 400 },
          );
        }
      }
    }

    // Validate ECR image URI
    if (!validatedData.ecr_image_uri) {
      return NextResponse.json(
        {
          success: false,
          error: "ecr_image_uri is required",
          details: {
            hint: "Call POST /api/v1/containers/credentials to get ECR credentials and push your Docker image to ECR first",
          },
        },
        { status: 400 },
      );
    }

    // Verify ECR image exists before deployment (prevents expensive failed deployments)
    try {
      const { getECRManager } = await import("@/lib/services/ecr");
      const ecrManager = getECRManager();
      const imageExists = await ecrManager.verifyImageExists(
        validatedData.ecr_image_uri,
      );

      if (!imageExists) {
        return NextResponse.json(
          {
            success: false,
            error: `ECR image not found: ${validatedData.ecr_image_uri}`,
            details: {
              hint: "Ensure the Docker image was successfully pushed to ECR before deploying",
            },
          },
          { status: 404 },
        );
      }
    } catch (error) {
      console.error("Failed to verify ECR image:", error);
      // Log but don't block deployment - image might exist but verification failed
      console.warn(
        "Proceeding with deployment despite image verification failure",
      );
    }

    // Prepare container data for ECS deployment
    const containerData: NewContainer = {
      name: validatedData.name,
      description: validatedData.description,
      organization_id: user.organization_id,
      user_id: user.id,
      api_key_id: apiKey?.id || null,
      ecr_repository_uri: validatedData.ecr_repository_uri,
      ecr_image_tag: validatedData.image_tag,
      image_tag: validatedData.image_tag,
      port: validatedData.port,
      desired_count: validatedData.desired_count,
      cpu: validatedData.cpu,
      memory: validatedData.memory,
      environment_vars: validatedData.environment_vars || {},
      health_check_path: validatedData.health_check_path,
      status: "pending",
      metadata: {
        ecr_image_uri: validatedData.ecr_image_uri,
      },
    };

    // Calculate deployment cost upfront (ECS is more expensive than Cloudflare)
    const deploymentCost = calculateDeploymentCost({
      desiredCount: validatedData.desired_count,
      cpu: validatedData.cpu,
      memory: validatedData.memory,
      includeUpload: false, // Image build/push is charged separately
    });

    // CRITICAL: Wrap container creation AND credit deduction in a single transaction
    // This prevents race condition where container exists but credits fail to deduct
    let container;
    let newBalance;

    try {
      const result = await containersService.createContainerWithCreditDeduction(
        containerData,
        user.id,
        deploymentCost,
      );

      container = result.container;
      newBalance = result.newBalance;

      // Emit credit update event for real-time balance updates
      creditEventEmitter.emitCreditUpdate({
        organizationId: user.organization_id,
        newBalance: newBalance,
        delta: -deploymentCost,
        reason: `Container deployment: ${validatedData.name}`,
        userId: user.id,
        timestamp: new Date(),
      });
    } catch (error) {
      // Transaction rolled back - no orphaned container or credit inconsistency
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      if (errorMessage.includes("Insufficient credits")) {
        return NextResponse.json(
          {
            success: false,
            error: errorMessage,
            requiredCredits: deploymentCost,
          },
          { status: 402 }, // Payment Required
        );
      }

      throw error; // Re-throw for outer error handler
    }

    // Create usage record for audit trail
    await usageService.create({
      organization_id: user.organization_id,
      user_id: user.id,
      api_key_id: apiKey?.id,
      type: "container_deployment",
      provider: "aws_ecs",
      input_cost: deploymentCost,
      output_cost: 0,
      is_successful: true,
      metadata: {
        container_id: container.id,
        container_name: validatedData.name,
        desired_count: validatedData.desired_count,
        cpu: validatedData.cpu,
        memory: validatedData.memory,
        port: validatedData.port,
      },
    });

    // Start async deployment process
    // Note: Vercel Pro allows up to 800s execution time (13.3 minutes)
    // CloudFormation typically takes 5-15 minutes to provision
    deployContainerAsync(
      container.id,
      validatedData,
      deploymentCost,
      user.organization_id,
    ).catch((error) => {
      console.error("❌ [deployContainerAsync] CRITICAL ERROR:", {
        containerId: container.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    });

    return NextResponse.json(
      {
        success: true,
        data: container,
        message:
          "Container deployment initiated. Check status for deployment progress.",
        creditsDeducted: deploymentCost,
        creditsRemaining: newBalance,
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
          error:
            "A container with this name already exists in your organization",
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
export const POST = withRateLimit(
  handleCreateContainer,
  RateLimitPresets.CRITICAL,
);

/**
 * Background deployment function - Provisions per-user CloudFormation stack
 * In production, this should be handled by a job queue
 */
async function deployContainerAsync(
  containerId: string,
  config: z.infer<typeof createContainerSchema>,
  deploymentCost: number,
  organizationId: string,
): Promise<void> {
  console.log(`🚀 [deployContainerAsync] Starting deployment for container: ${containerId}`);
  
  const { TimeoutError, withTimeout } = await import(
    "@/lib/errors/deployment-errors"
  );
  const { cloudFormationService } = await import(
    "@/lib/services/cloudformation"
  );

  try {
    // Update status to building
    console.log(`📝 [deployContainerAsync] Updating status to 'building'`);
    await updateContainerStatus(containerId, "building", {
      deploymentLog: "Provisioning dedicated EC2 instance and ECS cluster...",
    });

    // Check if shared infrastructure is deployed
    console.log(`🔍 [deployContainerAsync] Checking shared infrastructure...`);
    const sharedInfraExists =
      await cloudFormationService.isSharedInfrastructureDeployed();
    console.log(`📊 [deployContainerAsync] Shared infrastructure exists: ${sharedInfraExists}`);
    
    if (!sharedInfraExists) {
      throw new Error(
        "Shared infrastructure not deployed. Contact support or deploy infrastructure first.",
      );
    }

    // Create CloudFormation stack for this user
    console.log(`📝 [deployContainerAsync] Updating status to 'deploying'`);
    await updateContainerStatus(containerId, "deploying", {
      deploymentLog:
        "Creating CloudFormation stack (1x t3g.small ARM instance)...",
    });

    console.log(`☁️ [deployContainerAsync] Creating CloudFormation stack...`, {
      userId: containerId,
      containerName: config.name,
      ecrImageUri: config.ecr_image_uri,
      port: config.port,
      cpu: config.cpu,
      memory: config.memory,
    });

    const stackId = await cloudFormationService.createUserStack({
      userId: containerId,
      userEmail: config.name, // Using container name as identifier
      containerImage: config.ecr_image_uri,
      containerPort: config.port,
      containerCpu: config.cpu,
      containerMemory: config.memory,
      keyName: process.env.EC2_KEY_NAME,
    });

    console.log(`✅ [deployContainerAsync] CloudFormation stack initiated: ${stackId}`);

    // Wait for stack creation to complete (with timeout)
    const STACK_TIMEOUT_MINUTES = 15;
    console.log(`⏳ [deployContainerAsync] Waiting for stack creation (max ${STACK_TIMEOUT_MINUTES} minutes)...`);
    
    await withTimeout(
      async () =>
        cloudFormationService.waitForStackComplete(
          containerId,
          STACK_TIMEOUT_MINUTES,
        ),
      STACK_TIMEOUT_MINUTES * 60 * 1000,
      "CloudFormation stack creation",
    );

    // Get stack outputs
    const outputs = await cloudFormationService.getStackOutputs(containerId);

    if (!outputs) {
      throw new Error("Failed to get stack outputs");
    }

    // Update container with deployment info
    await updateContainerStatus(containerId, "running", {
      ecsServiceArn: outputs.serviceArn,
      ecsTaskDefinitionArn: outputs.taskDefinitionArn,
      ecsClusterArn: outputs.clusterArn,
      loadBalancerUrl: outputs.containerUrl,
      deploymentLog: `Deployed successfully! EC2: ${outputs.instancePublicIp}, URL: ${outputs.containerUrl}`,
    });

    console.log(`✅ Container ${containerId} deployed successfully:`, {
      instance: outputs.instancePublicIp,
      url: outputs.containerUrl,
      cluster: outputs.clusterName,
    });
  } catch (error) {
    console.error("Deployment failed:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown deployment error";
    const isTimeout = error instanceof TimeoutError;

    // Update container status to failed
    await updateContainerStatus(containerId, "failed", {
      errorMessage: isTimeout
        ? "Deployment timed out after 10 minutes. This may indicate a configuration issue or infrastructure problem."
        : errorMessage,
      deploymentLog: `Deployment failed: ${errorMessage}${isTimeout ? " (timeout)" : ""}`,
    });

    // CRITICAL: Refund credits and cleanup failed container
    // This MUST succeed to prevent charging users for failed deployments
    let refundSuccessful = false;
    let rollbackSuccessful = false;

    // Attempt refund with retries
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await creditsService.addCredits({
          organizationId,
          amount: deploymentCost,
          description: `Refund for failed container deployment: ${config.name}${isTimeout ? " (timeout)" : ""}`,
          metadata: { type: "refund" },
        });
        console.log(
          `✅ Refunded ${deploymentCost} credits for failed deployment of container ${containerId}`,
        );
        refundSuccessful = true;
        break;
      } catch (refundError) {
        console.error(`❌ Refund attempt ${attempt}/3 failed:`, refundError);
        if (attempt === 3) {
          // CRITICAL: Log to monitoring system for manual intervention
          console.error(
            `🚨 CRITICAL: Failed to refund ${deploymentCost} credits to org ${organizationId} for container ${containerId}. MANUAL INTERVENTION REQUIRED.`,
            { containerId, organizationId, deploymentCost, error: refundError },
          );
          // Future: Integrate with monitoring system (e.g., Sentry, DataDog, PagerDuty)
          // This error is already logged and will appear in application logs for manual review
        } else {
          // Wait before retry with exponential backoff
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)),
          );
        }
      }
    }

    // Attempt rollback with retries (delete CloudFormation stack + database record)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // Delete CloudFormation stack first
        try {
          await cloudFormationService.deleteUserStack(containerId);
          console.log(
            `✅ CloudFormation stack deletion initiated for ${containerId}`,
          );
        } catch (cfError) {
          console.warn(`⚠️  Failed to delete CloudFormation stack:`, cfError);
          // Continue with database cleanup even if CF deletion fails
        }

        // Delete from database
        await deleteContainer(containerId, organizationId);
        console.log(
          `✅ Rolled back failed container ${containerId} (CloudFormation stack + database)`,
        );
        rollbackSuccessful = true;
        break;
      } catch (rollbackError) {
        console.error(
          `❌ Rollback attempt ${attempt}/3 failed:`,
          rollbackError,
        );
        if (attempt === 3) {
          console.error(
            `⚠️  Failed to delete failed container ${containerId}. Container marked as 'failed' but not removed.`,
            { containerId, organizationId, error: rollbackError },
          );
          // This is less critical than refund - admin can clean up later
        } else {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)),
          );
        }
      }
    }

    // If refund failed, this is a critical issue that needs immediate attention
    if (!refundSuccessful) {
      // Update container with refund failure flag for manual processing
      await updateContainerStatus(containerId, "failed", {
        errorMessage: `${errorMessage} | REFUND FAILED - MANUAL INTERVENTION REQUIRED`,
        deploymentLog: `${errorMessage}${isTimeout ? " (timeout)" : ""} | Refund failed - admin must manually credit ${deploymentCost} credits to org ${organizationId}`,
      });
    }

    // Log final cleanup status for monitoring
    console.log(`Deployment cleanup completed for container ${containerId}:`, {
      refundSuccessful,
      rollbackSuccessful,
      requiresManualIntervention: !refundSuccessful,
    });
  }
}
