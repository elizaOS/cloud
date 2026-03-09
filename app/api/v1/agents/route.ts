import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireServiceKey, ServiceKeyAuthError } from "@/lib/auth/service-key";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const provisionSchema = z.object({
  tokenContractAddress: z.string().min(1),
  chain: z.string().min(1),
  chainId: z.number().int().positive(),
  tokenName: z.string().min(1),
  tokenTicker: z.string().min(1),
  launchType: z.enum(["native", "imported"]),
  character: z
    .object({
      name: z.string().min(1),
      bio: z.string().optional(),
      avatar: z.string().optional(),
      config: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  billing: z
    .object({
      mode: z.enum(["owner_credits", "waifu_treasury_subsidy", "hybrid"]),
      initialReserveUsd: z.number().nonnegative().optional(),
    })
    .optional(),
});

/**
 * POST /api/v1/agents
 *
 * Service-to-service endpoint for waifu.fun to provision a Milady cloud agent.
 * Auth: X-Service-Key header.
 *
 * Returns { cloudAgentId, status, jobId? }
 */
export async function POST(request: NextRequest) {
  let identity;
  try {
    identity = requireServiceKey(request);
  } catch (e) {
    if (e instanceof ServiceKeyAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.error("[service-api] Service key config error", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Service authentication misconfigured" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = provisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request data", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const p = parsed.data;
  const agentName = p.character?.name || p.tokenName;

  logger.info("[service-api] Provisioning agent", {
    token: p.tokenContractAddress,
    chain: p.chain,
    chainId: p.chainId,
    orgId: identity.organizationId,
  });

  // 1. Create sandbox record
  const agent = await miladySandboxService.createAgent({
    organizationId: identity.organizationId,
    userId: identity.userId,
    agentName,
    agentConfig: {
      tokenContractAddress: p.tokenContractAddress,
      chain: p.chain,
      chainId: p.chainId,
      tokenName: p.tokenName,
      tokenTicker: p.tokenTicker,
      launchType: p.launchType,
      character: p.character,
      billing: p.billing,
    },
    environmentVars: {
      TOKEN_CONTRACT_ADDRESS: p.tokenContractAddress,
      TOKEN_CHAIN: p.chain,
      TOKEN_CHAIN_ID: String(p.chainId),
      TOKEN_NAME: p.tokenName,
      TOKEN_TICKER: p.tokenTicker,
    },
  });

  // 2. Kick off provisioning (Neon DB + sandbox container)
  const result = await miladySandboxService.provision(agent.id, identity.organizationId);

  if (!result.success) {
    logger.error("[service-api] Provision failed", {
      agentId: agent.id,
      error: result.error,
    });

    return NextResponse.json(
      {
        cloudAgentId: agent.id,
        status: result.sandboxRecord?.status ?? "error",
        error: result.error,
      },
      { status: 502 },
    );
  }

  logger.info("[service-api] Agent provisioned", {
    agentId: agent.id,
    status: result.sandboxRecord.status,
  });

  return NextResponse.json(
    {
      cloudAgentId: agent.id,
      status: result.sandboxRecord.status,
    },
    { status: 201 },
  );
}
