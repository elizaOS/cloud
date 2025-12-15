/**
 * Discord Webhook Handler
 *
 * POST /api/webhooks/discord
 *
 * Handles incoming Discord interactions (commands, messages, etc.)
 * Verifies request signatures and routes to appropriate org agents.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { db } from "@/db";
import {
  orgPlatformConnections,
  orgPlatformServers,
} from "@/db/schemas/org-platforms";
import { eq, and } from "drizzle-orm";
import nacl from "tweetnacl";

const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

interface DiscordInteraction {
  id: string;
  type: number;
  data?: {
    id: string;
    name: string;
    options?: Array<{
      name: string;
      type: number;
      value: string;
    }>;
    custom_id?: string;
  };
  guild_id?: string;
  channel_id?: string;
  member?: {
    user: {
      id: string;
      username: string;
      discriminator: string;
    };
    roles: string[];
  };
  user?: {
    id: string;
    username: string;
    discriminator: string;
  };
  token: string;
  application_id: string;
}

// Discord interaction types
const INTERACTION_TYPES = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
} as const;

// Discord interaction response types
const RESPONSE_TYPES = {
  PONG: 1,
  CHANNEL_MESSAGE: 4,
  DEFERRED_CHANNEL_MESSAGE: 5,
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
  AUTOCOMPLETE_RESULT: 8,
  MODAL: 9,
} as const;

/**
 * Verify Discord request signature
 */
function verifyDiscordSignature(
  body: string,
  signature: string,
  timestamp: string,
): boolean {
  if (!DISCORD_PUBLIC_KEY) {
    logger.error("[Discord Webhook] DISCORD_PUBLIC_KEY not configured");
    return false;
  }

  const message = Buffer.from(timestamp + body);
  const sig = Buffer.from(signature, "hex");
  const key = Buffer.from(DISCORD_PUBLIC_KEY, "hex");

  return nacl.sign.detached.verify(message, sig, key);
}

/**
 * Find the org connection for a Discord application
 */
async function findOrgConnection(applicationId: string) {
  const [connection] = await db
    .select()
    .from(orgPlatformConnections)
    .where(
      and(
        eq(orgPlatformConnections.platform, "discord"),
        eq(orgPlatformConnections.platform_bot_id, applicationId),
        eq(orgPlatformConnections.status, "active"),
      ),
    )
    .limit(1);

  return connection;
}

/**
 * Check if a guild/server is enabled for the organization
 */
async function isServerEnabled(
  connectionId: string,
  guildId: string,
): Promise<boolean> {
  const [server] = await db
    .select()
    .from(orgPlatformServers)
    .where(
      and(
        eq(orgPlatformServers.connection_id, connectionId),
        eq(orgPlatformServers.server_id, guildId),
        eq(orgPlatformServers.enabled, true),
      ),
    )
    .limit(1);

  return !!server;
}

/**
 * Send a followup message to Discord
 */
async function sendFollowup(
  applicationId: string,
  interactionToken: string,
  content: string,
  ephemeral = false,
): Promise<void> {
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      flags: ephemeral ? 64 : 0,
    }),
  });
}

/**
 * Update the original interaction message
 */
