/**
 * Eliza App - Telegram Login Authentication Endpoint
 *
 * Verifies Telegram Login Widget authentication data and creates/updates user accounts.
 * Returns a JWT session token for subsequent API calls.
 *
 * If called WITH Authorization header:
 *   - Links Telegram to existing authenticated user (for phone-first flow)
 *
 * If called WITHOUT Authorization header:
 *   - Creates new user or returns existing user with that Telegram ID
 *
 * POST /api/eliza-app/auth/telegram
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import {
  telegramAuthService,
  elizaAppUserService,
  elizaAppSessionService,
  type TelegramAuthData,
} from "@/lib/services/eliza-app";

/**
 * Request body schema matching Telegram Login Widget data
 */
const telegramAuthSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string().min(1).max(256),
  last_name: z.string().max(256).optional(),
  username: z.string().max(32).optional(),
  photo_url: z.string().url().max(2048).optional(),
  auth_date: z.number().int().positive(),
  hash: z.string().length(64), // SHA-256 hash is 64 hex characters
});

/**
 * Success response type
 */
interface AuthSuccessResponse {
  success: true;
  user: {
    id: string;
    telegram_id: string;
    telegram_username: string | null;
    name: string | null;
    organization_id: string;
  };
  session: {
    token: string;
    expires_at: string;
  };
  is_new_user: boolean;
  /** True if Telegram was linked to an existing phone-verified account */
  telegram_linked: boolean;
}

/**
 * Error response type
 */
interface AuthErrorResponse {
  success: false;
  error: string;
  code: string;
}

async function handleTelegramAuth(
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

  const parseResult = telegramAuthSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request body", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  const authData: TelegramAuthData = parseResult.data;

  // Verify Telegram authentication data
  const isValid = telegramAuthService.verifyAuth(authData);

  if (!isValid) {
    logger.warn("[ElizaApp TelegramAuth] Authentication verification failed", {
      telegramId: authData.id,
      username: authData.username,
    });
    return NextResponse.json(
      {
        success: false,
        error: "Invalid authentication data",
        code: "INVALID_AUTH",
      },
      { status: 401 },
    );
  }

  // Check for existing session (phone-first flow - link Telegram to existing account)
  const authHeader = request.headers.get("Authorization");
  const existingSession = authHeader
    ? await elizaAppSessionService.validateAuthHeader(authHeader)
    : null;

  let user;
  let organization;
  let isNew = false;
  let telegramLinked = false;

  if (existingSession) {
    // Link Telegram to existing phone-verified user
    const linkResult = await elizaAppUserService.linkTelegramToUser(
      existingSession.userId,
      authData,
    );

    if (!linkResult.success) {
      logger.warn("[ElizaApp TelegramAuth] Failed to link Telegram to existing user", {
        userId: existingSession.userId,
        telegramId: authData.id,
        error: linkResult.error,
      });
      return NextResponse.json(
        {
          success: false,
          error: linkResult.error || "Failed to link Telegram account",
          code: "LINK_FAILED",
        },
        { status: 400 },
      );
    }

    const userWithOrg = await elizaAppUserService.getById(existingSession.userId);
    if (!userWithOrg || !userWithOrg.organization) {
      return NextResponse.json(
        { success: false, error: "User not found", code: "USER_NOT_FOUND" },
        { status: 404 },
      );
    }

    user = userWithOrg;
    organization = userWithOrg.organization;
    telegramLinked = true;

    logger.info("[ElizaApp TelegramAuth] Telegram linked to existing account", {
      userId: user.id,
      telegramId: authData.id,
      username: authData.username,
    });
  } else {
    // Original flow - find or create by Telegram
    const result = await elizaAppUserService.findOrCreateByTelegram(authData);
    user = result.user;
    organization = result.organization;
    isNew = result.isNew;

    logger.info("[ElizaApp TelegramAuth] Authentication successful", {
      userId: user.id,
      telegramId: authData.id,
      username: authData.username,
      isNewUser: isNew,
    });
  }

  // Create session
  const session = await elizaAppSessionService.createSession(
    user.id,
    organization.id,
    { telegramId: String(authData.id) },
  );

  return NextResponse.json({
    success: true,
    user: {
      id: user.id,
      telegram_id: user.telegram_id!,
      telegram_username: user.telegram_username,
      name: user.name,
      organization_id: organization.id,
    },
    session: {
      token: session.token,
      expires_at: session.expiresAt.toISOString(),
    },
    is_new_user: isNew,
    telegram_linked: telegramLinked,
  });
}

// Export with rate limiting (10 requests/min per IP - stricter for auth)
export const POST = withRateLimit(handleTelegramAuth, RateLimitPresets.STRICT);

// Health check
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    service: "eliza-app-telegram-auth",
    timestamp: new Date().toISOString(),
  });
}
