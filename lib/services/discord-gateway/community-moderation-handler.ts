/**
 * Discord Community Moderation Handler - handles MESSAGE_CREATE, GUILD_MEMBER_ADD, GUILD_MEMBER_REMOVE
 */

import { logger } from "@/lib/utils/logger";
import { discordMessageSender } from "./message-sender";
import { communityModerationService, getServerSettings, pickMostSevereViolation, type ViolationResult } from "../community-moderation";
import { linkSafetyService } from "../link-safety";
import { moderationEventsRepository } from "@/db/repositories/community-moderation";
import type { CommunityModerationSettings } from "@/db/schemas/org-agents";
import type { RoutableEvent } from "./types";

interface DiscordMemberData {
  user: { id: string; username: string; bot?: boolean };
  roles: string[];
  joined_at: string;
}

interface DiscordMessageData {
  id: string;
  channel_id: string;
  author: { id: string; username: string; bot?: boolean };
  content: string;
  guild_id?: string;
}

export class CommunityModerationHandler {
  private static instance: CommunityModerationHandler;
  private constructor() {}

  static getInstance(): CommunityModerationHandler {
    return CommunityModerationHandler.instance ??= new CommunityModerationHandler();
  }

  async handleEvent(event: RoutableEvent): Promise<{ handled: boolean; action?: string }> {
    switch (event.eventType) {
      case "MESSAGE_CREATE": return this.handleMessageCreate(event);
      case "GUILD_MEMBER_ADD": return this.handleMemberJoin(event);
      case "GUILD_MEMBER_REMOVE": return this.handleMemberLeave(event);
      default: return { handled: false };
    }
  }

  private async handleMessageCreate(event: RoutableEvent): Promise<{ handled: boolean; action?: string }> {
    const message = event.data.message as DiscordMessageData | undefined;
    if (!message || message.author.bot) return { handled: false };

    const serverData = await getServerSettings(event.platformConnectionId, event.guildId);
    if (!serverData) return { handled: false };

    const { settings, serverId, organizationId } = serverData;

    const results = await Promise.all([
      settings.antiSpamEnabled ? this.checkSpam(serverId, organizationId, message, settings) : null,
      settings.linkCheckingEnabled ? this.checkLinks(message, settings) : null,
      settings.badWordFilterEnabled ? this.checkBadWords(message, settings) : null,
    ]);

    const action = pickMostSevereViolation(results);

    if (action.shouldAct) {
      await this.executeModerationAction(event.platformConnectionId, event.guildId, message, action, serverId, organizationId, settings);
      return { handled: true, action: action.type };
    }

    return { handled: false };
  }

  private async checkSpam(serverId: string, organizationId: string, message: DiscordMessageData, settings: CommunityModerationSettings): Promise<ViolationResult | null> {
    const result = await communityModerationService.spam.checkSpam(
      { organizationId, serverId, platformUserId: message.author.id, platform: "discord" },
      message.content,
      { maxMessagesPerMinute: settings.maxMessagesPerMinute ?? 10, duplicateThreshold: settings.duplicateMessageThreshold ?? 3 }
    );

    if (!result.isSpam) return null;
    return { violation: true, type: result.reason ?? "spam", severity: result.reason === "rate_limit" ? 2 : 3 };
  }

  private async checkLinks(message: DiscordMessageData, settings: CommunityModerationSettings): Promise<ViolationResult | null> {
    const urls = linkSafetyService.extractUrls(message.content);
    if (urls.length === 0) return null;

    if (settings.blockedDomains?.length) {
      for (const url of urls) {
        const domain = this.parseDomain(url);
        if (domain && settings.blockedDomains.some((b) => domain.endsWith(b))) {
          return { violation: true, type: "blocked_domain", severity: 3 };
        }
      }
    }

    if (settings.checkLinksWithSafeBrowsing) {
      const results = await linkSafetyService.checkUrls(urls);
      const threat = results.find((r) => !r.safe);
      if (threat) return { violation: true, type: threat.threats[0] ?? "unsafe_link", severity: 5 };
    }

    return null;
  }

  private checkBadWords(message: DiscordMessageData, settings: CommunityModerationSettings): ViolationResult | null {
    const banWords = settings.banWords ?? [];
    if (banWords.length === 0) return null;

    const content = message.content.toLowerCase();
    const matched = banWords.find((word) => content.includes(word.toLowerCase()));
    if (!matched) return null;

    return { violation: true, type: "bad_word", severity: 3 };
  }

