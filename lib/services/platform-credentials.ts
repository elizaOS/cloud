/**
 * Platform Credentials Service
 * OAuth credential management for all cloud apps.
 */

import { nanoid } from "nanoid";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { eq, and, lt, desc } from "drizzle-orm";
import {
  platformCredentials,
  platformCredentialSessions,
  type PlatformCredential,
  type PlatformCredentialSession,
  type PlatformType,
} from "@/db/schemas/platform-credentials";
import { secretsService, type AuditContext } from "./secrets";
import { logger } from "@/lib/utils/logger";

const SYSTEM_AUDIT: AuditContext = {
  actorType: "system",
  actorId: "platform-credentials",
  source: "platform-credentials",
};

const SESSION_EXPIRY_MS = 15 * 60 * 1000;
const TOKEN_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;

export const OAUTH_CONFIGS: Record<string, {
  authUrl: string;
  tokenUrl: string;
  profileUrl: string;
  profileHeaders?: Record<string, string>;
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
}> = {
  discord: {
    authUrl: "https://discord.com/api/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    profileUrl: "https://discord.com/api/users/@me",
    scopes: ["identify", "email"],
    clientIdEnv: "DISCORD_CLIENT_ID",
    clientSecretEnv: "DISCORD_CLIENT_SECRET",
  },
  twitter: {
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    profileUrl: "https://api.twitter.com/2/users/me?user.fields=profile_image_url",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    clientIdEnv: "TWITTER_CLIENT_ID",
    clientSecretEnv: "TWITTER_CLIENT_SECRET",
  },
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    profileUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    scopes: ["openid", "email", "profile"],
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  google_calendar: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    profileUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/calendar.events"],
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  gmail: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    profileUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    scopes: ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"],
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  github: {
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    profileUrl: "https://api.github.com/user",
    profileHeaders: { "User-Agent": "Eliza-Cloud" },
    scopes: ["read:user", "user:email"],
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
  },
  slack: {
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    profileUrl: "https://slack.com/api/users.identity",
    scopes: ["users:read", "chat:write"],
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
  },
  // Social media platforms
  reddit: {
    authUrl: "https://www.reddit.com/api/v1/authorize",
    tokenUrl: "https://www.reddit.com/api/v1/access_token",
    profileUrl: "https://oauth.reddit.com/api/v1/me",
    scopes: ["identity", "submit", "edit", "read", "vote"],
    clientIdEnv: "REDDIT_CLIENT_ID",
    clientSecretEnv: "REDDIT_CLIENT_SECRET",
  },
  facebook: {
    authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    profileUrl: "https://graph.facebook.com/v19.0/me?fields=id,name,email",
    scopes: ["email", "pages_manage_posts", "pages_read_engagement"],
    clientIdEnv: "FACEBOOK_APP_ID",
    clientSecretEnv: "FACEBOOK_APP_SECRET",
  },
  instagram: {
    authUrl: "https://api.instagram.com/oauth/authorize",
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    profileUrl: "https://graph.instagram.com/me?fields=id,username",
    scopes: ["instagram_business_basic", "instagram_business_content_publish"],
    clientIdEnv: "FACEBOOK_APP_ID",
    clientSecretEnv: "FACEBOOK_APP_SECRET",
  },
  tiktok: {
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    profileUrl: "https://open.tiktokapis.com/v2/user/info/",
    scopes: ["user.info.basic", "video.publish"],
    clientIdEnv: "TIKTOK_CLIENT_KEY",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
  },
  linkedin: {
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    profileUrl: "https://api.linkedin.com/v2/me",
    scopes: ["r_liteprofile", "r_emailaddress", "w_member_social"],
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
  },
  // Note: Twilio uses API keys stored as secrets, not OAuth
  twilio: {
    authUrl: "",
    tokenUrl: "",
    profileUrl: "",
    scopes: [],
    clientIdEnv: "TWILIO_ACCOUNT_SID",
    clientSecretEnv: "TWILIO_AUTH_TOKEN",
  },
  // Mastodon uses instance-based OAuth - config is a template
  // Actual URLs are constructed from the instance URL at runtime
  mastodon: {
    authUrl: "", // Template: {instanceUrl}/oauth/authorize
    tokenUrl: "", // Template: {instanceUrl}/oauth/token
    profileUrl: "", // Template: {instanceUrl}/api/v1/accounts/verify_credentials
    scopes: ["read:accounts", "write:statuses", "write:favourites", "write:notifications"],
    clientIdEnv: "MASTODON_CLIENT_ID",
    clientSecretEnv: "MASTODON_CLIENT_SECRET",
  },
};

