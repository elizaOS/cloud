/**
 * Eliza App - WhatsApp Authentication Endpoint
 *
 * Issues JWT session tokens for users already identified via WhatsApp webhook.
 * Since WhatsApp users are auto-provisioned on first message, this endpoint
 * allows the eliza-app frontend to authenticate them using their WhatsApp ID.
 *
 * Flow:
 * 1. User messages the WhatsApp bot → auto-provisioned with whatsapp_id
 * 2. Frontend redirects user with whatsapp_id claim
 * 3. This endpoint verifies the user exists and issues a session token
 *
 * POST /api/eliza-app/auth/whatsapp
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import {
  elizaAppUserService,
  elizaAppSessionService,
  type ValidatedSession,
} from "@/lib/services/eliza-app";

/**
 * Request body schema
 */
const whatsappAuthSchema = z.object({
  // WhatsApp ID (digits only, e.g. "14245074963")
  whatsapp_id: z.string()
    .min(7, "WhatsApp ID must be at least 7 digits")
    .max(15, "WhatsApp ID must be at most 15 digits")
    .regex(/^\d+$/, "WhatsApp ID must contain only digits"),
});

/**
 * Success response type
 */
interface AuthSuccessResponse {
  success: true;
  user: {
    id: string;
    whatsapp_id: string;
    whatsapp_name: string | null;
    phone_number: string | null;
    name: string | null;
    organization_id: string;
  };
  session: {
    token: string;
    expires_at: string;
  };
}

/**
 * Error response type
 */
interface AuthErrorResponse {
  success: false;
  error: string;
  code: string;
}

async function handleWhatsAppAuth(
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

  const parseResult = whatsappAuthSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request body", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  const { whatsapp_id: whatsappId } = parseResult.data;

  // Check for existing session (session-based linking)
  const authHeader = request.headers.get("authorization");
  let existingSession: ValidatedSession | null = null;
  if (authHeader) {
    existingSession = await elizaAppSessionService.validateAuthHeader(authHeader);
    if (existingSession) {
      logger.info("[ElizaApp WhatsAppAuth] Session-based linking detected", {
        existingUserId: existingSession.userId,
      });
    }
  }

  if (existingSession) {
    // ---- SESSION-BASED LINKING: Link WhatsApp to existing user ----
    const linkResult = await elizaAppUserService.linkWhatsAppToUser(
      existingSession.userId,
      { whatsappId },
    );

    if (!linkResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: linkResult.error || "This WhatsApp account is already linked to another account",
          code: "WHATSAPP_ALREADY_LINKED",
        },
        { status: 409 },
      );
    }

    // Fetch the updated user
    const updatedUser = await elizaAppUserService.getById(existingSession.userId);
    if (!updatedUser || !updatedUser.organization) {
      return NextResponse.json(
        { success: false, error: "User not found after linking", code: "INTERNAL_ERROR" },
        { status: 500 },
      );
    }

    const session = await elizaAppSessionService.createSession(
      updatedUser.id,
      updatedUser.organization.id,
      {
        phoneNumber: updatedUser.phone_number || undefined,
        ...(updatedUser.telegram_id && { telegramId: updatedUser.telegram_id }),
        ...(updatedUser.discord_id && { discordId: updatedUser.discord_id }),
      },
    );

    logger.info("[ElizaApp WhatsAppAuth] Session-based WhatsApp linking successful", {
      userId: updatedUser.id,
      whatsappId,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: updatedUser.id,
        whatsapp_id: updatedUser.whatsapp_id!,
        whatsapp_name: updatedUser.whatsapp_name,
        phone_number: updatedUser.phone_number,
        name: updatedUser.name,
        organization_id: updatedUser.organization.id,
      },
      session: {
        token: session.token,
        expires_at: session.expiresAt.toISOString(),
      },
    });
  }

  // ---- STANDARD FLOW: Look up existing user by WhatsApp ID ----
  // WhatsApp users must first message the bot to be auto-provisioned
  const userWithOrg = await elizaAppUserService.getByWhatsAppId(whatsappId);

  if (!userWithOrg || !userWithOrg.organization) {
    return NextResponse.json(
      {
        success: false,
        error: "WhatsApp account not found. Please message our WhatsApp bot first to create your account.",
        code: "USER_NOT_FOUND",
      },
      { status: 404 },
    );
  }

  logger.info("[ElizaApp WhatsAppAuth] Authentication successful", {
    userId: userWithOrg.id,
    whatsappId,
  });

  // Create session
  const session = await elizaAppSessionService.createSession(
    userWithOrg.id,
    userWithOrg.organization.id,
    {
      phoneNumber: userWithOrg.phone_number || undefined,
      ...(userWithOrg.telegram_id && { telegramId: userWithOrg.telegram_id }),
      ...(userWithOrg.discord_id && { discordId: userWithOrg.discord_id }),
    },
  );

  return NextResponse.json({
    success: true,
    user: {
      id: userWithOrg.id,
      whatsapp_id: userWithOrg.whatsapp_id!,
      whatsapp_name: userWithOrg.whatsapp_name,
      phone_number: userWithOrg.phone_number,
      name: userWithOrg.name,
      organization_id: userWithOrg.organization.id,
    },
    session: {
      token: session.token,
      expires_at: session.expiresAt.toISOString(),
    },
  });
}

// Export with rate limiting
export const POST = withRateLimit(handleWhatsAppAuth, RateLimitPresets.STANDARD);

// Health check
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    service: "eliza-app-whatsapp-auth",
    timestamp: new Date().toISOString(),
  });
}
