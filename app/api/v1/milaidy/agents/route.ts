import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { miladySandboxService } from "@/lib/services/milady-sandbox";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createAgentSchema = z.object({
  agentName: z.string().min(1).max(100),
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

  return NextResponse.json({
    success: true,
    data: agents.map((a) => ({
      id: a.id,
      agentName: a.agent_name,
      status: a.status,
      databaseStatus: a.database_status,
      lastBackupAt: a.last_backup_at,
      lastHeartbeatAt: a.last_heartbeat_at,
      errorMessage: a.error_message,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    })),
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
      { success: false, error: "Invalid request data", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const agent = await miladySandboxService.createAgent({
    organizationId: user.organization_id,
    userId: user.id,
    agentName: parsed.data.agentName,
    agentConfig: parsed.data.agentConfig,
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
