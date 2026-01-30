/**
 * Notion OAuth Callback API
 *
 * Handles the OAuth callback from Notion after user authorizes the integration.
 */

import { NextRequest, NextResponse } from "next/server";
import { notionAutomationService, type OAuthState } from "@/lib/services/notion-automation";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 30;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  // Default return URL
  let returnUrl = "/dashboard/settings?tab=connections";

  // Try to get return URL from state
  if (state) {
    try {
      const stateData: OAuthState = JSON.parse(
        Buffer.from(state, "base64").toString()
      );
      if (stateData.returnUrl) {
        returnUrl = stateData.returnUrl;
      }
    } catch (e) {
      logger.warn("[Notion] Failed to parse state:", e);
    }
  }

  // Handle error from Notion
  if (error) {
    logger.error("[Notion] OAuth error:", error);
    const errorUrl = new URL(returnUrl, request.nextUrl.origin);
    errorUrl.searchParams.set("notion", "error");
    errorUrl.searchParams.set("message", encodeURIComponent(error));
    return NextResponse.redirect(errorUrl);
  }

  // Validate required params
  if (!code || !state) {
    const errorUrl = new URL(returnUrl, request.nextUrl.origin);
    errorUrl.searchParams.set("notion", "error");
    errorUrl.searchParams.set("message", "Missing code or state parameter");
    return NextResponse.redirect(errorUrl);
  }

  // Handle the OAuth callback
  const result = await notionAutomationService.handleOAuthCallback(code, state);

  // Build redirect URL with status
  const redirectUrl = new URL(returnUrl, request.nextUrl.origin);

  if (result.success) {
    redirectUrl.searchParams.set("notion", "connected");
    if (result.workspaceName) {
      redirectUrl.searchParams.set(
        "workspaceName",
        encodeURIComponent(result.workspaceName)
      );
    }
  } else {
    redirectUrl.searchParams.set("notion", "error");
    redirectUrl.searchParams.set(
      "message",
      encodeURIComponent(result.error || "Connection failed")
    );
  }

  return NextResponse.redirect(redirectUrl);
}
