/**
 * Discord Disconnect API
 *
 * Disconnects the bot from a Discord guild or all guilds.
 * 
 * Query params:
 * - guildId (optional): Specific guild to disconnect. If not provided, disconnects all.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { discordAutomationService } from "@/lib/services/discord-automation";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 60;

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  // Get guildId from query params (DELETE requests shouldn't have body)
  const guildId = request.nextUrl.searchParams.get("guildId");

  if (guildId) {
    // Disconnect specific guild
    const guild = await discordAutomationService.getGuild(
      user.organization_id,
      guildId,
    );
    if (!guild) {
      return NextResponse.json({ error: "Guild not found" }, { status: 404 });
    }

    const result = await discordAutomationService.disconnect(
      user.organization_id,
      guildId,
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    logger.info("[Discord Disconnect] Guild disconnected", {
      organizationId: user.organization_id,
      guildId,
    });

    return NextResponse.json({ success: true });
  }

  // Disconnect all guilds
  await discordAutomationService.disconnectAll(user.organization_id);

  logger.info("[Discord Disconnect] All guilds disconnected", {
    organizationId: user.organization_id,
  });

  return NextResponse.json({ success: true });
}
