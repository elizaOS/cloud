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
  if (isProduction) {
    throw new Error(`[ElizaApp] Required env var ${name} is not set`);
  }
  return fallback || "";
}

export const elizaAppConfig = {
  // Agent configuration
  defaultAgentId: process.env.ELIZA_APP_DEFAULT_AGENT_ID || "b850bc30-45f8-0041-a00a-83df46d8555d",

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

  // JWT configuration
  jwt: {
    secret: requireEnv("ELIZA_APP_JWT_SECRET", "dev-secret-not-for-production-use"),
  },
} as const;

// Validate on import in production
if (isProduction) {
  // These will throw if not set
  elizaAppConfig.telegram.botToken;
  elizaAppConfig.blooio.apiKey;
  elizaAppConfig.blooio.phoneNumber;
  elizaAppConfig.jwt.secret;
}
