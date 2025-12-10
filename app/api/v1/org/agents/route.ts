/**
 * Org Agents API
 *
 * GET  /api/v1/org/agents - List all org agent instances
 * POST /api/v1/org/agents - Provision all org agents for an organization
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAppAuth } from "@/lib/middleware/app-auth";
import { agentLifecycleService } from "@/lib/services/agent-lifecycle";
import { logger } from "@/lib/utils/logger";

const ORG_AGENT_TYPES = [
  "project-manager",
  "community-manager",
  "devrel",
  "social-media-manager",
  "liaison",
] as const;

export async function GET(request: NextRequest) {
  const auth = await requireAppAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { user } = auth;

  if (!user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Organization required" },
      { status: 403 }
    );
  }

  const instances = await agentLifecycleService.listInstances(
    user.organization_id
  );

  // Map instances to response format
  const agents = ORG_AGENT_TYPES.map((agentType) => {
    const instance = instances.find((i) => i.agent_type === agentType);

    return {
      agentType,
      id: instance?.id || null,
      status: instance?.status || "inactive",
      enabledPlatforms: instance?.enabled_platforms || [],
      lastActivity: instance?.last_activity_at?.toISOString(),
    };
  });

  return NextResponse.json({
    success: true,
    agents,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAppAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { user } = auth;

  if (!user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Organization required" },
      { status: 403 }
    );
  }

  logger.info("[Org Agents] Provisioning all org agents", {
    organizationId: user.organization_id,
    userId: user.id,
  });

  // Provision all agent types
  const results = await Promise.all(
    ORG_AGENT_TYPES.map(async (agentType) => {
      const existing = await agentLifecycleService.getInstance(
        user.organization_id,
        agentType
      );

      if (existing) {
        return { agentType, status: "exists", instance: existing };
      }

      const instance = await agentLifecycleService.createInstance({
        organizationId: user.organization_id,
        agentType,
        createdBy: user.id,
        enabledPlatforms: [],
      });

      return { agentType, status: "created", instance };
    })
  );

  return NextResponse.json({
    success: true,
    results: results.map((r) => ({
      agentType: r.agentType,
      status: r.status,
      instanceId: r.instance.id,
    })),
  });
}
