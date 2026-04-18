import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getErrorStatusCode, nextJsonFromCaughtErrorWithHeaders } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { appCreditsService } from "@/lib/services/app-credits";
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
 * OPTIONS /api/v1/app-credits/verify
 * CORS preflight handler
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}

/**
 * GET /api/v1/app-credits/verify
 *
 * Verify a completed checkout session and confirm credits were added.
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

    // Verify this is an app credit purchase
    const metadata = session.metadata || {};
    if (metadata.type !== "app_credit_purchase") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid session type",
        },
        { headers: corsHeaders },
      );
    }

    const appId = metadata.app_id;
    const userId = metadata.user_id;
    const organizationId = metadata.organization_id;
    const amount = Number.parseFloat(metadata.amount || "0");

    if (!appId || !userId || !organizationId || !amount) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid session metadata",
        },
        { headers: corsHeaders },
      );
    }

    if (organizationId !== user.organization_id || userId !== user.id) {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden",
        },
        { status: 403, headers: corsHeaders },
      );
    }

    const paymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : null;

    if (!paymentIntentId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing payment intent",
        },
        { status: 400, headers: corsHeaders },
      );
    }

    // Process the purchase (add credits to user's app balance)
    // This is idempotent - if credits were already added via webhook,
    // this will just return success
    try {
      await appCreditsService.processPurchase({
        appId,
        userId,
        organizationId,
        purchaseAmount: amount,
        stripePaymentIntentId: paymentIntentId,
      });

      logger.info("Verified and processed app credit purchase", {
        sessionId,
        appId,
        userId,
        amount,
      });
    } catch (e) {
      // If purchase was already processed (duplicate verification), that's OK
      const errorMsg = e instanceof Error ? e.message : "";
      if (!errorMsg.includes("already processed")) {
        throw e;
      }
      logger.info("Purchase already processed", { sessionId });
    }

    return NextResponse.json(
      {
        success: true,
        amount,
        message: "Credits added successfully",
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    if (getErrorStatusCode(error) >= 500) {
      logger.error("Failed to verify purchase:", error);
    }
    return nextJsonFromCaughtErrorWithHeaders(error, corsHeaders);
  }
}