  private async executeModerationAction(connectionId: string, guildId: string, message: DiscordMessageData, action: { type: string; severity: number }, serverId: string, organizationId: string, settings: CommunityModerationSettings): Promise<void> {
    await discordMessageSender.deleteMessage(connectionId, message.channel_id, message.id);

    await moderationEventsRepository.create({
      organization_id: organizationId,
      server_id: serverId,
      platform: "discord",
      platform_user_id: message.author.id,
      platform_username: message.author.username,
      event_type: action.type === "spam" ? "spam" : action.type === "bad_word" ? "banned_word" : "malicious_link",
      severity: action.severity >= 4 ? "high" : action.severity >= 2 ? "medium" : "low",
      message_id: message.id,
      channel_id: message.channel_id,
      content_sample: message.content.slice(0, 500),
      action_taken: "delete",
      detected_by: "auto",
      confidence_score: 90,
    });

    if (settings.escalationEnabled) {
      const violations = await moderationEventsRepository.countViolations(serverId, message.author.id, "discord");
      const banAfter = settings.banAfterViolations ?? 10;
      const timeoutAfter = settings.timeoutAfterViolations ?? 3;

      if (violations >= banAfter) {
        await discordMessageSender.banMember(connectionId, guildId, message.author.id, `Auto-ban: ${violations} violations`);
        logger.info("[Moderation] User banned", { userId: message.author.id, guildId, violations });
      } else if (violations >= timeoutAfter) {
        const timeoutMinutes = settings.defaultTimeoutMinutes ?? 10;
        await discordMessageSender.timeoutMember(connectionId, guildId, message.author.id, timeoutMinutes * 60, `Auto-timeout: ${violations} violations`);
        logger.info("[Moderation] User timed out", { userId: message.author.id, guildId, violations, timeoutMinutes });
      }
    }

    if (settings.warnAfterViolations && settings.warnAfterViolations <= 1) {
      await discordMessageSender.sendDM(connectionId, message.author.id, `⚠️ Your message was removed for violating server rules (${action.type}). Please review the community guidelines.`);
    }
  }

  private async handleMemberJoin(event: RoutableEvent): Promise<{ handled: boolean; action?: string }> {
    const member = event.data.raw as DiscordMemberData | undefined;
    if (!member || member.user.bot) return { handled: false };

    const serverData = await getServerSettings(event.platformConnectionId, event.guildId);
    if (!serverData) return { handled: false };

    const { settings } = serverData;

    if (settings.greetNewMembers && settings.greetingChannelId) {
      const greeting = (settings.greetingMessage ?? "Welcome to the server, {user}!")
        .replace("{user}", `<@${member.user.id}>`)
        .replace("{username}", member.user.username);

      await discordMessageSender.sendMessage(event.platformConnectionId, { channelId: settings.greetingChannelId, content: greeting });
    }

    if (settings.welcomeRoleId) {
      await discordMessageSender.addRole(event.platformConnectionId, event.guildId, member.user.id, settings.welcomeRoleId, "Welcome role");
    }

    if (settings.tokenGatingEnabled && settings.unverifiedRoleId) {
      await discordMessageSender.addRole(event.platformConnectionId, event.guildId, member.user.id, settings.unverifiedRoleId, "Unverified role");

      if (settings.verificationChannelId && settings.verificationMessage) {
        const msg = settings.verificationMessage.replace("{user}", `<@${member.user.id}>`);
        await discordMessageSender.sendMessage(event.platformConnectionId, { channelId: settings.verificationChannelId, content: msg });
      }
    }

    if (settings.logMemberJoins && settings.logChannelId) {
      await discordMessageSender.sendMessage(event.platformConnectionId, {
        channelId: settings.logChannelId,
        embeds: [{ title: "Member Joined", description: `<@${member.user.id}> joined`, color: 0x00ff00, fields: [{ name: "User", value: member.user.username, inline: true }, { name: "ID", value: member.user.id, inline: true }], timestamp: new Date().toISOString() }],
      });
    }

    return { handled: true, action: "welcome" };
  }

  private async handleMemberLeave(event: RoutableEvent): Promise<{ handled: boolean; action?: string }> {
    const member = event.data.raw as DiscordMemberData | undefined;
    if (!member) return { handled: false };

    const serverData = await getServerSettings(event.platformConnectionId, event.guildId);
    if (!serverData) return { handled: false };

    const { settings } = serverData;

    if (settings.logMemberLeaves && settings.logChannelId) {
      await discordMessageSender.sendMessage(event.platformConnectionId, {
        channelId: settings.logChannelId,
        embeds: [{ title: "Member Left", description: `${member.user.username} left`, color: 0xff0000, fields: [{ name: "User", value: member.user.username, inline: true }, { name: "ID", value: member.user.id, inline: true }], timestamp: new Date().toISOString() }],
      });
    }

    return { handled: true, action: "log_leave" };
  }

  private parseDomain(url: string): string | null {
    try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
  }
}

export const communityModerationHandler = CommunityModerationHandler.getInstance();
