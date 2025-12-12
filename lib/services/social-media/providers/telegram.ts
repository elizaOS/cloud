/**
 * Telegram Provider - Bot API
 */

import { logger } from "@/lib/utils/logger";
import { withRetry } from "../rate-limit";
import type {
  SocialMediaProvider,
  SocialCredentials,
  PostContent,
  PostResult,
  PlatformPostOptions,
  MediaAttachment,
} from "@/lib/types/social-media";

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  text?: string;
}

async function telegramApiRequest<T>(token: string, method: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await withRetry<TelegramResponse<T>>(
    () => fetch(`${TELEGRAM_API_BASE}${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: params ? JSON.stringify(params) : undefined,
    }),
    async (response) => response.json(),
    { platform: "telegram", maxRetries: 3 }
  );

  if (!data.ok) throw new Error(data.description ?? `Telegram error: ${data.error_code}`);
  return data.result as T;
}

async function sendMediaGroup(
  token: string,
  chatId: string | number,
  media: MediaAttachment[],
  caption?: string
): Promise<TelegramMessage[]> {
  const mediaItems = media.map((m, i) => ({
    type: m.type === "video" ? "video" : "photo",
    media: m.url,
    caption: i === 0 ? caption : undefined,
    parse_mode: "HTML",
  }));

  return telegramApiRequest<TelegramMessage[]>(token, "sendMediaGroup", {
    chat_id: chatId,
    media: mediaItems,
  });
}


export const telegramProvider: SocialMediaProvider = {
  platform: "telegram",

  async validateCredentials(credentials: SocialCredentials) {
    if (!credentials.botToken) {
      return { valid: false, error: "Bot token required" };
    }

    try {
      const user = await telegramApiRequest<TelegramUser>(
        credentials.botToken,
        "getMe"
      );

      return {
        valid: true,
        accountId: String(user.id),
        username: user.username,
        displayName: user.first_name,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async createPost(
    credentials: SocialCredentials,
    content: PostContent,
    options?: PlatformPostOptions
  ): Promise<PostResult> {
    if (!credentials.botToken) {
      return { platform: "telegram", success: false, error: "Bot token required" };
    }

    const chatId = options?.telegram?.chatId;
    if (!chatId) {
      return { platform: "telegram", success: false, error: "Chat ID required" };
    }

    try {
      logger.info("[Telegram] Creating post", {
        chatId,
        hasMedia: !!content.media?.length,
      });

      let message: TelegramMessage;

      // Handle media
      if (content.media?.length) {
        if (content.media.length === 1) {
          const media = content.media[0];
          if (media.type === "video") {
            message = await telegramApiRequest<TelegramMessage>(
              credentials.botToken,
              "sendVideo",
              {
                chat_id: chatId,
                video: media.url,
                caption: content.text,
                parse_mode: options?.telegram?.parseMode || "HTML",
                reply_to_message_id: options?.telegram?.replyToMessageId,
                disable_notification: options?.telegram?.disableNotification,
              }
            );
          } else {
            message = await telegramApiRequest<TelegramMessage>(
              credentials.botToken,
              "sendPhoto",
              {
                chat_id: chatId,
                photo: media.url,
                caption: content.text,
                parse_mode: options?.telegram?.parseMode || "HTML",
                reply_to_message_id: options?.telegram?.replyToMessageId,
                disable_notification: options?.telegram?.disableNotification,
              }
            );
          }
        } else {
          // Multiple media - use media group
          const messages = await sendMediaGroup(
            credentials.botToken,
            chatId,
            content.media,
            content.text
          );
          message = messages[0];
        }
      } else {
        // Text only
        const params: Record<string, unknown> = {
          chat_id: chatId,
          text: content.text,
          parse_mode: options?.telegram?.parseMode || "HTML",
          disable_web_page_preview: options?.telegram?.disableWebPagePreview,
          disable_notification: options?.telegram?.disableNotification,
          reply_to_message_id: options?.telegram?.replyToMessageId,
        };

        // Add inline keyboard if provided
        if (options?.telegram?.inlineKeyboard) {
          params.reply_markup = {
            inline_keyboard: options.telegram.inlineKeyboard,
          };
        }

        message = await telegramApiRequest<TelegramMessage>(
          credentials.botToken,
          "sendMessage",
          params
        );
      }

      return {
        platform: "telegram",
        success: true,
        postId: String(message.message_id),
        metadata: { chatId: message.chat.id },
      };
    } catch (error) {
      logger.error("[Telegram] Post failed", { error });
      return {
        platform: "telegram",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },

  async deletePost(credentials: SocialCredentials, postId: string) {
    if (!credentials.botToken) {
      return { success: false, error: "Bot token required" };
    }

    // postId should be in format "chatId/messageId"
    const [chatId, messageId] = postId.includes("/")
      ? postId.split("/")
      : [null, postId];

    if (!chatId) {
      return { success: false, error: "Post ID must be in format chatId/messageId" };
    }

    try {
      await telegramApiRequest(credentials.botToken, "deleteMessage", {
        chat_id: chatId,
        message_id: parseInt(messageId),
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Delete failed",
      };
    }
  },

  async replyToPost(
    credentials: SocialCredentials,
    postId: string,
    content: PostContent,
    options?: PlatformPostOptions
  ): Promise<PostResult> {
    // postId should be in format "chatId/messageId"
    const [chatId, messageId] = postId.includes("/")
      ? postId.split("/")
      : [options?.telegram?.chatId, postId];

    if (!chatId) {
      return {
        platform: "telegram",
        success: false,
        error: "Chat ID required",
      };
    }

    return this.createPost(credentials, content, {
      ...options,
      telegram: {
        ...options?.telegram,
        chatId,
        replyToMessageId: parseInt(messageId),
      },
    });
  },

  async uploadMedia(credentials: SocialCredentials, media: MediaAttachment) {
    // Telegram doesn't require pre-uploading - URLs can be used directly
    // For file uploads, we'd need to upload to our storage first
    if (media.url) {
      return { mediaId: media.url, url: media.url };
    }

    throw new Error("Only URL-based media is supported for Telegram");
  },
};

