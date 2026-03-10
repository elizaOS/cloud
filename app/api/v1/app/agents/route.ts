import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { charactersService } from "@/lib/services/characters";
import { logger } from "@/lib/utils/logger";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { z } from "zod";
import { dbRead } from "@/db/client";
import { userCharacters } from "@/db/schemas/user-characters";
import { organizations } from "@/db/schemas/organizations";
import { userCharactersRepository } from "@/db/repositories/characters";
import { normalizeTokenAddress } from "@/lib/utils/token-address";
import { isUniqueConstraintError } from "@/lib/utils/db-errors";
import { eq, and, sql } from "drizzle-orm";
import { trackServerEvent } from "@/lib/analytics/posthog-server";

const DEFAULT_AGENT_BIO = "A helpful AI assistant";

const CreateAgentSchema = z.object({
  name: z
    .string()
    .max(100)
    .transform((s) => s.trim())
    .pipe(z.string().min(1, "Name is required")),
  bio: z
    .string()
    .optional()
    .transform((s) => s?.trim()),
  // Optional token linkage — associates this agent with an on-chain token
  tokenAddress: z.string().min(1).max(256).optional(),
  tokenChain: z.string().min(1).max(64).optional(),
  tokenName: z.string().min(1).max(128).optional(),
  tokenTicker: z.string().min(1).max(32).optional(),
});

// Agent quota limits based on organization credit balance
const AGENT_LIMITS = {
  FREE_TIER: 5, // Less than $1 balance
  STARTER: 20, // $1-$9.99 balance
  PRO: 100, // $10-$99.99 balance
  ENTERPRISE: 500, // $100+ balance
} as const;

/**
 * Gets the maximum number of agents allowed for an organization.
 * Similar to container quotas, based on credit balance.
 */
function getMaxAgentsForOrg(
  creditBalance: number,
  orgSettings?: Record<string, unknown>,
): number {
  // Check if org has custom limit in settings
  const customLimit = orgSettings?.max_agents as number | undefined;
  if (customLimit && customLimit > 0) {
    return customLimit;
  }

  // Default tiering based on credit balance (USD)
  const balance = Number(creditBalance);
  if (balance >= 100.0) {
    return AGENT_LIMITS.ENTERPRISE; // $100+
  }
  if (balance >= 10.0) {
    return AGENT_LIMITS.PRO; // $10+
  }
  if (balance >= 1.0) {
    return AGENT_LIMITS.STARTER; // $1+
  }

  return AGENT_LIMITS.FREE_TIER; // Below $1
}

/**
 * POST /api/v1/app/agents
 * Creates a new AI agent (character) for the authenticated user.
 * Supports both Privy session and API key authentication.
 * Rate limited: 10 agent creations per minute.
 * Enforces organization agent quotas and user permissions.
 *
 * @param request - Request body with name and optional bio.
 * @returns The created agent with its ID. Response includes:
 *  - success: true
 *  - agent: { id, name, username, bio, created_at }
 *  - quota information logged (agentCount, maxAgents) for monitoring
 */
