/**
 * Organization Triggers API
 *
 * GET /api/v1/triggers - List all triggers for organization
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { logger } from "@/lib/utils/logger";
import { workflowTriggerService } from "@/lib/services/workflow-triggers";
import type { WorkflowTrigger } from "@/db/schemas/workflow-triggers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  try {
    const url = new URL(request.url);
    const isActive = url.searchParams.get("isActive");
    const triggerType = url.searchParams.get("triggerType") as WorkflowTrigger["trigger_type"] | null;

    const triggers = await workflowTriggerService.getOrgTriggers(
      user.organization_id,
      {
        isActive: isActive !== null ? isActive === "true" : undefined,
        triggerType: triggerType || undefined,
      },
    );

    // Get org stats
    const stats = await workflowTriggerService.getOrgStats(user.organization_id);

    return NextResponse.json({
      triggers: triggers.map((t) => ({
        id: t.id,
        workflowId: t.workflow_id,
        name: t.name,
        description: t.description,
        triggerType: t.trigger_type,
        triggerConfig: t.trigger_config,
        responseConfig: t.response_config,
        providerFilter: t.provider_filter,
        priority: t.priority,
        isActive: t.is_active,
        triggerCount: t.trigger_count,
        lastTriggeredAt: t.last_triggered_at,
        lastError: t.last_error,
        lastErrorAt: t.last_error_at,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      })),
      stats,
    });
  } catch (error) {
    logger.error("[Triggers] Failed to list organization triggers", {
      error: error instanceof Error ? error.message : String(error),
      organizationId: user.organization_id,
    });

    return NextResponse.json(
      { error: "Failed to list triggers" },
      { status: 500 },
    );
  }
}