/**
 * Non-OAuth platforms that use API keys or app passwords
 */
export const MANUAL_AUTH_PLATFORMS = ["bluesky", "telegram"] as const;
export type ManualAuthPlatform = typeof MANUAL_AUTH_PLATFORMS[number];

export const SOCIAL_PLATFORMS = [
  "twitter", "bluesky", "discord", "telegram", "slack",
  "reddit", "facebook", "instagram", "tiktok", "linkedin", "mastodon",
] as const;

export interface CreateLinkSessionParams {
  organizationId: string;
  platform: PlatformType;
  appId?: string;
  requestingUserId?: string;
  requestedScopes?: string[];
  callbackUrl?: string;
  callbackType?: "redirect" | "webhook" | "message";
  callbackContext?: { platform?: string; server_id?: string; channel_id?: string; user_id?: string };
}

export interface CompleteOAuthParams {
  oauthState: string;
  code: string;
  platformUserId: string;
  platformUsername?: string;
  platformDisplayName?: string;
  platformAvatarUrl?: string;
  platformEmail?: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresIn?: number;
  scopes: string[];
  profileData?: Record<string, unknown>;
}

class PlatformCredentialsService {
  async createLinkSession(params: CreateLinkSessionParams) {
    const config = OAUTH_CONFIGS[params.platform];
    if (!config) throw new Error(`Unsupported platform: ${params.platform}`);

    const clientId = process.env[config.clientIdEnv];
    if (!clientId) throw new Error(`${params.platform} OAuth not configured`);

    const sessionId = nanoid(32);
    const oauthState = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);
    const scopes = params.requestedScopes?.length ? params.requestedScopes : config.scopes;

    await db.insert(platformCredentialSessions).values({
      session_id: sessionId,
      organization_id: params.organizationId,
      app_id: params.appId,
      requesting_user_id: params.requestingUserId,
      platform: params.platform,
      requested_scopes: scopes,
      oauth_state: oauthState,
      callback_url: params.callbackUrl,
      callback_type: params.callbackType,
      callback_context: params.callbackContext,
      expires_at: expiresAt,
    });

