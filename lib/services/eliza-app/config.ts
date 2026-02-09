/**
 * Eliza App Configuration
 *
 * Centralized configuration with production validation.
 * All required env vars must be set in production.
 */

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

  // WhatsApp configuration
  whatsapp: {
    accessToken: requireEnv("ELIZA_APP_WHATSAPP_ACCESS_TOKEN", ""),
    phoneNumberId: requireEnv("ELIZA_APP_WHATSAPP_PHONE_NUMBER_ID", ""),
    appSecret: requireEnv("ELIZA_APP_WHATSAPP_APP_SECRET", ""),
    verifyToken: requireEnv("ELIZA_APP_WHATSAPP_VERIFY_TOKEN", ""),
    phoneNumber: requireEnv("ELIZA_APP_WHATSAPP_PHONE_NUMBER", ""),
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

// Validate on import in production
if (isProduction) {
  // These will throw if not set
  elizaAppConfig.telegram.botToken;
  elizaAppConfig.blooio.apiKey;
  elizaAppConfig.blooio.phoneNumber;
  elizaAppConfig.discord.botToken;
  elizaAppConfig.discord.applicationId;
  elizaAppConfig.discord.clientSecret;
  elizaAppConfig.whatsapp.accessToken;
  elizaAppConfig.whatsapp.phoneNumberId;
  elizaAppConfig.whatsapp.appSecret;
  elizaAppConfig.whatsapp.verifyToken;
  elizaAppConfig.whatsapp.phoneNumber;
  elizaAppConfig.jwt.secret;
}
