import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { creditsService } from "@/lib/services/credits";
import { usageService } from "@/lib/services/usage";
import {
  containersService,
  listContainers,
  getContainer,
  updateContainerStatus,
  type NewContainer,
} from "@/lib/services/containers";
import { QuotaExceededError } from "@/lib/services/container-quota";
import { creditEventEmitter } from "@/lib/events/credit-events";
import {
  calculateDeploymentCost,
  CONTAINER_LIMITS,
} from "@/lib/constants/pricing";
import { isFeatureConfigured } from "@/lib/config/env-validator";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { z } from "zod";
import {
  loadContainerSecrets,
  isSecretsConfigured,
} from "@/lib/services/secrets";
import { getDWSContainerService } from "@/lib/services/dws/containers";

export const dynamic = "force-dynamic";
// Set max duration for container deployments
// DWS deployments typically take 2-5 minutes
export const maxDuration = 300; // 5 minutes

const createContainerSchema = z.object({
  name: z.string().min(1).max(100),
  project_name: z.string().min(1).max(50), // Project identifier for multi-project support
  description: z.string().optional(),
  port: z.number().int().min(1).max(65535).default(3000),
  desired_count: z.number().int().min(1).max(10).default(1),
  cpu: z.number().int().min(256).max(2048).default(1792), // CPU units
  memory: z.number().int().min(256).max(2048).default(1792), // Memory in MB
  environment_vars: z.record(z.string(), z.string()).optional(),
  health_check_path: z.string().default("/health"),

  // Container image fields (DWS supports Docker images or IPFS CIDs)
  container_image: z.string(), // Required: Docker image URI or IPFS CID
  dws_image_cid: z.string().optional(), // Optional: Direct IPFS CID
  image_tag: z.string().optional(),

  // Architecture field for multi-platform support
  architecture: z.enum(["arm64", "x86_64"]).optional().default("arm64"),

  // TEE configuration
  tee_required: z.boolean().optional().default(false),
});

/**
 * GET /api/v1/containers
 * Lists all containers for the authenticated user's organization.
 *
 * @param request - The Next.js request object.
 * @returns Array of container objects.
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
    logger.error("Error fetching containers:", error);
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
 * Creates and deploys a new container to DWS.
 * Rate limited: 5 deployments per 5 minutes.
 *
 * @param request - Request body with container configuration.
 * @returns Created container details and deployment status.
 */