    const cloudUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const authParams = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${cloudUrl}/api/auth/platform-callback/${params.platform}`,
      response_type: "code",
      state: oauthState,
      scope: scopes.join(" "),
    });

    if (params.platform === "twitter") {
      authParams.set("code_challenge_method", "plain");
      authParams.set("code_challenge", oauthState);
    }
    if (params.platform === "google" || params.platform === "gmail") {
      authParams.set("access_type", "offline");
      authParams.set("prompt", "consent");
    }

    logger.info("[Credentials] Session created", { sessionId: sessionId.slice(0, 8), platform: params.platform });

    return { sessionId, linkUrl: `${config.authUrl}?${authParams}`, expiresAt };
  }

  async getSessionByOAuthState(oauthState: string): Promise<PlatformCredentialSession | null> {
    const [session] = await db.select().from(platformCredentialSessions)
      .where(and(eq(platformCredentialSessions.oauth_state, oauthState), eq(platformCredentialSessions.status, "pending")))
      .limit(1);

    if (!session) return null;
    if (session.expires_at < new Date()) {
      await db.update(platformCredentialSessions).set({ status: "expired" }).where(eq(platformCredentialSessions.id, session.id));
      return null;
    }
    return session;
  }

  async completeOAuth(params: CompleteOAuthParams): Promise<PlatformCredential> {
    const session = await this.getSessionByOAuthState(params.oauthState);
    if (!session) throw new Error("Invalid or expired session");

    const accessSecret = await secretsService.create({
      organizationId: session.organization_id,
      name: `${session.platform.toUpperCase()}_ACCESS_${params.platformUserId}`,
      value: params.accessToken,
      scope: session.app_id ? "project" : "organization",
      projectId: session.app_id || undefined,
      projectType: session.app_id ? "app" : undefined,
      createdBy: session.requesting_user_id || "system",
    }, SYSTEM_AUDIT);

    let refreshSecretId: string | undefined;
    if (params.refreshToken) {
      const refreshSecret = await secretsService.create({
        organizationId: session.organization_id,
        name: `${session.platform.toUpperCase()}_REFRESH_${params.platformUserId}`,
        value: params.refreshToken,
        scope: session.app_id ? "project" : "organization",
        projectId: session.app_id || undefined,
        projectType: session.app_id ? "app" : undefined,
        createdBy: session.requesting_user_id || "system",
      }, SYSTEM_AUDIT);
      refreshSecretId = refreshSecret.id;
    }

    const tokenExpiresAt = params.tokenExpiresIn
      ? new Date(Date.now() + params.tokenExpiresIn * 1000)
      : new Date(Date.now() + TOKEN_EXPIRY_MS);

    const [existing] = await db.select().from(platformCredentials)
      .where(and(
        eq(platformCredentials.organization_id, session.organization_id),
        eq(platformCredentials.platform, session.platform),
        eq(platformCredentials.platform_user_id, params.platformUserId)
      )).limit(1);

    const credentialData = {
      status: "active" as const,
      platform_username: params.platformUsername,
      platform_display_name: params.platformDisplayName,
      platform_avatar_url: params.platformAvatarUrl,
      platform_email: params.platformEmail,
      access_token_secret_id: accessSecret.id,
      refresh_token_secret_id: refreshSecretId,
      token_expires_at: tokenExpiresAt,
      scopes: params.scopes,
      profile_data: params.profileData,
      linked_at: new Date(),
      error_message: null,
      updated_at: new Date(),
    };

    const [credential] = existing
      ? await db.update(platformCredentials).set(credentialData).where(eq(platformCredentials.id, existing.id)).returning()
      : await db.insert(platformCredentials).values({
          organization_id: session.organization_id,
          user_id: session.requesting_user_id,
          app_id: session.app_id,
          platform: session.platform,
          platform_user_id: params.platformUserId,
          granted_permissions: params.scopes,
          source_type: session.callback_context?.platform || "web",
          source_context: session.callback_context,
          ...credentialData,
        }).returning();

    await db.update(platformCredentialSessions).set({
      status: "completed",
      credential_id: credential.id,
      completed_at: new Date(),
    }).where(eq(platformCredentialSessions.id, session.id));

    logger.info("[Credentials] OAuth completed", { platform: session.platform, credentialId: credential.id });
    return credential;
  }

  async failSession(oauthState: string, errorCode: string, errorMessage: string) {
    await db.update(platformCredentialSessions).set({
      status: "failed",
      error_code: errorCode,
      error_message: errorMessage,
      completed_at: new Date(),
    }).where(eq(platformCredentialSessions.oauth_state, oauthState));
  }

  async getSessionStatus(sessionId: string) {
    const [session] = await db.select().from(platformCredentialSessions)
      .where(eq(platformCredentialSessions.session_id, sessionId)).limit(1);
    if (!session) return { status: "not_found" };
    return {
      status: session.status,
      credentialId: session.credential_id || undefined,
      error: session.error_message || undefined,
    };
  }

  async getCredentialWithTokens(credentialId: string, organizationId: string) {
    const [credential] = await db.select().from(platformCredentials)
      .where(and(
        eq(platformCredentials.id, credentialId),
        eq(platformCredentials.organization_id, organizationId),
        eq(platformCredentials.status, "active")
      )).limit(1);

    if (!credential) return null;

    const accessToken = await secretsService.get(
      organizationId,
      `${credential.platform.toUpperCase()}_ACCESS_${credential.platform_user_id}`,
      credential.app_id || undefined
    ) || "";

    const refreshToken = await secretsService.get(
      organizationId,
      `${credential.platform.toUpperCase()}_REFRESH_${credential.platform_user_id}`,
      credential.app_id || undefined
    ) || undefined;

    await db.update(platformCredentials).set({ last_used_at: new Date() }).where(eq(platformCredentials.id, credentialId));

    return { credential, accessToken, refreshToken };
  }

  async listCredentials(organizationId: string, options?: { platform?: PlatformType; appId?: string; status?: string }) {
    const credentials = await db.select().from(platformCredentials)
      .where(eq(platformCredentials.organization_id, organizationId))
      .orderBy(desc(platformCredentials.created_at));

    return credentials.filter(c =>
      (!options?.platform || c.platform === options.platform) &&
      (!options?.appId || c.app_id === options.appId) &&
      (!options?.status || c.status === options.status)
    );
  }

  async getCredential(credentialId: string, organizationId: string): Promise<PlatformCredential | null> {
    const [credential] = await db.select().from(platformCredentials)
      .where(and(eq(platformCredentials.id, credentialId), eq(platformCredentials.organization_id, organizationId)))
      .limit(1);
    return credential ?? null;
  }

  async revokeCredential(credentialId: string, organizationId: string) {
    const [credential] = await db.select().from(platformCredentials)
      .where(and(eq(platformCredentials.id, credentialId), eq(platformCredentials.organization_id, organizationId)))
      .limit(1);

    if (!credential) throw new Error("Credential not found");

    if (credential.access_token_secret_id) {
      await secretsService.delete(credential.access_token_secret_id, organizationId, SYSTEM_AUDIT).catch(err => {
        logger.warn("[Credentials] Failed to delete access token secret", { credentialId, error: err.message });
      });
    }
    if (credential.refresh_token_secret_id) {
      await secretsService.delete(credential.refresh_token_secret_id, organizationId, SYSTEM_AUDIT).catch(err => {
        logger.warn("[Credentials] Failed to delete refresh token secret", { credentialId, error: err.message });
      });
    }

    await db.update(platformCredentials).set({
      status: "revoked",
      revoked_at: new Date(),
      updated_at: new Date(),
    }).where(eq(platformCredentials.id, credentialId));

    logger.info("[Credentials] Revoked", { credentialId, platform: credential.platform });
  }

  async refreshToken(credentialId: string, organizationId: string): Promise<boolean> {
    const result = await this.getCredentialWithTokens(credentialId, organizationId);
    if (!result?.refreshToken) return false;

    const { credential, refreshToken } = result;
    const config = OAUTH_CONFIGS[credential.platform];
    if (!config) return false;

    const clientId = process.env[config.clientIdEnv];
    const clientSecret = process.env[config.clientSecretEnv];
    if (!clientId || !clientSecret) return false;

    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      await db.update(platformCredentials).set({
        status: "expired",
        error_message: "Token refresh failed",
        updated_at: new Date(),
      }).where(eq(platformCredentials.id, credentialId));
      return false;
    }

    const data = await response.json();

    if (credential.access_token_secret_id) {
      await secretsService.update(credential.access_token_secret_id, organizationId, { value: data.access_token }, SYSTEM_AUDIT);
    }

    await db.update(platformCredentials).set({
      token_expires_at: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      last_refreshed_at: new Date(),
      status: "active",
      error_message: null,
      updated_at: new Date(),
    }).where(eq(platformCredentials.id, credentialId));

    logger.info("[Credentials] Token refreshed", { credentialId, platform: credential.platform });
    return true;
  }

  async cleanupExpiredSessions() {
    const result = await db.delete(platformCredentialSessions)
      .where(and(lt(platformCredentialSessions.expires_at, new Date()), eq(platformCredentialSessions.status, "pending")));
    return result.rowCount || 0;
  }

  async storeManualCredentials(params: {
    organizationId: string;
    userId?: string;
    appId?: string;
    platform: PlatformType;
    credentials: { handle?: string; appPassword?: string; botToken?: string };
  }): Promise<PlatformCredential> {
    const { organizationId, userId, appId, platform, credentials } = params;

    const validated = platform === "bluesky"
      ? await this.validateBluesky(credentials.handle!, credentials.appPassword!)
      : platform === "telegram"
        ? await this.validateTelegram(credentials.botToken!)
        : null;

    if (!validated) throw new Error(`Manual credentials not supported for: ${platform}`);

    const secret = await secretsService.create({
      organizationId,
      name: validated.secretName,
      value: validated.secretValue,
      scope: appId ? "project" : "organization",
      projectId: appId,
      projectType: appId ? "app" : undefined,
      createdBy: userId || "system",
    }, SYSTEM_AUDIT);

    const [existing] = await db.select().from(platformCredentials)
      .where(and(
        eq(platformCredentials.organization_id, organizationId),
        eq(platformCredentials.platform, platform),
        eq(platformCredentials.platform_user_id, validated.userId)
      )).limit(1);

    const data = {
      status: "active" as const,
      platform_username: validated.username,
      platform_display_name: validated.displayName,
      platform_avatar_url: validated.avatarUrl,
      api_key_secret_id: secret.id,
      linked_at: new Date(),
      error_message: null,
      updated_at: new Date(),
    };

    const [credential] = existing
      ? await db.update(platformCredentials).set(data).where(eq(platformCredentials.id, existing.id)).returning()
      : await db.insert(platformCredentials).values({
          organization_id: organizationId,
          user_id: userId,
          app_id: appId,
          platform,
          platform_user_id: validated.userId,
          source_type: "manual",
          ...data,
        }).returning();

    logger.info("[Credentials] Manual credentials stored", { platform, credentialId: credential.id });
    return credential;
  }

  private async validateBluesky(handle: string, appPassword: string) {
    if (!handle || !appPassword) throw new Error("Bluesky requires handle and app password");

    const normalizedHandle = handle.replace(/^@/, "");
    const service = normalizedHandle.includes(".") && !normalizedHandle.endsWith(".bsky.social")
      ? `https://${normalizedHandle.split(".").slice(-2).join(".")}`
      : "https://bsky.social";

