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
  timestamp: string
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

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");

  // Verify signature
  if (!signature || !timestamp) {
    return NextResponse.json(
      { error: "Missing signature headers" },
      { status: 401 }
    );
  }

  if (!verifyDiscordSignature(body, signature, timestamp)) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  const interaction: DiscordInteraction = JSON.parse(body);

  logger.info("[Discord Webhook] Received interaction", {
    type: interaction.type,
    guildId: interaction.guild_id,
    channelId: interaction.channel_id,
  });

  // Handle ping (required for Discord verification)
  if (interaction.type === INTERACTION_TYPES.PING) {
    return NextResponse.json({ type: RESPONSE_TYPES.PONG });
  }

  // Handle application commands
  if (interaction.type === INTERACTION_TYPES.APPLICATION_COMMAND) {
    const commandName = interaction.data?.name;

    logger.info("[Discord Webhook] Processing command", {
      command: commandName,
      guildId: interaction.guild_id,
    });

    // Defer response while processing
    // TODO: Route to appropriate org agent based on command and guild
    return NextResponse.json({
      type: RESPONSE_TYPES.DEFERRED_CHANNEL_MESSAGE,
    });
  }

  // Handle message components (buttons, selects)
  if (interaction.type === INTERACTION_TYPES.MESSAGE_COMPONENT) {
    return NextResponse.json({
      type: RESPONSE_TYPES.DEFERRED_UPDATE_MESSAGE,
    });
  }

  return NextResponse.json({
    type: RESPONSE_TYPES.CHANNEL_MESSAGE,
    data: {
      content: "Unknown interaction type",
      flags: 64, // Ephemeral
    },
  });
}

