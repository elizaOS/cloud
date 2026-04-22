/**
 * Twitter Automation Service
 *
 * Handles OAuth 1.0a flow for Twitter plugin integration.
 * The plugin requires OAuth 1.0a credentials:
 * - TWITTER_API_KEY + TWITTER_API_SECRET_KEY (from platform app, stored in env)
 * - TWITTER_ACCESS_TOKEN + TWITTER_ACCESS_TOKEN_SECRET (per-user, from OAuth flow)
 */

import { type TOAuth2Scope, TwitterApi } from "twitter-api-v2";
import type { OAuthConnectionRole } from "@/lib/services/oauth/types";
import { secretsService } from "@/lib/services/secrets";
import { logger } from "@/lib/utils/logger";

// Platform app credentials from environment
const TWITTER_API_KEY = process.env.TWITTER_API_KEY!;
const TWITTER_API_SECRET_KEY = process.env.TWITTER_API_SECRET_KEY!;
const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID?.trim() ?? "";
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET?.trim() || undefined;

type TwitterOAuthFlow = "oauth1a" | "oauth2";

const TWITTER_OAUTH2_SCOPES: TOAuth2Scope[] = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "dm.read",
  "dm.write",
  "offline.access",
];

const TWITTER_SECRET_FIELDS = {
  accessToken: "ACCESS_TOKEN",
  accessTokenSecret: "ACCESS_TOKEN_SECRET",
  oauth2AccessToken: "OAUTH2_ACCESS_TOKEN",
  oauth2RefreshToken: "OAUTH2_REFRESH_TOKEN",
  oauth2Scope: "OAUTH2_SCOPE",
  authMode: "AUTH_MODE",
  username: "USERNAME",
  userId: "USER_ID",
} as const;

const LEGACY_TWITTER_SECRET_NAMES: Partial<
  Record<keyof typeof TWITTER_SECRET_FIELDS, string | readonly string[]>
> = {
  accessToken: "TWITTER_ACCESS_TOKEN",
  accessTokenSecret: "TWITTER_ACCESS_TOKEN_SECRET",
  oauth2AccessToken: "TWITTER_OAUTH_ACCESS_TOKEN",
  oauth2RefreshToken: ["TWITTER_OAUTH_REFRESH_TOKEN", "TWITTER_OAUTH_RERESH_TOKEN"],
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
  const legacyNames = LEGACY_TWITTER_SECRET_NAMES[field];
  const names = Array.isArray(legacyNames) ? legacyNames : legacyNames ? [legacyNames] : [];
  for (const name of names) {
    const legacy = await secretsService.get(organizationId, name);
    if (legacy) return legacy;
  }
  return null;
}

