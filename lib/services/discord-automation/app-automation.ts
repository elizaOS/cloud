import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { discordAutomationService } from "./index";
import { discordGuildsRepository } from "@/db/repositories/discord-guilds";
import { discordChannelsRepository } from "@/db/repositories/discord-channels";
import { appsRepository } from "@/db/repositories/apps";
import { creditsService } from "@/lib/services/credits";
import { DISCORD_POST_COST } from "@/lib/promotion-pricing";
import { logger } from "@/lib/utils/logger";
import {
  DISCORD_BLURPLE,
  createActionRow,
  createEmbed,
  truncate,
} from "@/lib/utils/discord-helpers";
import type { App } from "@/db/schemas/apps";
import type {
  DiscordAutomationConfig,
  DiscordAutomationStatus,
  PostResult,
} from "./types";

class DiscordAppAutomationService {
  /**
   * Get app for organization, checking ownership.
   */
  private async getAppForOrg(
    organizationId: string,
    appId: string
  ): Promise<App> {
    const app = await appsRepository.findById(appId);
    if (!app || app.organization_id !== organizationId) {
      throw new Error("App not found");
    }
    return app;
  }

  /**
   * Enable or update automation for an app.
   */
  async enableAutomation(
    organizationId: string,
    appId: string,
    config: Partial<DiscordAutomationConfig>
  ): Promise<App> {
    const app = await this.getAppForOrg(organizationId, appId);

    // Verify Discord is connected
    const status = await discordAutomationService.getConnectionStatus(
      organizationId
    );
    if (!status.connected) {
      throw new Error(
        "Discord not connected. Add the bot to a server in Settings first."
      );
    }

    // Verify the guild exists if specified
    if (config.guildId) {
      const guild = await discordGuildsRepository.findByGuildId(
        organizationId,
        config.guildId
      );
      if (!guild) {
        throw new Error("Guild not found. Please reconnect the Discord server.");
      }
    }

    // Verify the channel exists if specified
    if (config.channelId) {
      const channel = await discordChannelsRepository.findByChannelId(
        organizationId,
        config.channelId
      );
      if (!channel) {
        throw new Error("Channel not found. Please refresh channels.");
      }
    }

    const currentConfig = (app.discord_automation as DiscordAutomationConfig) || {
      enabled: false,
      autoAnnounce: false,
      announceIntervalMin: 120,
      announceIntervalMax: 240,
    };

    const updatedConfig: DiscordAutomationConfig = {
      ...currentConfig,
      ...config,
      enabled: config.enabled ?? true,
    };

    const updatedApp = await appsRepository.update(appId, {
      discord_automation: updatedConfig,
    });

    logger.info("[DiscordAppAutomation] Automation enabled", {
      appId,
      organizationId,
      guildId: updatedConfig.guildId,
      channelId: updatedConfig.channelId,
    });

    return updatedApp;
  }

  /**
   * Disable automation for an app.
   */
  async disableAutomation(
    organizationId: string,
    appId: string
  ): Promise<App> {
    const app = await this.getAppForOrg(organizationId, appId);

    const currentConfig = (app.discord_automation as DiscordAutomationConfig) || {
      enabled: false,
      autoAnnounce: false,
      announceIntervalMin: 120,
      announceIntervalMax: 240,
    };

    const updatedApp = await appsRepository.update(appId, {
      discord_automation: {
        ...currentConfig,
        enabled: false,
      },
    });

    logger.info("[DiscordAppAutomation] Automation disabled", {
      appId,
      organizationId,
    });

    return updatedApp;
  }

  /**
   * Get automation status for an app.
   */
  async getAutomationStatus(
    organizationId: string,
    appId: string
  ): Promise<DiscordAutomationStatus> {
    const app = await this.getAppForOrg(organizationId, appId);
    const connectionStatus = await discordAutomationService.getConnectionStatus(
      organizationId
    );

    const config = (app.discord_automation as DiscordAutomationConfig) || {
      enabled: false,
      autoAnnounce: false,
      announceIntervalMin: 120,
      announceIntervalMax: 240,
    };

    // Get guild and channel names if configured
    let guildName: string | undefined;
    let channelName: string | undefined;

    if (config.guildId) {
      const guild = await discordGuildsRepository.findByGuildId(
        organizationId,
        config.guildId
      );
      guildName = guild?.guild_name;
    }

    if (config.channelId) {
      const channel = await discordChannelsRepository.findByChannelId(
        organizationId,
        config.channelId
      );
      channelName = channel?.channel_name;
    }

    return {
      enabled: config.enabled,
      discordConnected: connectionStatus.connected,
      guildId: config.guildId,
      guildName,
      channelId: config.channelId,
      channelName,
      autoAnnounce: config.autoAnnounce,
      lastAnnouncementAt: config.lastAnnouncementAt,
      totalMessages: config.totalMessages || 0,
    };
  }

