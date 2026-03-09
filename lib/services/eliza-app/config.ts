/**
 * Eliza App Configuration
 *
 * Channel integrations are optional in Preview and should not fail the build
 * when their runtime secrets are absent. Only the JWT secret is treated as
 * required for core session flows.
 */

import { getPromptPreset, type PromptPreset } from "@/lib/eliza/prompt-presets";

const isProduction = process.env.NODE_ENV === "production";

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value) return value;
  if (fallback !== undefined && !isProduction) return fallback;
  // Throw in production, or when no fallback is provided (truly required)
  if (isProduction || fallback === undefined) {
    throw new Error(`[ElizaApp] Required env var ${name} is not set`);
  }
  return fallback || "";
}

function optionalRuntimeEnv(name: string, fallback = ""): string {
  return process.env[name] || (!isProduction ? fallback : "");
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
    botToken: optionalRuntimeEnv("ELIZA_APP_TELEGRAM_BOT_TOKEN"),
    webhookSecret: process.env.ELIZA_APP_TELEGRAM_WEBHOOK_SECRET || "",
  },

  // Blooio (iMessage) configuration
  blooio: {
    apiKey: optionalRuntimeEnv("ELIZA_APP_BLOOIO_API_KEY"),
    webhookSecret: process.env.ELIZA_APP_BLOOIO_WEBHOOK_SECRET || "",
    phoneNumber: optionalRuntimeEnv("ELIZA_APP_BLOOIO_PHONE_NUMBER", "+14245074963"),
  },

  // Discord configuration
  discord: {
    botToken: optionalRuntimeEnv("ELIZA_APP_DISCORD_BOT_TOKEN"),
    applicationId: optionalRuntimeEnv("ELIZA_APP_DISCORD_APPLICATION_ID"),
    clientSecret: optionalRuntimeEnv("ELIZA_APP_DISCORD_CLIENT_SECRET"),
  },

  // JWT configuration - secret required in all environments
  jwt: {
    get secret() {
      return requireEnv("ELIZA_APP_JWT_SECRET");
    },
  },
} as const;
