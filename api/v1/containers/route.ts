import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sanitizeErrorMessage } from "@/lib/analytics/posthog";
import { trackServerEvent } from "@/lib/analytics/posthog-server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { isFeatureConfigured } from "@/lib/config/env-validator";
import { CONTAINER_LIMITS, calculateDeploymentCost } from "@/lib/constants/pricing";
import { creditEventEmitter } from "@/lib/events/credit-events";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { QuotaExceededError } from "@/lib/services/container-quota";
import {
  HetznerClientError,
  getHetznerContainersClient,
} from "@/lib/services/containers/hetzner-client";
import { listContainers } from "@/lib/services/containers";
import {
  type CreditReservation,
  creditsService,
  InsufficientCreditsError,
} from "@/lib/services/credits";
import { discordService } from "@/lib/services/discord";
import { usageService } from "@/lib/services/usage";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
// Container creation is async: POST returns 202 with the container row in
// `building`/`deploying` and the cron monitor flips it to `running` once
// the Docker health check reports healthy. The route itself only blocks
// on the SSH `docker pull/create/start` sequence (~20-60s typical),
// well below any sane HTTP / Workers timeout.
export const maxDuration = 90;

// TODO(auth): `requireAuthOrApiKeyWithOrg` lives in `@/lib/auth` and is
// part of Agent D's Privy → Steward rewrite. Container routes are
// transparent to the rewrite — they read the resolved user / apiKey only.

const createContainerSchema = z.object({
  name: z.string().min(1).max(100),
  project_name: z.string().min(1).max(50),
  description: z.string().optional(),
  port: z.number().int().min(1).max(65535).default(3000),
  desired_count: z.number().int().min(1).max(1).default(1),
  cpu: z.number().int().min(256).max(2048).default(1792),
  memory: z.number().int().min(256).max(2048).default(1792),
  environment_vars: z.record(z.string(), z.string()).optional(),
  health_check_path: z.string().default("/health"),
  /** Full image reference (e.g. `ghcr.io/owner/repo:tag`). */
  image: z.string().min(1),
});

/**
 * GET /api/v1/containers
 * Lists all containers for the authenticated user's organization.
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
        error: error instanceof Error ? error.message : "Failed to fetch containers",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/v1/containers
 * Creates and deploys a new container on the Hetzner-Docker pool.
 * Rate limited: 5 deployments per 5 minutes.
 */
