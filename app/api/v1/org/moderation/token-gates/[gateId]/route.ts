/**
 * Token Gate Management API
 *
 * PATCH  /api/v1/org/moderation/token-gates/[gateId] - Update token gate
 * DELETE /api/v1/org/moderation/token-gates/[gateId] - Delete token gate
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { orgTokenGates } from "@/db/schemas/org-community-moderation";

const UpdateSchema = z.object({
  enabled: z.boolean().optional(),
  minBalance: z.string().optional(),
  removeOnFail: z.boolean().optional(),
  discordRoleId: z.string().optional(),
  telegramGroupId: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ gateId: string }> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { gateId } = await params;

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const [updated] = await db
    .update(orgTokenGates)
    .set({
      enabled: data.enabled,
      min_balance: data.minBalance,
      remove_on_fail: data.removeOnFail,
      discord_role_id: data.discordRoleId,
      telegram_group_id: data.telegramGroupId,
      updated_at: new Date(),
    })
    .where(
      and(
        eq(orgTokenGates.id, gateId),
        eq(orgTokenGates.organization_id, user.organization_id)
      )
    )
    .returning();

  if (!updated) {
    return NextResponse.json(
      { error: "Token gate not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    tokenGate: {
      id: updated.id,
      name: updated.name,
      enabled: updated.enabled,
      minBalance: updated.min_balance,
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ gateId: string }> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { gateId } = await params;

  const result = await db
    .delete(orgTokenGates)
    .where(
      and(
        eq(orgTokenGates.id, gateId),
        eq(orgTokenGates.organization_id, user.organization_id)
      )
    );

  return NextResponse.json({ success: true });
}


