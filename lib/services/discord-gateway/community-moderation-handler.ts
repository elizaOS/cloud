/**
 * Community Moderation Event Handler
 *
 * Handles Discord events for community moderation:
 * - MESSAGE_CREATE: spam detection, link checking, word filtering
 * - GUILD_MEMBER_ADD: welcome messages, verification initiation
 * - GUILD_MEMBER_REMOVE: leave logging
 */

import { logger } from "@/lib/utils/logger";
import { discordMessageSender } from "./message-sender";
import { communityModerationService } from "../community-moderation";
import { linkSafetyService } from "../link-safety";
import { moderationEventsRepository, spamTrackingRepository } from "@/db/repositories/community-moderation";
import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { orgPlatformServers } from "@/db/schemas/org-platforms";
import { orgPlatformConnections } from "@/db/schemas/org-platforms";
import type { CommunityModerationSettings } from "@/db/schemas/org-agents";
import type { RoutableEvent } from "./types";

// =============================================================================
// TYPES
// =============================================================================

interface DiscordMemberData {
  user: {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    bot?: boolean;
  };
  nick?: string;
  roles: string[];
  joined_at: string;
}

interface DiscordMessageData {
  id: string;
  channel_id: string;
  author: {
    id: string;
    username: string;
    bot?: boolean;
  };
  content: string;
  timestamp: string;
  guild_id?: string;
  embeds?: Array<{
    url?: string;
    title?: string;
    description?: string;
  }>;
}

// =============================================================================
// HANDLER CLASS
// =============================================================================

export class CommunityModerationHandler {
  private static instance: CommunityModerationHandler;

  private constructor() {}

  static getInstance(): CommunityModerationHandler {
    if (!CommunityModerationHandler.instance) {
      CommunityModerationHandler.instance = new CommunityModerationHandler();
    }
    return CommunityModerationHandler.instance;
  }

  /**
   * Handle incoming Discord event for community moderation.
   */
  async handleEvent(event: RoutableEvent): Promise<{ handled: boolean; action?: string }> {
    switch (event.eventType) {
      case "MESSAGE_CREATE":
        return this.handleMessageCreate(event);
      case "GUILD_MEMBER_ADD":
        return this.handleMemberJoin(event);
      case "GUILD_MEMBER_REMOVE":
        return this.handleMemberLeave(event);
      default:
        return { handled: false };
    }
  }

  // ===========================================================================
  // MESSAGE HANDLING
  // ===========================================================================

  private async handleMessageCreate(
    event: RoutableEvent
  ): Promise<{ handled: boolean; action?: string }> {
    const message = event.data.message as DiscordMessageData | undefined;
    if (!message) return { handled: false };

    // Skip bot messages
    if (message.author.bot) return { handled: false };

    // Get server settings
    const serverSettings = await this.getServerSettings(
      event.platformConnectionId,
      event.guildId
    );
    if (!serverSettings) return { handled: false };

    const settings = serverSettings.settings;
    const serverId = serverSettings.serverId;

    // Run moderation checks in parallel
    const [spamResult, linkResult, filterResult] = await Promise.all([
      settings.antiSpamEnabled
        ? this.checkSpam(serverId, message, settings)
        : null,
      settings.linkCheckingEnabled
        ? this.checkLinks(serverId, message, settings)
        : null,
      settings.badWordFilterEnabled
        ? this.checkBadWords(serverId, message, settings)
        : null,
    ]);

    // Handle results - most severe action wins
    const action = this.determineModerationAction(spamResult, linkResult, filterResult);

    if (action.shouldAct) {
      await this.executeModerationAction(
        event.platformConnectionId,
        event.guildId,
        message,
        action,
        serverId,
        settings
      );

      return { handled: true, action: action.type };
    }

    return { handled: false };
  }

  private async checkSpam(
    serverId: string,
    message: DiscordMessageData,
    settings: CommunityModerationSettings
  ): Promise<{ violation: boolean; type: string; severity: number } | null> {
    const result = await communityModerationService.checkSpam(serverId, {
      userId: message.author.id,
      platform: "discord",
      content: message.content,
      maxMessagesPerMinute: settings.maxMessagesPerMinute ?? 10,
      duplicateThreshold: settings.duplicateMessageThreshold ?? 3,
    });

    if (!result.isSpam) return null;

    return {
      violation: true,
      type: result.reason ?? "spam",
      severity: result.reason === "rate_limit" ? 2 : 3,
    };
  }