async function handleCreateContainer(request: NextRequest) {
  try {
    if (!isFeatureConfigured("containers")) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Container deployments are not configured. Set MILADY_SSH_KEY (base64-encoded SSH key) and register at least one Hetzner Docker node via POST /api/v1/admin/docker-nodes.",
        },
        { status: 503 },
      );
    }

    const { user, apiKey } = await requireAuthOrApiKeyWithOrg(request);
    const body = await request.json();
    const validatedData = createContainerSchema.parse(body);

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

      for (const [key, value] of Object.entries(validatedData.environment_vars)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
          return NextResponse.json(
            {
              success: false,
              error: `Invalid environment variable name: '${key}'.`,
            },
            { status: 400 },
          );
        }

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

    const deploymentCost = calculateDeploymentCost({
      desiredCount: validatedData.desired_count,
      cpu: validatedData.cpu,
      memory: validatedData.memory,
    });

    let reservation: CreditReservation;
    try {
      reservation = await creditsService.reserve({
        organizationId: user.organization_id!,
        amount: deploymentCost,
        userId: user.id,
        description: `Container deployment: ${validatedData.name}`,
      });
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        return NextResponse.json(
          {
            success: false,
            error: `Insufficient balance. Required: $${deploymentCost.toFixed(2)}`,
            requiredCredits: deploymentCost,
          },
          { status: 402 },
        );
      }
      throw error;
    }

    const client = getHetznerContainersClient();
    let summary;
    try {
      summary = await client.createContainer({
        name: validatedData.name,
        projectName: validatedData.project_name,
        description: validatedData.description,
        organizationId: user.organization_id!,
        userId: user.id,
        apiKeyId: apiKey?.id,
        image: validatedData.image,
        port: validatedData.port,
        desiredCount: validatedData.desired_count,
        cpu: validatedData.cpu,
        memoryMb: validatedData.memory,
        healthCheckPath: validatedData.health_check_path,
        environmentVars: validatedData.environment_vars,
      });
    } catch (createError) {
      // Refund reservation on failure
      await reservation.reconcile(0).catch((err) => {
        logger.error("Failed to refund reservation after create error", err);
      });

      const message =
        createError instanceof Error ? createError.message : "Container create failed";
      logger.error("[handleCreateContainer] failed", { error: message });

      trackServerEvent(user.id, "container_deploy_failed", {
        container_name: validatedData.name,
        error_message: sanitizeErrorMessage(message),
      });

      if (createError instanceof HetznerClientError) {
        const statusByCode: Record<HetznerClientError["code"], number> = {
          container_not_found: 404,
          no_capacity: 503,
          image_pull_failed: 502,
          container_create_failed: 500,
          container_stop_failed: 500,
          ssh_unreachable: 503,
          invalid_input: 400,
        };
        return NextResponse.json(
          {
            success: false,
            error: message,
            code: createError.code,
          },
          { status: statusByCode[createError.code] ?? 500 },
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: message,
        },
        { status: 500 },
      );
    }

    await reservation.reconcile(deploymentCost);
    const newBalance = reservation.reservedAmount;

    creditEventEmitter.emitCreditUpdate({
      organizationId: user.organization_id!,
      newBalance,
      delta: -deploymentCost,
      reason: `Container deployment: ${validatedData.name}`,
      userId: user.id,
      timestamp: new Date(),
    });

    // Usage record marked successful=false until the cron monitor sees the
    // container reach `running`. Same convention the AWS path used.
    await usageService.create({
      organization_id: user.organization_id!,
      user_id: user.id,
      api_key_id: apiKey?.id,
      type: "container_deployment",
      provider: "hetzner_docker",
      input_cost: String(deploymentCost),
      output_cost: String(0),
      is_successful: false,
      metadata: {
        container_id: summary.id,
        container_name: validatedData.name,
        project_name: validatedData.project_name,
        desired_count: validatedData.desired_count,
        cpu: validatedData.cpu,
        memory: validatedData.memory,
        port: validatedData.port,
        is_update: false,
        node_id: summary.metadata?.nodeId,
      },
    });

    discordService
      .logContainerLaunched({
        containerId: summary.id,
        containerName: validatedData.name,
        projectName: validatedData.project_name,
        userId: user.id,
        organizationId: user.organization_id!,
        ecrImageUri: validatedData.image,
        architecture: "arm64",
        cpu: validatedData.cpu,
        memory: validatedData.memory,
        port: validatedData.port,
        desiredCount: validatedData.desired_count,
        cost: deploymentCost,
        isUpdate: false,
        stackName: summary.metadata?.containerName ?? summary.id,
      })
      .catch((err) => {
        logger.warn("[CONTAINER DEPLOYMENT] Failed to send Discord notification", {
          containerId: summary.id,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      });

    trackServerEvent(user.id, "container_deploy_started", {
      container_id: summary.id,
      container_name: validatedData.name,
      cpu: validatedData.cpu,
      memory: validatedData.memory,
      cost: deploymentCost,
    });

    return NextResponse.json(
      {
        success: true,
        data: summary,
        message:
          "Container deployment started. Poll GET /api/v1/containers/:id to check status. Hetzner-Docker provisioning typically takes 30–90s.",
        creditsDeducted: deploymentCost,
        creditsRemaining: newBalance,
        polling: {
          endpoint: `/api/v1/containers/${summary.id}`,
          intervalMs: 5000,
          expectedDurationMs: 60_000,
        },
      },
      { status: 202 },
    );
  } catch (error) {
    logger.error("Error creating container:", error);

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

    if (error instanceof QuotaExceededError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          quota: { current: error.current, max: error.max },
        },
        { status: 403 },
      );
    }

    if (
      error instanceof Error &&
      (error.message.includes("unique constraint") || error.message.includes("duplicate key"))
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "A container with this name already exists in your organization",
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create container",
      },
      { status: 500 },
    );
  }
}

export const POST = withRateLimit(handleCreateContainer, RateLimitPresets.CRITICAL);
