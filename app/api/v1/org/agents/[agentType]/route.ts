/**
 * Org Agent Instance API
 *
 * GET    /api/v1/org/agents/[agentType] - Get agent instance details
 * PUT    /api/v1/org/agents/[agentType] - Update agent configuration
 * DELETE /api/v1/org/agents/[agentType] - Delete agent instance
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAppAuth } from "@/lib/middleware/app-auth";
import { agentLifecycleService } from "@/lib/services/agent-lifecycle";
import { logger } from "@/lib/utils/logger";

const UpdateAgentSchema = z.object({
  enabledPlatforms: z.array(z.string()).optional(),
  platformConfigs: z
    .object({
      discord: z
        .object({
          enabled: z.boolean(),
          serverId: z.string().optional(),
          channelIds: z.array(z.string()).optional(),
        })
        .optional(),
      telegram: z
        .object({
          enabled: z.boolean(),
          chatIds: z.array(z.string()).optional(),
        })
        .optional(),
      twitter: z
        .object({
          enabled: z.boolean(),
          autoPost: z.boolean().optional(),
          postFrequency: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  settings: z
    .object({
      responseStyle: z.string().optional(),
      autoReply: z.boolean().optional(),
      mentionRequired: z.boolean().optional(),
    })
    .optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentType: string }> },
) {
  const auth = await requireAppAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { user } = auth;
  const { agentType } = await params;

  if (!user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Organization required" },
      { status: 403 },
    );
  }

  const instance = await agentLifecycleService.getInstance(
    user.organization_id,
    agentType,
  );

  if (!instance) {
    return NextResponse.json(
      { success: false, error: "Agent not found" },
      { status: 404 },
    );
  }

  // Get configuration
  const config = await agentLifecycleService.getConfig(instance.id);

  return NextResponse.json({
    success: true,
    agent: {
      id: instance.id,
      agentType: instance.agent_type,
      status: instance.status,
      enabledPlatforms: instance.enabled_platforms || [],
      platformConfigs: config?.platform_configs || {},
      settings: config?.settings || {},
      lastActivity: instance.last_activity_at?.toISOString(),
      createdAt: instance.created_at.toISOString(),
    },
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ agentType: string }> },
) {
  const auth = await requireAppAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { user } = auth;
  const { agentType } = await params;

  if (!user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Organization required" },
      { status: 403 },
    );
  }

  const body = await request.json();
  const validation = UpdateAgentSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid request",
        details: validation.error.format(),
      },
      { status: 400 },
    );
  }

  const data = validation.data;

  logger.info("[Org Agents] Updating agent configuration", {
    organizationId: user.organization_id,
    agentType,
  });

  let instance = await agentLifecycleService.getInstance(
    user.organization_id,
    agentType,
  );

  // Create instance if it doesn't exist
  if (!instance) {
    instance = await agentLifecycleService.createInstance({
      organizationId: user.organization_id,
      agentType,
      createdBy: user.id,
      enabledPlatforms: data.enabledPlatforms || [],
      platformConfigs: data.platformConfigs,
    });
  }

  // Update configuration
  await agentLifecycleService.updateConfig(instance.id, {
    platformConfigs: data.platformConfigs,
    settings: data.settings,
  });

  // Update enabled platforms if provided
  if (data.enabledPlatforms) {
    await agentLifecycleService.updateInstance(instance.id, {
      enabled_platforms: data.enabledPlatforms,
    });
  }

  // Refetch updated instance
  instance = await agentLifecycleService.getInstance(
    user.organization_id,
    agentType,
  );

  const config = await agentLifecycleService.getConfig(instance!.id);

  return NextResponse.json({
    success: true,
    agent: {
      id: instance!.id,
      agentType: instance!.agent_type,
      status: instance!.status,
      enabledPlatforms: instance!.enabled_platforms || [],
      platformConfigs: config?.platform_configs || {},
      settings: config?.settings || {},
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ agentType: string }> },
) {
  const auth = await requireAppAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { user } = auth;
  const { agentType } = await params;

  if (!user.organization_id) {
    return NextResponse.json(
      { success: false, error: "Organization required" },
      { status: 403 },
    );
  }

  const instance = await agentLifecycleService.getInstance(
    user.organization_id,
    agentType,
  );

  if (!instance) {
    return NextResponse.json(
      { success: false, error: "Agent not found" },
      { status: 404 },
    );
  }

  await agentLifecycleService.deleteInstance(instance.id);

  logger.info("[Org Agents] Agent deleted", {
    organizationId: user.organization_id,
    agentType,
    instanceId: instance.id,
  });

  return NextResponse.json({
    success: true,
    message: "Agent deleted successfully",
  });
}
