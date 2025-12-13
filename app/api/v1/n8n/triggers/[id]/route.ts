import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowsService } from "@/lib/services/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { UpdateTriggerSchema, formatTrigger, ErrorResponses } from "@/lib/n8n/schemas";

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id: triggerId } = await ctx.params;

  const trigger = await n8nWorkflowsService.getTrigger(triggerId);
  if (!trigger || trigger.organization_id !== user.organization_id) {
    return NextResponse.json(ErrorResponses.triggerNotFound, { status: 404 });
  }

  return NextResponse.json({ success: true, trigger: formatTrigger(trigger) });
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id: triggerId } = await ctx.params;

  const body = await request.json();
  const validation = UpdateTriggerSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(ErrorResponses.invalidRequest(validation.error.format()), { status: 400 });
  }

  const { isActive, config } = validation.data;
  if (isActive === undefined && config === undefined) {
    return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
  }

  const updated = await n8nWorkflowsService.updateTrigger(triggerId, user.organization_id, { isActive, config });

  logger.info(`[N8N Triggers] Trigger updated`, {
    triggerId,
    userId: user.id,
    organizationId: user.organization_id,
    isActive: updated.is_active,
  });

  return NextResponse.json({ success: true, trigger: formatTrigger(updated) });
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id: triggerId } = await ctx.params;

  await n8nWorkflowsService.deleteTrigger(triggerId, user.organization_id);

  logger.info(`[N8N Triggers] Trigger deleted`, {
    triggerId,
    userId: user.id,
    organizationId: user.organization_id,
  });

  return NextResponse.json({ success: true, message: "Trigger deleted successfully" });
}

