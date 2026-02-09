/**
 * Eliza App - Stripe Checkout Endpoint
 *
 * Creates a Stripe checkout session for eliza-app users to purchase credits.
 * Can be called with session token (authenticated) or with organization ID (for payment links).
 *
 * POST /api/eliza-app/checkout
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/utils/logger";
import { RateLimitPresets, withRateLimit } from "@/lib/middleware/rate-limit";
import { requireStripe, isStripeConfigured } from "@/lib/stripe";
import { elizaAppSessionService, elizaAppUserService } from "@/lib/services/eliza-app";
import { elizaAppConfig } from "@/lib/services/eliza-app/config";

const checkoutRequestSchema = z.object({
  amount: z.number().min(1).max(100).default(5), // $1 to $100, default $5
});

interface CheckoutResponse {
  url: string;
  sessionId: string;
}

interface ErrorResponse {
  error: string;
  code: string;
}

async function handleCheckout(
  request: NextRequest,
): Promise<NextResponse<CheckoutResponse | ErrorResponse>> {
  // Check if Stripe is configured
  if (!isStripeConfigured()) {
    logger.error("[ElizaApp Checkout] Stripe not configured");
    return NextResponse.json(
      { error: "Payment processing not available", code: "STRIPE_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  // Authenticate user via session token
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return NextResponse.json(
      { error: "Authorization header required", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const session = await elizaAppSessionService.validateAuthHeader(authHeader);
  if (!session) {
    return NextResponse.json(
      { error: "Invalid or expired session", code: "INVALID_SESSION" },
      { status: 401 },
    );
  }

  // Get user with organization
  const user = await elizaAppUserService.getById(session.userId);
  if (!user || !user.organization_id) {
    return NextResponse.json(
      { error: "User not found", code: "USER_NOT_FOUND" },
      { status: 404 },
    );
  }

  // Parse request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parseResult = checkoutRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request", code: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  const { amount } = parseResult.data;

  try {
    const stripe = requireStripe();

    // Create checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      customer_email: user.email || undefined,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `$${amount.toFixed(2)} Credits Top-Up`,
              description: "Eliza App credits for AI conversations",
            },
            unit_amount: Math.round(amount * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${elizaAppConfig.appUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${elizaAppConfig.appUrl}/payment-canceled`,
      metadata: {
        organization_id: user.organization_id,
        user_id: user.id,
        credits: String(amount),
        type: "eliza_app_topup",
        source: "eliza_app",
      },
      // Copy metadata to PaymentIntent for webhook handling
      payment_intent_data: {
        metadata: {
          organization_id: user.organization_id,
          user_id: user.id,
          credits: String(amount),
          type: "eliza_app_topup",
          source: "eliza_app",
        },
      },
    });

    if (!checkoutSession.url) {
      throw new Error("Failed to create checkout URL");
    }


    logger.info("[ElizaApp Checkout] Checkout session created", {
      userId: user.id,
      organizationId: user.organization_id,
      amount,
      sessionId: checkoutSession.id,
    });

    return NextResponse.json({
      url: checkoutSession.url,
      sessionId: checkoutSession.id,
    });
  } catch (error) {
    logger.error("[ElizaApp Checkout] Failed to create checkout session", {
      error: error instanceof Error ? error.message : String(error),
      userId: user.id,
    });

    return NextResponse.json(
      { error: "Failed to create checkout session", code: "CHECKOUT_FAILED" },
      { status: 500 },
    );
  }
}

// Rate limit: 10 requests per minute per user
export const POST = withRateLimit(handleCheckout, RateLimitPresets.STANDARD);

// Health check
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    service: "eliza-app-checkout",
    stripeConfigured: isStripeConfigured(),
  });
}
