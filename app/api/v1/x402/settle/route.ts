/**
 * x402 Facilitator API — Settle Payment
 *
 * POST /api/v1/x402/settle
 *
 * Settles a verified x402 payment on-chain by calling USDC's
 * `transferWithAuthorization()` function.
 *
 * This endpoint verifies the payment first, then executes the on-chain
 * settlement. In serverless mode, settlement may be queued for async
 * processing.
 *
 * Request body:
 * {
 *   "paymentPayload": { ... },
 *   "paymentRequirements": { ... }
 * }
 *
 * No authentication required — payment is the authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { x402FacilitatorService } from "@/lib/services/x402-facilitator";
import { logger } from "@/lib/utils/logger";

async function settleHandler(request: NextRequest): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      {
        success: false,
        transaction: "",
        network: "",
        errorReason: "invalid_json_body",
      },
      { status: 400 },
    );
  }

  const { paymentPayload, paymentRequirements } = body;

  if (!paymentPayload || !paymentRequirements) {
    return NextResponse.json(
      {
        success: false,
        transaction: "",
        network: "",
        errorReason:
          "missing_fields: paymentPayload and paymentRequirements are required",
      },
      { status: 400 },
    );
  }

  try {
    const result = await x402FacilitatorService.settle(
      paymentPayload as Parameters<typeof x402FacilitatorService.settle>[0],
      paymentRequirements as Parameters<
        typeof x402FacilitatorService.settle
      >[1],
    );

    const status = result.success ? 200 : 400;
    return NextResponse.json(result, { status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[x402-settle] Settlement error: ${msg}`);
    return NextResponse.json(
      {
        success: false,
        transaction: "",
        network: "",
        errorReason: `internal_error: ${msg}`,
      },
      { status: 500 },
    );
  }
}

export const POST = withRateLimit(settleHandler, RateLimitPresets.STRICT);

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
