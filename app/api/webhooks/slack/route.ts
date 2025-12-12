import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createHmac } from "crypto";
import { logger } from "@/lib/utils/logger";
import { secretsService } from "@/lib/services/secrets";
import { db } from "@/db";
import { orgPlatformConnections } from "@/db/schemas/org-platforms";
import { eq, and } from "drizzle-orm";

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

interface SlackEvent {
  type: string;
  challenge?: string;
  token?: string;
  team_id?: string;
  api_app_id?: string;
  event?: {
    type: string;
    user?: string;
    channel?: string;
    text?: string;
    ts?: string;
    thread_ts?: string;
  };
}

interface SlackInteraction {
  type: string;
  user: { id: string; username: string; name: string };
  team: { id: string };
  channel: { id: string };
  message?: { ts: string };
  actions?: Array<{
    action_id: string;
    value?: string;
    type: string;
  }>;
  response_url?: string;
  trigger_id?: string;
}

function verifySlackSignature(
  body: string,
  signature: string,
  timestamp: string
): boolean {
  if (!SLACK_SIGNING_SECRET) {
    logger.error("[Slack Webhook] SLACK_SIGNING_SECRET not configured");
    return false;
  }

  // Check timestamp is not too old (within 5 minutes)
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = "v0=" + createHmac("sha256", SLACK_SIGNING_SECRET)
    .update(sigBasestring)
    .digest("hex");

  const sigBuffer = Buffer.from(signature);
  const myBuffer = Buffer.from(mySignature);

  if (sigBuffer.length !== myBuffer.length) return false;
  return timingSafeEqual(sigBuffer, myBuffer);
}

async function findOrgConnectionByTeam(teamId: string) {
  const [connection] = await db
    .select()
    .from(orgPlatformConnections)
    .where(
      and(
        eq(orgPlatformConnections.platform, "slack"),
        eq(orgPlatformConnections.platform_bot_id, teamId),
        eq(orgPlatformConnections.status, "active")
      )
    )
    .limit(1);

  return connection;
}

async function respondToInteraction(
  responseUrl: string,
  message: string,
  replaceOriginal = true
): Promise<void> {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: message,
      replace_original: replaceOriginal,
      response_type: "in_channel",
    }),
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.text();
  const signature = request.headers.get("x-slack-signature");
  const timestamp = request.headers.get("x-slack-request-timestamp");

  // For URL verification, don't verify signature (Slack doesn't send it)
  const contentType = request.headers.get("content-type") ?? "";

  // Handle URL-encoded payload (interactions)
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(body);
    const payloadStr = params.get("payload");

    if (!payloadStr) {
      return NextResponse.json({ error: "Missing payload" }, { status: 400 });
    }

    // Verify signature for interactions
    if (!signature || !timestamp || !verifySlackSignature(body, signature, timestamp)) {
      logger.warn("[Slack Webhook] Invalid signature for interaction");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const interaction: SlackInteraction = JSON.parse(payloadStr);

    logger.info("[Slack Webhook] Received interaction", {
      type: interaction.type,
      teamId: interaction.team?.id,
      userId: interaction.user?.id,
      actions: interaction.actions?.map(a => a.action_id),
    });

    // Handle block actions (button clicks)
    if (interaction.type === "block_actions" && interaction.actions) {
      for (const action of interaction.actions) {
        // Handle reply confirmation buttons
        if (action.action_id === "reply_confirm" || action.action_id === "reply_reject") {
          const confirmationId = action.value;
          if (!confirmationId) continue;

          const isConfirm = action.action_id === "reply_confirm";

          // Find org connection
          const connection = await findOrgConnectionByTeam(interaction.team.id);
          if (!connection) {
            logger.warn("[Slack Webhook] No connection for team", { teamId: interaction.team.id });
            if (interaction.response_url) {
              await respondToInteraction(interaction.response_url, "❌ Bot not configured for this workspace");
            }
            continue;
          }

          const { replyRouterService } = await import("@/lib/services/social-feed/reply-router");

          if (isConfirm) {
            const result = await replyRouterService.handleConfirmation(
              confirmationId,
              connection.organization_id,
              interaction.user.id,
              interaction.user.username
            );

            const message = result.success
              ? `✅ Reply posted successfully!${result.postUrl ? `\n${result.postUrl}` : ""}`
              : `❌ Failed to post reply: ${result.error}`;

            if (interaction.response_url) {
              await respondToInteraction(interaction.response_url, message);
            }
          } else {
            await replyRouterService.handleRejection(
              confirmationId,
              connection.organization_id,
              interaction.user.id
            );

            if (interaction.response_url) {
              await respondToInteraction(interaction.response_url, "❌ Reply was not sent.");
            }
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  }

  // Handle JSON payload (events)
  if (!signature || !timestamp || !verifySlackSignature(body, signature, timestamp)) {
    // Check if this is a URL verification challenge (no signature)
    const event: SlackEvent = JSON.parse(body);
    if (event.type === "url_verification" && event.challenge) {
      return new Response(event.challenge, {
        headers: { "Content-Type": "text/plain" },
      });
    }

    logger.warn("[Slack Webhook] Invalid signature for event");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event: SlackEvent = JSON.parse(body);

  logger.info("[Slack Webhook] Received event", {
    type: event.type,
    eventType: event.event?.type,
    teamId: event.team_id,
  });

  // Handle URL verification
  if (event.type === "url_verification" && event.challenge) {
    return new Response(event.challenge, {
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Handle events
  if (event.type === "event_callback" && event.event) {
    const innerEvent = event.event;

    // Handle message events (for reply detection)
    if (innerEvent.type === "message" && innerEvent.thread_ts && innerEvent.text && innerEvent.user) {
      // This is a reply in a thread - check if it's a reply to a notification message
      const connection = await findOrgConnectionByTeam(event.team_id ?? "");
      
      if (connection && innerEvent.channel) {
        const { replyRouterService } = await import("@/lib/services/social-feed/reply-router");

        const result = await replyRouterService.processIncomingReply({
          platform: "slack",
          channelId: innerEvent.channel,
          messageId: innerEvent.ts ?? "",
          replyToMessageId: innerEvent.thread_ts,
          userId: innerEvent.user,
          content: innerEvent.text,
        });

        if (result) {
          logger.info("[Slack Webhook] Social feed reply processed", {
            channelId: innerEvent.channel,
            confirmationId: result.confirmationId,
            success: result.success,
          });
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}

export async function GET(): Promise<Response> {
  return NextResponse.json({
    status: "ok",
    service: "slack-webhook",
    timestamp: new Date().toISOString(),
  });
}
