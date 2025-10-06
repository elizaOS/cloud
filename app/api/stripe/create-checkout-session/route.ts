import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { getCreditPackById } from "@/lib/queries/credit-packs";
import { db } from "@/db/drizzle";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { creditPackId } = await req.json();

    if (!creditPackId) {
      return NextResponse.json(
        { error: "Credit pack ID is required" },
        { status: 400 },
      );
    }

    const creditPack = await getCreditPackById(creditPackId);
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
      await db
        .update(schema.organizations)
        .set({
          stripe_customer_id: customerId,
          updated_at: new Date(),
        })
        .where(eq(schema.organizations.id, user.organization_id));
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
      { status: 200 },
    );
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}
