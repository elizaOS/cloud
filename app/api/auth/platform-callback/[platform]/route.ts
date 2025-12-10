/**
 * OAuth Callback - Exchanges code for tokens and stores credentials.
 */

import { NextRequest, NextResponse } from "next/server";
import { platformCredentialsService, OAUTH_CONFIGS } from "@/lib/services/platform-credentials";
import { logger } from "@/lib/utils/logger";

const CLOUD_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

async function exchangeCode(platform: string, code: string, state: string) {
  const config = OAUTH_CONFIGS[platform];
  if (!config) throw new Error(`Unsupported platform: ${platform}`);

  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];
  if (!clientId || !clientSecret) throw new Error(`${platform} OAuth not configured`);

  const body: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: `${CLOUD_URL}/api/auth/platform-callback/${platform}`,
  };
  if (platform === "twitter") body.code_verifier = state;

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
  });

  if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);
  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    scope: data.scope || "",
  };
}

async function fetchProfile(platform: string, accessToken: string) {
  const config = OAUTH_CONFIGS[platform];
  if (!config) throw new Error(`Unsupported platform: ${platform}`);

  const response = await fetch(config.profileUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, ...config.profileHeaders },
  });
  if (!response.ok) throw new Error(`Profile fetch failed: ${response.status}`);

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
    github: () => ({
      id: String(data.id),
      username: data.login,
      displayName: data.name || data.login,
      avatarUrl: data.avatar_url,
      email: data.email,
      raw: data,
    }),
    slack: () => ({
      id: data.user.id,
      username: data.user.name,
      displayName: data.user.name,
      avatarUrl: data.user.image_192,
      email: data.user.email,
      raw: data.user,
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

  const tokens = await exchangeCode(platform, code, state);
  const profile = await fetchProfile(platform, tokens.accessToken);

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
