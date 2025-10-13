import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKey } from "@/lib/auth";
import { db } from "@/db/drizzle";
import { organizations, creditTransactions } from "@/db/sass/schema";
import { eq } from "drizzle-orm";
import {
  listContainers,
  type NewContainer,
  deleteContainer,
} from "@/lib/queries/containers";
import {
  createContainerWithQuotaCheck,
  QuotaExceededError,
} from "@/lib/queries/container-quota";
import { addCredits } from "@/lib/queries/credits";
import { createUsageRecord } from "@/lib/queries/usage";
import { creditEventEmitter } from "@/lib/events/credit-events";
import { calculateDeploymentCost, CONTAINER_LIMITS } from "@/lib/constants/pricing";
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
  artifact_url: z.string().optional(), // Presigned download URL (expires in 1 hour)
  artifact_id: z.string().optional(), // Artifact ID for reference tracking
  artifact_checksum: z.string().optional(),
  
  // Optional: Allow custom image tag for self-hosted bootstrapper images
  image_tag: z.string().optional().default(process.env.BOOTSTRAPPER_IMAGE_TAG || "elizaos/bootstrapper:latest"),
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
          { status: 400 }
        );
      }

      // Validate each env var name and value size
      for (const [key, value] of Object.entries(validatedData.environment_vars)) {
        // Validate key format
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
          return NextResponse.json(
            {
              success: false,
              error: `Invalid environment variable name: '${key}'. Must start with letter/underscore and contain only alphanumeric and underscores.`,
            },
            { status: 400 }
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
            { status: 400 }
          );
        }
      }
    }

    // CRITICAL: Validate bootstrapper requirements
    // If using bootstrapper, artifact_url and artifact_checksum are REQUIRED
    if (validatedData.use_bootstrapper !== false) {
      if (!validatedData.artifact_url) {
        return NextResponse.json(
          {
            success: false,
            error: "artifact_url is required when using bootstrapper deployment (use_bootstrapper=true)",
            details: {
              field: "artifact_url",
              hint: "Upload your artifact first via POST /api/v1/artifacts/upload",
            },
          },
          { status: 400 }
        );
      }

      if (!validatedData.artifact_checksum) {
        return NextResponse.json(
          {
            success: false,
            error: "artifact_checksum is required when using bootstrapper deployment (use_bootstrapper=true)",
            details: {
              field: "artifact_checksum",
              hint: "Provide the SHA256 checksum of your artifact for integrity validation",
            },
          },
          { status: 400 }
        );
      }

      // Validate artifact_url format (must be a valid URL)
      try {
        const artifactUrlObj = new URL(validatedData.artifact_url);
        if (!artifactUrlObj.protocol.startsWith("http")) {
          return NextResponse.json(
            {
              success: false,
              error: `Invalid artifact_url protocol: ${artifactUrlObj.protocol}. Must be http or https.`,
            },
            { status: 400 }
          );
        }
      } catch (urlError) {
        return NextResponse.json(
          {
            success: false,
            error: "artifact_url must be a valid URL",
            details: {
              provided: validatedData.artifact_url,
              error: urlError instanceof Error ? urlError.message : "Invalid URL format",
            },
          },
          { status: 400 }
        );
      }

      // Validate artifact_checksum format (must be 64-char hex string for SHA256)
      const checksumPattern = /^[a-f0-9]{64}$/i;
      if (!checksumPattern.test(validatedData.artifact_checksum)) {
        return NextResponse.json(
          {
            success: false,
            error: "artifact_checksum must be a valid SHA256 hash (64 hexadecimal characters)",
            details: {
              provided: validatedData.artifact_checksum,
              expected: "64-character hexadecimal string",
            },
          },
          { status: 400 }
        );
      }
    }

    // Prepare container data for bootstrapper architecture
    const containerData: NewContainer = {
      name: validatedData.name,
      description: validatedData.description,
      organization_id: user.organization_id,
      user_id: user.id,
      api_key_id: apiKey?.id || null,
      image_tag: validatedData.image_tag || process.env.BOOTSTRAPPER_IMAGE_TAG || "elizaos/bootstrapper:latest",
      port: validatedData.port,
      max_instances: validatedData.max_instances,
      environment_vars: validatedData.environment_vars || {},
      health_check_path: validatedData.health_check_path,
      status: "pending",
      // Store bootstrapper-specific fields in metadata
      // CRITICAL: Store artifact_id for reliable reference tracking
      metadata: {
        use_bootstrapper: validatedData.use_bootstrapper !== false,
        artifact_id: validatedData.artifact_id, // Primary reference for cleanup
        artifact_url: validatedData.artifact_url, // Presigned URL (expires)
        artifact_checksum: validatedData.artifact_checksum,
      },
    };

    // Calculate deployment cost upfront
    const deploymentCost = calculateDeploymentCost({
      maxInstances: validatedData.max_instances,
      includeUpload: false, // Upload is charged separately
    });

    // CRITICAL: Wrap container creation AND credit deduction in a single transaction
    // This prevents race condition where container exists but credits fail to deduct
    let container;
    let creditResult;
    
    try {
      const result = await db.transaction(async (tx) => {
        // Step 1: Create container within transaction
        const newContainer = await createContainerWithQuotaCheck(containerData, tx);
        
        // Step 2: Check credits within the same transaction
        const org = await tx.query.organizations.findFirst({
          where: eq(organizations.id, user.organization_id),
        });

        if (!org) {
          throw new Error("Organization not found");
        }

        if (org.credit_balance < deploymentCost) {
          // Transaction will rollback, container won't be created
          throw new Error(`Insufficient credits. Required: ${deploymentCost}, Available: ${org.credit_balance}`);
        }

        const newBalance = org.credit_balance - deploymentCost;

        // Step 3: Deduct credits within transaction
        await tx
          .update(organizations)
          .set({
            credit_balance: newBalance,
            updated_at: new Date(),
          })
          .where(eq(organizations.id, user.organization_id));

        // Step 4: Create credit transaction record
        const [creditTx] = await tx
          .insert(creditTransactions)
          .values({
            organization_id: user.organization_id,
            user_id: user.id,
            amount: -deploymentCost,
            type: "usage",
            description: `Container deployment: ${validatedData.name}`,
          })
          .returning();

        return {
          container: newContainer,
          creditResult: { success: true, newBalance, transaction: creditTx },
        };
      });

      container = result.container;
      creditResult = result.creditResult;

      creditEventEmitter.emitCreditUpdate({
        organizationId: user.organization_id,
        newBalance: creditResult.newBalance,
        delta: -deploymentCost,
        reason: `Container deployment: ${validatedData.name}`,
        userId: user.id,
        timestamp: new Date(),
      });

    } catch (error) {
      // Transaction rolled back - no orphaned container or credit inconsistency
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
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
        creditsRemaining: creditResult.newBalance,
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
  const { TimeoutError, withTimeout } = await import("@/lib/errors/deployment-errors");

  try {
    // Update status to building
    await updateContainerStatus(containerId, "building");

    // Initialize Cloudflare service
    const cloudflare = getCloudflareService();

    // Deploy to Cloudflare
    await updateContainerStatus(containerId, "deploying");

    // Note: Artifact download credentials are generated and injected
    // by the CloudflareService.deployContainerBinding() method
    
    // Add timeout to prevent deployments from hanging indefinitely
    const DEPLOYMENT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
    const deployment = await withTimeout(
      async () => cloudflare.deployContainer({
        name: config.name,
        imageTag: config.image_tag || "latest",
        port: config.port,
        maxInstances: config.max_instances,
        environmentVars: config.environment_vars,
        healthCheckPath: config.health_check_path,
        useBootstrapper: config.use_bootstrapper,
        artifactUrl: config.artifact_url,
        artifactChecksum: config.artifact_checksum,
      }),
      DEPLOYMENT_TIMEOUT_MS,
      "deployContainer"
    );

    // Update container with deployment info
    await updateContainerStatus(containerId, "running", {
      cloudflareWorkerId: deployment.workerId,
      cloudflareContainerId: deployment.containerId,
      cloudflareUrl: deployment.url,
      deploymentLog: `Deployed successfully to ${deployment.url}`,
    });

    console.log(`✅ Container ${containerId} deployed successfully to ${deployment.url}`);
  } catch (error) {
    console.error("Deployment failed:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown deployment error";
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
        await addCredits(
          organizationId,
          deploymentCost,
          "refund",
          `Refund for failed container deployment: ${config.name}${isTimeout ? " (timeout)" : ""}`,
        );
        console.log(`✅ Refunded ${deploymentCost} credits for failed deployment of container ${containerId}`);
        refundSuccessful = true;
        break;
      } catch (refundError) {
        console.error(`❌ Refund attempt ${attempt}/3 failed:`, refundError);
        if (attempt === 3) {
          // CRITICAL: Log to monitoring system for manual intervention
          console.error(
            `🚨 CRITICAL: Failed to refund ${deploymentCost} credits to org ${organizationId} for container ${containerId}. MANUAL INTERVENTION REQUIRED.`,
            { containerId, organizationId, deploymentCost, error: refundError }
          );
          // In production, this should trigger an alert/notification
          // TODO: Add alert to monitoring system (e.g., Sentry, DataDog)
        } else {
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
        }
      }
    }

    // Attempt rollback with retries
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await deleteContainer(containerId, organizationId);
        console.log(`✅ Rolled back failed container ${containerId} (deleted from database)`);
        rollbackSuccessful = true;
        break;
      } catch (rollbackError) {
        console.error(`❌ Rollback attempt ${attempt}/3 failed:`, rollbackError);
        if (attempt === 3) {
          console.error(
            `⚠️  Failed to delete failed container ${containerId}. Container marked as 'failed' but not removed.`,
            { containerId, organizationId, error: rollbackError }
          );
          // This is less critical than refund - admin can clean up later
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
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

