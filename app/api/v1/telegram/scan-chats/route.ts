import { NextRequest, NextResponse } from "next/server";
import { Telegraf } from "telegraf";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { telegramAutomationService } from "@/lib/services/telegram-automation";
import { telegramChatsRepository } from "@/db/repositories/telegram-chats";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 30;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { user } = await requireAuthOrApiKeyWithOrg(request);

  const botToken = await telegramAutomationService.getBotToken(
    user.organization_id
  );

  if (!botToken) {
    return NextResponse.json(
      { error: "Telegram bot not connected" },
      { status: 400 }
    );
  }

  const bot = new Telegraf(botToken);

  try {
    // Remove webhook temporarily to use getUpdates
    await bot.telegram.deleteWebhook({ drop_pending_updates: false });

    // Get recent updates (includes my_chat_member events)
    const updates = await bot.telegram.getUpdates({
      allowed_updates: ["my_chat_member", "message", "channel_post"],
      limit: 100,
    });

    const chatsFound: Array<{
      chatId: number;
      title: string;
      type: string;
      username?: string;
    }> = [];

    const seenChatIds = new Set<number>();

    for (const update of updates) {
      let chat: { id: number; title?: string; type: string; username?: string } | null = null;
      let isAdmin = false;

      if (update.my_chat_member) {
        const member = update.my_chat_member;
        chat = member.chat as typeof chat;
        const status = member.new_chat_member.status;
        isAdmin = status === "administrator" || status === "creator";
      } else if (update.message?.chat) {
        chat = update.message.chat as typeof chat;
      } else if (update.channel_post?.chat) {
        chat = update.channel_post.chat as typeof chat;
      }

      if (
        chat &&
        !seenChatIds.has(chat.id) &&
        (chat.type === "group" || chat.type === "supergroup" || chat.type === "channel")
      ) {
        seenChatIds.add(chat.id);

        // Save to database
        await telegramChatsRepository.upsert({
          organization_id: user.organization_id,
          chat_id: chat.id,
          chat_type: chat.type,
          title: chat.title || `Chat ${chat.id}`,
          username: chat.username,
          is_admin: isAdmin,
          can_post_messages: isAdmin || chat.type !== "channel",
        });

        chatsFound.push({
          chatId: chat.id,
          title: chat.title || `Chat ${chat.id}`,
          type: chat.type,
          username: chat.username,
        });
      }
    }

    // Re-set the webhook (only if using HTTPS - required by Telegram)
    // Use ELIZA_API_URL (ngrok) for local dev, otherwise NEXT_PUBLIC_APP_URL
    const WEBHOOK_URL = process.env.ELIZA_API_URL || process.env.NEXT_PUBLIC_APP_URL || "https://eliza.gg";
    if (WEBHOOK_URL.startsWith("https://")) {
      await bot.telegram.setWebhook(
        `${WEBHOOK_URL}/api/v1/telegram/webhook/${user.organization_id}`,
        {
          allowed_updates: ["message", "callback_query", "channel_post", "my_chat_member"],
          drop_pending_updates: true,
        }
      );
      logger.info("[Telegram Scan] Webhook set", {
        organizationId: user.organization_id,
        webhookUrl: WEBHOOK_URL,
      });
    } else {
      // Skip webhook setup for local development without ngrok
      logger.info("[Telegram Scan] Skipping webhook setup - HTTPS required (set ELIZA_API_URL with ngrok URL)", {
        organizationId: user.organization_id,
        appUrl: WEBHOOK_URL,
      });
    }

    logger.info("[Telegram Scan] Scanned for chats", {
      organizationId: user.organization_id,
      chatsFound: chatsFound.length,
    });

    // Fetch all chats for this org
    const allChats = await telegramChatsRepository.findByOrganization(
      user.organization_id
    );

    return NextResponse.json({
      success: true,
      newChatsFound: chatsFound.length,
      chats: allChats.map((chat) => ({
        id: chat.chat_id.toString(),
        type: chat.chat_type,
        title: chat.title,
        username: chat.username,
        isAdmin: chat.is_admin,
        canPost: chat.can_post_messages,
      })),
    });
  } catch (error) {
    logger.error("[Telegram Scan] Failed to scan", {
      organizationId: user.organization_id,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to scan for chats" },
      { status: 500 }
    );
  }
}
