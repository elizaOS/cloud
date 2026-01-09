import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/utils/logger";
import { verifyAuthTokenCached } from "@/lib/auth";
import { appsService } from "@/lib/services/apps";
import { dbRead } from "@/db/client";
import { users } from "@/db/schemas/users";
import { eq } from "drizzle-orm";
import { z } from "zod";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-11-20.acacia",
});

// CORS headers - fully open, security via auth tokens
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-API-Key, X-App-Id, X-Request-ID",
  "Access-Control-Max-Age": "86400",
};

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
    headers: CORS_HEADERS,
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
  try {
    // Verify user authentication
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401, headers: CORS_HEADERS }
      );
    }
    
    const token = authHeader.slice(7);
    const verifiedClaims = await verifyAuthTokenCached(token);
    
    if (!verifiedClaims) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired token" },
        { status: 401, headers: CORS_HEADERS }
      );
    }
    
    // Get user
    const [user] = await dbRead
      .select({
        id: users.id,
        email: users.email,
        organization_id: users.organization_id,
      })
      .from(users)
      .where(eq(users.privy_user_id, verifiedClaims.userId))
      .limit(1);
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404, headers: CORS_HEADERS }
      );
    }
    
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
        { status: 400, headers: CORS_HEADERS }
      );
    }
    
    const { app_id, amount, success_url, cancel_url } = validation.data;
    
    // Verify app exists
    const app = await appsService.getById(app_id);
    if (!app) {
      return NextResponse.json(
        { success: false, error: "App not found" },
        { status: 404, headers: CORS_HEADERS }
      );
    }
    
    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
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
      success_url: `${success_url}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url,
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
    
    return NextResponse.json({
      success: true,
      url: session.url,
      sessionId: session.id,
    }, { headers: CORS_HEADERS });
  } catch (error) {
    logger.error("Failed to create checkout session:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create checkout",
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
