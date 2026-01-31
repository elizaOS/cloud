/**
 * OAuth Provider Registry
 *
 * Defines configuration for each supported OAuth provider including:
 * - Environment variables required for configuration
 * - Default OAuth scopes
 * - Storage type (platform_credentials table vs secrets table)
 * - Secret naming patterns for secrets-based storage
 * - Routes for OAuth flow delegation
 *
 * NOTE: Discord is excluded until user OAuth is implemented.
 * Current Discord OAuth is bot-only (adds bot to servers), not suitable
 * for the unified OAuth API which focuses on user-level access.
 */

import type { OAuthProviderType } from "./types";

export interface OAuthProviderConfig {
  /** Unique provider identifier */
  id: string;
  /** Human-readable provider name */
  name: string;
  /** Description of what this provider enables */
  description: string;
  /** OAuth type (oauth2, oauth1a, or api_key) */
  type: OAuthProviderType;

  /** Environment variables required for this provider to be configured */
  envVars: string[];

  /** Default OAuth scopes to request */
  defaultScopes?: string[];

  /** Storage type for credentials */
  storage: "platform_credentials" | "secrets";

  /**
   * For secrets-based storage, the secret name patterns.
   * These define what secret names are used to store credentials.
   */
  secretPatterns?: {
    accessToken?: string;
    accessTokenSecret?: string; // OAuth 1.0a
    refreshToken?: string;
    username?: string;
    userId?: string;
    apiKey?: string;
    accountSid?: string;
    authToken?: string;
    phoneNumber?: string;
    webhookSecret?: string;
    fromNumber?: string;
  };

  /** Routes for OAuth flow delegation to existing endpoints */
  routes: {
    /** Route to initiate OAuth flow */
    initiate: string;
    /** OAuth callback route */
    callback: string;
    /** Status check route */
    status: string;
    /** Disconnect route */
    disconnect: string;
  };
}

/**
 * Registry of all supported OAuth providers.
 */
export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  google: {
    id: "google",
    name: "Google",
    description: "Gmail, Calendar, Contacts",
    type: "oauth2",
    envVars: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    defaultScopes: [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
    ],
    storage: "platform_credentials",
    routes: {
      initiate: "/api/v1/google/oauth",
      callback: "/api/v1/google/callback",
      status: "/api/v1/google/status",
      disconnect: "/api/v1/google/disconnect",
    },
  },

  twitter: {
    id: "twitter",
    name: "Twitter/X",
    description: "Post tweets, read timeline",
    type: "oauth1a",
    envVars: ["TWITTER_API_KEY", "TWITTER_API_SECRET_KEY"],
    storage: "secrets",
    secretPatterns: {
      accessToken: "TWITTER_ACCESS_TOKEN",
      accessTokenSecret: "TWITTER_ACCESS_TOKEN_SECRET",
      username: "TWITTER_USERNAME",
      userId: "TWITTER_USER_ID",
    },
    routes: {
      initiate: "/api/v1/twitter/connect",
      callback: "/api/v1/twitter/callback",
      status: "/api/v1/twitter/status",
      disconnect: "/api/v1/twitter/disconnect",
    },
  },

  twilio: {
    id: "twilio",
    name: "Twilio",
    description: "SMS and voice messaging",
    type: "api_key",
    envVars: [], // User provides their own credentials
    storage: "secrets",
    secretPatterns: {
      accountSid: "TWILIO_ACCOUNT_SID",
      authToken: "TWILIO_AUTH_TOKEN",
      phoneNumber: "TWILIO_PHONE_NUMBER",
    },
    routes: {
      initiate: "/api/v1/twilio/connect",
      callback: "", // No callback for API key
      status: "/api/v1/twilio/status",
      disconnect: "/api/v1/twilio/disconnect",
    },
  },

  blooio: {
    id: "blooio",
    name: "Blooio",
    description: "iMessage integration",
    type: "api_key",
    envVars: [], // User provides their own credentials
    storage: "secrets",
    secretPatterns: {
      apiKey: "BLOOIO_API_KEY",
      webhookSecret: "BLOOIO_WEBHOOK_SECRET",
      fromNumber: "BLOOIO_FROM_NUMBER",
    },
    routes: {
      initiate: "/api/v1/blooio/connect",
      callback: "", // No callback for API key
      status: "/api/v1/blooio/status",
      disconnect: "/api/v1/blooio/disconnect",
    },
  },

  // NOTE: Discord excluded until user OAuth is implemented.
  // Current Discord OAuth is bot-only (adds bot to servers).
  // Will be added when user OAuth (act as user) is available.
};

/**
 * Get provider configuration by ID.
 *
 * @param platformId - The platform identifier (e.g., 'google', 'twitter')
 * @returns Provider configuration or null if not found
 */
export function getProvider(platformId: string): OAuthProviderConfig | null {
  return OAUTH_PROVIDERS[platformId] || null;
}

/**
 * Check if a provider has its required environment variables configured.
 *
 * API key providers (envVars is empty array) are always considered "configured"
 * since users provide their own credentials.
 *
 * @param provider - Provider configuration
 * @returns Whether the provider is configured
 */
export function isProviderConfigured(provider: OAuthProviderConfig): boolean {
  if (provider.envVars.length === 0) {
    return true; // API key providers always "configured"
  }
  return provider.envVars.every((envVar) => !!process.env[envVar]);
}

/**
 * Get all providers that have required environment variables configured.
 *
 * @returns Array of configured provider configurations
 */
export function getConfiguredProviders(): OAuthProviderConfig[] {
  return Object.values(OAUTH_PROVIDERS).filter(isProviderConfigured);
}

/**
 * Get all provider IDs.
 *
 * @returns Array of provider identifiers
 */
export function getAllProviderIds(): string[] {
  return Object.keys(OAUTH_PROVIDERS);
}

/**
 * Check if a platform ID is a valid provider.
 *
 * @param platformId - Platform identifier to check
 * @returns Whether the platform is supported
 */
export function isValidProvider(platformId: string): boolean {
  return platformId in OAUTH_PROVIDERS;
}
