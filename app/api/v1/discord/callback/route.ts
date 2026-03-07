/**
 * Discord OAuth Callback API
 *
 * Handles the OAuth2 callback after user authorizes the bot.
 * For bot OAuth (scope=bot), Discord returns guild_id directly in URL params.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveSafeRedirectTarget } from "@/lib/security/redirect-validation";
import { discordAutomationService } from "@/lib/services/discord-automation";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const guildId = searchParams.get("guild_id");
  const permissions = searchParams.get("permissions");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Parse state for return URL (do this early for error redirects)
  const defaultReturnPath = "/dashboard/settings?tab=connections";
  let returnTarget = resolveSafeRedirectTarget(
    undefined,
    baseUrl,
    defaultReturnPath,
  );
  if (state) {
    try {
      const stateData = JSON.parse(Buffer.from(state, "base64").toString());
      returnTarget = resolveSafeRedirectTarget(
        typeof stateData.returnUrl === "string" ? stateData.returnUrl : undefined,
        baseUrl,
        defaultReturnPath,
      );
    } catch {
      // Use default return URL
    }
  }

  function redirectWithStatus(
    status: "connected" | "error",
    params: Record<string, string>,
  ): NextResponse {
    const target = new URL(returnTarget.toString());
    target.searchParams.set("discord", status);
    Object.entries(params).forEach(([key, value]) => {
      target.searchParams.set(key, value);
    });
    return NextResponse.redirect(target);
  }

  // Handle OAuth errors (user cancelled, etc.)
  if (error) {
    logger.warn("[Discord Callback] OAuth error", { error, errorDescription });
    return redirectWithStatus("error", {
      message: errorDescription || error,
    });
  }

  // For bot OAuth, guild_id is returned directly in URL params
  if (!guildId || !state) {
    logger.warn("[Discord Callback] Missing params", {
      hasGuildId: !!guildId,
      hasState: !!state,
      hasCode: !!code,
    });
    return redirectWithStatus("error", { message: "missing_params" });
  }

  try {
    const result = await discordAutomationService.handleBotOAuthCallback(
      guildId,
      state,
      permissions || undefined,
    );

    if (result.success) {
      return redirectWithStatus("connected", {
        guildId: result.guildId ?? guildId,
        guildName: result.guildName || "",
      });
    } else {
      return redirectWithStatus("error", {
        message: result.error || "unknown",
      });
    }
  } catch (error) {
    logger.error("[Discord Callback] Unexpected error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return redirectWithStatus("error", { message: "callback_failed" });
  }
}
