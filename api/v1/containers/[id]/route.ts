import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { calculateDeploymentCost } from "@/lib/constants/pricing";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { getContainer } from "@/lib/services/containers";
import {
  getHetznerContainersClient,
  HetznerClientError,
} from "@/lib/services/containers/hetzner-client";
import { creditsService } from "@/lib/services/credits";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const ContainerPatchBody = z.object({
  action: z.string().optional(),
  environment_vars: z.record(z.string(), z.string()).optional(),
  desired_count: z.number().optional(),
});

// TODO(auth): `requireAuthOrApiKeyWithOrg` is owned by Agent D's
// Privy → Steward rewrite. Container routes only consume the resolved
// user / apiKey, so they need no auth changes here.

/**
 * GET /api/v1/containers/[id]
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { id: containerId } = await params;

    const summary = await getHetznerContainersClient().getContainer(
      containerId,
      user.organization_id!,
    );

    if (!summary) {
      return NextResponse.json({ success: false, error: "Container not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    logger.error("Error fetching container:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch container",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/v1/containers/[id]
 *
 * Tears down the Docker container on its Hetzner node, decrements the
 * node's allocated count, refunds prorated credits, and removes the DB
 * row.
 */
async function handleDELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!context) {
    return NextResponse.json(
      { success: false, error: "Missing route parameters" },
      { status: 400 },
    );
  }
  const { params } = context;
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { id: containerId } = await params;

    // Read the row first so we can compute the prorated refund based on
    // its actual creation time and resource allocation.
    const container = await getContainer(containerId, user.organization_id!);
    if (!container) {
      return NextResponse.json({ success: false, error: "Container not found" }, { status: 404 });
    }
    if (container.organization_id !== user.organization_id!) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    let refundAmount = 0;
    if (container.status === "running" && container.created_at) {
      const now = Date.now();
      const createdAt = new Date(container.created_at).getTime();
      const runtimeHours = (now - createdAt) / (1000 * 60 * 60);
      const runtimeDays = runtimeHours / 24;
      const deploymentCost = calculateDeploymentCost({
        desiredCount: container.desired_count || 1,
        cpu: container.cpu || 1792,
        memory: container.memory || 1792,
      });

      if (runtimeHours < 2) {
        refundAmount = Math.floor(deploymentCost * 0.75);
      } else if (runtimeDays < 1) {
        refundAmount = Math.floor(deploymentCost * 0.5);
      }

      if (refundAmount > 0) {
        await creditsService.addCredits({
          organizationId: user.organization_id!,
          amount: refundAmount,
          description: `Prorated refund for container ${container.name} (ran ${runtimeHours.toFixed(2)} hours)`,
          metadata: {
            type: "refund",
            containerId,
            runtimeHours: runtimeHours.toFixed(2),
            runtimeDays: runtimeDays.toFixed(2),
          },
        });
      }
    }

    try {
      await getHetznerContainersClient().deleteContainer(containerId, user.organization_id!);
    } catch (err) {
      if (err instanceof HetznerClientError && err.code === "container_not_found") {
        // Already gone — treat delete as idempotent.
      } else {
        throw err;
      }
    }

    return NextResponse.json({
      success: true,
      message: "Container deleted successfully",
      refundAmount: refundAmount > 0 ? refundAmount : undefined,
    });
  } catch (error) {
    logger.error("Error deleting container:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete container",
      },
      { status: 500 },
    );
  }
}

export const DELETE = withRateLimit(handleDELETE, RateLimitPresets.STANDARD);

/**
 * PATCH /api/v1/containers/[id]
 *
 * Mutates env vars (recreates the container) or restarts in-place. The
 * AWS path also supported live cpu/memory/port updates via CloudFormation
 * stack updates; on the Hetzner-Docker pool we recreate instead.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { id: containerId } = await params;
    const rawBody = await request.json();
    const parsedBody = ContainerPatchBody.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request body", details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }
    const body = parsedBody.data;

    const container = await getContainer(containerId, user.organization_id!);
    if (!container) {
      return NextResponse.json({ success: false, error: "Container not found" }, { status: 404 });
    }
    if (container.organization_id !== user.organization_id!) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    const client = getHetznerContainersClient();

    if (body.action === "restart") {
      const updated = await client.restartContainer(containerId, user.organization_id!);
      return NextResponse.json({
        success: true,
        message: "Container restart initiated",
        data: updated,
      });
    }

    if (body.environment_vars && typeof body.environment_vars === "object") {
      const updated = await client.setEnv(
        containerId,
        user.organization_id!,
        body.environment_vars,
      );
      return NextResponse.json({
        success: true,
        message: "Container env vars updated; container recreated",
        data: updated,
      });
    }

    if (body.desired_count !== undefined) {
      // Will throw `invalid_input` if !== 1.
      await client.setScale(containerId, user.organization_id!, Number(body.desired_count));
      return NextResponse.json({ success: true, message: "Scale unchanged" });
    }

    return NextResponse.json(
      {
        success: false,
        error:
          "PATCH supports `action: 'restart'`, `environment_vars: {...}`, or `desired_count: 1`. Live cpu/memory/port mutation is not supported on the Hetzner-Docker pool — DELETE and re-create instead.",
      },
      { status: 400 },
    );
  } catch (error) {
    logger.error("Error updating container:", error);

    if (error instanceof HetznerClientError) {
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
        { success: false, error: error.message, code: error.code },
        { status: statusByCode[error.code] ?? 500 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update container",
      },
      { status: 500 },
    );
  }
}
