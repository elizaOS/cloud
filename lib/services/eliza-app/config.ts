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
  telegram: {
    botToken: requireEnv("ELIZA_APP_TELEGRAM_BOT_TOKEN", ""),
    webhookSecret: process.env.ELIZA_APP_TELEGRAM_WEBHOOK_SECRET || "",
  },

  // Blooio (iMessage) configuration
  blooio: {
    apiKey: requireEnv("ELIZA_APP_BLOOIO_API_KEY", ""),
    webhookSecret: process.env.ELIZA_APP_BLOOIO_WEBHOOK_SECRET || "",
    phoneNumber: requireEnv("ELIZA_APP_BLOOIO_PHONE_NUMBER", "+14245074963"),
  },

  // Discord configuration
  discord: {
    botToken: requireEnv("ELIZA_APP_DISCORD_BOT_TOKEN", ""),
    applicationId: requireEnv("ELIZA_APP_DISCORD_APPLICATION_ID", ""),
    clientSecret: requireEnv("ELIZA_APP_DISCORD_CLIENT_SECRET", ""),
  },

  // JWT configuration - secret required in all environments
  jwt: {
    secret: requireEnv("ELIZA_APP_JWT_SECRET"),
  },
} as const;

// Validate all required environment variables in production
if (isProduction) {
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
  if (process.env.ELIZA_APP_DISCORD_ENABLED === "true" && 
      (!process.env.ELIZA_APP_DISCORD_BOT_TOKEN || 
       !process.env.ELIZA_APP_DISCORD_APPLICATION_ID || 
       !process.env.ELIZA_APP_DISCORD_CLIENT_SECRET)) {
    throw new Error("Discord is enabled but required Discord env vars are not set in production");
  }
}
