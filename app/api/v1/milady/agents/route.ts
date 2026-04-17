import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { userCharactersRepository } from "@/db/repositories/characters";
import { errorToResponse } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { MILADY_PRICING } from "@/lib/constants/milady-pricing";
import {
  stripReservedMiladyConfigKeys,
  withReusedMiladyCharacterOwnership,
} from "@/lib/services/milady-agent-config";
import { checkMiladyCreditGate } from "@/lib/services/milady-billing-gate";
import { prepareManagedMiladyEnvironment } from "@/lib/services/milady-managed-launch";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { applyCorsHeaders, handleCorsOptions } from "@/lib/services/proxy/cors";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const CORS_METHODS = "GET, POST, OPTIONS";

export function OPTIONS() {
  return handleCorsOptions(CORS_METHODS);
}

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
  try {
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

    return applyCorsHeaders(
      NextResponse.json({
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
              char?.token_name ??
              (cfg?.tokenName as string | undefined) ??
              null,
            token_ticker:
              char?.token_ticker ??
              (cfg?.tokenTicker as string | undefined) ??
              null,
          };
        }),
      }),
      CORS_METHODS,
    );
  } catch (error) {
    logger.error("[milady-api] GET /agents error", { error });
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}

/**
 * POST /api/v1/milady/agents
 * Create a new Milady cloud agent.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const body = await request.json();

    const parsed = createAgentSchema.safeParse(body);
    if (!parsed.success) {
      return applyCorsHeaders(
        NextResponse.json(
          {
            success: false,
            error: "Invalid request data",
            details: parsed.error.issues,
          },
          { status: 400 },
        ),
        CORS_METHODS,
      );
    }

    // ── Credit gate: require minimum deposit before creating an agent ──
    const creditCheck = await checkMiladyCreditGate(user.organization_id);
    if (!creditCheck.allowed) {
      logger.warn("[milady-api] Agent creation blocked: insufficient credits", {
        orgId: user.organization_id,
        balance: creditCheck.balance,
        required: MILADY_PRICING.MINIMUM_DEPOSIT,
      });
      return applyCorsHeaders(
        NextResponse.json(
          {
            success: false,
            error: creditCheck.error,
            requiredBalance: MILADY_PRICING.MINIMUM_DEPOSIT,
            currentBalance: creditCheck.balance,
          },
          { status: 402 },
        ),
        CORS_METHODS,
      );
    }

    if (parsed.data.characterId) {
      const character =
        await userCharactersRepository.findByIdInOrganizationForWrite(
          parsed.data.characterId,
          user.organization_id,
        );

      if (!character) {
        return applyCorsHeaders(
          NextResponse.json(
            {
              success: false,
              error: "Character not found",
            },
            { status: 404 },
          ),
          CORS_METHODS,
        );
      }
    }

    // Strip reserved __milady* keys from user-supplied agentConfig to prevent
    // callers from spoofing internal lifecycle flags.
    const sanitizedConfig = stripReservedMiladyConfigKeys(
      parsed.data.agentConfig,
    );
    const managedEnvironment = await prepareManagedMiladyEnvironment({
      existingEnv: parsed.data.environmentVars,
      organizationId: user.organization_id,
      userId: user.id,
    });

    const agent = await miladySandboxService.createAgent({
      organizationId: user.organization_id,
      userId: user.id,
      agentName: parsed.data.agentName,
      characterId: parsed.data.characterId,
      agentConfig: parsed.data.characterId
        ? withReusedMiladyCharacterOwnership(sanitizedConfig)
        : sanitizedConfig,
      environmentVars: managedEnvironment.environmentVars,
    });

    logger.info("[milady-api] Agent created", {
      agentId: agent.id,
      orgId: user.organization_id,
    });

    return applyCorsHeaders(
      NextResponse.json(
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
      ),
      CORS_METHODS,
    );
  } catch (error) {
    logger.error("[milady-api] POST /agents error", { error });
    return applyCorsHeaders(errorToResponse(error), CORS_METHODS);
  }
}