async function updateInteractionMessage(
  applicationId: string,
  interactionToken: string,
  content: string,
  removeComponents = false,
): Promise<void> {
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`;

  await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      embeds: [],
      components: removeComponents ? [] : undefined,
    }),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");

  // Verify signature
  if (!signature || !timestamp) {
    return NextResponse.json(
      { error: "Missing signature headers" },
      { status: 401 },
    );
  }

  if (!verifyDiscordSignature(body, signature, timestamp)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const interaction: DiscordInteraction = JSON.parse(body);

  logger.info("[Discord Webhook] Received interaction", {
    type: interaction.type,
    applicationId: interaction.application_id,
    guildId: interaction.guild_id,
    channelId: interaction.channel_id,
  });

  // Handle ping (required for Discord verification)
  if (interaction.type === INTERACTION_TYPES.PING) {
    return NextResponse.json({ type: RESPONSE_TYPES.PONG });
  }

  // Find org connection for this Discord application
  const connection = await findOrgConnection(interaction.application_id);
  if (!connection) {
    logger.warn(
      "[Discord Webhook] No active connection found for application",
      {
        applicationId: interaction.application_id,
      },
    );
    return NextResponse.json({
      type: RESPONSE_TYPES.CHANNEL_MESSAGE,
      data: {
        content:
          "This bot is not configured. Please contact the administrator.",
        flags: 64,
      },
    });
  }

  // Check if guild is enabled (if in a guild)
  if (interaction.guild_id) {
    const serverEnabled = await isServerEnabled(
      connection.id,
      interaction.guild_id,
    );
    if (!serverEnabled) {
      logger.debug("[Discord Webhook] Server not enabled", {
        guildId: interaction.guild_id,
        connectionId: connection.id,
      });
      return NextResponse.json({
        type: RESPONSE_TYPES.CHANNEL_MESSAGE,
        data: {
          content: "This bot is not enabled for this server.",
          flags: 64,
        },
      });
    }
  }

  // Handle application commands
  if (interaction.type === INTERACTION_TYPES.APPLICATION_COMMAND) {
    const commandName = interaction.data?.name;
    const userId = interaction.member?.user?.id || interaction.user?.id;

    logger.info("[Discord Webhook] Processing command", {
      command: commandName,
      guildId: interaction.guild_id,
      userId,
      organizationId: connection.organization_id,
    });

    // Defer response while processing
    // Fire-and-forget: Send followup with actual response later
    void (async () => {
      // Basic command handling - in production, route to org agent
      let responseContent = `Command \`/${commandName}\` received. Agent routing not yet implemented.`;

      if (commandName === "help") {
        responseContent =
          "Available commands:\n• `/help` - Show this help message\n• `/ping` - Check bot status";
      } else if (commandName === "ping") {
        responseContent = "Pong! 🏓 Bot is online and responding.";
      }

      await sendFollowup(
        interaction.application_id,
        interaction.token,
        responseContent,
      );
    })();

    return NextResponse.json({
      type: RESPONSE_TYPES.DEFERRED_CHANNEL_MESSAGE,
    });
  }

  // Handle message components (buttons, selects)
  if (interaction.type === INTERACTION_TYPES.MESSAGE_COMPONENT) {
    const customId = interaction.data?.custom_id;
    const userId = interaction.member?.user?.id || interaction.user?.id;
    const username =
      interaction.member?.user?.username || interaction.user?.username;

    logger.info("[Discord Webhook] Processing component interaction", {
      customId,
      guildId: interaction.guild_id,
      userId,
    });

    // Handle reply confirmation buttons
    if (
      customId?.startsWith("reply_confirm:") ||
      customId?.startsWith("reply_reject:")
    ) {
      const [action, confirmationId] = customId.split(":");
      const isConfirm = action === "reply_confirm";

      // Defer immediately, then process
      void (async () => {
        const { replyRouterService } =
          await import("@/lib/services/social-feed/reply-router");

        if (isConfirm) {
          const result = await replyRouterService.handleConfirmation(
            confirmationId,
            connection.organization_id,
            userId ?? "unknown",
            username,
          );

          const message = result.success
            ? `✅ Reply posted successfully!${result.postUrl ? `\n${result.postUrl}` : ""}`
            : `❌ Failed to post reply: ${result.error}`;

          await updateInteractionMessage(
            interaction.application_id,
            interaction.token,
            message,
            true,
          );
        } else {
          await replyRouterService.handleRejection(
            confirmationId,
            connection.organization_id,
            userId ?? "unknown",
          );

          await updateInteractionMessage(
            interaction.application_id,
            interaction.token,
            "❌ Reply was not sent.",
            true,
          );
        }
      })();

      return NextResponse.json({
        type: RESPONSE_TYPES.DEFERRED_UPDATE_MESSAGE,
      });
    }

    return NextResponse.json({
      type: RESPONSE_TYPES.DEFERRED_UPDATE_MESSAGE,
    });
  }

  // Handle autocomplete
  if (interaction.type === INTERACTION_TYPES.AUTOCOMPLETE) {
    return NextResponse.json({
      type: RESPONSE_TYPES.AUTOCOMPLETE_RESULT,
      data: {
        choices: [],
      },
    });
  }

  return NextResponse.json({
    type: RESPONSE_TYPES.CHANNEL_MESSAGE,
    data: {
      content: "Unknown interaction type",
      flags: 64,
    },
  });
}
