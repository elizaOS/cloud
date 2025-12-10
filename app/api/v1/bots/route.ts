/**
 * Bot Connections API
 *
 * Connect Discord, Telegram, and Twitter bots to your organization.
 * Works via session, API key, or app token auth.
 *
 * GET  /api/v1/bots - List connected bots
 * POST /api/v1/bots - Connect a new bot
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { botsService, validateDiscordBotToken, validateTelegramBotToken } from "@/lib/services/bots";
import { logger } from "@/lib/utils/logger";

export async function GET(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const connections = await botsService.getConnections(user.organization_id);
  const bots = await Promise.all(connections.map(async (c) => {
    const servers = await botsService.getServers(c.id);
    return {
      id: c.id,
      platform: c.platform,
      botId: c.platform_bot_id,
      botUsername: c.platform_bot_username,
      botName: c.platform_bot_name,
      status: c.status,
      errorMessage: c.error_message,
      connectedAt: c.connected_at?.toISOString(),
      lastHealthCheck: c.last_health_check?.toISOString(),
      servers: servers.map(s => ({
        id: s.id,
        serverId: s.server_id,
        serverName: s.server_name,
        serverIcon: s.server_icon,
        memberCount: s.member_count,
        enabled: s.enabled,
        enabledAgents: s.enabled_agents,
      })),
    };
  }));

  return NextResponse.json({ bots });
}

const ConnectSchema = z.discriminatedUnion("platform", [
  z.object({ platform: z.literal("discord"), botToken: z.string().min(1) }),
  z.object({ platform: z.literal("telegram"), botToken: z.string().min(1) }),
  z.object({
    platform: z.literal("twitter"),
    username: z.string().min(1),
    password: z.string().min(1),
    email: z.string().email().optional(),
    twoFactorSecret: z.string().optional(),
  }),
]);

export async function POST(request: NextRequest) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const body = await request.json();
  const parsed = ConnectSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", details: parsed.error.format() }, { status: 400 });

  const data = parsed.data;
  logger.info("[Bots] Connecting", { platform: data.platform, orgId: user.organization_id });

  if (data.platform === "discord") {
    const botInfo = await validateDiscordBotToken(data.botToken);
    const connection = await botsService.connectDiscord({
      organizationId: user.organization_id,
      userId: user.id,
      accessToken: data.botToken,
      botInfo,
    });
    const servers = await botsService.syncDiscordGuilds(connection.id, user.organization_id);
    return NextResponse.json({
      bot: { id: connection.id, platform: "discord", botId: connection.platform_bot_id, botUsername: connection.platform_bot_username, status: connection.status },
      servers: servers.map(s => ({ id: s.id, serverId: s.server_id, serverName: s.server_name, serverIcon: s.server_icon, memberCount: s.member_count })),
    });
  }

  if (data.platform === "telegram") {
    const botInfo = await validateTelegramBotToken(data.botToken);
    const connection = await botsService.connectTelegram({
      organizationId: user.organization_id,
      userId: user.id,
      botToken: data.botToken,
      botInfo,
    });
    return NextResponse.json({
      bot: { id: connection.id, platform: "telegram", botId: connection.platform_bot_id, botUsername: connection.platform_bot_username, status: connection.status },
      servers: [],
    });
  }

  if (data.platform === "twitter") {
    const connection = await botsService.connectTwitter({
      organizationId: user.organization_id,
      userId: user.id,
      username: data.username,
      email: data.email,
      password: data.password,
      twoFactorSecret: data.twoFactorSecret,
    });
    return NextResponse.json({
      bot: { id: connection.id, platform: "twitter", botId: connection.platform_bot_id, botUsername: connection.platform_bot_username, status: connection.status },
    });
  }

  return NextResponse.json({ error: "Unsupported platform" }, { status: 400 });
}