  private async checkLinks(
    serverId: string,
    message: DiscordMessageData,
    settings: CommunityModerationSettings
  ): Promise<{ violation: boolean; type: string; severity: number; urls: string[] } | null> {
    const urls = linkSafetyService.extractUrls(message.content);
    if (urls.length === 0) return null;

    // Check against allowed/blocked domains first
    if (settings.allowedDomains && settings.allowedDomains.length > 0) {
      const blocked = urls.filter((url) => {
        const domain = new URL(url).hostname;
        return !settings.allowedDomains?.some((allowed) => domain.endsWith(allowed));
      });

      if (blocked.length > 0) {
        return {
          violation: true,
          type: "blocked_domain",
          severity: 2,
          urls: blocked,
        };
      }
    }

    if (settings.blockedDomains && settings.blockedDomains.length > 0) {
      const blocked = urls.filter((url) => {
        const domain = new URL(url).hostname;
        return settings.blockedDomains?.some((blocked) => domain.endsWith(blocked));
      });

      if (blocked.length > 0) {
        return {
          violation: true,
          type: "blocked_domain",
          severity: 3,
          urls: blocked,
        };
      }
    }

    // Check with Safe Browsing if enabled
    if (settings.checkLinksWithSafeBrowsing) {
      const results = await linkSafetyService.checkUrls(urls);
      const threats = results.filter((r) => !r.safe);

      if (threats.length > 0) {
        return {
          violation: true,
          type: threats[0].threats[0] ?? "unsafe_link",
          severity: 5,
          urls: threats.map((t) => t.url),
        };
      }
    }

    return null;
  }

  private async checkBadWords(
    serverId: string,
    message: DiscordMessageData,
    settings: CommunityModerationSettings
  ): Promise<{ violation: boolean; type: string; severity: number; word?: string } | null> {
    const banWords = settings.banWords ?? [];
    if (banWords.length === 0) return null;

    const content = message.content.toLowerCase();
    const matched = banWords.find((word) => content.includes(word.toLowerCase()));

    if (!matched) return null;

    return {
      violation: true,
      type: "bad_word",
      severity: 3,
      word: matched,
    };
  }

  private determineModerationAction(
    ...results: Array<{ violation: boolean; type: string; severity: number } | null>
  ): { shouldAct: boolean; type: string; severity: number } {
    const violations = results.filter((r): r is NonNullable<typeof r> => r?.violation === true);

    if (violations.length === 0) {
      return { shouldAct: false, type: "none", severity: 0 };
    }

    // Return most severe violation
    const mostSevere = violations.reduce((prev, curr) =>
      curr.severity > prev.severity ? curr : prev
    );

    return {
      shouldAct: true,
      type: mostSevere.type,
      severity: mostSevere.severity,
    };
  }

  private async executeModerationAction(
    connectionId: string,
    guildId: string,
    message: DiscordMessageData,
    action: { type: string; severity: number },
    serverId: string,
    settings: CommunityModerationSettings
  ): Promise<void> {
    // Delete the message
    await discordMessageSender.deleteMessage(connectionId, message.channel_id, message.id);

    // Log the event
    await moderationEventsRepository.create({
      server_id: serverId,
      platform: "discord",
      platform_user_id: message.author.id,
      event_type: "auto_mod",
      severity: action.severity >= 4 ? "high" : action.severity >= 2 ? "medium" : "low",
      description: `Auto-moderation: ${action.type}`,
      detected_by: "auto_mod",
      evidence: {
        message_content: message.content.slice(0, 500),
        message_id: message.id,
        channel_id: message.channel_id,
        violation_type: action.type,
      },
      action_taken: "delete",
    });

    // Check if escalation is needed
    if (settings.escalationEnabled) {
      const violations = await moderationEventsRepository.countViolations(
        serverId,
        message.author.id,
        "discord"
      );

      const timeoutAfter = settings.timeoutAfterViolations ?? 3;
      const banAfter = settings.banAfterViolations ?? 10;

      if (violations >= banAfter) {
        await discordMessageSender.banMember(
          connectionId,
          guildId,
          message.author.id,
          `Auto-ban: ${violations} violations`
        );

        logger.info("[Moderation] User banned", {
          userId: message.author.id,
          guildId,
          violations,
        });
      } else if (violations >= timeoutAfter) {
        const timeoutMinutes = settings.defaultTimeoutMinutes ?? 10;
        await discordMessageSender.timeoutMember(
          connectionId,
          guildId,
          message.author.id,
          timeoutMinutes * 60,
          `Auto-timeout: ${violations} violations`
        );

        logger.info("[Moderation] User timed out", {
          userId: message.author.id,
          guildId,
          violations,
          timeoutMinutes,
        });
      }
    }

    // Send warning DM if enabled
    if (settings.warnAfterViolations && settings.warnAfterViolations <= 1) {
      await discordMessageSender.sendDM(
        connectionId,
        message.author.id,
        `⚠️ Your message was removed for violating server rules (${action.type}). Please review the community guidelines.`
      );
    }
  }

  // ===========================================================================
  // MEMBER JOIN HANDLING
  // ===========================================================================

