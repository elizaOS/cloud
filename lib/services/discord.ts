import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";
import { logger } from "@/lib/utils/logger";

/**
 * Discord notification service using Discord.js REST API
 * Send custom events, logs, and errors to Discord channels
 *
 * Setup:
 * 1. Create a Discord bot at https://discord.com/developers/applications
 * 2. Set DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID environment variables
 * 3. Invite bot to your server with "Send Messages" permission
 *
 * @see https://discord.js.org/docs/packages/rest/2.6.0
 */

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  timestamp?: string;
  footer?: {
    text: string;
    icon_url?: string;
  };
  author?: {
    name: string;
    icon_url?: string;
    url?: string;
  };
  thumbnail?: {
    url: string;
  };
}

export interface DiscordMessageOptions {
  content?: string;
  embeds?: DiscordEmbed[];
}

export enum DiscordColor {
  SUCCESS = 0x00ff00, // Green
  INFO = 0x0099ff, // Blue
  WARNING = 0xffaa00, // Orange
  ERROR = 0xff0000, // Red
  DEFAULT = 0x5865f2, // Discord Blurple
}

class DiscordService {
  private rest: REST | null = null;
  private defaultChannelId: string | null = null;
  private initialized = false;

  private initialize(): void {
    if (this.initialized) return;

    const botToken = process.env.DISCORD_BOT_TOKEN;
    const channelId = process.env.DISCORD_CHANNEL_ID;

    if (!botToken || !channelId) {
      logger.warn(
        "[DiscordService] Not configured. Set DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID",
      );
      this.initialized = false;
      return;
    }

    this.rest = new REST({ version: "10" }).setToken(botToken);
    this.defaultChannelId = channelId;
    this.initialized = true;
    logger.info("[DiscordService] Initialized successfully");
  }

  /**
   * Send a message to Discord
   */
  async send(
    options: DiscordMessageOptions,
    channelId?: string,
  ): Promise<boolean> {
    this.initialize();

    if (!this.initialized || !this.rest || !this.defaultChannelId) {
      logger.warn("[DiscordService] Not initialized, skipping Discord message");
      return false;
    }

    const targetChannel = channelId || this.defaultChannelId;

    try {
      await this.rest.post(Routes.channelMessages(targetChannel), {
        body: {
          content: options.content,
          embeds: options.embeds,
        },
      });

      logger.info(`[DiscordService] Message sent to channel ${targetChannel}`);
      return true;
    } catch (error: any) {
      logger.error("[DiscordService] Failed to send message", {
        error: error.message,
        channelId: targetChannel,
      });
      return false;
    }
  }

  /**
   * Send a message to a specific channel
   */
  async sendToChannel(
    channelId: string,
    options: DiscordMessageOptions,
  ): Promise<boolean> {
    return this.send(options, channelId);
  }

  /**
   * Send a simple text message
   */
  async sendText(message: string, channelId?: string): Promise<boolean> {
    return this.send({ content: message }, channelId);
  }

  /**
   * Log a user signup event
   */
  async logUserSignup(userData: {
    userId: string;
    privyUserId: string;
    email?: string | null;
    name?: string | null;
    walletAddress?: string | null;
    organizationId: string;
    organizationName: string;
    role: string;
    isNewOrganization: boolean;
  }): Promise<boolean> {
    const fields: DiscordEmbedField[] = [
      {
        name: "User ID",
        value: `\`${userData.userId}\``,
        inline: true,
      },
      {
        name: "Privy ID",
        value: `\`${userData.privyUserId}\``,
        inline: true,
      },
      {
        name: "Role",
        value: userData.role,
        inline: true,
      },
    ];

    if (userData.email) {
      fields.push({
        name: "Email",
        value: userData.email,
        inline: false,
      });
    }

    if (userData.name) {
      fields.push({
        name: "Name",
        value: userData.name,
        inline: true,
      });
    }

    if (userData.walletAddress) {
      fields.push({
        name: "Wallet",
        value: `\`${userData.walletAddress.slice(0, 8)}...${userData.walletAddress.slice(-6)}\``,
        inline: true,
      });
    }

    fields.push(
      {
        name: "Organization",
        value: userData.organizationName,
        inline: false,
      },
      {
        name: "Organization ID",
        value: `\`${userData.organizationId}\``,
        inline: false,
      },
      {
        name: "New Organization",
        value: userData.isNewOrganization
          ? "✅ Yes"
          : "❌ No (Joined via invite)",
        inline: true,
      },
    );

    const embed: DiscordEmbed = {
      title: "🎉 New User Signup",
      description: userData.isNewOrganization
        ? "A new user has signed up and created an organization!"
        : "A user has accepted an invite and joined an organization!",
      color: DiscordColor.SUCCESS,
      fields,
      timestamp: new Date().toISOString(),
      footer: {
        text: "Eliza Cloud",
      },
    };

    return this.send({
      embeds: [embed],
    });
  }

  /**
   * Log an error
   */
  async logError(error: {
    title: string;
    message: string;
    stack?: string;
    context?: Record<string, any>;
  }): Promise<boolean> {
    const fields: DiscordEmbedField[] = [
      {
        name: "Error Message",
        value: `\`\`\`${error.message.slice(0, 1000)}\`\`\``,
        inline: false,
      },
    ];

    if (error.stack) {
      fields.push({
        name: "Stack Trace",
        value: `\`\`\`${error.stack.slice(0, 1000)}\`\`\``,
        inline: false,
      });
    }

    if (error.context) {
      fields.push({
        name: "Context",
        value: `\`\`\`json\n${JSON.stringify(error.context, null, 2).slice(0, 1000)}\`\`\``,
        inline: false,
      });
    }

    const embed: DiscordEmbed = {
      title: `❌ ${error.title}`,
      color: DiscordColor.ERROR,
      fields,
      timestamp: new Date().toISOString(),
      footer: {
        text: "Eliza Cloud - Error Tracker",
      },
    };

    return this.send({
      embeds: [embed],
    });
  }

  /**
   * Log a custom event
   */
  async logEvent(event: {
    title: string;
    description?: string;
    fields?: DiscordEmbedField[];
    color?: DiscordColor;
  }): Promise<boolean> {
    const embed: DiscordEmbed = {
      title: event.title,
      description: event.description,
      color: event.color || DiscordColor.INFO,
      fields: event.fields,
      timestamp: new Date().toISOString(),
      footer: {
        text: "Eliza Cloud",
      },
    };

    return this.send({
      embeds: [embed],
    });
  }

  /**
   * Log a warning
   */
  async logWarning(warning: {
    title: string;
    message: string;
    context?: Record<string, any>;
  }): Promise<boolean> {
    const fields: DiscordEmbedField[] = [
      {
        name: "Message",
        value: warning.message,
        inline: false,
      },
    ];

    if (warning.context) {
      fields.push({
        name: "Context",
        value: `\`\`\`json\n${JSON.stringify(warning.context, null, 2).slice(0, 1000)}\`\`\``,
        inline: false,
      });
    }

    const embed: DiscordEmbed = {
      title: `⚠️ ${warning.title}`,
      color: DiscordColor.WARNING,
      fields,
      timestamp: new Date().toISOString(),
      footer: {
        text: "Eliza Cloud",
      },
    };

    return this.send({
      embeds: [embed],
    });
  }
}

export const discordService = new DiscordService();
