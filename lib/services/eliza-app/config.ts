/**
 * Eliza App Configuration
 *
 * Centralized configuration with production validation.
 * All required env vars must be set in production.
 */

import { getPromptPreset, type PromptPreset } from "@/lib/eliza/prompt-presets";

const isProduction = process.env.NODE_ENV === "production";

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value) return value;

  // In production, never use fallbacks - always require explicit env vars
  if (isProduction) {
    throw new Error(`Required env var ${name} is not set in production`);
  }

  // In development/test, can use fallbacks
  console.warn(`Missing env var ${name}, using fallback`);
  if (fallback !== undefined) return fallback;
  throw new Error(`Required env var ${name} is not set`);
}

export const elizaAppConfig = {
  // Frontend URL (the consumer-facing app, e.g. eliza.app)
  appUrl: process.env.ELIZA_APP_URL || "https://eliza.app",

  // Agent configuration
  defaultAgentId: process.env.ELIZA_APP_DEFAULT_AGENT_ID || "b850bc30-45f8-0041-a00a-83df46d8555d",

  // Model preferences for webhook channels (Telegram, iMessage)
  modelPreferences: {
    smallModel: "anthropic/claude-sonnet-4.5",
    largeModel: "anthropic/claude-sonnet-4.5",
  },

  // Prompt preset for eliza-app channels (engaging, conversation-continuing behavior)
  promptPreset: getPromptPreset("eliza-app") as PromptPreset,

  // Telegram configuration
  get telegram() {
    return {
      get botToken() {
        return requireEnv("ELIZA_APP_TELEGRAM_BOT_TOKEN", "");
      },
      get webhookSecret() {
        return process.env.ELIZA_APP_TELEGRAM_WEBHOOK_SECRET || "";
      },
    };
  },

  // Blooio (iMessage) configuration
  get blooio() {
    return {
      get apiKey() {
        return requireEnv("ELIZA_APP_BLOOIO_API_KEY", "");
      },
      get webhookSecret() {
        return process.env.ELIZA_APP_BLOOIO_WEBHOOK_SECRET || "";
      },
      get phoneNumber() {
        return requireEnv("ELIZA_APP_BLOOIO_PHONE_NUMBER", "+14245074963");
      },
    };
  },

  // WhatsApp configuration
  get whatsapp() {
    return {
      get accessToken() {
        return requireEnv("ELIZA_APP_WHATSAPP_ACCESS_TOKEN", "");
      },
      get phoneNumberId() {
        return requireEnv("ELIZA_APP_WHATSAPP_PHONE_NUMBER_ID", "");
      },
      get appSecret() {
        return requireEnv("ELIZA_APP_WHATSAPP_APP_SECRET", "");
      },
      get verifyToken() {
        return requireEnv("ELIZA_APP_WHATSAPP_VERIFY_TOKEN", "");
      },
      get phoneNumber() {
        return requireEnv("ELIZA_APP_WHATSAPP_PHONE_NUMBER", "");
      },
    };
  },

  // Discord configuration
  get discord() {
    return {
      get botToken() {
        return requireEnv("ELIZA_APP_DISCORD_BOT_TOKEN", "");
      },
      get applicationId() {
        return requireEnv("ELIZA_APP_DISCORD_APPLICATION_ID", "");
      },
      get clientSecret() {
        return requireEnv("ELIZA_APP_DISCORD_CLIENT_SECRET", "");
      },
    };
  },

  // JWT configuration - secret required in all environments
  get jwt() {
    return {
      get secret() {
        return requireEnv("ELIZA_APP_JWT_SECRET");
      },
    };
  },
} as const;

// Validate all required environment variables in production when explicitly invoked.
export function validateElizaAppConfig() {
  // JWT is required for the core app to function
  if (!process.env.ELIZA_APP_JWT_SECRET) {
    throw new Error("Required env var ELIZA_APP_JWT_SECRET is not set in production");
  }

  // Validate channel-specific required vars if they're enabled
  if (process.env.ELIZA_APP_TELEGRAM_ENABLED === "true" && !process.env.ELIZA_APP_TELEGRAM_BOT_TOKEN) {
    throw new Error("Telegram is enabled but ELIZA_APP_TELEGRAM_BOT_TOKEN is not set in production");
  }
  if (process.env.ELIZA_APP_BLOOIO_ENABLED === "true" && !process.env.ELIZA_APP_BLOOIO_API_KEY) {
    throw new Error("Blooio is enabled but ELIZA_APP_BLOOIO_API_KEY is not set in production");
  }
  if (
    process.env.ELIZA_APP_DISCORD_ENABLED === "true" &&
    (
      !process.env.ELIZA_APP_DISCORD_BOT_TOKEN ||
      !process.env.ELIZA_APP_DISCORD_APPLICATION_ID ||
      !process.env.ELIZA_APP_DISCORD_CLIENT_SECRET
    )
  ) {
    throw new Error("Discord is enabled but required Discord env vars are not set in production");
  }

  const whatsappEnabled =
    process.env.ELIZA_APP_WHATSAPP_ENABLED === "true" ||
    Boolean(
      process.env.ELIZA_APP_WHATSAPP_ACCESS_TOKEN ||
      process.env.ELIZA_APP_WHATSAPP_PHONE_NUMBER_ID ||
      process.env.ELIZA_APP_WHATSAPP_APP_SECRET ||
      process.env.ELIZA_APP_WHATSAPP_VERIFY_TOKEN ||
      process.env.ELIZA_APP_WHATSAPP_PHONE_NUMBER
    );

  if (
    whatsappEnabled &&
    (
      !process.env.ELIZA_APP_WHATSAPP_ACCESS_TOKEN ||
      !process.env.ELIZA_APP_WHATSAPP_PHONE_NUMBER_ID ||
      !process.env.ELIZA_APP_WHATSAPP_APP_SECRET ||
      !process.env.ELIZA_APP_WHATSAPP_VERIFY_TOKEN ||
      !process.env.ELIZA_APP_WHATSAPP_PHONE_NUMBER
    )
  ) {
    throw new Error(
      "WhatsApp is enabled but required WhatsApp env vars are not set in production",
    );
  }
}
