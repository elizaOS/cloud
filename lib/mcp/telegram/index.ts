/**
 * Telegram MCP Server
 *
 * Exposes Telegram messaging capabilities via MCP protocol.
 * Allows AI agents to send messages, manage groups, and interact
 * with Telegram chats through the cloud.
 */

import { z } from "zod";
import {
  telegramService,
  type TelegramReplyMarkup,
} from "@/lib/services/telegram";
import { botsService } from "@/lib/services/bots";
import { logger } from "@/lib/utils/logger";

// =============================================================================
// TYPES
// =============================================================================

export interface MCPContext {
  organizationId: string;
  userId: string;
  connectionId?: string; // Optional specific bot connection
}

interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  handler: (
    params: Record<string, unknown>,
    context: MCPContext,
  ) => Promise<unknown>;
}

interface MCPResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

interface MCPServerDefinition {
  name: string;
  version: string;
  description: string;
  tools: MCPToolDefinition[];
  resources: MCPResourceDefinition[];
}

// =============================================================================
// SCHEMAS
// =============================================================================

const SendMessageSchema = z.object({
  chatId: z
    .union([z.string(), z.number()])
    .describe("Telegram chat ID to send message to"),
  text: z.string().min(1).max(4096).describe("Message text (max 4096 chars)"),
  parseMode: z
    .enum(["HTML", "Markdown", "MarkdownV2"])
    .optional()
    .describe("Text formatting mode"),
  replyToMessageId: z.number().optional().describe("Message ID to reply to"),
  connectionId: z
    .string()
    .uuid()
    .optional()
    .describe("Specific bot connection to use"),
});

const GetChatSchema = z.object({
  chatId: z.union([z.string(), z.number()]).describe("Telegram chat ID"),
  connectionId: z
    .string()
    .uuid()
    .optional()
    .describe("Specific bot connection to use"),
});

const ListChatsSchema = z.object({
  connectionId: z
    .string()
    .uuid()
    .optional()
    .describe("Specific bot connection to list chats for"),
});

const SendButtonsSchema = z.object({
  chatId: z.union([z.string(), z.number()]).describe("Telegram chat ID"),
  text: z.string().min(1).max(4096).describe("Message text"),
  buttons: z
    .array(
      z.array(
        z.object({
          text: z.string().describe("Button label"),
          callbackData: z
            .string()
            .optional()
            .describe("Data sent when button is clicked"),
          url: z
            .string()
            .url()
            .optional()
            .describe("URL to open when button is clicked"),
        }),
      ),
    )
    .describe("2D array of inline keyboard buttons"),
  connectionId: z.string().uuid().optional(),
});

const AnswerCallbackSchema = z.object({
  callbackQueryId: z.string().describe("Callback query ID to answer"),
  text: z.string().optional().describe("Text to show to user"),
  showAlert: z
    .boolean()
    .optional()
    .describe("Show as alert instead of notification"),
  connectionId: z.string().uuid().optional(),
});

const SetupWebhookSchema = z.object({
  connectionId: z
    .string()
    .uuid()
    .describe("Bot connection ID to setup webhook for"),
});

const ListBotsSchema = z.object({});

// =============================================================================
// HELPERS
// =============================================================================

async function getConnectionId(
  context: MCPContext,
  specifiedConnectionId?: string,
): Promise<string> {
  if (specifiedConnectionId) return specifiedConnectionId;
  if (context.connectionId) return context.connectionId;

  // Get first active Telegram connection for the org
  const connections = await botsService.getConnections(context.organizationId);
  const telegramConnection = connections.find(
    (c) => c.platform === "telegram" && c.status === "active",
  );

  if (!telegramConnection) {
    throw new Error(
      "No active Telegram bot connection found. Connect a bot first.",
    );
  }

  return telegramConnection.id;
}

// =============================================================================
// HANDLERS
// =============================================================================

async function handleSendMessage(
  params: z.infer<typeof SendMessageSchema>,
  ctx: MCPContext,
) {
  const connectionId = await getConnectionId(ctx, params.connectionId);

  const message = await telegramService.sendMessageViaConnection(
    connectionId,
    ctx.organizationId,
    params.chatId,
    params.text,
    {
      parse_mode: params.parseMode,
      reply_to_message_id: params.replyToMessageId,
    },
  );

  logger.info("[Telegram MCP] Message sent", {
    chatId: params.chatId,
    messageId: message.message_id,
    orgId: ctx.organizationId,
  });

  return {
    success: true,
    messageId: message.message_id,
    chatId: message.chat.id,
    date: message.date,
  };
}

