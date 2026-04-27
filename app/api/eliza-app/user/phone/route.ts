/**
 * Eliza App - Link Phone Number Endpoint
 *
 * Allows an authenticated user to link a phone number to their account.
 * This enables cross-platform messaging with iMessage.
 *
 * Useful when a user signed up via Discord (where phone is optional)
 * and wants to add their phone number later.
 *
 * POST /api/eliza-app/user/phone
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { elizaAppSessionService, elizaAppUserService } from "@/lib/services/eliza-app";
import { logger } from "@/lib/utils/logger";
import { isValidE164, normalizePhoneNumber } from "@/lib/utils/phone-normalization";

/**
 * E.164 phone number validation (after normalization)
 */
const phoneNumberSchema = z
  .string()
  .min(1, "Phone number is required")
  .transform((val, ctx) => {
    const normalized = normalizePhoneNumber(val);
    if (!isValidE164(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid phone number format. Please use international format (e.g., +1234567890)",
      });
      return z.NEVER;
    }
    return normalized;
  });

/**
 * Request body schema
 */
const linkPhoneSchema = z.object({
  phone_number: phoneNumberSchema,
});

/**
 * Success response type
 */
interface LinkPhoneSuccessResponse {
  success: true;
  phone_number: string;
}

/**
 * Error response type
 */
interface LinkPhoneErrorResponse {
  success: false;
  error: string;
  code: string;
}

async function handleLinkPhone(
  request: NextRequest,
): Promise<NextResponse<LinkPhoneSuccessResponse | LinkPhoneErrorResponse>> {
  // Extract Authorization header
  const authHeader = request.headers.get("Authorization");

  if (!authHeader) {
    return NextResponse.json(
      {
        success: false,
        error: "Authorization header required",
        code: "UNAUTHORIZED",
      },
      { status: 401 },
    );
  }

  // Validate session
  const session = await elizaAppSessionService.validateAuthHeader(authHeader);

  if (!session) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid or expired session",
        code: "INVALID_SESSION",
      },
      { status: 401 },
    );
  }

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

  const parseResult = linkPhoneSchema.safeParse(body);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    return NextResponse.json(
      {
        success: false,
        error: firstIssue?.message || "Invalid request body",
        code: "INVALID_REQUEST",
      },
      { status: 400 },
    );
  }

  const { phone_number: phoneNumber } = parseResult.data;

  // Check if user already has a phone number
  const user = await elizaAppUserService.getById(session.userId);
  if (!user) {
    return NextResponse.json(
      { success: false, error: "User not found", code: "USER_NOT_FOUND" },
      { status: 404 },
    );
  }

  if (user.phone_number) {
    return NextResponse.json(
      {
        success: false,
        error: "A phone number is already linked to this account",
        code: "PHONE_ALREADY_SET",
      },
      { status: 409 },
    );
  }

  // Link the phone number
  const result = await elizaAppUserService.linkPhoneToUser(session.userId, phoneNumber);

  if (!result.success) {
    logger.warn("[ElizaApp LinkPhone] Phone linking failed", {
      userId: session.userId,
      phone: `***${phoneNumber.slice(-4)}`,
      error: result.error,
    });
    return NextResponse.json(
      {
        success: false,
        error: result.error || "Failed to link phone number",
        code: "PHONE_ALREADY_LINKED",
      },
      { status: 409 },
    );
  }

  logger.info("[ElizaApp LinkPhone] Phone number linked successfully", {
    userId: session.userId,
    phone: `***${phoneNumber.slice(-4)}`,
  });

  return NextResponse.json({
    success: true,
    phone_number: phoneNumber,
  });
}

// Export with standard rate limiting
export const POST = withRateLimit(handleLinkPhone, RateLimitPresets.STANDARD);
