/**
 * Bot Server API
 *
 * GET   /api/v1/bots/[botId]/servers/[serverId] - Get server details
 * PATCH /api/v1/bots/[botId]/servers/[serverId] - Update server settings
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { botsService } from "@/lib/services/bots";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string; serverId: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { botId, serverId } = await params;

  const connection = await botsService.getConnection(botId);
  if (!connection || connection.organization_id !== user.organization_id) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  const server = await botsService.getServer(serverId);
  if (!server || server.connection_id !== botId) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }

  return NextResponse.json({
    server: {
      id: server.id,
      serverId: server.server_id,
      serverName: server.server_name,
      serverIcon: server.server_icon,
      memberCount: server.member_count,
      enabled: server.enabled,
      enabledAgents: server.enabled_agents,
      agentSettings: server.agent_settings,
      channelMappings: server.channel_mappings,
    },
  });
}

const UpdateSchema = z.object({
  enabled: z.boolean().optional(),
  enabledAgents: z.array(z.string()).optional(),
  agentSettings: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .optional(),
  channelMappings: z.record(z.string(), z.string()).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string; serverId: string }> },
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { botId, serverId } = await params;

  const connection = await botsService.getConnection(botId);
  if (!connection || connection.organization_id !== user.organization_id) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const server = await botsService.updateServer(serverId, parsed.data);
  if (!server)
    return NextResponse.json({ error: "Server not found" }, { status: 404 });

  return NextResponse.json({
    server: {
      id: server.id,
      serverId: server.server_id,
      serverName: server.server_name,
      enabled: server.enabled,
      enabledAgents: server.enabled_agents,
    },
  });
}