    const response = await fetch(`${service}/xrpc/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: normalizedHandle, password: appPassword }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || "Bluesky authentication failed");
    }

    const session = await response.json();
    const profileRes = await fetch(`${service}/xrpc/app.bsky.actor.getProfile?actor=${session.did}`, {
      headers: { Authorization: `Bearer ${session.accessJwt}` },
    });
    const profile = profileRes.ok ? await profileRes.json() : {};

    return {
      userId: session.did,
      username: handle,
      displayName: profile.displayName,
      avatarUrl: profile.avatar,
      secretName: `BLUESKY_APP_PASSWORD_${session.did}`,
      secretValue: appPassword,
    };
  }

  private async validateTelegram(botToken: string) {
    if (!botToken) throw new Error("Telegram requires bot token");

    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = await response.json();

    if (!data.ok) throw new Error(data.description || "Invalid Telegram bot token");

    return {
      userId: String(data.result.id),
      username: data.result.username,
      displayName: data.result.first_name,
      avatarUrl: undefined,
      secretName: `TELEGRAM_BOT_TOKEN_${data.result.id}`,
      secretValue: botToken,
    };
  }

  async getManualCredentials(credentialId: string, organizationId: string) {
    const [credential] = await db.select().from(platformCredentials)
      .where(and(
        eq(platformCredentials.id, credentialId),
        eq(platformCredentials.organization_id, organizationId),
        eq(platformCredentials.status, "active")
      )).limit(1);

    if (!credential?.api_key_secret_id) return null;

    const secretName = credential.platform === "bluesky"
      ? `BLUESKY_APP_PASSWORD_${credential.platform_user_id}`
      : `TELEGRAM_BOT_TOKEN_${credential.platform_user_id}`;

    const apiKey = await secretsService.get(organizationId, secretName, credential.app_id || undefined);
    if (!apiKey) return null;

    await db.update(platformCredentials).set({ last_used_at: new Date() }).where(eq(platformCredentials.id, credentialId));
    return { credential, apiKey };
  }

  async createMastodonLinkSession(params: CreateLinkSessionParams & { instanceUrl: string }) {
    const instanceHost = new URL(params.instanceUrl.startsWith("http") ? params.instanceUrl : `https://${params.instanceUrl}`).origin;

    const clientId = process.env.MASTODON_CLIENT_ID;
    const clientSecret = process.env.MASTODON_CLIENT_SECRET;
    const configuredInstance = process.env.MASTODON_INSTANCE_URL;

    if (!configuredInstance || !clientId || !clientSecret) {
      throw new Error("Mastodon OAuth not configured");
    }
    if (!instanceHost.includes(new URL(configuredInstance).host)) {
      throw new Error(`Instance ${instanceHost} not supported`);
    }

    const sessionId = nanoid(32);
    const oauthState = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);
    const scopes = params.requestedScopes?.length ? params.requestedScopes : OAUTH_CONFIGS.mastodon.scopes;

