import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyOAuth3Token, getOAuth3User } from "@/lib/auth/oauth3-client";
import { syncUserFromOAuth3 } from "@/lib/oauth3-sync";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

const OAUTH3_TOKEN_COOKIE = "oauth3-token";
const OAUTH3_REFRESH_COOKIE = "oauth3-refresh-token";
const OAUTH3_AGENT_URL = process.env.OAUTH3_AGENT_URL ?? "http://localhost:4200";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    logger.error("[OAuth3Callback] OAuth error:", error);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code) {
    logger.error("[OAuth3Callback] Missing authorization code");
    return NextResponse.redirect(
      new URL("/login?error=missing_code", request.url)
    );
  }

  try {
    // Exchange the authorization code for tokens via OAuth2 token endpoint
    const tokenResponse = await fetch(`${OAUTH3_AGENT_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${request.nextUrl.origin}/api/auth/oauth3/callback`,
        client_id: "eliza-cloud",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error("[OAuth3Callback] Token exchange failed:", {
        status: tokenResponse.status,
        error: errorText,
        code: code.substring(0, 8) + "...",
        redirectUri: `${request.nextUrl.origin}/api/auth/oauth3/callback`,
      });
      return NextResponse.redirect(
        new URL(`/login?error=exchange_failed&details=${encodeURIComponent(errorText)}`, request.url)
      );
    }

    const tokenData = await tokenResponse.json();
    logger.info("[OAuth3Callback] Token exchange successful");
    
    const { accessToken, refreshToken, expiresIn, tokenType } = tokenData;
    
    if (!accessToken) {
      logger.error("[OAuth3Callback] No access token in response");
      return NextResponse.redirect(
        new URL("/login?error=no_token", request.url)
      );
    }
    
    // Calculate expiration
    const expiresAt = Date.now() + ((expiresIn ?? 3600) * 1000);

    // Get user info from OAuth3
    const userInfoResponse = await fetch(`${OAUTH3_AGENT_URL}/oauth/userinfo`, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },
    });

    let oauth3User = null;
    if (userInfoResponse.ok) {
      const userInfo = await userInfoResponse.json();
      oauth3User = {
        identityId: userInfo.sub,
        smartAccount: userInfo.address,
        provider: userInfo.provider ?? "wallet",
        providerId: userInfo.sub,
        providerHandle: userInfo.address ? `${userInfo.address.slice(0, 6)}...${userInfo.address.slice(-4)}` : undefined,
        email: userInfo.email,
        fid: userInfo.fid,
      };
      
      // Try to sync user to database (skip if DB not available)
      try {
        await syncUserFromOAuth3(oauth3User);
      } catch (syncError) {
        logger.warn("[OAuth3Callback] Failed to sync user to database, continuing:", 
          syncError instanceof Error ? syncError.message : syncError);
      }
    }

    // Set the session cookies
    const cookieStore = await cookies();
    
    cookieStore.set(OAUTH3_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(expiresAt),
    });
    
    if (refreshToken) {
      cookieStore.set(OAUTH3_REFRESH_COOKIE, refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        // Refresh tokens last 30 days
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
    }

    logger.info("[OAuth3Callback] Authentication successful", {
      identityId: oauth3User?.identityId?.substring(0, 16),
      provider: oauth3User?.provider,
    });

    // Check if this was in a popup (for modal login)
    const isPopup = searchParams.get("popup") === "true";

    if (isPopup) {
      // Return HTML that posts message to parent and closes
      return new NextResponse(
        `<!DOCTYPE html>
        <html>
          <head><title>Login Successful</title></head>
          <body>
            <script>
              window.opener.postMessage({
                type: 'oauth3-callback',
                session: ${JSON.stringify({
                  accessToken,
                  expiresAt,
                })},
                user: ${JSON.stringify(oauth3User)}
              }, window.location.origin);
              window.close();
            </script>
          </body>
        </html>`,
        {
          headers: { "Content-Type": "text/html" },
        }
      );
    }

    // Redirect to dashboard
    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error("[OAuth3Callback] Error:", {
      message: errorMessage,
      stack: errorStack,
    });
    console.error("[OAuth3Callback] Full error:", error);
    return NextResponse.redirect(
      new URL(`/login?error=callback_failed&msg=${encodeURIComponent(errorMessage)}`, request.url)
    );
  }
}
