/**
 * Eliza App - Phone OTP Send Endpoint
 *
 * Sends a one-time password to a phone number via iMessage (Blooio).
 * Rate limited to prevent abuse.
 *
 * POST /api/eliza-app/auth/phone/send-otp
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { otpService } from "@/lib/services/eliza-app";
import { validatePhoneForAPI } from "@/lib/utils/phone-normalization";

const sendOTPSchema = z.object({
  phone_number: z.string().min(1, "Phone number is required"),
});

interface SendOTPSuccessResponse {
  success: true;
  message: string;
}

interface SendOTPErrorResponse {
  success: false;
  error: string;
  code: string;
  retry_after?: number;
}

async function handleSendOTP(
  request: NextRequest
): Promise<NextResponse<SendOTPSuccessResponse | SendOTPErrorResponse>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  const parseResult = sendOTPSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { success: false, error: "Phone number is required", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  const { phone_number: phoneNumber } = parseResult.data;
  const phoneValidation = validatePhoneForAPI(phoneNumber);

  if (!phoneValidation.valid) {
    return NextResponse.json(
      { success: false, error: phoneValidation.error, code: "INVALID_PHONE" },
      { status: 400 }
    );
  }

  const result = await otpService.sendOTP(phoneValidation.normalized);

  if (!result.success) {
    const status = result.retryAfter ? 429 : 500;
    return NextResponse.json(
      {
        success: false,
        error: result.error || "Failed to send verification code",
        code: result.retryAfter ? "RATE_LIMITED" : "SEND_FAILED",
        retry_after: result.retryAfter,
      },
      { status }
    );
  }

  logger.info("[ElizaApp PhoneAuth] OTP sent", {
    phone: `***${phoneValidation.normalized.slice(-2)}`,
  });

  return NextResponse.json({
    success: true,
    message: "Verification code sent via iMessage",
  });
}

export const POST = withRateLimit(handleSendOTP, RateLimitPresets.STRICT);

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    service: "eliza-app-phone-send-otp",
    timestamp: new Date().toISOString(),
  });
}