async function handleCreateContainer(request: NextRequest) {
  try {
    // Check if container feature is configured
    if (!isFeatureConfigured("containers")) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Container deployments are not configured. Please set DWS_API_URL and DWS_NETWORK.",
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

    // Validate container image
    if (!validatedData.container_image) {
      return NextResponse.json(
        {
          success: false,
          error: "container_image is required",
          details: {
            hint: "Provide a Docker image URI or use dws_image_cid for IPFS-stored images",
          },
        },
        { status: 400 },
      );
    }

    // Check if a container with this project_name already exists for this user
    const existingContainers = await listContainers(user.organization_id!);
    const existingProject = existingContainers.find(
      (c) =>
        c.user_id === user.id && c.project_name === validatedData.project_name,
    );

    const isUpdate = !!existingProject;

    let container;
    let newBalance: number;
    let deploymentCost: number;

    if (isUpdate && existingProject) {
      // UPDATE: Update the existing container record
      const updateData = {
        name: validatedData.name,
        description: validatedData.description,
        dws_image_cid: validatedData.dws_image_cid,
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
          container_image: validatedData.container_image,
          is_update: true,
          previous_image: existingProject.metadata?.container_image,
          architecture: validatedData.architecture,
          tee_required: validatedData.tee_required,
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
      const containerData: NewContainer = {
        name: validatedData.name,
        project_name: validatedData.project_name,
        description: validatedData.description,
        organization_id: user.organization_id!!,
        user_id: user.id,
        api_key_id: apiKey?.id || null,
        dws_image_cid: validatedData.dws_image_cid,
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
          container_image: validatedData.container_image,
          is_update: false,
          architecture: validatedData.architecture,
          tee_required: validatedData.tee_required,
        },
      };

      // Calculate deployment cost
      deploymentCost = calculateDeploymentCost({
        desiredCount: validatedData.desired_count,
        cpu: validatedData.cpu,
        memory: validatedData.memory,
        includeUpload: false,
      });

      // CRITICAL: Wrap container creation AND credit deduction in a single transaction
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
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        if (errorMessage.includes("Insufficient balance")) {
          return NextResponse.json(
            {
              success: false,
              error: errorMessage,
              requiredCredits: deploymentCost,
            },
            { status: 402 },
          );
        }

        throw error;
      }

      // Create usage record for audit trail
      await usageService.create({
        organization_id: user.organization_id!!,
        user_id: user.id,
        api_key_id: apiKey?.id,
        type: "container_deployment",
        provider: "dws",
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
        provider: "dws",
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

    // Create DWS container stack
    try {
      const dwsContainerId = await initiateDWSContainerDeployment(
        container.id,
        validatedData,
        user.organization_id!,
      );

      // Return immediately with container info and polling instructions
      return NextResponse.json(
        {
          success: true,
          data: container,
          message:
            "Container deployment started. Poll GET /api/v1/containers/:id to check status. DWS deployment typically takes 2-5 minutes.",
          creditsDeducted: deploymentCost,
          creditsRemaining: newBalance,
          dwsContainerId,
          polling: {
            endpoint: `/api/v1/containers/${container.id}`,
            intervalMs: 5000, // Poll every 5 seconds
            expectedDurationMs: 180000, // 3 minutes
          },
        },
        { status: 202 },
      );
    } catch (stackError) {
      logger.error(
        `[handleCreateContainer] DWS container creation failed:`,
        stackError,
      );

      // Update container status to failed
      await updateContainerStatus(container.id, "failed", {
        errorMessage:
          stackError instanceof Error
            ? stackError.message
            : "DWS container creation failed",
      });

      // Refund credits
      try {
        await creditsService.addCredits({
          organizationId: user.organization_id!,
          amount: deploymentCost,
          description: `Refund for failed container deployment: ${validatedData.name}`,
          metadata: { type: "refund" },
        });
      } catch (refundError) {
        logger.error(`Failed to refund credits:`, refundError);
      }

      return NextResponse.json(
        {
          success: false,
          error:
            stackError instanceof Error
              ? stackError.message
              : "DWS container creation failed",
          containerId: container.id,
        },
        { status: 500 },
      );
    }
  } catch (error) {
    logger.error("Error creating container:", error);

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

    // Handle duplicate container name errors
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
 * Initiates DWS container deployment
 * This creates the container stack in DWS and returns the container ID
 */
async function initiateDWSContainerDeployment(
  containerId: string,
  config: z.infer<typeof createContainerSchema>,
  organizationId: string,
): Promise<string> {
  const dwsContainerService = getDWSContainerService();

  // Update status to building
  await updateContainerStatus(containerId, "building", {
    deploymentLog: "Provisioning DWS container...",
  });

  // Determine architecture
  const architecture = config.architecture || "arm64";

  // Update status to deploying
  await updateContainerStatus(containerId, "deploying", {
    deploymentLog: `Creating DWS container stack (${architecture} architecture)...`,
  });

  // Load encrypted secrets (org + container-scoped)
  const encryptedSecrets = isSecretsConfigured()
    ? await loadContainerSecrets({ organizationId, containerId })
    : {};

  // Priority: secrets (highest) > user env vars > platform defaults
  const environmentVars: Record<string, string> = {
    ...(process.env.OPENAI_API_KEY && {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    }),
    ...(config.environment_vars || {}),
    ...encryptedSecrets,
  };

  // Get container to check if this is an update
  const container = await getContainer(containerId, organizationId);
  const isUpdate = container?.is_update === "true";

  const stackConfig = {
    userId: organizationId,
    projectName: config.project_name,
    userEmail: config.name,
    containerImage: config.container_image,
    containerPort: config.port,
    containerCpu: config.cpu,
    containerMemory: config.memory,
    architecture: architecture,
    environmentVars: environmentVars,
    teeRequired: config.tee_required ?? false,
    minInstances: config.desired_count,
    maxInstances: Math.min(config.desired_count * 3, 10),
    healthCheckPath: config.health_check_path,
  };

  // Create or update DWS container stack
  let result;
  if (isUpdate) {
    result = await dwsContainerService.updateStack(
      organizationId,
      config.project_name,
      stackConfig,
    );
  } else {
    result = await dwsContainerService.createStack(stackConfig);
  }

  // Update container with DWS container ID
  await updateContainerStatus(containerId, "deploying", {
    dwsContainerId: result.stackId,
    dwsDeploymentId: result.stackId,
    deploymentLog: `DWS container "${result.stackName}" deployment initiated. Monitoring for completion...`,
  });

  return result.stackId;
}
