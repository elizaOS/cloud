import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { assertSafeOutboundUrl } from "@/lib/security/outbound-url";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import { provisioningJobService } from "@/lib/services/provisioning-jobs";

export const dynamic = "force-dynamic";
// Reduced from 120s — async path returns 202 immediately.
// Sync fallback (?sync=true) still needs headroom for legacy callers.
export const maxDuration = 120;

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
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { agentId } = await params;
  const sync = request.nextUrl.searchParams.get("sync") === "true";

  logger.info("[milady-api] Provision requested", {
    agentId,
    orgId: user.organization_id,
    async: !sync,
  });

  // Fast path: check if already running (no job needed)
  const existing = await miladySandboxService.getAgentForWrite(
    agentId,
    user.organization_id!,
  );
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Agent not found" },
      { status: 404 },
    );
  }

  if (
    existing.status === "running" &&
    existing.bridge_url &&
    existing.health_url
  ) {
    return NextResponse.json({
      success: true,
      data: {
        id: existing.id,
        agentName: existing.agent_name,
        status: existing.status,
        bridgeUrl: existing.bridge_url,
        healthUrl: existing.health_url,
      },
    });
  }

  // ── Sync fallback (legacy) ────────────────────────────────────────
  if (sync) {
    const result = await miladySandboxService.provision(
      agentId,
      user.organization_id!,
    );

    if (!result.success) {
      const status =
        result.error === "Agent not found"
          ? 404
          : result.error === "Agent is already being provisioned"
            ? 409
            : 500;
      return NextResponse.json(
        { success: false, error: result.error },
        { status },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: result.sandboxRecord.id,
        agentName: result.sandboxRecord.agent_name,
        status: result.sandboxRecord.status,
        bridgeUrl: result.bridgeUrl,
        healthUrl: result.healthUrl,
      },
    });
  }

  // ── Async path (default) ──────────────────────────────────────────
  const webhookUrl = request.headers.get("x-webhook-url") ?? undefined;
  if (webhookUrl) {
    try {
      await assertSafeOutboundUrl(webhookUrl);
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Invalid webhook URL",
        },
        { status: 400 },
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
    return NextResponse.json({ success: false, error: message }, { status });
  }

  const { job, created } = enqueueResult;

  return NextResponse.json(
    {
      success: created,
      error: created ? undefined : "Agent is already being provisioned",
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
  );
}
