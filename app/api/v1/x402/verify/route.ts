/**
 * x402 Facilitator API — Verify Payment
 *
 * POST /api/v1/x402/verify
 *
 * Verifies an x402 payment header (EIP-3009 TransferWithAuthorization
 * signature). Checks:
 * - Network is supported
 * - Amount matches requirements
 * - Signature is valid (recovers to the claimed payer)
 * - Deadline has not passed
 * - Payer has sufficient USDC balance
 *
 * Request body:
 * {
 *   "paymentPayload": { ... },        // Decoded X-PAYMENT header
 *   "paymentRequirements": { ... }     // Expected payment parameters
 * }
 *
 * No authentication required — payment is the authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { x402FacilitatorService } from "@/lib/services/x402-facilitator";
import { logger } from "@/lib/utils/logger";

async function verifyHandler(request: NextRequest): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { isValid: false, invalidReason: "invalid_json_body" },
      { status: 400 },
    );
  }

  const { paymentPayload, paymentRequirements } = body;

  if (!paymentPayload || !paymentRequirements) {
    return NextResponse.json(
      {
        isValid: false,
        invalidReason:
          "missing_fields: paymentPayload and paymentRequirements are required",
      },
      { status: 400 },
    );
  }

  try {
    const result = await x402FacilitatorService.verify(
      paymentPayload as Parameters<typeof x402FacilitatorService.verify>[0],
      paymentRequirements as Parameters<
        typeof x402FacilitatorService.verify
      >[1],
    );

    const status = result.isValid ? 200 : 400;
    return NextResponse.json(result, { status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[x402-verify] Verification error: ${msg}`);
    return NextResponse.json(
      { isValid: false, invalidReason: `internal_error: ${msg}` },
      { status: 500 },
    );
  }
}

export const POST = withRateLimit(verifyHandler, RateLimitPresets.STRICT);

export async function OPTIONS(): Promise<Response> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
