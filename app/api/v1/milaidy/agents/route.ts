import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { userCharactersRepository } from "@/db/repositories/characters";
import { miladySandboxService } from "@/lib/services/milaidy-sandbox";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createAgentSchema = z.object({
  agentName: z.string().min(1).max(100),
  characterId: z.string().uuid().optional(),
  agentConfig: z.record(z.string(), z.unknown()).optional(),
  environmentVars: z.record(z.string(), z.string()).optional(),
});

/**
 * GET /api/v1/milady/agents
 * List all Milady cloud agents for the authenticated user's organization.
 */
export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const agents = await miladySandboxService.listAgents(user.organization_id);

  const characterIds = Array.from(
    new Set(
      agents
        .map((a) => a.character_id)
        .filter((id): id is string => id != null),
    ),
  );
  const characters =
    characterIds.length > 0
      ? await userCharactersRepository.findByIdsInOrganization(
          characterIds,
          user.organization_id,
        )
      : [];
  const charMap = new Map(characters.map((c) => [c.id, c]));

  return NextResponse.json({
    success: true,
    data: agents.map((a) => {
      const char = a.character_id ? charMap.get(a.character_id) : undefined;
      // Fallback: extract from agent_config JSONB if character record not linked
      const cfg = a.agent_config as Record<string, unknown> | null;
      return {
        id: a.id,
        agentName: a.agent_name,
        status: a.status,
        databaseStatus: a.database_status,
        lastBackupAt: a.last_backup_at,
        lastHeartbeatAt: a.last_heartbeat_at,
        errorMessage: a.error_message,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
        // Canonical token linkage
        token_address:
          char?.token_address ??
          (cfg?.tokenContractAddress as string | undefined) ??
          null,
        token_chain:
          char?.token_chain ?? (cfg?.chain as string | undefined) ?? null,
        token_name:
          char?.token_name ?? (cfg?.tokenName as string | undefined) ?? null,
        token_ticker:
          char?.token_ticker ??
          (cfg?.tokenTicker as string | undefined) ??
          null,
      };
    }),
  });
}

/**
 * POST /api/v1/milady/agents
 * Create a new Milady cloud agent.
 */
export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const body = await request.json();

  const parsed = createAgentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request data",
        details: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  if (parsed.data.characterId) {
    const character =
      await userCharactersRepository.findByIdInOrganizationForWrite(
        parsed.data.characterId,
        user.organization_id,
      );

    if (!character) {
      return NextResponse.json(
        {
          success: false,
          error: "Character not found",
        },
        { status: 404 },
      );
    }
  }

  // Strip reserved __milady* keys from user-supplied agentConfig to prevent
  // callers from spoofing internal flags (e.g. __miladyCharacterOwnership)
  // that control delete-time character cleanup behaviour.
  const sanitizedConfig = parsed.data.agentConfig
    ? Object.fromEntries(
        Object.entries(parsed.data.agentConfig).filter(
          ([k]) => !k.startsWith("__milady"),
        ),
      )
    : undefined;

  const agent = await miladySandboxService.createAgent({
    organizationId: user.organization_id,
    userId: user.id,
    agentName: parsed.data.agentName,
    characterId: parsed.data.characterId,
    agentConfig: parsed.data.characterId
      ? {
          ...sanitizedConfig,
          __miladyCharacterOwnership: "reuse-existing",
        }
      : sanitizedConfig,
    environmentVars: parsed.data.environmentVars,
  });

  logger.info("[milady-api] Agent created", {
    agentId: agent.id,
    orgId: user.organization_id,
  });

  return NextResponse.json(
    {
      success: true,
      data: {
        id: agent.id,
        agentName: agent.agent_name,
        status: agent.status,
        createdAt: agent.created_at,
      },
    },
    { status: 201 },
  );
}
