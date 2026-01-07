/**
 * Telegram Webhook Handler
 *
 * Receives updates from Telegram for a specific organization's bot.
 * Each organization has their own webhook URL with their orgId.
 */

import { NextResponse } from "next/server";
import { Telegraf } from "telegraf";
import { telegramAutomationService } from "@/lib/services/telegram-automation";
import { telegramAppAutomationService } from "@/lib/services/telegram-automation/app-automation";
import { telegramChatsRepository } from "@/db/repositories/telegram-chats";
import { logger } from "@/lib/utils/logger";
import { isCommand } from "@/lib/utils/telegram-helpers";
import type { Update, Message, ChatMemberUpdated } from "telegraf/types";
import type { App } from "@/db/schemas/apps";

export const maxDuration = 25;

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

export async function POST(
  request: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  const { orgId } = await params;

  const botToken = await telegramAutomationService.getBotToken(orgId);
  if (!botToken) {
    logger.warn("[Telegram Webhook] No bot token for organization", { orgId });
    return NextResponse.json({ error: "Bot not configured" }, { status: 404 });
  }

  let update: Update;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Handle my_chat_member updates (bot added/removed from chats)
  if ("my_chat_member" in update) {
    await handleChatMemberUpdate(orgId, update.my_chat_member);
    return NextResponse.json({ ok: true });
  }

  const bot = new Telegraf(botToken);
  const activeApps =
    await telegramAppAutomationService.getAppsWithActiveAutomation(orgId);

  setupBotHandlers(bot, orgId, activeApps);

  try {
    await bot.handleUpdate(update);
  } catch (error) {
    logger.error("[Telegram Webhook] Error processing update", {
      orgId,
      updateId: update.update_id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  return NextResponse.json({ ok: true });
}

async function handleChatMemberUpdate(
  orgId: string,
  update: ChatMemberUpdated
): Promise<void> {
  const chat = update.chat;
  const newStatus = update.new_chat_member.status;

  // Only track channels, groups, and supergroups
  if (
    chat.type !== "channel" &&
    chat.type !== "group" &&
    chat.type !== "supergroup"
  ) {
    return;
  }

  const isAdmin = newStatus === "administrator" || newStatus === "creator";
  const isMember = isAdmin || newStatus === "member";
  const canPost =
    isAdmin || (newStatus === "member" && chat.type !== "channel");

  if (isMember) {
    await telegramChatsRepository.upsert({
      organization_id: orgId,
      chat_id: chat.id,
      chat_type: chat.type,
      title: chat.title,
      username: "username" in chat ? chat.username : undefined,
      is_admin: isAdmin,
      can_post_messages: canPost,
    });

    logger.info("[Telegram Webhook] Bot added to chat", {
      orgId,
      chatId: chat.id,
      chatTitle: chat.title,
      chatType: chat.type,
      status: newStatus,
    });
  } else {
    // Bot was removed (kicked, left, restricted)
    await telegramChatsRepository.delete(orgId, chat.id);

    logger.info("[Telegram Webhook] Bot removed from chat", {
      orgId,
      chatId: chat.id,
      chatTitle: chat.title,
      status: newStatus,
    });
  }
}

function setupBotHandlers(bot: Telegraf, orgId: string, activeApps: App[]) {
  bot.start(async (ctx) => {
    const chatId = ctx.chat.id;
    const userName = ctx.from?.first_name || "there";

    const matchingApp = activeApps.find(
      (app) =>
        app.telegram_automation?.channelId === String(chatId) ||
        app.telegram_automation?.groupId === String(chatId)
    );

    if (matchingApp) {
      const welcomeMessage =
        matchingApp.telegram_automation?.welcomeMessage ||
        `Welcome to ${matchingApp.name}! I'm here to help you.`;
      await ctx.reply(welcomeMessage);
    } else {
      await ctx.reply(
        `Hello ${userName}! 👋 I'm an AI assistant. How can I help you today?`
      );
    }

    logger.info("[Telegram Webhook] Start command handled", {
      orgId,
      chatId,
      userName,
    });
  });

  bot.help(async (ctx) => {
    const helpText = `Available commands:
/start - Start the bot
/help - Show this help message
/about - Learn about this bot

You can also just send me a message and I'll do my best to help!`;

    await ctx.reply(helpText);
  });

  bot.command("about", async (ctx) => {
    const chatId = ctx.chat.id;
    const matchingApp = activeApps.find(
      (app) =>
        app.telegram_automation?.channelId === String(chatId) ||
        app.telegram_automation?.groupId === String(chatId)
    );

    if (matchingApp) {
      const aboutText = `${matchingApp.name}

${matchingApp.description || "A helpful application"}

${matchingApp.website_url ? `🌐 Website: ${matchingApp.website_url}` : ""}`;

      await ctx.reply(aboutText.trim());
    } else {
      await ctx.reply("I'm an AI assistant powered by Eliza Cloud.");
    }
  });

  bot.on("text", async (ctx) => {
    const message = ctx.message as Message.TextMessage;
    const text = message.text;

    if (isCommand(text)) return;

    const chatId = ctx.chat.id;
    const userName = ctx.from?.first_name;

    const matchingApp = activeApps.find(
      (app) =>
        app.telegram_automation?.channelId === String(chatId) ||
        app.telegram_automation?.groupId === String(chatId)
    );

    if (matchingApp?.telegram_automation?.autoReply) {
      try {
        await telegramAppAutomationService.handleIncomingMessage(
          orgId,
          matchingApp.id,
          {
            chatId,
            messageId: message.message_id,
            text,
            userName,
          }
        );
      } catch (error) {
        logger.error("[Telegram Webhook] Error handling message", {
          orgId,
          appId: matchingApp.id,
          chatId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    } else if (!matchingApp) {
      await ctx.reply(
        "Thanks for your message! This bot is configured for specific applications."
      );
    }
  });

  bot.on("channel_post", async (ctx) => {
    logger.info("[Telegram Webhook] Channel post received", {
      orgId,
      chatId: ctx.chat.id,
    });
  });

  bot.on("callback_query", async (ctx) => {
    await ctx.answerCbQuery();

    const data = "data" in ctx.callbackQuery ? ctx.callbackQuery.data : null;

    logger.info("[Telegram Webhook] Callback query received", {
      orgId,
      data,
    });
  });
}
