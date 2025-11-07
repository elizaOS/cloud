import { type NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { creditsService, invoicesService } from "@/lib/services";
import { headers } from "next/headers";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "No signature provided" },
      { status: 400 },
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook configuration error" },
      { status: 500 },
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Webhook signature verification failed" },
      { status: 400 },
    );
  }

  console.log(`[Stripe Webhook] Received event: ${event.type} (${event.id})`);

  // Handle the event
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        if (session.payment_status === "paid") {
          const organizationId = session.metadata?.organization_id;
          const userId = session.metadata?.user_id;
          const credits = Number.parseInt(session.metadata?.credits || "0", 10);
          const paymentIntentId = session.payment_intent as string;

          if (!organizationId || !credits || credits <= 0) {
            console.warn(
              `[Stripe Webhook] Permanent failure - Invalid metadata in checkout session ${session.id}: organizationId=${organizationId}, credits=${credits}`,
            );
            // Return 200 to prevent retries for permanent failures (bad data)
            return NextResponse.json(
              {
                received: true,
                error: "Invalid metadata",
                skipped: true,
              },
              { status: 200 },
            );
          }

          if (!paymentIntentId) {
            console.warn(
              `[Stripe Webhook] Permanent failure - No payment intent ID in checkout session ${session.id}`,
            );
            // Return 200 to prevent retries for permanent failures
            return NextResponse.json(
              {
                received: true,
                error: "No payment intent ID",
                skipped: true,
              },
              { status: 200 },
            );
          }

          // Check for duplicate transaction
          const existingTransaction =
            await creditsService.getTransactionByStripePaymentIntent(
              paymentIntentId,
            );

          if (existingTransaction) {
            console.log(
              `⚠️ Duplicate webhook event detected. Payment intent ${paymentIntentId} already processed (transaction ${existingTransaction.id})`,
            );
            return NextResponse.json(
              { received: true, duplicate: true },
              { status: 200 },
            );
          }

          // Add credits
          await creditsService.addCredits({
            organizationId,
            amount: credits,
            description: `Balance top-up - $${Number(credits).toFixed(2)}`,
            metadata: {
              user_id: userId,
              payment_intent_id: paymentIntentId,
              session_id: session.id,
            },
            stripePaymentIntentId: paymentIntentId,
          });

          console.log(
            `✓ Added ${credits} credits to organization ${organizationId} (payment intent: ${paymentIntentId})`,
          );
        }
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        console.log(
          `[Stripe Webhook] Payment intent succeeded: ${paymentIntent.id}`,
        );
        console.log(
          `[Stripe Webhook] Payment intent metadata:`,
          JSON.stringify(paymentIntent.metadata, null, 2),
        );

        // Only process if this is a one-time purchase or auto-top-up
        // Credit pack purchases are handled by checkout.session.completed
        const purchaseType = paymentIntent.metadata?.type;
        console.log(`[Stripe Webhook] Purchase type: ${purchaseType}`);

        if (!purchaseType || purchaseType === "credit_pack") {
          console.log(
            `[Stripe Webhook] Skipping payment intent ${paymentIntent.id} - type: ${purchaseType || "unknown"}`,
          );
          break;
        }

        const organizationId = paymentIntent.metadata?.organization_id;
        const creditsStr = paymentIntent.metadata?.credits;
        const credits = creditsStr ? Number.parseFloat(creditsStr) : 0;

        if (!organizationId || !credits || credits <= 0) {
          console.warn(
            `[Stripe Webhook] Permanent failure - Invalid metadata in payment intent ${paymentIntent.id}: organizationId=${organizationId}, credits=${credits}`,
          );
          // Return 200 to prevent retries for permanent failures (bad data)
          return NextResponse.json(
            {
              received: true,
              error: "Invalid metadata",
              skipped: true,
            },
            { status: 200 },
          );
        }

        // Check for duplicate transaction
        const existingTransaction =
          await creditsService.getTransactionByStripePaymentIntent(
            paymentIntent.id,
          );

        if (existingTransaction) {
          console.log(
            `⚠️ Duplicate webhook event detected. Payment intent ${paymentIntent.id} already processed (transaction ${existingTransaction.id})`,
          );
          return NextResponse.json(
            { received: true, duplicate: true },
            { status: 200 },
          );
        }

        // Determine description based on purchase type
        const description =
          purchaseType === "auto_top_up"
            ? `Auto top-up - $${credits.toFixed(2)}`
            : `One-time purchase - $${credits.toFixed(2)}`;

        // Add credits
        await creditsService.addCredits({
          organizationId,
          amount: credits,
          description,
          metadata: {
            type: purchaseType,
            payment_intent_id: paymentIntent.id,
          },
          stripePaymentIntentId: paymentIntent.id,
        });

        console.log(
          `✓ Added ${credits} credits to organization ${organizationId} (${purchaseType}, payment intent: ${paymentIntent.id})`,
        );

        try {
          // Type-safe handling of invoice property
          // PaymentIntent.invoice can be string | Stripe.Invoice | null when expanded
          // Check if the property exists first
          const invoiceIdOrObject = (
            paymentIntent as Stripe.PaymentIntent & {
              invoice?: string | Stripe.Invoice | null;
            }
          ).invoice;
          if (invoiceIdOrObject) {
            // Extract the invoice ID - it's either the string itself or the ID from the object
            const invoiceId =
              typeof invoiceIdOrObject === "string"
                ? invoiceIdOrObject
                : invoiceIdOrObject.id;

            const existingInvoice =
              await invoicesService.getByStripeInvoiceId(invoiceId);

            if (!existingInvoice) {
              const stripeInvoice = await stripe.invoices.retrieve(invoiceId);

              await invoicesService.create({
                organization_id: organizationId,
                stripe_invoice_id: stripeInvoice.id,
                stripe_customer_id: stripeInvoice.customer as string,
                stripe_payment_intent_id: paymentIntent.id,
                amount_due: (stripeInvoice.amount_due / 100).toString(),
                amount_paid: (stripeInvoice.amount_paid / 100).toString(),
                currency: stripeInvoice.currency,
                status: stripeInvoice.status || "draft",
                invoice_type: purchaseType || "one_time_purchase",
                invoice_number: stripeInvoice.number || undefined,
                invoice_pdf: stripeInvoice.invoice_pdf || undefined,
                hosted_invoice_url:
                  stripeInvoice.hosted_invoice_url || undefined,
                credits_added: credits.toString(),
                metadata: {
                  type: purchaseType,
                },
                paid_at: stripeInvoice.status_transitions?.paid_at
                  ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
                  : undefined,
              });

              console.log(
                `✓ Created invoice record for payment intent ${paymentIntent.id}`,
              );
            }
          } else {
            // Check if invoice already exists (might have been created synchronously)
            const existingInvoice = await invoicesService.getByStripeInvoiceId(
              `pi_${paymentIntent.id}`,
            );

            if (!existingInvoice) {
              await invoicesService.create({
                organization_id: organizationId,
                stripe_invoice_id: `pi_${paymentIntent.id}`,
                stripe_customer_id: paymentIntent.customer as string,
                stripe_payment_intent_id: paymentIntent.id,
                amount_due: (paymentIntent.amount / 100).toString(),
                amount_paid: (paymentIntent.amount_received / 100).toString(),
                currency: paymentIntent.currency,
                status: "paid",
                invoice_type: purchaseType || "one_time_purchase",
                invoice_number: undefined,
                invoice_pdf: undefined,
                hosted_invoice_url: undefined,
                credits_added: credits.toString(),
                metadata: {
                  type: purchaseType,
                },
                paid_at: new Date(),
              });

              console.log(
                `✓ Created invoice record for direct payment ${paymentIntent.id}`,
              );
            } else {
              console.log(
                `⚠️ Invoice already exists for payment ${paymentIntent.id}, skipping creation`,
              );
            }
          }
        } catch (invoiceError) {
          // Invoice creation failure is not critical - log but don't fail the webhook
          // The credits were already added successfully
          console.error(
            `[Stripe Webhook] Non-critical error creating invoice record:`,
            invoiceError,
          );
        }

        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object;
        console.error(
          `[Stripe Webhook] Payment intent failed: ${paymentIntent.id}`,
        );
        // Payment failures are expected events, acknowledge receipt
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error(
      `[Stripe Webhook] Error processing event ${event.type} (${event.id}):`,
      error,
    );

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error("[Stripe Webhook] Error details:", {
      event_id: event.id,
      event_type: event.type,
      error_message: errorMessage,
      error_stack: errorStack,
    });

    // Determine if error is permanent or transient
    const isPermanentError =
      error instanceof Error &&
      (error.message.includes("not found") ||
        error.message.includes("Invalid") ||
        error.message.includes("already processed") ||
        error.message.includes("duplicate"));

    if (isPermanentError) {
      // Return 200 for permanent errors to prevent retries
      console.warn(
        `[Stripe Webhook] Permanent error detected, returning 200 to prevent retries`,
      );
      return NextResponse.json(
        {
          received: true,
          error: "Permanent error",
          message: errorMessage,
          event_id: event.id,
          event_type: event.type,
        },
        { status: 200 },
      );
    }

    // Return 500 for transient errors to trigger Stripe retry logic
    // (database issues, network issues, temporary service unavailability)
    console.warn(
      `[Stripe Webhook] Transient error detected, returning 500 to trigger retry`,
    );
    return NextResponse.json(
      {
        error: "Transient error - will retry",
        message: errorMessage,
        event_id: event.id,
        event_type: event.type,
      },
      { status: 500 },
    );
  }
}