    await db.insert(platformCredentialSessions).values({
      session_id: sessionId,
      organization_id: params.organizationId,
      app_id: params.appId,
      requesting_user_id: params.requestingUserId,
      platform: "mastodon",
      requested_scopes: scopes,
      oauth_state: oauthState,
      callback_url: params.callbackUrl,
      callback_type: params.callbackType,
      callback_context: { ...params.callbackContext, instanceUrl: instanceHost },
      expires_at: expiresAt,
    });

    const cloudUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const authParams = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${cloudUrl}/api/auth/platform-callback/mastodon`,
      response_type: "code",
      state: oauthState,
      scope: scopes.join(" "),
    });

    logger.info("[Credentials] Mastodon session created", { sessionId: sessionId.slice(0, 8), instance: instanceHost });
    return { sessionId, linkUrl: `${instanceHost}/oauth/authorize?${authParams}`, expiresAt };
  }

  async getAvailablePlatforms(organizationId: string) {
    const credentials = await this.listCredentials(organizationId, { status: "active" });
    const credentialMap = new Map(credentials.map(c => [c.platform, c]));

    const toConnection = (cred: PlatformCredential) => ({
      id: cred.id,
      username: cred.platform_username || cred.platform_user_id,
      displayName: cred.platform_display_name || cred.platform_username || "",
      avatarUrl: cred.platform_avatar_url || undefined,
      status: cred.status,
      linkedAt: cred.linked_at,
    });

    const oauthPlatforms = Object.entries(OAUTH_CONFIGS)
      .filter(([platform]) => platform !== "twilio")
      .map(([platform, config]) => {
        const cred = credentialMap.get(platform as PlatformType);
        return {
          platform,
          authType: "oauth" as const,
          configured: !!process.env[config.clientIdEnv],
          connected: !!cred,
          connection: cred ? toConnection(cred) : undefined,
        };
      });

    const manualPlatforms = MANUAL_AUTH_PLATFORMS.map(platform => {
      const cred = credentialMap.get(platform as PlatformType);
      return {
        platform,
        authType: "manual" as const,
        configured: true,
        connected: !!cred,
        connection: cred ? toConnection(cred) : undefined,
      };
    });

    return [...oauthPlatforms, ...manualPlatforms];
  }
}

export const platformCredentialsService = new PlatformCredentialsService();