  async generateAnnouncement(organizationId: string, app: App): Promise<string> {
    const deduction = await creditsService.deductCredits({
      organizationId,
      amount: DISCORD_POST_COST,
      description: `Discord AI announcement: ${app.name}`,
      metadata: { appId: app.id, type: "discord_announcement" },
    });

    if (!deduction.success) {
      throw new Error(`Insufficient credits for AI generation. Required: $${DISCORD_POST_COST.toFixed(4)}`);
    }

    const config = app.discord_automation as DiscordAutomationConfig;
    const vibeStyle = config?.vibeStyle || "professional and engaging";

    const systemPrompt = `You are creating a Discord announcement for an app called "${app.name}".
The app is: ${app.description || "A great application"}
Website: ${app.website_url || app.app_url}

Write in a ${vibeStyle} style. Keep it concise and engaging.
Use appropriate emojis sparingly (1-2 max). Do not use excessive formatting.
Maximum 300 characters. Do not include the URL in your response - it will be added automatically.`;

    try {
      const result = await generateText({
        model: openai("gpt-4o-mini"),
        system: systemPrompt,
        prompt:
          "Create a compelling Discord announcement about this app that would engage a community. Focus on what makes it unique and valuable.",
        maxTokens: 150,
      });

      return truncate(result.text, 500);
    } catch (error) {
      await creditsService.refundCredits({
        organizationId,
        amount: DISCORD_POST_COST,
        description: "Refund for failed Discord AI generation",
        metadata: { appId: app.id, type: "discord_announcement_refund" },
      });
      throw error;
    }
  }

  /**
   * Get the best promotional image for Discord (prefer landscape/twitter card)
   */
  private getPromotionalImage(app: App): string | undefined {
    const assets = app.promotional_assets;
    if (!assets || assets.length === 0) return undefined;

    // Prefer twitter_card or facebook_feed (landscape) for Discord embeds
    const preferred = assets.find(
      (a) =>
        a.url &&
        (a.size.width === 1200 || // twitter_card, facebook_feed, linkedin
          a.type === "social_card")
    );
    if (preferred?.url) return preferred.url;

    // Fallback to any available image
    const anyImage = assets.find((a) => a.url);
    return anyImage?.url;
  }

  /**
   * Post an announcement to a configured Discord channel.
   * Includes promotional image if available.
   */
  async postAnnouncement(
    organizationId: string,
    appId: string,
    text?: string
  ): Promise<PostResult> {
    const app = await this.getAppForOrg(organizationId, appId);
    const config = app.discord_automation as DiscordAutomationConfig;

    if (!config?.enabled) {
      return { success: false, error: "Automation not enabled for this app" };
    }

    if (!config.channelId) {
      return { success: false, error: "No channel configured" };
    }

    // Verify channel still exists and is accessible
    const channel = await discordChannelsRepository.findByChannelId(
      organizationId,
      config.channelId
    );
    if (!channel) {
      return { success: false, error: "Channel not found. Please reconfigure." };
    }

    const messageText = text || (await this.generateAnnouncement(organizationId, app));

    // Get promotional image if available
    const promotionalImageUrl = this.getPromotionalImage(app);

    // Build embed with promotional image
    const embed = createEmbed({
      title: app.name,
      description: app.description || undefined,
      url: app.website_url || app.app_url,
      color: DISCORD_BLURPLE,
      thumbnailUrl: app.logo_url || undefined,
      imageUrl: promotionalImageUrl, // Add promotional image to embed
    });

    // Build button
    const buttonUrl = app.website_url || app.app_url;
    const components = [
      createActionRow([{ label: "Try It Now", url: buttonUrl }]),
    ];

    const result = await discordAutomationService.sendMessage(
      config.channelId,
      messageText,
      {
        embeds: [embed],
        components,
      }
    );

    if (result.success) {
      // Update stats
      const updatedConfig: DiscordAutomationConfig = {
        ...config,
        lastAnnouncementAt: new Date().toISOString(),
        totalMessages: (config.totalMessages || 0) + 1,
      };

      await appsRepository.update(appId, {
        discord_automation: updatedConfig,
      });

      logger.info("[DiscordAppAutomation] Announcement posted", {
        appId,
        channelId: config.channelId,
        messageId: result.messageId,
        hasImage: !!promotionalImageUrl,
      });

      return {
        success: true,
        messageId: result.messageId,
        channelId: config.channelId,
      };
    }

    return { success: false, error: result.error };
  }

  /**
   * Get all apps with active Discord automation.
   */
  async getAppsWithActiveAutomation(organizationId: string): Promise<App[]> {
    const apps = await appsRepository.findByOrganization(organizationId);
    return apps.filter((app) => {
      const config = app.discord_automation as DiscordAutomationConfig | null;
      return config?.enabled === true;
    });
  }

  /**
   * Check if an app needs an announcement based on interval settings.
   */
  isAnnouncementDue(app: App): boolean {
    const config = app.discord_automation as DiscordAutomationConfig | null;
    if (!config?.enabled || !config?.autoAnnounce) return false;

    if (!config.lastAnnouncementAt) return true;

    const lastAnnouncement = new Date(config.lastAnnouncementAt);
    const now = new Date();
    const minutesSince = (now.getTime() - lastAnnouncement.getTime()) / (1000 * 60);

    // Use a random interval between min and max
    const minInterval = config.announceIntervalMin || 120;
    const maxInterval = config.announceIntervalMax || 240;
    const targetInterval =
      minInterval + Math.random() * (maxInterval - minInterval);

    return minutesSince >= targetInterval;
  }
}

export const discordAppAutomationService = new DiscordAppAutomationService();
