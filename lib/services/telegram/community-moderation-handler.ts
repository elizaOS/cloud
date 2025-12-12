/**
 * Telegram Community Moderation Handler
 */

import { logger } from "@/lib/utils/logger";
import { communityModerationService } from "../community-moderation";
import { linkSafetyService } from "../link-safety";
import { moderationEventsRepository } from "@/db/repositories/community-moderation";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { orgPlatformServers, orgPlatformConnections } from "@/db/schemas/org-platforms";
import type { CommunityModerationSettings } from "@/db/schemas/org-agents";

interface TelegramMessage {
  message_id: number;
  from: { id: number; username?: string; is_bot?: boolean };
  chat: { id: number; type: string; title?: string };
  text?: string;
  entities?: Array<{ type: string; offset: number; length: number; url?: string }>;
  date: number;
}

interface TelegramUser {
  id: number;
  username?: string;
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

  async handleMessage(connectionId: string, organizationId: string, message: TelegramMessage): Promise<ModerationResult> {
    if (message.from.is_bot) return { handled: false };
    if (!message.text) return { handled: false };

    const serverSettings = await this.getServerSettings(connectionId, String(message.chat.id));
    if (!serverSettings) return { handled: false };

    const { serverId, settings } = serverSettings;

    const [spamResult, linkResult, wordResult] = await Promise.all([
      settings.antiSpamEnabled ? this.checkSpam(serverId, message, settings) : null,
      settings.linkCheckingEnabled ? this.checkLinks(message, settings) : null,
      settings.badWordFilterEnabled ? this.checkBadWords(message, settings) : null,
    ]);

    const action = this.determineModerationAction(spamResult, linkResult, wordResult);

    if (action.shouldAct) {
      await this.logModerationEvent(serverId, organizationId, message, action);
      return { handled: true, action: action.type, shouldDelete: true, reason: action.type };
    }

    return { handled: false };
  }

  async handleNewMember(connectionId: string, organizationId: string, user: TelegramUser, chatId: string): Promise<ModerationResult> {
    const serverSettings = await this.getServerSettings(connectionId, chatId);
    if (!serverSettings) return { handled: false };

    const { settings } = serverSettings;

    if (settings.raidProtectionEnabled) {
      const isRaid = await this.checkRaidCondition(serverSettings.serverId, settings);
      if (isRaid) {
        logger.warn("[TelegramModeration] Member blocked during raid", { userId: user.id, chatId });
        return { handled: true, action: "raid_block", shouldBan: true };
      }
    }

    return { handled: true, action: "welcome" };
  }

  private async checkSpam(serverId: string, message: TelegramMessage, settings: CommunityModerationSettings): Promise<{ violation: boolean; type: string; severity: number } | null> {
    const result = await communityModerationService.checkSpam(serverId, {
      userId: String(message.from.id),
      platform: "telegram",
      content: message.text ?? "",
      maxMessagesPerMinute: settings.maxMessagesPerMinute ?? 10,
      duplicateThreshold: settings.duplicateMessageThreshold ?? 3,
    });

    if (!result.isSpam) return null;
    return { violation: true, type: result.reason ?? "spam", severity: result.reason === "rate_limit" ? 2 : 3 };
  }

  private async checkLinks(message: TelegramMessage, settings: CommunityModerationSettings): Promise<{ violation: boolean; type: string; severity: number } | null> {
    const urls = linkSafetyService.extractUrls(message.text ?? "");
    if (urls.length === 0) return null;

    if (settings.blockedDomains?.length) {
      const blocked = urls.filter((url) => {
        const domain = new URL(url).hostname;
        return settings.blockedDomains?.some((b) => domain.endsWith(b));
      });
      if (blocked.length > 0) return { violation: true, type: "blocked_domain", severity: 3 };
    }

    if (settings.checkLinksWithSafeBrowsing) {
      const results = await linkSafetyService.checkUrls(urls);
      const threats = results.filter((r) => !r.safe);
      if (threats.length > 0) return { violation: true, type: threats[0].threats[0] ?? "unsafe_link", severity: 5 };
    }

    return null;
  }

  private async checkBadWords(message: TelegramMessage, settings: CommunityModerationSettings): Promise<{ violation: boolean; type: string; severity: number } | null> {
    const banWords = settings.banWords ?? [];
    if (banWords.length === 0) return null;

    const content = (message.text ?? "").toLowerCase();
    const matched = banWords.find((word) => content.includes(word.toLowerCase()));
    if (!matched) return null;

    return { violation: true, type: "bad_word", severity: 3 };
  }

  private determineModerationAction(...results: Array<{ violation: boolean; type: string; severity: number } | null>): { shouldAct: boolean; type: string; severity: number } {
    const violations = results.filter((r): r is NonNullable<typeof r> => r?.violation === true);
    if (violations.length === 0) return { shouldAct: false, type: "none", severity: 0 };
    return violations.reduce((prev, curr) => curr.severity > prev.severity ? curr : prev, { shouldAct: true, type: violations[0].type, severity: violations[0].severity });
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

  private async checkRaidCondition(_serverId: string, settings: CommunityModerationSettings): Promise<boolean> {
    // Placeholder - production implementation would use Redis for rate tracking
    return false;
  }

  private async getServerSettings(connectionId: string, chatId: string): Promise<{ serverId: string; settings: CommunityModerationSettings } | null> {
    const [server] = await db
      .select({ id: orgPlatformServers.id, agent_settings: orgPlatformServers.agent_settings })
      .from(orgPlatformServers)
      .innerJoin(orgPlatformConnections, eq(orgPlatformServers.connection_id, orgPlatformConnections.id))
      .where(and(eq(orgPlatformConnections.id, connectionId), eq(orgPlatformServers.server_id, chatId)))
      .limit(1);

    if (!server) return null;
    const settings = (server.agent_settings as { community_manager?: CommunityModerationSettings })?.community_manager ?? {};
    return { serverId: server.id, settings };
  }
}

export const telegramModerationHandler = TelegramModerationHandler.getInstance();