async function handleGetChat(
  params: z.infer<typeof GetChatSchema>,
  ctx: MCPContext,
) {
  const connectionId = await getConnectionId(ctx, params.connectionId);
  const token = await botsService.getBotToken(connectionId, ctx.organizationId);
  const chat = await telegramService.getChat(token, params.chatId);

  return {
    id: chat.id,
    type: chat.type,
    title: chat.title,
    username: chat.username,
  };
}

async function handleListChats(
  params: z.infer<typeof ListChatsSchema>,
  ctx: MCPContext,
) {
  const connectionId = await getConnectionId(ctx, params.connectionId);
  const chats = await telegramService.listChats(
    connectionId,
    ctx.organizationId,
  );

  return {
    chats,
    count: chats.length,
  };
}

async function handleSendButtons(
  params: z.infer<typeof SendButtonsSchema>,
  ctx: MCPContext,
) {
  const connectionId = await getConnectionId(ctx, params.connectionId);

  const replyMarkup: TelegramReplyMarkup = {
    inline_keyboard: params.buttons.map((row) =>
      row.map((btn) => ({
        text: btn.text,
        callback_data: btn.callbackData,
        url: btn.url,
      })),
    ),
  };

  const message = await telegramService.sendMessageViaConnection(
    connectionId,
    ctx.organizationId,
    params.chatId,
    params.text,
    { reply_markup: replyMarkup },
  );

  return {
    success: true,
    messageId: message.message_id,
  };
}

async function handleAnswerCallback(
  params: z.infer<typeof AnswerCallbackSchema>,
  ctx: MCPContext,
) {
  const connectionId = await getConnectionId(ctx, params.connectionId);
  const token = await botsService.getBotToken(connectionId, ctx.organizationId);

  await telegramService.answerCallbackQuery(
    token,
    params.callbackQueryId,
    params.text,
    params.showAlert,
  );

  return { success: true };
}

async function handleSetupWebhook(
  params: z.infer<typeof SetupWebhookSchema>,
  ctx: MCPContext,
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://cloud.eliza.ai";

  await telegramService.setupWebhookForConnection(
    params.connectionId,
    ctx.organizationId,
    baseUrl,
  );

  return {
    success: true,
    webhookUrl: `${baseUrl}/api/webhooks/telegram`,
  };
}

async function handleListBots(
  _params: z.infer<typeof ListBotsSchema>,
  ctx: MCPContext,
) {
  const connections = await botsService.getConnections(ctx.organizationId);
  const telegramBots = connections.filter((c) => c.platform === "telegram");

  return {
    bots: telegramBots.map((bot) => ({
      id: bot.id,
      botId: bot.platform_bot_id,
      botUsername: bot.platform_bot_username,
      botName: bot.platform_bot_name,
      status: bot.status,
      connectedAt: bot.connected_at?.toISOString(),
    })),
    count: telegramBots.length,
  };
}

// =============================================================================
// MCP SERVER DEFINITION
// =============================================================================

export const telegramMcpServer: MCPServerDefinition = {
  name: "telegram",
  version: "1.0.0",
  description: "Telegram messaging and group management for AI agents",
  tools: [
    {
      name: "send_telegram_message",
      description: "Send a text message to a Telegram chat or group",
      inputSchema: SendMessageSchema,
      handler: handleSendMessage,
    },
    {
      name: "get_telegram_chat",
      description: "Get information about a Telegram chat",
      inputSchema: GetChatSchema,
      handler: handleGetChat,
    },
    {
      name: "list_telegram_chats",
      description: "List all Telegram chats/groups the bot is connected to",
      inputSchema: ListChatsSchema,
      handler: handleListChats,
    },
    {
      name: "send_telegram_buttons",
      description: "Send a message with inline keyboard buttons",
      inputSchema: SendButtonsSchema,
      handler: handleSendButtons,
    },
    {
      name: "answer_telegram_callback",
      description:
        "Answer a callback query from an inline keyboard button press",
      inputSchema: AnswerCallbackSchema,
      handler: handleAnswerCallback,
    },
    {
      name: "setup_telegram_webhook",
      description: "Setup webhook for a Telegram bot to receive updates",
      inputSchema: SetupWebhookSchema,
      handler: handleSetupWebhook,
    },
    {
      name: "list_telegram_bots",
      description: "List all connected Telegram bots for the organization",
      inputSchema: ListBotsSchema,
      handler: handleListBots,
    },
  ],
  resources: [
    {
      uri: "telegram://bots",
      name: "Connected Telegram Bots",
      description: "List of connected Telegram bots",
      mimeType: "application/json",
    },
    {
      uri: "telegram://chats",
      name: "Telegram Chats",
      description: "List of Telegram chats the bots are in",
      mimeType: "application/json",
    },
  ],
};

export default telegramMcpServer;