async function getRoleCredentials(
  organizationId: string,
  role: OAuthConnectionRole,
): Promise<{
  accessToken: string | null;
  accessSecret: string | null;
  oauth2AccessToken: string | null;
  oauth2RefreshToken: string | null;
  oauth2Scope: string | null;
  authMode: string | null;
  username: string | null;
  twitterUserId: string | null;
}> {
  const [
    accessToken,
    accessSecret,
    oauth2AccessToken,
    oauth2RefreshToken,
    oauth2Scope,
    authMode,
    username,
    twitterUserId,
  ] = await Promise.all([
    getRoleSecret(organizationId, role, "accessToken"),
    getRoleSecret(organizationId, role, "accessTokenSecret"),
    getRoleSecret(organizationId, role, "oauth2AccessToken"),
    getRoleSecret(organizationId, role, "oauth2RefreshToken"),
    getRoleSecret(organizationId, role, "oauth2Scope"),
    getRoleSecret(organizationId, role, "authMode"),
    getRoleSecret(organizationId, role, "username"),
    getRoleSecret(organizationId, role, "userId"),
  ]);
  return {
    accessToken,
    accessSecret,
    oauth2AccessToken,
    oauth2RefreshToken,
    oauth2Scope,
    authMode,
    username,
    twitterUserId,
  };
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

async function deleteRoleSecret(
  organizationId: string,
  role: OAuthConnectionRole,
  field: keyof typeof TWITTER_SECRET_FIELDS,
  audit: {
    actorType: "user";
    actorId: string;
    source: string;
  },
): Promise<void> {
  await secretsService.deleteByName(organizationId, roleSecretName(role, field), audit);
}

export interface TwitterOAuthState {
  oauthToken: string;
  oauthTokenSecret: string;
  organizationId: string;
  userId: string;
  connectionRole?: OAuthConnectionRole;
  redirectUrl?: string;
}

export type TwitterAuthLink =
  | {
      flow: "oauth1a";
      url: string;
      oauthToken: string;
      oauthTokenSecret: string;
    }
  | {
      flow: "oauth2";
      url: string;
      state: string;
      codeVerifier: string;
      redirectUri: string;
      scopes: string[];
    };

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
  private getOAuth2Client(): TwitterApi {
    if (!TWITTER_CLIENT_ID) {
      throw new Error("Twitter OAuth2 client ID is not configured");
    }
    return new TwitterApi({
      clientId: TWITTER_CLIENT_ID,
      ...(TWITTER_CLIENT_SECRET ? { clientSecret: TWITTER_CLIENT_SECRET } : {}),
    });
  }

  private resolveOAuthFlow(): TwitterOAuthFlow {
    const configured = (process.env.TWITTER_OAUTH_FLOW ?? process.env.TWITTER_OAUTH_MODE ?? "")
      .trim()
      .toLowerCase();
    if (configured === "oauth1" || configured === "oauth1a") {
      return "oauth1a";
    }
    if (configured === "oauth2") {
      return "oauth2";
    }
    return TWITTER_CLIENT_ID ? "oauth2" : "oauth1a";
  }

  /**
   * Generate an authorization URL.
   *
   * X supports OAuth 1.0a and OAuth2 user-context auth. Prefer OAuth2 when
   * a client ID is configured because LifeOps reads/writes v2 endpoints and
   * the deployment secrets include OAuth2 app credentials.
   *
   * Step 1 of the 3-legged OAuth flow
   */
  async generateAuthLink(
    callbackUrl: string,
    connectionRole: OAuthConnectionRole = "owner",
  ): Promise<TwitterAuthLink> {
    const role = normalizeConnectionRole(connectionRole);
    if (this.resolveOAuthFlow() === "oauth2") {
      const authLink = this.getOAuth2Client().generateOAuth2AuthLink(callbackUrl, {
        scope: TWITTER_OAUTH2_SCOPES,
      });

      logger.info("[TwitterAutomation] Generated OAuth2 auth link", {
        state: authLink.state,
        connectionRole: role,
      });

      return {
        flow: "oauth2",
        url: authLink.url,
        state: authLink.state,
        codeVerifier: authLink.codeVerifier,
        redirectUri: callbackUrl,
        scopes: TWITTER_OAUTH2_SCOPES,
      };
    }

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
      connectionRole: role,
    });

    return {
      flow: "oauth1a",
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

  async exchangeOAuth2Token(
    code: string,
    codeVerifier: string,
    redirectUri: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string | null;
    scope: string[];
    screenName: string;
    userId: string;
  }> {
    const loginResult = await this.getOAuth2Client().loginWithOAuth2({
      code,
      codeVerifier,
      redirectUri,
    });
    const me = await loginResult.client.v2.me();

    logger.info("[TwitterAutomation] OAuth2 token exchange successful", {
      screenName: me.data.username,
      userId: me.data.id,
    });

    return {
      accessToken: loginResult.accessToken,
      refreshToken: loginResult.refreshToken ?? null,
      scope: loginResult.scope,
      screenName: me.data.username,
      userId: me.data.id,
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
      accessSecret?: string | null;
      refreshToken?: string | null;
      scope?: string[] | null;
      screenName: string;
      twitterUserId: string;
      authMode?: TwitterOAuthFlow;
    },
    connectionRole: OAuthConnectionRole = "owner",
  ): Promise<void> {
    const role = normalizeConnectionRole(connectionRole);
    const authMode = credentials.authMode ?? (credentials.accessSecret ? "oauth1a" : "oauth2");
    const audit = {
      actorType: "user" as const,
      actorId: userId,
      source: "twitter-automation",
    };

    const writes: Promise<void>[] = [
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
      upsertRoleSecret({
        organizationId,
        userId,
        name: roleSecretName(role, "authMode"),
        value: authMode,
        audit,
      }),
    ];

    if (authMode === "oauth1a") {
      if (!credentials.accessSecret) {
        throw new Error("OAuth 1.0a credentials require an access token secret");
      }
      writes.push(
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
        deleteRoleSecret(organizationId, role, "oauth2AccessToken", audit),
        deleteRoleSecret(organizationId, role, "oauth2RefreshToken", audit),
        deleteRoleSecret(organizationId, role, "oauth2Scope", audit),
      );
    } else {
      writes.push(
        upsertRoleSecret({
          organizationId,
          userId,
          name: roleSecretName(role, "oauth2AccessToken"),
          value: credentials.accessToken,
          audit,
        }),
        upsertRoleSecret({
          organizationId,
          userId,
          name: roleSecretName(role, "oauth2Scope"),
          value: (credentials.scope ?? TWITTER_OAUTH2_SCOPES).join(" "),
          audit,
        }),
        deleteRoleSecret(organizationId, role, "accessToken", audit),
        deleteRoleSecret(organizationId, role, "accessTokenSecret", audit),
      );
      if (credentials.refreshToken) {
        writes.push(
          upsertRoleSecret({
            organizationId,
            userId,
            name: roleSecretName(role, "oauth2RefreshToken"),
            value: credentials.refreshToken,
            audit,
          }),
        );
      }
    }

    await Promise.all(writes);

    logger.info("[TwitterAutomation] Credentials stored", {
      organizationId,
      connectionRole: role,
      authMode,
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
      roleSecretName(role, "oauth2AccessToken"),
      roleSecretName(role, "oauth2RefreshToken"),
      roleSecretName(role, "oauth2Scope"),
      roleSecretName(role, "authMode"),
      roleSecretName(role, "username"),
      roleSecretName(role, "userId"),
      ...(role === "owner"
        ? Object.values(LEGACY_TWITTER_SECRET_NAMES).flatMap((name) =>
            Array.isArray(name) ? name : name ? [name] : [],
          )
        : []),
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
    const { accessToken, accessSecret, oauth2AccessToken, username, twitterUserId } =
      await getRoleCredentials(organizationId, role);

    if ((!accessToken || !accessSecret) && !oauth2AccessToken) {
      return { connected: false };
    }

    // Optionally validate the token is still valid
    try {
      const client =
        accessToken && accessSecret
          ? new TwitterApi({
              appKey: TWITTER_API_KEY,
              appSecret: TWITTER_API_SECRET_KEY,
              accessToken,
              accessSecret,
            })
          : new TwitterApi(oauth2AccessToken!);

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
    const {
      accessToken,
      accessSecret,
      oauth2AccessToken,
      oauth2RefreshToken,
      oauth2Scope,
      twitterUserId,
    } = credentials;

    if (accessToken && accessSecret) {
      return {
        TWITTER_AUTH_MODE: "oauth1a",
        TWITTER_API_KEY,
        TWITTER_API_SECRET_KEY,
        TWITTER_ACCESS_TOKEN: accessToken,
        TWITTER_ACCESS_TOKEN_SECRET: accessSecret,
        ...(twitterUserId ? { TWITTER_USER_ID: twitterUserId } : {}),
      };
    }

    if (oauth2AccessToken) {
      return {
        TWITTER_AUTH_MODE: "oauth2",
        TWITTER_OAUTH_ACCESS_TOKEN: oauth2AccessToken,
        ...(oauth2RefreshToken ? { TWITTER_OAUTH_REFRESH_TOKEN: oauth2RefreshToken } : {}),
        ...(oauth2Scope ? { TWITTER_OAUTH_SCOPE: oauth2Scope } : {}),
        ...(twitterUserId ? { TWITTER_USER_ID: twitterUserId } : {}),
      };
    }

    return null;
  }

  hasOAuth1AppCredentials(): boolean {
    return Boolean(TWITTER_API_KEY && TWITTER_API_SECRET_KEY);
  }

  hasOAuth2AppCredentials(): boolean {
    return Boolean(TWITTER_CLIENT_ID);
  }

  getDefaultOAuthFlow(): TwitterOAuthFlow {
    return this.resolveOAuthFlow();
  }

  isConfigured(): boolean {
    return this.hasOAuth1AppCredentials() || this.hasOAuth2AppCredentials();
  }
}

export const twitterAutomationService = new TwitterAutomationService();

// Re-export app automation service
export {
  type GeneratedTweet,
  type TwitterAutomationConfig,
  twitterAppAutomationService,
} from "./app-automation";
