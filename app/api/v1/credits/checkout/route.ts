/**
 * Credits Checkout API (v1)
 *
 * POST /api/v1/credits/checkout
 * Creates a Stripe checkout session for purchasing organization credits.
 *
 * CORS: Reflects origin header. Security is via auth tokens.
 */

import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { z } from "zod";
import { getErrorStatusCode, nextJsonFromCaughtErrorWithHeaders } from "@/lib/api/errors";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import {
  assertAllowedAbsoluteRedirectUrl,
  getDefaultPlatformRedirectOrigins,
} from "@/lib/security/redirect-validation";
import { organizationsService } from "@/lib/services/organizations";
import { requireStripe } from "@/lib/stripe";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";

// Configurable currency
const STRIPE_CURRENCY = process.env.STRIPE_CURRENCY || "usd";

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
  // Amount of credits (in dollars) - this is what the SDK sends
  credits: z.number().min(1).max(1000),
  // Redirect URLs
  success_url: z.string().url(),
  cancel_url: z.string().url(),
});

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
 * POST /api/v1/credits/checkout
 * Creates a Stripe checkout session for purchasing organization credits.
 *
 * Body:
 * - credits: Amount in dollars to purchase
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
    // Authenticate user
    const { user } = await requireAuthOrApiKeyWithOrg(request);

    // Parse and validate body
    const body = await request.json();
    const validation = CheckoutSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: validation.error.format(),
        },
        { status: 400, headers: corsHeaders },
      );
    }

    const { credits: amount, success_url, cancel_url } = validation.data;
    const allowedRedirectOrigins = getDefaultPlatformRedirectOrigins();
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

    const organizationId = user.organization_id;
    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 400, headers: corsHeaders },
      );
    }

    // Affiliate/Referral revenue splits are now calculated and handled
    // implicitly within the Stripe Webhook via the 50/40/10 model,
    // rather than adding line-items at checkout.

    // Line items for Stripe
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: STRIPE_CURRENCY,
          product_data: {
            name: "Account Balance Top-up",
            description: `Add $${amount.toFixed(2)} to your account balance`,
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      },
    ];

    // Get or create Stripe customer
    let customerId = user.organization.stripe_customer_id;

    if (!customerId) {
      const customerData: Stripe.CustomerCreateParams = {
        name: user.organization.name,
        metadata: {
          organization_id: organizationId,
        },
      };

      const email = user.organization.billing_email || user.email;
      if (email) {
        customerData.email = email;
      }

      if (user.wallet_address) {
        customerData.metadata = {
          ...customerData.metadata,
          wallet_address: user.wallet_address,
        };
      }

      const customer = await requireStripe().customers.create(customerData);
      customerId = customer.id;

      await organizationsService.update(organizationId, {
        stripe_customer_id: customerId,
        updated_at: new Date(),
      });
    }

    successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");

    // Create Stripe checkout session
    const session = await requireStripe().checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString(),
      metadata: {
        organization_id: organizationId,
        user_id: user.id,
        credits: amount.toFixed(2),
        type: "custom_amount",
      },
    });

    logger.info("Created credits checkout session", {
      sessionId: session.id,
      organizationId,
      userId: user.id,
      amount,
    });

    return NextResponse.json(
      {
        url: session.url,
        sessionId: session.id,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to create checkout session";
    const isValidationError =
      errorMessage.includes("Invalid success_url") || errorMessage.includes("Invalid cancel_url");

    if (isValidationError) {
      return NextResponse.json({ error: errorMessage }, { status: 400, headers: corsHeaders });
    }

    if (getErrorStatusCode(error) >= 500) {
      logger.error("[Credits Checkout API v1] Error:", error);
    }
    return nextJsonFromCaughtErrorWithHeaders(error, corsHeaders);
  }
}
