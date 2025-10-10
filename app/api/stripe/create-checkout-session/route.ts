import { type NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { creditsService, organizationsService } from "@/lib/services";
import { rateLimiter, RATE_LIMITS } from "@/lib/rate-limiter";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();

    const rateLimitKey = `checkout:${user.organization_id}`;
    const rateLimitResult = rateLimiter.check(
      rateLimitKey,
      RATE_LIMITS.CHECKOUT_SESSION.limit,
      RATE_LIMITS.CHECKOUT_SESSION.windowMs,
    );

    if (!rateLimitResult.allowed) {
      const resetDate = new Date(rateLimitResult.resetAt);
      return NextResponse.json(
        {
          error: "Too many checkout sessions created",
          message: `Rate limit exceeded. Try again after ${resetDate.toLocaleTimeString()}`,
          retryAfter: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil(
              (rateLimitResult.resetAt - Date.now()) / 1000,
            ).toString(),
            "X-RateLimit-Limit": RATE_LIMITS.CHECKOUT_SESSION.limit.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": rateLimitResult.resetAt.toString(),
          },
        },
      );
    }

    const { creditPackId } = await req.json();

    if (!creditPackId) {
      return NextResponse.json(
        { error: "Credit pack ID is required" },
        { status: 400 },
      );
    }

    const creditPack = await creditsService.getCreditPackById(creditPackId);
    if (!creditPack || !creditPack.is_active) {
      return NextResponse.json(
        { error: "Invalid or inactive credit pack" },
        { status: 404 },
      );
    }

    // Get or create Stripe customer
    let customerId = user.organization.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.organization.billing_email || user.email,
        name: user.organization.name,
        metadata: {
          organization_id: user.organization_id,
        },
      });
      customerId = customer.id;

      // Save customer ID to database
      await organizationsService.update(user.organization_id, {
        stripe_customer_id: customerId,
        updated_at: new Date(),
      });
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: creditPack.stripe_price_id,
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?canceled=true`,
      metadata: {
        organization_id: user.organization_id,
        user_id: user.id,
        credit_pack_id: creditPackId,
        credits: creditPack.credits.toString(),
      },
    });

    return NextResponse.json(
      { sessionId: session.id, url: session.url },
      {
        status: 200,
        headers: {
          "X-RateLimit-Limit": RATE_LIMITS.CHECKOUT_SESSION.limit.toString(),
          "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
          "X-RateLimit-Reset": rateLimitResult.resetAt.toString(),
        },
      },
    );
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}