  private async handleMemberJoin(
    event: RoutableEvent
  ): Promise<{ handled: boolean; action?: string }> {
    const member = event.data.raw as DiscordMemberData | undefined;
    if (!member) return { handled: false };

    // Skip bots
    if (member.user.bot) return { handled: false };

    const serverSettings = await this.getServerSettings(
      event.platformConnectionId,
      event.guildId
    );
    if (!serverSettings) return { handled: false };

    const settings = serverSettings.settings;
    const serverId = serverSettings.serverId;

    // Check raid protection
    if (settings.raidProtectionEnabled) {
      const isRaid = await this.checkRaidCondition(serverId, settings);
      if (isRaid) {
        // Kick the member during raid
        await discordMessageSender.kickMember(
          event.platformConnectionId,
          event.guildId,
          member.user.id,
          "Raid protection: server temporarily locked"
        );

        logger.warn("[Moderation] Member kicked during raid", {
          userId: member.user.id,
          guildId: event.guildId,
        });

        return { handled: true, action: "raid_kick" };
      }
    }

    // Send welcome message
    if (settings.greetNewMembers && settings.greetingChannelId) {
      const greetingMessage = this.formatGreeting(
        settings.greetingMessage ?? "Welcome to the server, {user}!",
        member
      );

      await discordMessageSender.sendMessage(event.platformConnectionId, {
        channelId: settings.greetingChannelId,
        content: greetingMessage,
      });
    }

    // Assign welcome role
    if (settings.welcomeRoleId) {
      await discordMessageSender.addRole(
        event.platformConnectionId,
        event.guildId,
        member.user.id,
        settings.welcomeRoleId,
        "Welcome role assignment"
      );
    }

    // If token gating is enabled, assign unverified role
    if (settings.tokenGatingEnabled && settings.unverifiedRoleId) {
      await discordMessageSender.addRole(
        event.platformConnectionId,
        event.guildId,
        member.user.id,
        settings.unverifiedRoleId,
        "Unverified role (pending wallet verification)"
      );

      // Send verification instructions
      if (settings.verificationChannelId && settings.verificationMessage) {
        const verifyMessage = settings.verificationMessage.replace(
          "{user}",
          `<@${member.user.id}>`
        );

        await discordMessageSender.sendMessage(event.platformConnectionId, {
          channelId: settings.verificationChannelId,
          content: verifyMessage,
        });
      }
    }

    // Log join if enabled
    if (settings.logMemberJoins && settings.logChannelId) {
      await discordMessageSender.sendMessage(event.platformConnectionId, {
        channelId: settings.logChannelId,
        embeds: [{
          title: "Member Joined",
          description: `<@${member.user.id}> joined the server`,
          color: 0x00ff00,
          fields: [
            { name: "User", value: `${member.user.username}`, inline: true },
            { name: "ID", value: member.user.id, inline: true },
          ],
          timestamp: new Date().toISOString(),
        }],
      });
    }

    return { handled: true, action: "welcome" };
  }

  private async checkRaidCondition(
    serverId: string,
    settings: CommunityModerationSettings
  ): Promise<boolean> {
    // Simple raid detection based on join rate
    // In production, this would use a Redis counter for accurate rate limiting
    const threshold = settings.autoLockdownThreshold ?? 10;
    const rateLimit = settings.joinRateLimitPerMinute ?? 5;

    // This is a placeholder - actual implementation would use Redis
    // to track join rate across the cluster
    return false;
  }

  private formatGreeting(template: string, member: DiscordMemberData): string {
    return template
      .replace("{user}", `<@${member.user.id}>`)
      .replace("{username}", member.user.username)
      .replace("{server}", "the server"); // Would need server name from context
  }

  // ===========================================================================
  // MEMBER LEAVE HANDLING
  // ===========================================================================

  private async handleMemberLeave(
    event: RoutableEvent
  ): Promise<{ handled: boolean; action?: string }> {
    const member = event.data.raw as DiscordMemberData | undefined;
    if (!member) return { handled: false };

    const serverSettings = await this.getServerSettings(
      event.platformConnectionId,
      event.guildId
    );
    if (!serverSettings) return { handled: false };

    const settings = serverSettings.settings;

    // Log leave if enabled
    if (settings.logMemberLeaves && settings.logChannelId) {
      await discordMessageSender.sendMessage(event.platformConnectionId, {
        channelId: settings.logChannelId,
        embeds: [{
          title: "Member Left",
          description: `${member.user.username} left the server`,
          color: 0xff0000,
          fields: [
            { name: "User", value: member.user.username, inline: true },
            { name: "ID", value: member.user.id, inline: true },
          ],
          timestamp: new Date().toISOString(),
        }],
      });
    }

    return { handled: true, action: "log_leave" };
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private async getServerSettings(
    connectionId: string,
    guildId: string
  ): Promise<{
    serverId: string;
    settings: CommunityModerationSettings;
  } | null> {
    const [server] = await db
      .select({
        id: orgPlatformServers.id,
        agent_settings: orgPlatformServers.agent_settings,
      })
      .from(orgPlatformServers)
      .innerJoin(
        orgPlatformConnections,
        eq(orgPlatformServers.connection_id, orgPlatformConnections.id)
      )
      .where(
        and(
          eq(orgPlatformConnections.id, connectionId),
          eq(orgPlatformServers.server_id, guildId)
        )
      )
      .limit(1);

    if (!server) return null;

    const settings = (server.agent_settings as {
      community_manager?: CommunityModerationSettings;
    })?.community_manager ?? {};

    return {
      serverId: server.id,
      settings,
    };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const communityModerationHandler = CommunityModerationHandler.getInstance();


