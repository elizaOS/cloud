/**
 * Eliza App - Phone OTP Verify Endpoint
 *
 * Verifies OTP and creates/retrieves user account with session token.
 * Returns JWT for subsequent API calls.
 *
 * If called WITH Authorization header:
 *   - Links phone to existing authenticated user (for Telegram users adding phone)
 *
 * If called WITHOUT Authorization header:
 *   - Creates new user or returns existing user with that phone
 *
 * POST /api/eliza-app/auth/phone/verify-otp
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import {
  otpService,
  elizaAppUserService,
  elizaAppSessionService,
  elizaAppConfig,
} from "@/lib/services/eliza-app";
import { validatePhoneForAPI } from "@/lib/utils/phone-normalization";

const verifyOTPSchema = z.object({
  phone_number: z.string().min(1, "Phone number is required"),
  otp: z.string().trim().length(6, "OTP must be 6 digits").regex(/^\d+$/, "OTP must be numeric"),
});

interface VerifyOTPSuccessResponse {
  success: true;
  user: {
    id: string;
    phone_number: string;
    name: string | null;
    organization_id: string;
  };
  session: {
    token: string;
    expires_at: string;
  };
  is_new_user: boolean;
  phone_linked: boolean;
  eliza_phone_number: string;
}

interface VerifyOTPErrorResponse {
  success: false;
  error: string;
  code: string;
  attempts_remaining?: number;
}

async function handleVerifyOTP(
  request: NextRequest
): Promise<NextResponse<VerifyOTPSuccessResponse | VerifyOTPErrorResponse>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  const parseResult = verifyOTPSchema.safeParse(body);
  if (!parseResult.success) {
    const firstError = parseResult.error.issues[0];
    return NextResponse.json(
      {
        success: false,
        error: firstError?.message || "Invalid request",
        code: "INVALID_REQUEST",
      },
      { status: 400 }
    );
  }

  const { phone_number: phoneNumber, otp } = parseResult.data;
  const phoneValidation = validatePhoneForAPI(phoneNumber);

  if (!phoneValidation.valid) {
    return NextResponse.json(
      { success: false, error: phoneValidation.error, code: "INVALID_PHONE" },
      { status: 400 }
    );
  }

  const normalizedPhone = phoneValidation.normalized;
  const verifyResult = await otpService.verifyOTP(normalizedPhone, otp);

  if (!verifyResult.valid) {
    const status = verifyResult.attemptsRemaining === 0 ? 429 : 401;
    return NextResponse.json(
      {
        success: false,
        error: verifyResult.error || "Invalid verification code",
        code: verifyResult.attemptsRemaining === 0 ? "MAX_ATTEMPTS" : "INVALID_OTP",
        attempts_remaining: verifyResult.attemptsRemaining,
      },
      { status }
    );
  }

  const authHeader = request.headers.get("Authorization");
  const existingSession = authHeader
    ? await elizaAppSessionService.validateAuthHeader(authHeader)
    : null;

  let user;
  let organization;
  let isNew = false;
  let phoneLinked = false;

  if (existingSession) {
    const linkResult = await elizaAppUserService.linkPhoneToUser(
      existingSession.userId,
      normalizedPhone
    );

    if (!linkResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: linkResult.error || "Failed to link phone number",
          code: "LINK_FAILED",
        },
        { status: 400 }
      );
    }

    const userWithOrg = await elizaAppUserService.getById(existingSession.userId);
    if (!userWithOrg || !userWithOrg.organization) {
      return NextResponse.json(
        { success: false, error: "User not found", code: "USER_NOT_FOUND" },
        { status: 404 }
      );
    }

    user = userWithOrg;
    organization = userWithOrg.organization;
    phoneLinked = true;

    logger.info("[ElizaApp PhoneAuth] Phone linked to existing account", {
      userId: user.id,
      phone: `***${normalizedPhone.slice(-2)}`,
    });
  } else {
    const result = await elizaAppUserService.findOrCreateByPhone(normalizedPhone);
    user = result.user;
    organization = result.organization;
    isNew = result.isNew;

    logger.info("[ElizaApp PhoneAuth] Authentication successful", {
      userId: user.id,
      phone: `***${normalizedPhone.slice(-2)}`,
      isNewUser: isNew,
    });
  }

  const session = await elizaAppSessionService.createSession(
    user.id,
    organization.id,
    { phoneNumber: normalizedPhone }
  );

  return NextResponse.json({
    success: true,
    user: {
      id: user.id,
      phone_number: normalizedPhone,
      name: user.name,
      organization_id: organization.id,
    },
    session: {
      token: session.token,
      expires_at: session.expiresAt.toISOString(),
    },
    is_new_user: isNew,
    phone_linked: phoneLinked,
    eliza_phone_number: elizaAppConfig.blooio.phoneNumber,
  });
}

export const POST = withRateLimit(handleVerifyOTP, RateLimitPresets.STRICT);

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    service: "eliza-app-phone-verify-otp",
    timestamp: new Date().toISOString(),
  });
}
