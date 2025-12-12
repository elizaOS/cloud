/**
 * OAuth Callback - Exchanges code for tokens and stores credentials.
 */

import { NextRequest, NextResponse } from "next/server";
import { platformCredentialsService, OAUTH_CONFIGS } from "@/lib/services/platform-credentials";
import { logger } from "@/lib/utils/logger";

const CLOUD_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

async function exchangeCode(platform: string, code: string, state: string, instanceUrl?: string) {
  const config = OAUTH_CONFIGS[platform];
  if (!config) throw new Error(`Unsupported platform: ${platform}`);

  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  if (!clientId || !clientSecret) throw new Error(`${platform} OAuth not configured`);

  // Determine token URL - Mastodon uses instance-specific URL
  let tokenUrl = config.tokenUrl;
  if (platform === "mastodon" && instanceUrl) {
    tokenUrl = `${instanceUrl}/oauth/token`;
  }

  const body: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: `${CLOUD_URL}/api/auth/platform-callback/${platform}`,
  };
  if (platform === "twitter") body.code_verifier = state;
  if (platform === "reddit") body.redirect_uri = `${CLOUD_URL}/api/auth/platform-callback/reddit`;

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  // Reddit requires Basic auth for token exchange
  if (platform === "reddit") {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers,
    body: new URLSearchParams(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("[OAuth] Token exchange failed", { platform, status: response.status, error: errorText });
    throw new Error(`Token exchange failed: ${response.status}`);
  }
  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    scope: data.scope || "",
  };
}

async function fetchProfile(platform: string, accessToken: string, instanceUrl?: string) {
  const config = OAUTH_CONFIGS[platform];
  if (!config) throw new Error(`Unsupported platform: ${platform}`);

  // Determine profile URL - Mastodon uses instance-specific URL
  let profileUrl = config.profileUrl;
  if (platform === "mastodon" && instanceUrl) {
    profileUrl = `${instanceUrl}/api/v1/accounts/verify_credentials`;
  }

  const response = await fetch(profileUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, ...config.profileHeaders },
  });
  if (!response.ok) {
    const errorText = await response.text();
    logger.error("[OAuth] Profile fetch failed", { platform, status: response.status, error: errorText });
    throw new Error(`Profile fetch failed: ${response.status}`);
  }

  const data = await response.json();

  const normalizers: Record<string, () => { id: string; username?: string; displayName?: string; avatarUrl?: string; email?: string; raw: Record<string, unknown> }> = {
    discord: () => ({
      id: data.id,
      username: data.username,
      displayName: data.global_name || data.username,
      avatarUrl: data.avatar ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png` : undefined,
      email: data.email,
      raw: data,
    }),
    twitter: () => ({
      id: data.data.id,
      username: data.data.username,
      displayName: data.data.name,
      avatarUrl: data.data.profile_image_url,
      raw: data.data,
    }),
    google: () => ({
      id: data.id,
      username: data.email?.split("@")[0],
      displayName: data.name,
      avatarUrl: data.picture,
      email: data.email,
      raw: data,
    }),
    gmail: () => ({
      id: data.id,
      username: data.email?.split("@")[0],
      displayName: data.name,
      avatarUrl: data.picture,
      email: data.email,
      raw: data,
    }),
    google_calendar: () => ({
      id: data.id,
      username: data.email?.split("@")[0],
      displayName: data.name,
      avatarUrl: data.picture,
      email: data.email,
      raw: data,
    }),
    github: () => ({
      id: String(data.id),
      username: data.login,
      displayName: data.name || data.login,
      avatarUrl: data.avatar_url,
      email: data.email,
      raw: data,
    }),
    slack: () => ({
      id: data.user?.id || data.authed_user?.id,
      username: data.user?.name || data.authed_user?.name,
      displayName: data.user?.name || data.authed_user?.name,
      avatarUrl: data.user?.image_192,
      email: data.user?.email,
      raw: data.user || data,
    }),
    reddit: () => ({
      id: data.id,
      username: data.name,
      displayName: data.subreddit?.display_name_prefixed || data.name,
      avatarUrl: data.icon_img?.split("?")[0],
      raw: data,
    }),
    facebook: () => ({
      id: data.id,
      username: data.email?.split("@")[0],
      displayName: data.name,
      email: data.email,
      raw: data,
    }),
    instagram: () => ({
      id: data.id,
      username: data.username,
      displayName: data.username,
      raw: data,
    }),
    tiktok: () => ({
      id: data.data?.user?.open_id || data.open_id,
      username: data.data?.user?.display_name || data.display_name,
      displayName: data.data?.user?.display_name || data.display_name,
      avatarUrl: data.data?.user?.avatar_url || data.avatar_url,
      raw: data.data?.user || data,
    }),
    linkedin: () => ({
      id: data.id || data.sub,
      username: data.email?.split("@")[0],
      displayName: data.localizedFirstName ? `${data.localizedFirstName} ${data.localizedLastName}` : data.name,
      avatarUrl: data.profilePicture?.["displayImage~"]?.elements?.[0]?.identifiers?.[0]?.identifier,
      email: data.email,
      raw: data,
    }),
    mastodon: () => ({
      id: data.id,
      username: data.username,
      displayName: data.display_name || data.username,
      avatarUrl: data.avatar,
      raw: data,
    }),
  };

  return normalizers[platform]?.() || { id: data.id || "unknown", raw: data };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    logger.warn("[OAuth] Provider error", { platform, error });
    if (state) await platformCredentialsService.failSession(state, error, searchParams.get("error_description") || error);
    return NextResponse.redirect(`${CLOUD_URL}/auth/platform-link/error?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${CLOUD_URL}/auth/platform-link/error?error=missing_params`);
  }

  const session = await platformCredentialsService.getSessionByOAuthState(state);
  if (!session) {
    return NextResponse.redirect(`${CLOUD_URL}/auth/platform-link/error?error=invalid_session`);
  }

  logger.info("[OAuth] Processing", { platform, sessionId: session.session_id.slice(0, 8) });

  // Get instance URL for Mastodon from session context
  const instanceUrl = (session.callback_context as Record<string, unknown>)?.instanceUrl as string | undefined;

  const tokens = await exchangeCode(platform, code, state, instanceUrl);
  const profile = await fetchProfile(platform, tokens.accessToken, instanceUrl);

  const credential = await platformCredentialsService.completeOAuth({
    oauthState: state,
    code,
    platformUserId: profile.id,
    platformUsername: profile.username,
    platformDisplayName: profile.displayName,
    platformAvatarUrl: profile.avatarUrl,
    platformEmail: profile.email,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenExpiresIn: tokens.expiresIn,
    scopes: tokens.scope.split(" ").filter(Boolean),
    profileData: profile.raw,
  });

  logger.info("[OAuth] Complete", { platform, credentialId: credential.id });

  if (session.callback_url && session.callback_type === "redirect") {
    const url = new URL(session.callback_url);
    url.searchParams.set("credential_id", credential.id);
    url.searchParams.set("platform", platform);
    url.searchParams.set("status", "success");
    return NextResponse.redirect(url.toString());
  }

  return NextResponse.redirect(`${CLOUD_URL}/auth/platform-link/success?platform=${platform}&session=${session.session_id}`);
}