async function handlePOST(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    // Check user role - only members, admins, and owners can create agents
    if (user.role === "viewer") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Insufficient permissions. Viewers cannot create agents. Please contact your organization owner.",
        },
        { status: 403 },
      );
    }

    const body = await request.json();

    const validationResult = CreateAgentSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: validationResult.error.format(),
        },
        { status: 400 },
      );
    }

    const { name, bio, tokenChain, tokenName, tokenTicker } =
      validationResult.data;
    // Normalise so EVM checksum variants are treated as the same address.
    const tokenAddress = validationResult.data.tokenAddress
      ? normalizeTokenAddress(validationResult.data.tokenAddress, tokenChain)
      : undefined;

    // Check organization agent quota
    const org = await dbRead.query.organizations.findFirst({
      where: eq(organizations.id, user.organization_id!),
      columns: {
        id: true,
        credit_balance: true,
        settings: true,
      },
    });

    if (!org) {
      return NextResponse.json(
        {
          success: false,
          error: "Organization not found",
        },
        { status: 404 },
      );
    }

    // Count existing agents for this organization
    // Note: This query runs on each creation. If agent creation becomes a bottleneck,
    // consider caching this count in Redis with invalidation on create/delete.
    const [{ count }] = await dbRead
      .select({ count: sql<number>`count(*)::int` })
      .from(userCharacters)
      .where(
        and(
          eq(userCharacters.organization_id, user.organization_id!),
          eq(userCharacters.source, "cloud"),
        ),
      );

    const maxAgents = getMaxAgentsForOrg(
      Number(org.credit_balance),
      org.settings as Record<string, unknown> | undefined,
    );

    if (count >= maxAgents) {
      return NextResponse.json(
        {
          success: false,
          error: `Agent quota exceeded. Your organization has reached the maximum of ${maxAgents} agents.`,
          details: {
            current: count,
            max: maxAgents,
            upgrade_hint:
              "Add credits to your account to increase your agent limit.",
          },
        },
        { status: 403 }, // 403 Forbidden for quota exceeded
      );
    }

    // If a token is specified, check for existing linkage (unique constraint)
    if (tokenAddress) {
      const existing = await userCharactersRepository.findByTokenAddress(
        tokenAddress,
        tokenChain,
      );
      if (existing) {
        return NextResponse.json(
          {
            success: false,
            error: `An agent is already linked to token ${tokenAddress}${tokenChain ? ` on ${tokenChain}` : ""}`,
            existingAgentId: existing.id,
          },
          { status: 409 },
        );
      }
    }

    const startTime = Date.now();
    let character;
    try {
      character = await charactersService.create({
        name,
        bio: bio ? [bio] : [DEFAULT_AGENT_BIO],
        user_id: user.id,
        organization_id: user.organization_id,
        source: "cloud",
        character_data: {},
        // Token linkage (all optional)
        ...(tokenAddress && { token_address: tokenAddress }),
        ...(tokenChain && { token_chain: tokenChain }),
        ...(tokenName && { token_name: tokenName }),
        ...(tokenTicker && { token_ticker: tokenTicker }),
      });
    } catch (error) {
      if (tokenAddress && isUniqueConstraintError(error)) {
        const existing = await userCharactersRepository.findByTokenAddress(
          tokenAddress,
          tokenChain,
        );
        return NextResponse.json(
          {
            success: false,
            error: `An agent is already linked to token ${tokenAddress}${tokenChain ? ` on ${tokenChain}` : ""}`,
            existingAgentId: existing?.id,
          },
          { status: 409 },
        );
      }
      throw error;
    }

    // Track agent creation in PostHog using internal UUID
    trackServerEvent(user.id, "agent_create_completed", {
      agent_id: character.id,
      agent_name: character.name,
      source: "quick_create",
      has_custom_bio: !!bio,
      creation_time_ms: Date.now() - startTime,
      agent_count: count + 1,
      is_first_agent: count === 0,
    });

    logger.info(`[Agents API] Created agent: ${character.id}`, {
      agentId: character.id,
      name: character.name,
      userId: user.id,
      organizationId: user.organization_id,
      agentCount: count + 1,
      maxAgents,
    });

    return NextResponse.json(
      {
        success: true,
        agent: {
          id: character.id,
          name: character.name,
          username: character.username,
          bio: character.bio,
          created_at: character.created_at,
          // Token linkage (null when not linked)
          token_address: character.token_address ?? null,
          token_chain: character.token_chain ?? null,
          token_name: character.token_name ?? null,
          token_ticker: character.token_ticker ?? null,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error("[Agents API] Failed to create agent:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create agent",
      },
      { status: 500 },
    );
  }
}

export const POST = withRateLimit(handlePOST, RateLimitPresets.STANDARD);
