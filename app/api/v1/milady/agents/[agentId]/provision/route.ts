import { NextRequest, NextResponse } from "next/server";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { MILADY_PRICING } from "@/lib/constants/milady-pricing";
import { assertSafeOutboundUrl } from "@/lib/security/outbound-url";
import { checkMiladyCreditGate } from "@/lib/services/milady-billing-gate";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { provisioningJobService } from "@/lib/services/provisioning-jobs";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
// Reduced from 120s — async path returns 202 immediately.
// Sync fallback (?sync=true) still needs headroom for legacy callers.
export const maxDuration = 120;

const CORS_METHODS = "POST, OPTIONS";

export function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

function getProvisionFailureStatus(error?: string): 404 | 409 | 500 {
  if (error === "Agent not found") return 404;
  if (error === "Agent is already being provisioned") return 409;
  return 500;
}

function sanitizeProvisionFailureMessage(
  error: string | undefined,
  status: 404 | 409 | 500,
): string {
  if (status !== 500) {
    return error ?? "Provisioning failed";
  }

  return "Provisioning failed";
}

function sanitizeEnqueueFailureMessage(error: string, status: 404 | 409 | 500): string {
  if (status !== 500) {
    return error;
  }

  return "Failed to start provisioning";
}

/**
 * POST /api/v1/milady/agents/[agentId]/provision
 *
 * Provision (or re-provision) the sandbox for a Milady cloud agent.
 *
 * **Default (async):** Creates a provisioning job and returns 202 with a jobId.
 * Poll GET /api/v1/jobs/{jobId} for status.
 *
 * **Sync fallback:** Pass `?sync=true` to get the old blocking behaviour
 * (useful during migration). Will be removed in a future release.
 *
 * Idempotent: if the sandbox is already running, returns 200 with
 * existing connection info (no job created).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { agentId } = await params;
    // Always use async job queue — sync provisioning is disabled in production
    // because the VPS worker handles SSH/Docker operations that can't run in
    // serverless functions. The sync path remains in code for local dev only.
    const sync = false;

    logger.info("[milady-api] Provision requested", {
      agentId,
      orgId: user.organization_id,
      async: !sync,
    });

    // Fast path: check if already running (no job needed)
    const existing = await miladySandboxService.getAgentForWrite(agentId, user.organization_id!);
    if (!existing) {
      return applyCorsHeaders(
        NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 }),
        CORS_METHODS,
      );
    }

    if (existing.status === "running" && existing.bridge_url && existing.health_url) {
      return applyCorsHeaders(
        NextResponse.json({
          success: true,
          data: {
            id: existing.id,
            agentName: existing.agent_name,
            status: existing.status,
            bridgeUrl: existing.bridge_url,
            healthUrl: existing.health_url,
          },
        }),
        CORS_METHODS,
      );
    }

    // ── Credit gate: require minimum deposit before provisioning ──────
    const creditCheck = await checkMiladyCreditGate(user.organization_id);
    if (!creditCheck.allowed) {
      logger.warn("[milady-api] Provision blocked: insufficient credits", {
        agentId,
        orgId: user.organization_id,
        balance: creditCheck.balance,
        required: MILADY_PRICING.MINIMUM_DEPOSIT,
      });
      return applyCorsHeaders(
        NextResponse.json(
          {
            success: false,
            error: creditCheck.error,
            requiredBalance: MILADY_PRICING.MINIMUM_DEPOSIT,
            currentBalance: creditCheck.balance,
          },
          { status: 402 },
        ),
        CORS_METHODS,
      );
    }

    // ── Sync fallback (legacy) ────────────────────────────────────────
    if (sync) {
      const result = await miladySandboxService.provision(agentId, user.organization_id!);

      if (!result.success) {
        const status = getProvisionFailureStatus(result.error);
        const clientError = sanitizeProvisionFailureMessage(result.error, status);

        if (status === 500) {
          logger.error("[milady-api] Sync provision failed", {
            agentId,
            orgId: user.organization_id,
            error: result.error,
          });
        }

        return applyCorsHeaders(
          NextResponse.json({ success: false, error: clientError }, { status }),
          CORS_METHODS,
        );
      }

      return applyCorsHeaders(
        NextResponse.json({
          success: true,
          data: {
            id: result.sandboxRecord.id,
            agentName: result.sandboxRecord.agent_name,
            status: result.sandboxRecord.status,
            bridgeUrl: result.bridgeUrl,
            healthUrl: result.healthUrl,
          },
        }),
        CORS_METHODS,
      );
    }

    // ── Async path (default) ──────────────────────────────────────────
    const webhookUrl = request.headers.get("x-webhook-url") ?? undefined;
    if (webhookUrl) {
      try {
        await assertSafeOutboundUrl(webhookUrl);
      } catch (error) {
        return applyCorsHeaders(
          NextResponse.json(
            {
              success: false,
              error: error instanceof Error ? error.message : "Invalid webhook URL",
            },
            { status: 400 },
          ),
          CORS_METHODS,
        );
      }
    }

    let enqueueResult;
    try {
      enqueueResult = await provisioningJobService.enqueueMiladyProvisionOnce({
        agentId,
        organizationId: user.organization_id!,
        userId: user.id,
        agentName: existing.agent_name ?? agentId,
        webhookUrl,
        expectedUpdatedAt: existing.updated_at,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status =
        message === "Agent not found"
          ? 404
          : message === "Agent state changed while starting"
            ? 409
            : 500;

      if (status === 500) {
        logger.error("[milady-api] Failed to enqueue provisioning job", {
          agentId,
          orgId: user.organization_id,
          error: message,
        });
      }

      return applyCorsHeaders(
        NextResponse.json(
          {
            success: false,
            error: sanitizeEnqueueFailureMessage(message, status),
          },
          { status },
        ),
        CORS_METHODS,
      );
    }

    const { job, created } = enqueueResult;

    return applyCorsHeaders(
      NextResponse.json(
        {
          success: true,
          created,
          alreadyInProgress: !created,
          message: created
            ? "Provisioning job created. Poll the job endpoint for status."
            : "Provisioning is already in progress. Poll the existing job for status.",
          data: {
            jobId: job.id,
            agentId,
            status: job.status,
            estimatedCompletionAt: job.estimated_completion_at,
          },
          polling: {
            endpoint: `/api/v1/jobs/${job.id}`,
            intervalMs: 5000,
            expectedDurationMs: 90000,
          },
        },
        { status: created ? 202 : 409 },
      ),
      CORS_METHODS,
    );
  } catch (error) {
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}
