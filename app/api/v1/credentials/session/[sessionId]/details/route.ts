/**
 * Credential Session Details API
 *
 * GET /api/v1/credentials/session/[sessionId]/details
 *
 * Returns detailed information about a link session for the OAuth landing page.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { platformCredentialSessions } from "@/db/schemas/platform-credentials";
import { organizations } from "@/db/schemas/organizations";
import { apps } from "@/db/schemas/apps";

const CLOUD_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// OAuth configuration per platform
const OAUTH_CONFIGS: Record<
  string,
  {
    authUrl: string;
    scopes: string[];
    clientIdEnv: string;
  }
> = {
  discord: {
    authUrl: "https://discord.com/api/oauth2/authorize",
    scopes: ["identify", "email"],
    clientIdEnv: "DISCORD_CLIENT_ID",
  },
  twitter: {
    authUrl: "https://twitter.com/i/oauth2/authorize",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    clientIdEnv: "TWITTER_CLIENT_ID",
  },
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scopes: ["openid", "email", "profile"],
    clientIdEnv: "GOOGLE_CLIENT_ID",
  },
  gmail: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scopes: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
    clientIdEnv: "GOOGLE_CLIENT_ID",
  },
  github: {
    authUrl: "https://github.com/login/oauth/authorize",
    scopes: ["read:user", "user:email"],
    clientIdEnv: "GITHUB_CLIENT_ID",
  },
  slack: {
    authUrl: "https://slack.com/oauth/v2/authorize",
    scopes: ["users:read", "chat:write"],
    clientIdEnv: "SLACK_CLIENT_ID",
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  // Get session with related data
  const [session] = await db
    .select({
      session: platformCredentialSessions,
      organization: organizations,
      app: apps,
    })
    .from(platformCredentialSessions)
    .leftJoin(
      organizations,
      eq(platformCredentialSessions.organization_id, organizations.id),
    )
    .leftJoin(apps, eq(platformCredentialSessions.app_id, apps.id))
    .where(eq(platformCredentialSessions.session_id, sessionId))
    .limit(1);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Check expiry
  if (session.session.expires_at < new Date()) {
    return NextResponse.json({ error: "Session expired" }, { status: 410 });
  }

  if (session.session.status !== "pending") {
    return NextResponse.json(
      { error: "Session already completed", status: session.session.status },
      { status: 400 },
    );
  }

  // Build OAuth URL
  const platform = session.session.platform;
  const oauthConfig = OAUTH_CONFIGS[platform];

  let linkUrl: string | undefined;

  if (oauthConfig) {
    const clientId = process.env[oauthConfig.clientIdEnv];
    if (clientId) {
      const redirectUri = `${CLOUD_URL}/api/auth/platform-callback/${platform}`;
      const scopes = session.session.requested_scopes?.length
        ? (session.session.requested_scopes as string[])
        : oauthConfig.scopes;

      const authParams = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        state: session.session.oauth_state,
        scope: scopes.join(" "),
      });

      // Platform-specific params
      if (platform === "twitter") {
        authParams.set("code_challenge_method", "plain");
        authParams.set("code_challenge", session.session.oauth_state);
      }
      if (platform === "google" || platform === "gmail") {
        authParams.set("access_type", "offline");
        authParams.set("prompt", "consent");
      }

      linkUrl = `${oauthConfig.authUrl}?${authParams.toString()}`;
    }
  }

  return NextResponse.json({
    platform,
    organizationName: session.organization?.name,
    appName: session.app?.name,
    requestedScopes: session.session.requested_scopes,
    linkUrl,
    expiresAt: session.session.expires_at.toISOString(),
  });
}
