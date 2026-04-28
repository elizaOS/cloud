/**
 * x402 Facilitator API — Supported Networks
 *
 * GET /api/v1/x402
 *
 * Returns the supported schemes, networks, and signer addresses for the
 * Eliza Cloud x402 facilitator. This is the discovery endpoint that clients
 * use to determine what payment options are available.
 *
 * No authentication required — this is public information.
 */

import { NextResponse } from "next/server";
import { x402FacilitatorService } from "@/lib/services/x402-facilitator";

export async function GET(): Promise<Response> {
  await x402FacilitatorService.initialize();

  if (!x402FacilitatorService.isReady()) {
    return NextResponse.json(
      {
        success: false,
        error: "x402 facilitator is not configured",
        code: "FACILITATOR_NOT_CONFIGURED",
      },
      { status: 503 },
    );
  }

  const supported = x402FacilitatorService.getSupported();

  return NextResponse.json({
    success: true,
    ...supported,
    version: "1.0.0",
  });
}

export async function OPTIONS(): Promise<Response> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
