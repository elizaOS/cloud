/**
 * Twitter Automation Service
 *
 * Handles OAuth 1.0a flow for Twitter plugin integration.
 * The plugin requires OAuth 1.0a credentials:
 * - TWITTER_API_KEY + TWITTER_API_SECRET_KEY (from platform app, stored in env)
 * - TWITTER_ACCESS_TOKEN + TWITTER_ACCESS_TOKEN_SECRET (per-user, from OAuth flow)
 */

import { TwitterApi } from "twitter-api-v2";
import type { OAuthConnectionRole } from "@/lib/services/oauth/types";
import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";

// Platform app credentials from environment
const TWITTER_API_KEY = process.env.TWITTER_API_KEY!;
const TWITTER_API_SECRET_KEY = process.env.TWITTER_API_SECRET_KEY!;

const TWITTER_SECRET_FIELDS = {
  accessToken: "ACCESS_TOKEN",
  accessTokenSecret: "ACCESS_TOKEN_SECRET",
  username: "USERNAME",
  userId: "USER_ID",
} as const;

const LEGACY_TWITTER_SECRET_NAMES = {
  accessToken: "TWITTER_ACCESS_TOKEN",
  accessTokenSecret: "TWITTER_ACCESS_TOKEN_SECRET",
  username: "TWITTER_USERNAME",
  userId: "TWITTER_USER_ID",
} as const;

function normalizeConnectionRole(role?: OAuthConnectionRole): OAuthConnectionRole {
  return role === "agent" ? "agent" : "owner";
}

function roleSecretName(
  role: OAuthConnectionRole,
  field: keyof typeof TWITTER_SECRET_FIELDS,
): string {
  return `TWITTER_${role.toUpperCase()}_${TWITTER_SECRET_FIELDS[field]}`;
}

async function getRoleSecret(
  organizationId: string,
  role: OAuthConnectionRole,
  field: keyof typeof TWITTER_SECRET_FIELDS,
): Promise<string | null> {
  const roleScoped = await secretsService.get(organizationId, roleSecretName(role, field));
  if (roleScoped || role !== "owner") {
    return roleScoped;
  }
  return secretsService.get(organizationId, LEGACY_TWITTER_SECRET_NAMES[field]);
}

async function getRoleCredentials(
  organizationId: string,
  role: OAuthConnectionRole,
): Promise<{
  accessToken: string | null;
  accessSecret: string | null;
  username: string | null;
  twitterUserId: string | null;
}> {
  const [accessToken, accessSecret, username, twitterUserId] = await Promise.all([
    getRoleSecret(organizationId, role, "accessToken"),
    getRoleSecret(organizationId, role, "accessTokenSecret"),
    getRoleSecret(organizationId, role, "username"),
    getRoleSecret(organizationId, role, "userId"),
  ]);
  return { accessToken, accessSecret, username, twitterUserId };
}

async function upsertRoleSecret(args: {
  organizationId: string;
  userId: string;
  name: string;
  value: string;
  audit: {
    actorType: "user";
    actorId: string;
    source: string;
  };
}): Promise<void> {
  try {
    await secretsService.create(
      {
        organizationId: args.organizationId,
        name: args.name,
        value: args.value,
        scope: "organization",
        createdBy: args.userId,
      },
      args.audit,
    );
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !message.includes("already exists") &&
      !message.includes("duplicate") &&
      !message.includes("unique constraint")
    ) {
      throw error;
    }
  }

  const existingSecret = (await secretsService.list(args.organizationId)).find(
    (secret) => secret.name === args.name,
  );
  if (!existingSecret) {
    throw new Error(`Secret '${args.name}' already exists but could not be loaded for rotation`);
  }
  await secretsService.rotate(existingSecret.id, args.organizationId, args.value, args.audit);
}

export interface TwitterOAuthState {
  oauthToken: string;
  oauthTokenSecret: string;
  organizationId: string;
  userId: string;
  connectionRole?: OAuthConnectionRole;
  redirectUrl?: string;
}

export interface TwitterConnectionStatus {
  connected: boolean;
  username?: string;
  userId?: string;
  avatarUrl?: string;
  error?: string;
}

export interface TwitterAutomationSettings {
  enabled: boolean;
  autoPost: boolean;
  autoReply: boolean;
  autoEngage: boolean;
  discovery: boolean;
  postIntervalMin: number;
  postIntervalMax: number;
  dryRun: boolean;
  targetUsers?: string;
}

class TwitterAutomationService {
  /**
   * Generate OAuth 1.0a authorization URL
   * Step 1 of the 3-legged OAuth flow
   */
  async generateAuthLink(callbackUrl: string): Promise<{
    url: string;
    oauthToken: string;
    oauthTokenSecret: string;
  }> {
    if (!TWITTER_API_KEY || !TWITTER_API_SECRET_KEY) {
      throw new Error(
        "Twitter API credentials not configured. Set TWITTER_API_KEY and TWITTER_API_SECRET_KEY in environment.",
      );
    }

    const client = new TwitterApi({
      appKey: TWITTER_API_KEY,
      appSecret: TWITTER_API_SECRET_KEY,
    });

    const authLink = await client.generateAuthLink(callbackUrl, {
      linkMode: "authorize",
    });

    logger.info("[TwitterAutomation] Generated auth link", {
      oauthToken: authLink.oauth_token,
    });

    return {
      url: authLink.url,
      oauthToken: authLink.oauth_token,
      oauthTokenSecret: authLink.oauth_token_secret,
    };
  }

