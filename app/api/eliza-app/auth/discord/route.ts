/**
 * Eliza App - Discord OAuth2 Authentication Endpoint
 *
 * Exchanges a Discord OAuth2 authorization code for user data,
 * creates/updates user accounts, and returns a JWT session token.
 *
 * Phone number is optional (unlike Telegram where it's required).
 * If provided, it enables cross-platform linking with iMessage.
 *
 * POST /api/eliza-app/auth/discord
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import {
  discordAuthService,
  elizaAppUserService,
  elizaAppSessionService,
} from "@/lib/services/eliza-app";
import { normalizePhoneNumber, isValidE164 } from "@/lib/utils/phone-normalization";

/**
 * Optional E.164 phone number validation (after normalization)
 */
const optionalPhoneSchema = z
  .string()
  .optional()
  .transform((val, ctx) => {
    if (!val || val.trim() === "") return undefined;
    const normalized = normalizePhoneNumber(val);
    if (!isValidE164(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Invalid phone number format. Please use international format (e.g., +1234567890)",
      });
      return z.NEVER;
    }
    return normalized;
  });

/**
 * Request body schema: Discord OAuth2 code + redirect_uri + optional phone
 */
const discordAuthSchema = z.object({
  // OAuth2 authorization code from Discord redirect
  code: z.string().min(1, "Authorization code is required"),
  // The redirect_uri used in the original authorization request (must match exactly)
  redirect_uri: z.string().url("Invalid redirect URI"),
  // Optional phone number for cross-platform linking
  phone_number: optionalPhoneSchema,
});

/**
 * Success response type
 */
interface AuthSuccessResponse {
  success: true;
  user: {
    id: string;
    discord_id: string;
    discord_username: string | null;
    discord_global_name: string | null;
    phone_number: string | null;
    name: string | null;
    organization_id: string;
  };
  session: {
    token: string;
    expires_at: string;
  };
  is_new_user: boolean;
}

/**
 * Error response type
 */
interface AuthErrorResponse {
  success: false;
  error: string;
  code: string;
}

async function handleDiscordAuth(
  request: NextRequest,
): Promise<NextResponse<AuthSuccessResponse | AuthErrorResponse>> {
  // Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body", code: "INVALID_JSON" },
      { status: 400 },
    );
  }

  const parseResult = discordAuthSchema.safeParse(body);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    const errorMessage = firstIssue?.path.includes("phone_number")
      ? firstIssue.message
      : "Invalid request body";
    return NextResponse.json(
      { success: false, error: errorMessage, code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  const { code, redirect_uri: redirectUri, phone_number: phoneNumber } =
    parseResult.data;

  // Exchange OAuth2 code for Discord user data
  const discordUser = await discordAuthService.verifyOAuthCode(code, redirectUri);

  if (!discordUser) {
    logger.warn("[ElizaApp DiscordAuth] OAuth2 verification failed");
    return NextResponse.json(
      {
        success: false,
        error: "Invalid or expired authorization code",
        code: "INVALID_AUTH",
      },
      { status: 401 },
    );
  }

  // Build avatar URL
  const avatarUrl = discordAuthService.getAvatarUrl(
    discordUser.id,
    discordUser.avatar,
  );

  // Find or create user by Discord ID
  let result;
  try {
    result = await elizaAppUserService.findOrCreateByDiscordId(discordUser.id, {
      username: discordUser.username,
      globalName: discordUser.global_name,
      avatarUrl,
    });
  } catch (error) {
    logger.error(
      "[ElizaApp DiscordAuth] Unexpected error during user creation",
      {
        error: error instanceof Error ? error.message : String(error),
        discordId: discordUser.id,
      },
    );
    return NextResponse.json(
      {
        success: false,
        error: "An unexpected error occurred",
        code: "INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }

  const { user, organization, isNew } = result;

  // If phone number was provided, link it to the user
  if (phoneNumber && !user.phone_number) {
    const linkResult = await elizaAppUserService.linkPhoneToUser(user.id, phoneNumber);
    if (!linkResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: linkResult.error || "This phone number is already linked to a different account",
          code: "PHONE_ALREADY_LINKED",
        },
        { status: 409 },
      );
    }
  }

  logger.info("[ElizaApp DiscordAuth] Authentication successful", {
    userId: user.id,
    discordId: discordUser.id,
    username: discordUser.username,
    phoneNumber: phoneNumber ? `***${phoneNumber.slice(-4)}` : "not provided",
    isNewUser: isNew,
  });

  // Create session
  const session = await elizaAppSessionService.createSession(
    user.id,
    organization.id,
    {
      discordId: discordUser.id,
      ...(phoneNumber && { phoneNumber }),
    },
  );

  return NextResponse.json({
    success: true,
    user: {
      id: user.id,
      discord_id: user.discord_id!,
      discord_username: user.discord_username,
      discord_global_name: user.discord_global_name,
      phone_number: user.phone_number,
      name: user.name,
      organization_id: organization.id,
    },
    session: {
      token: session.token,
      expires_at: session.expiresAt.toISOString(),
    },
    is_new_user: isNew,
  });
}

// Export with rate limiting
export const POST = withRateLimit(handleDiscordAuth, RateLimitPresets.STANDARD);

// Health check
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    service: "eliza-app-discord-auth",
    timestamp: new Date().toISOString(),
  });
}
