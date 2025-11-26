import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  creditsService,
  usageService,
  containersService,
  listContainers,
  getContainer,
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
// Set max duration to handle CloudFormation deployments
// CloudFormation typically takes 5-12 minutes for EC2+ECS provisioning
// Vercel limits: Hobby=300s, Pro/Enterprise=800s (configurable)
export const maxDuration = 780; // 13 minutes - allows full CloudFormation deployment

const createContainerSchema = z.object({
  name: z.string().min(1).max(100),
  project_name: z.string().min(1).max(50), // Project identifier for multi-project support
  description: z.string().optional(),
  port: z.number().int().min(1).max(65535).default(3000),
  desired_count: z.number().int().min(1).max(10).default(1),
  cpu: z.number().int().min(256).max(2048).default(1792), // CPU units (1792 = 1.75 vCPU, 87.5% of t4g.small's 2 vCPUs)
  memory: z.number().int().min(256).max(2048).default(1792), // Memory in MB (1792 MB = 1.75 GiB, 87.5% of t4g.small's 2 GiB)
  environment_vars: z.record(z.string(), z.string()).optional(),
  health_check_path: z.string().default("/health"),

  // ECR image fields
  ecr_image_uri: z.string(), // Required: Full ECR image URI with tag
  ecr_repository_uri: z.string().optional(),
  image_tag: z.string().optional(),

  // Architecture field for multi-platform support
  architecture: z.enum(["arm64", "x86_64"]).optional().default("arm64"),
});