  /**
   * Exchange OAuth verifier for access tokens
   * Step 3 of the 3-legged OAuth flow (after user authorizes)
   */
  async exchangeToken(
    oauthToken: string,
    oauthTokenSecret: string,
    oauthVerifier: string,
  ): Promise<{
    accessToken: string;
    accessSecret: string;
    screenName: string;
    userId: string;
  }> {
    if (!TWITTER_API_KEY || !TWITTER_API_SECRET_KEY) {
      throw new Error("Twitter API credentials not configured");
    }

    const client = new TwitterApi({
      appKey: TWITTER_API_KEY,
      appSecret: TWITTER_API_SECRET_KEY,
      accessToken: oauthToken,
      accessSecret: oauthTokenSecret,
    });

    const loginResult = await client.login(oauthVerifier);

    logger.info("[TwitterAutomation] Token exchange successful", {
      screenName: loginResult.screenName,
      userId: loginResult.userId,
    });

    return {
      accessToken: loginResult.accessToken,
      accessSecret: loginResult.accessSecret,
      screenName: loginResult.screenName,
      userId: loginResult.userId,
    };
  }

  /**
   * Store user's Twitter credentials in secrets
   */
  async storeCredentials(
    organizationId: string,
    userId: string,
    credentials: {
      accessToken: string;
      accessSecret: string;
      screenName: string;
      twitterUserId: string;
    },
    connectionRole: OAuthConnectionRole = "owner",
  ): Promise<void> {
    const role = normalizeConnectionRole(connectionRole);
    const audit = {
      actorType: "user" as const,
      actorId: userId,
      source: "twitter-automation",
    };

    await Promise.all([
      upsertRoleSecret({
        organizationId,
        userId,
        name: roleSecretName(role, "accessToken"),
        value: credentials.accessToken,
        audit,
      }),
      upsertRoleSecret({
        organizationId,
        userId,
        name: roleSecretName(role, "accessTokenSecret"),
        value: credentials.accessSecret,
        audit,
      }),
      upsertRoleSecret({
        organizationId,
        userId,
        name: roleSecretName(role, "username"),
        value: credentials.screenName,
        audit,
      }),
      upsertRoleSecret({
        organizationId,
        userId,
        name: roleSecretName(role, "userId"),
        value: credentials.twitterUserId,
        audit,
      }),
    ]);

    logger.info("[TwitterAutomation] Credentials stored", {
      organizationId,
      connectionRole: role,
      screenName: credentials.screenName,
    });
  }

  /**
   * Remove Twitter credentials (disconnect)
   */
  async removeCredentials(
    organizationId: string,
    userId: string,
    connectionRole: OAuthConnectionRole = "owner",
  ): Promise<void> {
    const role = normalizeConnectionRole(connectionRole);
    const audit = {
      actorType: "user" as const,
      actorId: userId,
      source: "twitter-automation",
    };

    const secretNames = [
      roleSecretName(role, "accessToken"),
      roleSecretName(role, "accessTokenSecret"),
      roleSecretName(role, "username"),
      roleSecretName(role, "userId"),
      ...(role === "owner" ? Object.values(LEGACY_TWITTER_SECRET_NAMES) : []),
    ];

    await Promise.all(
      secretNames.map((name) => secretsService.deleteByName(organizationId, name, audit)),
    );

    logger.info("[TwitterAutomation] Credentials removed", {
      organizationId,
      connectionRole: role,
    });
  }

  /**
   * Check if Twitter is connected for an organization
   */
  async getConnectionStatus(
    organizationId: string,
    connectionRole: OAuthConnectionRole = "owner",
  ): Promise<TwitterConnectionStatus> {
    const role = normalizeConnectionRole(connectionRole);
    const { accessToken, accessSecret, username, twitterUserId } = await getRoleCredentials(
      organizationId,
      role,
    );

    if (!accessToken || !accessSecret) {
      return { connected: false };
    }

    // Optionally validate the token is still valid
    try {
      const client = new TwitterApi({
        appKey: TWITTER_API_KEY,
        appSecret: TWITTER_API_SECRET_KEY,
        accessToken,
        accessSecret,
      });

      const me = await client.v2.me({
        "user.fields": ["profile_image_url"],
      });

      return {
        connected: true,
        username: me.data.username,
        userId: me.data.id,
        avatarUrl: me.data.profile_image_url,
      };
    } catch (error) {
      logger.warn("[TwitterAutomation] Token validation failed", {
        organizationId,
        connectionRole: role,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return {
        connected: false,
        username: username ?? undefined,
        userId: twitterUserId ?? undefined,
        error: "Token may be expired. Try reconnecting.",
      };
    }
  }

  /**
   * Get credentials for injecting into character settings
   * Used by agent-loader when Twitter is enabled
   */
  async getCredentialsForAgent(
    organizationId: string,
    connectionRole: OAuthConnectionRole = "agent",
  ): Promise<Record<string, string> | null> {
    const role = normalizeConnectionRole(connectionRole);
    const credentials = await getRoleCredentials(organizationId, role);
    const { accessToken, accessSecret, twitterUserId } = credentials;

    if (!accessToken || !accessSecret) {
      return null;
    }

    // Return credentials that the plugin expects
    return {
      TWITTER_API_KEY,
      TWITTER_API_SECRET_KEY,
      TWITTER_ACCESS_TOKEN: accessToken,
      TWITTER_ACCESS_TOKEN_SECRET: accessSecret,
      ...(twitterUserId ? { TWITTER_USER_ID: twitterUserId } : {}),
    };
  }

  /**
   * Check if Twitter API credentials are configured at platform level
   */
  isConfigured(): boolean {
    return Boolean(TWITTER_API_KEY && TWITTER_API_SECRET_KEY);
  }
}

export const twitterAutomationService = new TwitterAutomationService();

// Re-export app automation service
export {
  type GeneratedTweet,
  type TwitterAutomationConfig,
  twitterAppAutomationService,
} from "./app-automation";
