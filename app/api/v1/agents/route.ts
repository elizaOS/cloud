import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireServiceKey, ServiceKeyAuthError } from "@/lib/auth/service-key";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import { provisioningJobService } from "@/lib/services/provisioning-jobs";
import { userCharactersRepository } from "@/db/repositories/characters";
import { charactersService } from "@/lib/services/characters";
import { normalizeTokenAddress } from "@/lib/utils/token-address";
import { isUniqueConstraintError } from "@/lib/utils/db-errors";
import { z } from "zod";

export const dynamic = "force-dynamic";
// Reduced from 120s for async default; sync fallback still needs headroom.
export const maxDuration = 120;

const provisionSchema = z.object({
  tokenContractAddress: z.string().min(1).max(256),
  chain: z.string().min(1).max(50),
  chainId: z.number().int().positive(),
  tokenName: z.string().min(1).max(200),
  tokenTicker: z.string().min(1).max(30),
  launchType: z.enum(["native", "imported"]),
  character: z
    .object({
      name: z.string().min(1).max(200),
      bio: z.string().max(5000).optional(),
      avatar: z.string().url().max(2048).optional(),
      config: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  billing: z
    .object({
      mode: z.enum(["owner_credits", "waifu_treasury_subsidy", "hybrid"]),
      initialReserveUsd: z.number().nonnegative().optional(),
    })
    .optional(),
  /** Optional: webhook URL to receive job completion notifications */
  webhookUrl: z.string().url().max(2048).optional(),
});

/**
 * POST /api/v1/agents
 *
 * Service-to-service endpoint for waifu.fun to provision a Milady cloud agent.
 * Auth: X-Service-Key header.
 *
 * **Default (async):** Creates the agent record + enqueues a provisioning job.
 * Returns 202 with { cloudAgentId, jobId, polling }.
 * The cron processor handles Neon DB + Docker sandbox creation.
 *
 * **Sync fallback:** Pass `?sync=true` to get the old blocking behaviour.
 * Returns 201 with { cloudAgentId, status }.
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
    logger.error("[service-api] Service key config error", {
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: "Service authentication misconfigured" },
      { status: 500 },
    );
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
  const sync = request.nextUrl.searchParams.get("sync") === "true";
  const agentName = p.character?.name || p.tokenName;

  // Normalise the token address so EVM checksum variants are treated as equal.
  const normalizedTokenAddress = normalizeTokenAddress(
    p.tokenContractAddress,
    p.chain,
  );

  logger.info("[service-api] Provisioning agent", {
    token: normalizedTokenAddress,
    chain: p.chain,
    chainId: p.chainId,
    orgId: identity.organizationId,
    async: !sync,
  });

  // 0. Check for existing agent linked to this token (prevent duplicates)
  const existingChar = await userCharactersRepository.findByTokenAddress(
    normalizedTokenAddress,
    p.chain,
  );
  if (existingChar) {
    return NextResponse.json(
      {
        error: `An agent is already linked to token ${p.tokenContractAddress} on ${p.chain}`,
        existingAgentId: existingChar.id,
      },
      { status: 409 },
    );
  }

  // 0b. Create a user_character record with first-class token linkage
  let character;
  try {
    character = await charactersService.create({
      name: agentName,
      bio: p.character?.bio ? [p.character.bio] : [`Agent for ${p.tokenName}`],
      user_id: identity.userId,
      organization_id: identity.organizationId,
      source: "cloud",
      character_data: p.character?.config ?? {},
      avatar_url: p.character?.avatar ?? null,
      token_address: normalizedTokenAddress,
      token_chain: p.chain,
      token_name: p.tokenName,
      token_ticker: p.tokenTicker,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existingChar = await userCharactersRepository.findByTokenAddress(
        normalizedTokenAddress,
        p.chain,
      );
      return NextResponse.json(
        {
          error: `An agent is already linked to token ${p.tokenContractAddress} on ${p.chain}`,
          ...(existingChar?.id ? { existingAgentId: existingChar.id } : {}),
        },
        { status: 409 },
      );
    }
    throw error;
  }

  // 1. Create sandbox record (always sync — just a DB insert)
  const agent = await miladySandboxService.createAgent({
    organizationId: identity.organizationId,
    userId: identity.userId,
    agentName,
    characterId: character.id,
    agentConfig: {
      tokenContractAddress: normalizedTokenAddress,
      chain: p.chain,
      chainId: p.chainId,
      tokenName: p.tokenName,
      tokenTicker: p.tokenTicker,
      launchType: p.launchType,
      character: p.character,
      billing: p.billing,
    },
    environmentVars: {
      TOKEN_CONTRACT_ADDRESS: normalizedTokenAddress,
      TOKEN_CHAIN: p.chain,
      TOKEN_CHAIN_ID: String(p.chainId),
      TOKEN_NAME: p.tokenName,
      TOKEN_TICKER: p.tokenTicker,
    },
  });

  // ── Sync fallback (legacy) ────────────────────────────────────────
  if (sync) {
    const result = await miladySandboxService.provision(
      agent.id,
      identity.organizationId,
    );

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

    logger.info("[service-api] Agent provisioned (sync)", {
      agentId: agent.id,
      status: result.sandboxRecord.status,
    });

    return NextResponse.json(
      {
        cloudAgentId: agent.id,
        characterId: character.id,
        status: result.sandboxRecord.status,
        token_address: character.token_address ?? null,
        token_chain: character.token_chain ?? null,
        token_name: character.token_name ?? null,
        token_ticker: character.token_ticker ?? null,
      },
      { status: 201 },
    );
  }

  // ── Async path (default) ──────────────────────────────────────────
  const job = await provisioningJobService.enqueueMiladyProvision({
    agentId: agent.id,
    organizationId: identity.organizationId,
    userId: identity.userId,
    agentName,
    webhookUrl: p.webhookUrl,
  });

  logger.info("[service-api] Agent provisioning job enqueued", {
    agentId: agent.id,
    jobId: job.id,
  });

  return NextResponse.json(
    {
      cloudAgentId: agent.id,
      characterId: character.id,
      status: "pending",
      jobId: job.id,
      polling: {
        endpoint: `/api/v1/jobs/${job.id}`,
        intervalMs: 5000,
        expectedDurationMs: 90000,
      },
      token_address: character.token_address ?? null,
      token_chain: character.token_chain ?? null,
      token_name: character.token_name ?? null,
      token_ticker: character.token_ticker ?? null,
    },
    { status: 202 },
  );
}
