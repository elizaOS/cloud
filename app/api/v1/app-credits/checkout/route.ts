import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { appsService } from "@/lib/services/apps";
import {
  assertAllowedAbsoluteRedirectUrl,
  getDefaultPlatformRedirectOrigins,
} from "@/lib/security/redirect-validation";
import { z } from "zod";
import { requireStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// CORS headers - open CORS without credentials. Cross-origin callers must
// authenticate explicitly with bearer/API-key headers instead of cookies.
function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-API-Key, X-App-Id, X-Request-ID",
    "Access-Control-Max-Age": "86400",
  };
}

const CheckoutSchema = z.object({
  app_id: z.string().uuid(),
  amount: z.number().min(1).max(10000),
  success_url: z.string().url(),
  cancel_url: z.string().url(),
});

/**
 * OPTIONS /api/v1/app-credits/checkout
 * CORS preflight handler
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}

/**
 * POST /api/v1/app-credits/checkout
 *
 * Create a Stripe checkout session for purchasing app credits.
 *
 * Body:
 * - app_id: The app ID
 * - amount: Amount in dollars to purchase
 * - success_url: URL to redirect after success
 * - cancel_url: URL to redirect if cancelled
 *
 * Returns:
 * - url: Stripe checkout URL
 * - sessionId: Checkout session ID
 */
export async function POST(request: NextRequest) {
  const corsHeaders = getCorsHeaders();

  try {
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    // Parse and validate body
    const body = await request.json();
    const validation = CheckoutSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request",
          details: validation.error.format(),
        },
        { status: 400, headers: corsHeaders },
      );
    }

    const { app_id, amount, success_url, cancel_url } = validation.data;

    // Verify app exists
    const app = await appsService.getById(app_id);
    if (!app) {
      return NextResponse.json(
        { success: false, error: "App not found" },
        { status: 404, headers: corsHeaders },
      );
    }

    const allowedRedirectOrigins = [
      ...getDefaultPlatformRedirectOrigins(),
      app.app_url,
      ...(app.allowed_origins ?? []),
    ].filter((value): value is string => !!value);
    const successUrl = assertAllowedAbsoluteRedirectUrl(
      success_url,
      allowedRedirectOrigins,
      "success_url",
    );
    const cancelUrl = assertAllowedAbsoluteRedirectUrl(
      cancel_url,
      allowedRedirectOrigins,
      "cancel_url",
    );

    successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");

    // Create Stripe checkout session
    const session = await requireStripe().checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${app.name} Credits`,
              description: `$${amount} credits for ${app.name}`,
            },
            unit_amount: amount * 100, // Stripe uses cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
      customer_email: user.email || undefined,
      metadata: {
        type: "app_credit_purchase",
        app_id: app_id,
        user_id: user.id,
        organization_id: user.organization_id || "",
        amount: amount.toString(),
      },
    });

    logger.info("Created app credit checkout session", {
      sessionId: session.id,
      appId: app_id,
      userId: user.id,
      amount,
    });

    return NextResponse.json(
      {
        success: true,
        url: session.url,
        sessionId: session.id,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to create checkout";
    const isAuthError =
      errorMessage.includes("Unauthorized") ||
      errorMessage.includes("Authentication required") ||
      errorMessage.includes("Invalid or expired token") ||
      errorMessage.includes("Invalid or expired API key") ||
      errorMessage.includes("Invalid wallet signature") ||
      errorMessage.includes("Wallet authentication failed") ||
      errorMessage.includes("Forbidden");
    const isValidationError =
      errorMessage.includes("Invalid success_url") ||
      errorMessage.includes("Invalid cancel_url");

    if (isAuthError) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401, headers: getCorsHeaders() },
      );
    }

    if (isValidationError) {
      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
        },
        { status: 400, headers: getCorsHeaders() },
      );
    }

    logger.error("Failed to create checkout session:", error);
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500, headers: getCorsHeaders() },
    );
  }
}