/**
 * GET /api/v1/containers
 * List all containers for the authenticated user's organization
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    const containers = await listContainers(user.organization_id!);

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

    const { user, apiKey } = await requireAuthOrApiKeyWithOrg(request);
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

    // Check if a container with this project_name already exists for this user
    const existingContainers = await listContainers(user.organization_id!);
    const existingProject = existingContainers.find(
      (c) =>
        c.user_id === user.id && c.project_name === validatedData.project_name,
    );

    const isUpdate = !!existingProject;

    console.log(
      `🔍 [handleCreateContainer] Project "${validatedData.project_name}" ${isUpdate ? "EXISTS - will update" : "is NEW - will create"}`,
    );

    let container;
    let newBalance: number;
    let deploymentCost: number;

    if (isUpdate && existingProject) {
      // UPDATE: Update the existing container record
      console.log(
        `🔄 [handleCreateContainer] Updating existing container: ${existingProject.id}`,
      );

      const updateData = {
        name: validatedData.name,
        description: validatedData.description,
        ecr_repository_uri: validatedData.ecr_repository_uri,
        ecr_image_tag: validatedData.image_tag,
        image_tag: validatedData.image_tag,
        port: validatedData.port,
        desired_count: validatedData.desired_count,
        cpu: validatedData.cpu,
        memory: validatedData.memory,
        architecture: validatedData.architecture,
        environment_vars: validatedData.environment_vars || {},
        health_check_path: validatedData.health_check_path,
        status: "pending",
        is_update: "true",
        metadata: {
          ecr_image_uri: validatedData.ecr_image_uri,
          is_update: true,
          previous_image: existingProject.metadata?.ecr_image_uri,
          architecture: validatedData.architecture,
        },
      };

      const updatedContainer = await containersService.update(
        existingProject.id,
        user.organization_id!,
        updateData,
      );

      if (!updatedContainer) {
        throw new Error("Failed to update existing container");
      }

      container = updatedContainer;

      // For updates, still need to calculate cost and deduct credits
      deploymentCost = calculateDeploymentCost({
        desiredCount: validatedData.desired_count,
        cpu: validatedData.cpu,
        memory: validatedData.memory,
        includeUpload: false,
      });

      // Deduct credits for update deployment
      const creditResult = await creditsService.deductCredits({
        organizationId: user.organization_id!!,
        amount: deploymentCost,
        description: `Container update deployment: ${validatedData.name}`,
        metadata: {
          type: "container_update",
          containerId: container.id,
          projectName: validatedData.project_name,
        },
      });

      if (!creditResult.success) {
        return NextResponse.json(
          {
            success: false,
            error: "Insufficient balance for update deployment",
            requiredCredits: deploymentCost,
          },
          { status: 402 }, // Payment Required
        );
      }

      newBalance = creditResult.newBalance;

      creditEventEmitter.emitCreditUpdate({
        organizationId: user.organization_id!!,
        newBalance: newBalance,
        delta: -deploymentCost,
        reason: `Container update: ${validatedData.name}`,
        userId: user.id,
        timestamp: new Date(),
      });
    } else {
      // FRESH: Create a new container record
      console.log(
        `🆕 [handleCreateContainer] Creating new container for project "${validatedData.project_name}"`,
      );

      const containerData: NewContainer = {
        name: validatedData.name,
        project_name: validatedData.project_name,
        description: validatedData.description,
        organization_id: user.organization_id!!,
        user_id: user.id,
        api_key_id: apiKey?.id || null,
        ecr_repository_uri: validatedData.ecr_repository_uri,
        ecr_image_tag: validatedData.image_tag,
        image_tag: validatedData.image_tag,
        port: validatedData.port,
        desired_count: validatedData.desired_count,
        cpu: validatedData.cpu,
        memory: validatedData.memory,
        architecture: validatedData.architecture,
        environment_vars: validatedData.environment_vars || {},
        health_check_path: validatedData.health_check_path,
        status: "pending",
        is_update: "false",
        metadata: {
          ecr_image_uri: validatedData.ecr_image_uri,
          is_update: false,
          architecture: validatedData.architecture,
        },
      };

      // Calculate deployment cost upfront (ECS is more expensive than Cloudflare)
      deploymentCost = calculateDeploymentCost({
        desiredCount: validatedData.desired_count,
        cpu: validatedData.cpu,
        memory: validatedData.memory,
        includeUpload: false, // Image build/push is charged separately
      });

      // CRITICAL: Wrap container creation AND credit deduction in a single transaction
      // This prevents race condition where container exists but credits fail to deduct
      try {
        const result =
          await containersService.createContainerWithCreditDeduction(
            containerData,
            user.id,
            deploymentCost,
          );

        container = result.container;
        newBalance = result.newBalance;

        // Emit credit update event for real-time balance updates
        creditEventEmitter.emitCreditUpdate({
          organizationId: user.organization_id!!,
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

        if (errorMessage.includes("Insufficient balance")) {
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
        organization_id: user.organization_id!!,
        user_id: user.id,
        api_key_id: apiKey?.id,
        type: "container_deployment",
        provider: "aws_ecs",
        input_cost: String(deploymentCost),
        output_cost: String(0),
        is_successful: true,
        metadata: {
          container_id: container.id,
          container_name: validatedData.name,
          project_name: validatedData.project_name,
          desired_count: validatedData.desired_count,
          cpu: validatedData.cpu,
          memory: validatedData.memory,
          port: validatedData.port,
          is_update: false,
        },
      });
    }

    // Create usage record for updates
    if (isUpdate) {
      const deploymentCost = calculateDeploymentCost({
        desiredCount: validatedData.desired_count,
        cpu: validatedData.cpu,
        memory: validatedData.memory,
        includeUpload: false,
      });

      await usageService.create({
        organization_id: user.organization_id!!,
        user_id: user.id,
        api_key_id: apiKey?.id,
        type: "container_update",
        provider: "aws_ecs",
        input_cost: String(deploymentCost),
        output_cost: String(0),
        is_successful: true,
        metadata: {
          container_id: container.id,
          container_name: validatedData.name,
          project_name: validatedData.project_name,
          desired_count: validatedData.desired_count,
          cpu: validatedData.cpu,
          memory: validatedData.memory,
          port: validatedData.port,
          is_update: true,
        },
      });
    }

    // Deploy container ASYNCHRONOUSLY - return immediately to prevent API timeout
    // CloudFormation deployments take 8-12 minutes, which exceeds API gateway timeouts
    // Client will poll GET /api/v1/containers/:id for status updates

    console.log(
      `🚀 [handleCreateContainer] Starting background deployment for container: ${container.id}`,
    );

    // Start deployment in background (no await)
    deployContainerAsync(
      container.id,
      validatedData,
      deploymentCost,
      user.organization_id!,
    ).catch((error) => {
      console.error(
        "❌ [handleCreateContainer] Background deployment failed:",
        error,
      );
      // Error handling is already done inside deployContainerAsync
      // Container status will be set to "failed" with error message
    });

    // Return immediately with container info and polling instructions
    return NextResponse.json(
      {
        success: true,
        data: container,
        message:
          "Container deployment started. Poll GET /api/v1/containers/:id to check status. CloudFormation deployment typically takes 8-12 minutes.",
        creditsDeducted: deploymentCost,
        creditsRemaining: newBalance,
        polling: {
          endpoint: `/api/v1/containers/${container.id}`,
          intervalMs: 10000, // Suggest polling every 10 seconds
          expectedDurationMs: 600000, // 10 minutes
        },
      },
      { status: 202 }, // 202 Accepted - request accepted, processing asynchronously
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
  console.log(
    `🚀 [deployContainerAsync] Starting deployment for container: ${containerId}`,
  );

  const { cloudFormationService } = await import(
    "@/lib/services/cloudformation"
  );

  try {
    // Update status to building
    console.log(`📝 [deployContainerAsync] Updating status to 'building'`);
    try {
      await updateContainerStatus(containerId, "building", {
        deploymentLog: "Provisioning dedicated EC2 instance and ECS cluster...",
      });
      console.log(`✅ [deployContainerAsync] Status updated to 'building'`);
    } catch (dbError) {
      console.error(`❌ [deployContainerAsync] DB update failed:`, dbError);
      throw dbError;
    }

    // Check if shared infrastructure is deployed
    console.log(`🔍 [deployContainerAsync] Checking shared infrastructure...`);
    let sharedInfraExists: boolean;
    try {
      sharedInfraExists =
        await cloudFormationService.isSharedInfrastructureDeployed();
      console.log(
        `📊 [deployContainerAsync] Shared infrastructure exists: ${sharedInfraExists}`,
      );
    } catch (cfError) {
      const errorMsg =
        cfError instanceof Error ? cfError.message : String(cfError);
      console.error(
        `❌ [deployContainerAsync] CloudFormation check failed:`,
        errorMsg,
        cfError,
      );
      throw cfError;
    }

    if (!sharedInfraExists) {
      throw new Error(
        "Shared infrastructure not deployed. Contact support or deploy infrastructure first.",
      );
    }

    // Create CloudFormation stack for this user
    const architecture = config.architecture || "arm64";
    const instanceType = architecture === "arm64" ? "t4g.small" : "t3.small";

    console.log(`📝 [deployContainerAsync] Updating status to 'deploying'`);
    await updateContainerStatus(containerId, "deploying", {
      deploymentLog: `Creating CloudFormation stack (1x ${instanceType} ${architecture === "arm64" ? "ARM" : "x86_64"} instance)...`,
    });

    console.log(`☁️ [deployContainerAsync] Creating CloudFormation stack...`, {
      userId: containerId,
      containerName: config.name,
      ecrImageUri: config.ecr_image_uri,
      port: config.port,
      cpu: config.cpu,
      memory: config.memory,
    });

    // Prepare environment variables for the container
    // Include platform-level vars (OPENAI_API_KEY) + user-provided vars
    const environmentVars: Record<string, string> = {
      // Platform-level environment variables
      ...(process.env.OPENAI_API_KEY && {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      }),

      // User-provided environment variables from container config
      ...(config.environment_vars || {}),
    };

    console.log(
      `🔐 [deployContainerAsync] Injecting ${Object.keys(environmentVars).length} environment variables (including OPENAI_API_KEY and DATABASE_URL)`,
    );

    // Get container to check if this is an update
    const container = await getContainer(containerId, organizationId);
    const isUpdate = container?.is_update === "true";

    const stackConfig = {
      userId: organizationId, // Use organizationId (not containerId) for per-user stack naming
      projectName: config.project_name,
      userEmail: config.name, // Using container name as identifier
      containerImage: config.ecr_image_uri,
      containerPort: config.port,
      containerCpu: config.cpu,
      containerMemory: config.memory,
      architecture: architecture, // Pass architecture for instance type selection
      keyName: process.env.EC2_KEY_NAME,
      environmentVars: environmentVars,
    };

    // Use update or create based on whether project exists
    let stackId: string;
    try {
      if (isUpdate) {
        console.log(
          `🔄 [deployContainerAsync] Updating existing CloudFormation stack for project "${config.project_name}"...`,
        );
        stackId = await cloudFormationService.updateUserStack(stackConfig);
      } else {
        console.log(
          `🆕 [deployContainerAsync] Creating new CloudFormation stack for project "${config.project_name}"...`,
        );
        console.log(`[DEBUG] About to call createUserStack with config:`, {
          userId: stackConfig.userId,
          projectName: stackConfig.projectName,
          architecture: stackConfig.architecture,
        });
        stackId = await cloudFormationService.createUserStack(stackConfig);
        console.log(`[DEBUG] createUserStack returned stackId: ${stackId}`);
      }

      console.log(
        `✅ [deployContainerAsync] CloudFormation stack ${isUpdate ? "update" : "creation"} initiated: ${stackId}`,
      );
    } catch (stackError) {
      const errorMsg =
        stackError instanceof Error ? stackError.message : String(stackError);
      console.error(
        `❌ [deployContainerAsync] CloudFormation stack ${isUpdate ? "update" : "creation"} failed:`,
        errorMsg,
      );
      console.error(`[DEBUG] Full stack error:`, stackError);
      throw stackError;
    }

    // Store the stack name in container metadata for future reference
    // Use organizationId (not containerId) to match stack creation
    const stackName = cloudFormationService.getStackName(
      organizationId,
      config.project_name,
    );
    await updateContainerStatus(containerId, "deploying", {
      cloudformationStackName: stackName,
      deploymentLog: `CloudFormation stack "${stackName}" creation initiated. Stack will be monitored by cron job.`,
    });

    console.log(
      `✅ [deployContainerAsync] Stack creation initiated: ${stackName}. Cron job will monitor completion.`,
    );

    // NOTE: We do NOT wait for stack completion here.
    // The /api/v1/cron/deployment-monitor endpoint will periodically check
    // all "deploying" containers and update their status when CloudFormation completes.
    // This prevents Vercel serverless function timeout issues.
  } catch (error) {
    // This catch handles errors during initial stack creation only (not waiting for completion)
    console.error("Deployment initiation failed:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown deployment error";

    // Update container status to failed
    await updateContainerStatus(containerId, "failed", {
      errorMessage: errorMessage,
      deploymentLog: `Deployment initiation failed: ${errorMessage}`,
    });

    // CRITICAL: Refund credits for failed deployment
    let refundSuccessful = false;

    // Attempt refund with retries
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await creditsService.addCredits({
          organizationId,
          amount: deploymentCost,
          description: `Refund for failed container deployment: ${config.name}`,
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
          console.error(
            `🚨 CRITICAL: Failed to refund ${deploymentCost} credits to org ${organizationId} for container ${containerId}. MANUAL INTERVENTION REQUIRED.`,
            { containerId, organizationId, deploymentCost, error: refundError },
          );
        } else {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)),
          );
        }
      }
    }

    // Attempt to cleanup CloudFormation stack (use organizationId for stack name)
    try {
      await cloudFormationService.deleteUserStack(
        organizationId,
        config.project_name,
      );
      console.log(
        `✅ CloudFormation stack deletion initiated for org ${organizationId}, project ${config.project_name}`,
      );
    } catch (cfError) {
      console.warn(`⚠️  Failed to delete CloudFormation stack:`, cfError);
      // Stack may not exist yet
    }

    // Release ALB priority (use organizationId)
    try {
      const { dbPriorityManager } = await import(
        "@/lib/services/alb-priority-manager"
      );
      await dbPriorityManager.releasePriority(organizationId);
      console.log(`✅ Released ALB priority for org ${organizationId}`);
    } catch (priorityError) {
      console.warn(`⚠️  Failed to release ALB priority:`, priorityError);
    }

    if (!refundSuccessful) {
      await updateContainerStatus(containerId, "failed", {
        errorMessage: `${errorMessage} | REFUND FAILED - MANUAL INTERVENTION REQUIRED`,
        deploymentLog: `${errorMessage} | Refund failed - admin must manually credit ${deploymentCost} credits to org ${organizationId}`,
      });
    }

    console.log(`Deployment initiation cleanup completed for container ${containerId}:`, {
      status: "failed",
      refundSuccessful,
      requiresManualIntervention: !refundSuccessful,
    });
  }
}
