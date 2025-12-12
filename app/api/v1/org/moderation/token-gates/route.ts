/**
 * Token Gates API
 *
 * GET  /api/v1/org/moderation/token-gates - List token gates
 * POST /api/v1/org/moderation/token-gates - Create token gate
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { orgTokenGates } from "@/db/schemas/org-community-moderation";

const CreateSchema = z.object({
  serverId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  chain: z.enum(["solana", "ethereum", "base", "polygon", "arbitrum", "optimism"]),
  tokenType: z.enum(["token", "nft", "nft_collection"]),
  tokenAddress: z.string().min(1),
  minBalance: z.string().optional().default("1"),
  discordRoleId: z.string().optional(),
  telegramGroupId: z.string().optional(),
  removeOnFail: z.boolean().optional().default(true),
});

export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const { searchParams } = request.nextUrl;
  const serverId = searchParams.get("serverId");

  if (!serverId) {
    return NextResponse.json(
      { error: "serverId is required" },
      { status: 400 }
    );
  }

  const gates = await db
    .select()
    .from(orgTokenGates)
    .where(
      and(
        eq(orgTokenGates.server_id, serverId),
        eq(orgTokenGates.organization_id, user.organization_id)
      )
    );

  return NextResponse.json({
    tokenGates: gates.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      chain: g.chain,
      tokenType: g.token_type,
      tokenAddress: g.token_address,
      minBalance: g.min_balance,
      discordRoleId: g.discord_role_id,
      telegramGroupId: g.telegram_group_id,
      enabled: g.enabled,
      removeOnFail: g.remove_on_fail,
      createdAt: g.created_at.toISOString(),
    })),
  });
}

export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const body = await request.json();
  const parsed = CreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const data = parsed.data;

  const [gate] = await db
    .insert(orgTokenGates)
    .values({
      organization_id: user.organization_id,
      server_id: data.serverId,
      name: data.name,
      description: data.description,
      chain: data.chain,
      token_type: data.tokenType,
      token_address: data.tokenAddress,
      min_balance: data.minBalance,
      discord_role_id: data.discordRoleId,
      telegram_group_id: data.telegramGroupId,
      remove_on_fail: data.removeOnFail,
      created_by: user.id,
    })
    .returning();

  return NextResponse.json({
    success: true,
    tokenGate: {
      id: gate.id,
      name: gate.name,
      chain: gate.chain,
      tokenType: gate.token_type,
      tokenAddress: gate.token_address,
    },
  });
}


