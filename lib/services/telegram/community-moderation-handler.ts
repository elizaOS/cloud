/**
 * Telegram Community Moderation Handler
 */

import { logger } from "@/lib/utils/logger";
import { getServerSettings, pickMostSevereViolation, checkSpamViolation, checkLinksViolation, checkBadWordsViolation, type ModerationContext } from "../community-moderation";
import { moderationEventsRepository } from "@/db/repositories/community-moderation";
import type { CommunityModerationSettings } from "@/db/schemas/org-agents";

interface TelegramMessage {
  message_id: number;
  from: { id: number; username?: string; is_bot?: boolean };
  chat: { id: number; type: string };
  text?: string;
  date: number;
}

interface ModerationResult {
  handled: boolean;
  action?: string;
  shouldDelete?: boolean;
  shouldBan?: boolean;
  reason?: string;
}

export class TelegramModerationHandler {
  private static instance: TelegramModerationHandler;
  private constructor() {}

  static getInstance(): TelegramModerationHandler {
    return TelegramModerationHandler.instance ??= new TelegramModerationHandler();
  }

  async handleMessage(connectionId: string, message: TelegramMessage): Promise<ModerationResult> {
    if (message.from.is_bot || !message.text) return { handled: false };

    const serverData = await getServerSettings(connectionId, String(message.chat.id));
    if (!serverData) return { handled: false };

    const { serverId, organizationId, settings } = serverData;

    const ctx: ModerationContext = { organizationId, serverId, platformUserId: String(message.from.id), platform: "telegram" };
    const results = await Promise.all([
      settings.antiSpamEnabled ? checkSpamViolation(ctx, message.text ?? "", settings) : null,
      settings.linkCheckingEnabled ? checkLinksViolation(message.text ?? "", settings) : null,
      settings.badWordFilterEnabled ? checkBadWordsViolation(message.text ?? "", settings) : null,
    ]);

    const action = pickMostSevereViolation(results);

    if (action.shouldAct) {
      await this.logModerationEvent(serverId, organizationId, message, action);
      return { handled: true, action: action.type, shouldDelete: true, reason: action.type };
    }

    return { handled: false };
  }

  async handleNewMember(connectionId: string, userId: number, chatId: string): Promise<ModerationResult> {
    const serverData = await getServerSettings(connectionId, chatId);
    if (!serverData) return { handled: false };

    logger.info("[TelegramModeration] New member joined", { userId, chatId });
    return { handled: true, action: "welcome" };
  }

  private async logModerationEvent(serverId: string, organizationId: string, message: TelegramMessage, action: { type: string; severity: number }): Promise<void> {
    await moderationEventsRepository.create({
      organization_id: organizationId,
      server_id: serverId,
      platform: "telegram",
      platform_user_id: String(message.from.id),
      platform_username: message.from.username,
      event_type: action.type === "spam" ? "spam" : action.type === "bad_word" ? "banned_word" : "malicious_link",
      severity: action.severity >= 4 ? "high" : action.severity >= 2 ? "medium" : "low",
      message_id: String(message.message_id),
      channel_id: String(message.chat.id),
      content_sample: message.text?.slice(0, 500),
      action_taken: "delete",
      detected_by: "auto",
      confidence_score: 90,
    });
  }
}

export const telegramModerationHandler = TelegramModerationHandler.getInstance();
