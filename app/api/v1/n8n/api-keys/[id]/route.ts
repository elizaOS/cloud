/**
 * N8N API Key API - Individual API Key
 *
 * PATCH /api/v1/n8n/api-keys/:id - Update API key (revoke/activate)
 * DELETE /api/v1/n8n/api-keys/:id - Delete API key permanently
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { n8nWorkflowApiKeysRepository } from "@/db/repositories/n8n-workflows";
import { logger } from "@/lib/utils/logger";
import { z } from "zod";

const UpdateApiKeySchema = z.object({
  isActive: z.boolean().optional(),
  name: z.string().min(1).optional(),
});

/**
 * PATCH /api/v1/n8n/api-keys/:id
 * Updates an API key (can revoke or reactivate).
 */
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;

  const apiKey = await n8nWorkflowApiKeysRepository.findById(id);
  if (!apiKey || apiKey.organization_id !== user.organization_id) {
    return NextResponse.json(
      { success: false, error: "API key not found" },
      { status: 404 }
    );
  }

  const body = await request.json();
  const validation = UpdateApiKeySchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request", details: validation.error.format() },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {};
  if (validation.data.isActive !== undefined) {
    updates.is_active = validation.data.isActive;
  }
  if (validation.data.name !== undefined) {
    updates.name = validation.data.name;
  }

  const updated = await n8nWorkflowApiKeysRepository.update(id, updates);

  logger.info(`[N8N API Keys] Updated API key: ${id}`, {
    isActive: updates.is_active,
    nameChanged: !!updates.name,
  });

  return NextResponse.json({
    success: true,
    apiKey: {
      id: updated?.id,
      name: updated?.name,
      keyPrefix: updated?.key_prefix,
      isActive: updated?.is_active,
      scopes: updated?.scopes,
      expiresAt: updated?.expires_at,
      lastUsedAt: updated?.last_used_at,
      updatedAt: updated?.updated_at,
    },
  });
}

/**
 * DELETE /api/v1/n8n/api-keys/:id
 * Deletes an API key permanently.
 */
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { id } = await ctx.params;

  const apiKey = await n8nWorkflowApiKeysRepository.findById(id);
  if (!apiKey || apiKey.organization_id !== user.organization_id) {
    return NextResponse.json(
      { success: false, error: "API key not found" },
      { status: 404 }
    );
  }

  await n8nWorkflowApiKeysRepository.delete(id);

  logger.info(`[N8N API Keys] Deleted API key: ${id}`);

  return NextResponse.json({ success: true });
}


