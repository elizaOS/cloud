/**
 * Org Agent Enable/Disable API
 *
 * POST /api/v1/org/agents/[agentType]/enable - Enable or disable an agent
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAppAuth } from "@/lib/middleware/app-auth";
import { agentLifecycleService } from "@/lib/services/agent-lifecycle";
import { logger } from "@/lib/utils/logger";

const EnableSchema = z.object({
  enabled: z.boolean(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentType: string }> },
) {
  const auth = await requireAppAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { user } = auth;
  const { agentType } = await params;

  if (!user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Organization required" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const validation = EnableSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request" },
      { status: 400 },
    );
  }

  const { enabled } = validation.data;

  let instance = await agentLifecycleService.getInstance(
    user.organization_id,
    agentType,
  );

  // Create instance if it doesn't exist and enabling
  if (!instance && enabled) {
    instance = await agentLifecycleService.createInstance({
      organizationId: user.organization_id,
      agentType,
      createdBy: user.id,
      enabledPlatforms: [],
    });
  }

  if (!instance) {
    return NextResponse.json(
      { success: false, error: "Agent not found" },
      { status: 404 },
    );
  }

  const newStatus = enabled ? "active" : "inactive";

  logger.info("[Org Agents] Toggling agent status", {
    organizationId: user.organization_id,
    agentType,
    instanceId: instance.id,
    enabled,
    newStatus,
  });

  await agentLifecycleService.updateInstance(instance.id, {
    status: newStatus,
    last_activity_at: new Date(),
  });

  // Log activity
  await agentLifecycleService.logActivity(instance.id, {
    action: enabled ? "enabled" : "disabled",
    userId: user.id,
    details: { previousStatus: instance.status },
  });

  return NextResponse.json({
    success: true,
    status: newStatus,
    agentType,
    instanceId: instance.id,
  });
}
