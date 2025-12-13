import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowApiKeysRepository } from "@/db/repositories/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { UpdateApiKeySchema, formatApiKey, ErrorResponses } from "@/lib/n8n/schemas";

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;

  const apiKey = await n8nWorkflowApiKeysRepository.findById(id);
  if (!apiKey || apiKey.organization_id !== user.organization_id) {
    return NextResponse.json(ErrorResponses.apiKeyNotFound, { status: 404 });
  }

  const body = await request.json();
  const validation = UpdateApiKeySchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(ErrorResponses.invalidRequest(validation.error.format()), { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (validation.data.isActive !== undefined) updates.is_active = validation.data.isActive;
  if (validation.data.name !== undefined) updates.name = validation.data.name;

  const updated = await n8nWorkflowApiKeysRepository.update(id, updates);
  logger.info(`[N8N API Keys] Updated API key: ${id}`, { isActive: updates.is_active, nameChanged: !!updates.name });

  return NextResponse.json({ success: true, apiKey: updated ? formatApiKey(updated) : null });
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;

  const apiKey = await n8nWorkflowApiKeysRepository.findById(id);
  if (!apiKey || apiKey.organization_id !== user.organization_id) {
    return NextResponse.json(ErrorResponses.apiKeyNotFound, { status: 404 });
  }

  await n8nWorkflowApiKeysRepository.delete(id);
  logger.info(`[N8N API Keys] Deleted API key: ${id}`);
  return NextResponse.json({ success: true });
}


