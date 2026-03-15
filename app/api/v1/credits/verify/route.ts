/**
 * Credits Verify API (v1)
 *
 * GET /api/v1/credits/verify
 * Verifies a completed Stripe checkout session and confirms credits were added.
 *
 * CORS: Reflects origin header. Security is via auth tokens.
 */

import { type NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { requireStripe } from "@/lib/stripe";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

// CORS headers - open CORS without credentials. Cross-origin callers must
// authenticate explicitly with bearer/API-key headers instead of cookies.
function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-API-Key, X-App-Id, X-Request-ID",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}

/**
 * GET /api/v1/credits/verify
 * Verifies a completed checkout session.
 *
 * Query Params:
 * - session_id: Stripe checkout session ID
 *
 * Returns:
 * - success: Whether the purchase was successful
 * - amount: Amount of credits purchased (if successful)
 */
export async function GET(request: NextRequest) {
  const corsHeaders = getCorsHeaders();

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "session_id is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    // Retrieve the checkout session from Stripe
    const session = await requireStripe().checkout.sessions.retrieve(sessionId);

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404, headers: corsHeaders },
      );
    }

    // Check if payment was successful
    if (session.payment_status !== "paid") {
      return NextResponse.json(
        {
          success: false,
          error: "Payment not completed",
          status: session.payment_status,
        },
        { headers: corsHeaders },
      );
    }

    // Verify this is an organization credit purchase
    const metadata = session.metadata || {};
    if (metadata.type !== "custom_amount" && metadata.type !== "credit_pack") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid session type",
        },
        { headers: corsHeaders },
      );
    }

    if (
      metadata.organization_id !== user.organization_id ||
      (metadata.user_id && metadata.user_id !== user.id)
    ) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403, headers: corsHeaders },
      );
    }

    const amount = parseFloat(metadata.credits || "0");

    logger.info("Verified credits checkout session", {
      sessionId,
      organizationId: metadata.organization_id,
      amount,
    });

    // Credits are added via Stripe webhook - this endpoint just verifies payment status
    return NextResponse.json(
      {
        success: true,
        amount,
        message: "Payment verified successfully",
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Verification failed";
    const isAuthError =
      errorMessage.includes("Unauthorized") ||
      errorMessage.includes("Authentication required") ||
      errorMessage.includes("Invalid or expired token") ||
      errorMessage.includes("Invalid or expired API key") ||
      errorMessage.includes("Forbidden: This feature requires a full account") ||
      errorMessage.includes("Organization is inactive");

    if (isAuthError) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401, headers: corsHeaders },
      );
    }

    logger.error("[Credits Verify API v1] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500, headers: corsHeaders },
    );
  }
}
