/**
 * Queue consumer for Stripe events.
 *
 * Runs the heavy fan-out that used to live inline in /api/stripe/webhook
 * before the queue refactor — app credits, org credits, revenue splits,
 * redeemable earnings, cache invalidation, Discord notifications, and
 * invoice rows. The webhook route now just verifies the signature,
 * dedupes by event ID via webhook_events, enqueues, and returns 200.
 *
 * Idempotency strategy:
 *   - The webhook route uses webhook_events.tryCreate(event.id) so
 *     Stripe's at-least-once retries are caught BEFORE this consumer
 *     ever runs.
 *   - For queue retries (transient downstream failures, e.g. DB blip),
 *     this consumer additionally re-checks each downstream write:
 *       * creditsService.getTransactionByStripePaymentIntent
 *       * redeemableEarningsService.addEarnings({ dedupeBySourceId: true })
 *       * invoicesService.getByStripeInvoiceId
 *   - These guards make a queue retry safe to apply even if a previous
 *     attempt got partway through.
 *
 * Failure handling:
 *   - Permanent failures (bad metadata, missing required fields) ack the
 *     message — there is no recovery path and we do not want them eating
 *     retry budget.
 *   - Transient failures (DB error, downstream timeout, etc.) call
 *     message.retry() with a backoff. After max_retries (5, configured
 *     in wrangler.toml) the message lands in stripe-events-dlq for
 *     manual reconciliation.
 */

import type Stripe from "stripe";

import { organizationsRepository } from "@/db/repositories/organizations";
import { usersRepository } from "@/db/repositories/users";
import { trackServerEvent } from "@/lib/analytics/posthog-server";
import { appCreditsService } from "@/lib/services/app-credits";
import { creditsService } from "@/lib/services/credits";
import { discordService } from "@/lib/services/discord";
import { invoicesService } from "@/lib/services/invoices";
import { invalidateOrgTierCache } from "@/lib/services/org-rate-limits";
import { redeemableEarningsService } from "@/lib/services/redeemable-earnings";
import { referralsService } from "@/lib/services/referrals";
import { requireStripe } from "@/lib/stripe";
import { logger } from "@/lib/utils/logger";

import type { StripeEventMessage } from "./types";

const MAX_CREDITS = 10000;

/** Type guard: detect an expanded Stripe.Invoice on a PaymentIntent.invoice field. */
function isInvoiceExpanded(invoice: unknown): invoice is Stripe.Invoice {
  return typeof invoice === "object" && invoice !== null && "id" in invoice;
}

/**
 * Parse a metadata "credits" string into a USD-rounded number.
 * Returns null when the input is not a finite positive number within bounds.
 */
function parseAndValidateCredits(creditsStr: string): number | null {
  const credits = Number.parseFloat(creditsStr);
  if (!Number.isFinite(credits) || credits <= 0 || credits > MAX_CREDITS) {
    return null;
  }
  return Math.round(credits * 100) / 100;
}

/**
 * Process a single Stripe event message.
 *
 * Calls `message.ack()` on success and on permanent failures (bad data
 * we cannot recover by retrying). Calls `message.retry()` on transient
 * failures so Cloudflare Queues will redeliver until max_retries is
 * exhausted, after which the message goes to the dead-letter queue.
 */
export async function processStripeEvent(
  message: Message<StripeEventMessage>,
): Promise<void> {
  const { event } = message.body;
  logger.info(
    `[Stripe Queue] Processing ${event.type} (${event.id}) attempt=${message.attempts}`,
  );

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event);
        break;
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event);
        break;
      case "payment_intent.payment_failed":
        handlePaymentIntentFailed(event);
        break;
      default:
        logger.debug(`[Stripe Queue] Unhandled event type: ${event.type}`);
    }
    message.ack();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Permanent errors: bad data we cannot recover by retrying. Ack so
    // the DLQ does not collect noise from poisonous metadata.
    const isPermanentError =
      error instanceof Error &&
      (error.message.includes("not found") ||
        error.message.includes("Invalid") ||
        error.message.includes("already processed"));

    if (isPermanentError) {
      logger.warn(
        `[Stripe Queue] Permanent failure for ${event.type} (${event.id}); acking to skip retries`,
        { error: errorMessage },
      );
      message.ack();
      return;
    }

    // Transient: retry with exponential-ish backoff (cf-queues uses
    // attempts internally; we just nudge the next delivery a bit).
    const delaySeconds = Math.min(60, 5 * 2 ** message.attempts);
    logger.error(
      `[Stripe Queue] Transient failure for ${event.type} (${event.id}); retrying in ${delaySeconds}s`,
      { error: errorMessage, attempts: message.attempts },
    );
    message.retry({ delaySeconds });
  }
}

// ---------------------------------------------------------------------------
// checkout.session.completed
// ---------------------------------------------------------------------------

async function handleCheckoutSessionCompleted(event: Stripe.Event): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") return;

  const organizationId = session.metadata?.organization_id;
  const userId = session.metadata?.user_id;
  const creditsStr = session.metadata?.credits || "0";
  const credits = parseAndValidateCredits(creditsStr);
  const paymentIntentId = session.payment_intent as string;
  const purchaseType = session.metadata?.type || "checkout";
  const purchaseSource = session.metadata?.source;
  const appId = session.metadata?.app_id;

  const isAppPurchase = purchaseSource === "miniapp_app" && appId && userId;

  if (!organizationId || !credits) {
    logger.warn(
      `[Stripe Queue] Permanent failure - Invalid metadata in checkout session ${session.id}`,
      { hasOrgId: !!organizationId, hasValidCredits: !!credits },
    );
    return;
  }

  if (!paymentIntentId) {
    logger.warn(
      `[Stripe Queue] Permanent failure - No payment intent ID in checkout session ${session.id}`,
    );
    return;
  }

  const existingTransaction =
    await creditsService.getTransactionByStripePaymentIntent(paymentIntentId);
  const isDuplicate = !!existingTransaction;

  if (isDuplicate) {
    logger.debug(
      `[Stripe Queue] Per-row dedup hit - Payment intent ${paymentIntentId} already credited; will still attempt revenue splits (idempotent via dedupeBySourceId)`,
    );
  }

  if (isAppPurchase && !isDuplicate) {
    logger.info(`[Stripe Queue] Processing app-specific credit purchase for app ${appId}`);

    const result = await appCreditsService.processPurchase({
      appId,
      userId,
      organizationId,
      purchaseAmount: credits,
      stripePaymentIntentId: paymentIntentId,
    });

    logger.info(
      `[Stripe Queue] App credits added: ${result.creditsAdded} to app ${appId} for user ${userId}`,
      {
        creditsAdded: result.creditsAdded,
        platformOffset: result.platformOffset,
        creatorEarnings: result.creatorEarnings,
        newBalance: result.newBalance,
      },
    );

    trackServerEvent(userId, "app_credits_purchased", {
      app_id: appId,
      amount: credits,
      credits_added: result.creditsAdded,
      organization_id: organizationId,
      platform_offset: result.platformOffset,
      creator_earnings: result.creatorEarnings,
    });

    trackServerEvent(userId, "checkout_completed", {
      payment_method: "stripe",
      amount: credits,
      currency: session.currency || "usd",
      organization_id: organizationId,
      purchase_type: "app_credits",
      credits_added: result.creditsAdded,
      stripe_session_id: session.id,
    });

    await creditsService.addCredits({
      organizationId,
      amount: 0,
      description: `App credit purchase (App: ${appId}) - $${credits.toFixed(2)}`,
      metadata: {
        user_id: userId,
        app_id: appId,
        payment_intent_id: paymentIntentId,
        session_id: session.id,
        type: purchaseType,
        source: purchaseSource,
        credits_to_app_balance: credits,
        platform_offset: result.platformOffset,
        creator_earnings: result.creatorEarnings,
      },
      stripePaymentIntentId: paymentIntentId,
    });

    invalidateOrgTierCache(organizationId).catch((err) =>
      logger.warn("[Stripe Queue] Failed to invalidate org tier cache", {
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  } else if (!isDuplicate) {
    await creditsService.addCredits({
      organizationId,
      amount: credits,
      description: `Balance top-up - $${credits.toFixed(2)}`,
      metadata: {
        user_id: userId,
        payment_intent_id: paymentIntentId,
        session_id: session.id,
        type: purchaseType,
      },
      stripePaymentIntentId: paymentIntentId,
    });

    logger.info(`[Stripe Queue] Credits added: ${credits} to org ${organizationId}`);

    invalidateOrgTierCache(organizationId).catch((err) =>
      logger.warn("[Stripe Queue] Failed to invalidate org tier cache", {
        error: err instanceof Error ? err.message : String(err),
      }),
    );

    if (userId) {
      trackServerEvent(userId, "credits_purchased", {
        amount: credits,
        currency: session.currency || "usd",
        purchase_type: purchaseType,
        organization_id: organizationId,
        payment_method: "stripe",
      });

      trackServerEvent(userId, "checkout_completed", {
        payment_method: "stripe",
        amount: credits,
        currency: session.currency || "usd",
        organization_id: organizationId,
        purchase_type: purchaseType,
        credits_added: credits,
        stripe_session_id: session.id,
      });
    }
  }

  // Revenue splits run on every delivery (including duplicate event_id
  // hits at the per-row level) so a retry that previously failed mid-way
  // can complete. dedupeBySourceId guarantees we never insert twice.
  if (!isAppPurchase && userId) {
    const { splits } = await referralsService.calculateRevenueSplits(userId, credits);
    if (splits.length > 0) {
      logger.info(
        `[Stripe Queue] Processing revenue splits for $${credits.toFixed(2)} purchase by user ${userId}`,
      );
      for (const split of splits) {
        if (split.amount <= 0) continue;
        const source =
          split.role === "app_owner" ? "app_owner_revenue_share" : "creator_revenue_share";
        try {
          await redeemableEarningsService.addEarnings({
            userId: split.userId,
            amount: split.amount,
            source,
            sourceId: `revenue_split:${paymentIntentId}:${split.userId}`,
            dedupeBySourceId: true,
            description: `${
              split.role === "app_owner" ? "App Owner" : "Creator"
            } revenue share (${((split.amount / credits) * 100).toFixed(0)}%) for $${credits.toFixed(2)} purchase`,
            metadata: {
              buyer_user_id: userId,
              buyer_org_id: organizationId,
              payment_intent_id: paymentIntentId,
              role: split.role,
            },
          });
          logger.info(
            `[Stripe Queue] Credited split: $${split.amount.toFixed(2)} to ${split.role} (${split.userId})`,
          );
        } catch (splitError) {
          // Surface as transient — the queue will retry. dedupeBySourceId
          // guarantees a successful split on a previous attempt is not
          // re-applied on retry.
          logger.error(
            `[Stripe Queue] Failed to credit split to ${split.role} (${split.userId})`,
            {
              error: splitError instanceof Error ? splitError.message : String(splitError),
              amount: split.amount,
              paymentIntentId,
              sourceId: `revenue_split:${paymentIntentId}:${split.userId}`,
            },
          );
          trackServerEvent(userId, "revenue_split_failed", {
            payment_intent_id: paymentIntentId,
            split_user_id: split.userId,
            split_role: split.role,
            split_amount: split.amount,
            error: splitError instanceof Error ? splitError.message : String(splitError),
          });
          throw splitError instanceof Error ? splitError : new Error(String(splitError));
        }
      }
    }
  }

  if (!isDuplicate) {
    organizationsRepository.findById(organizationId).then((org) => {
      const user = userId ? usersRepository.findById(userId) : Promise.resolve(null);
      user.then((userData) => {
        discordService
          .logPaymentReceived({
            paymentId: paymentIntentId,
            amount: credits,
            currency: session.currency || "usd",
            credits,
            organizationId,
            organizationName: org?.name,
            userId: userId || undefined,
            userName: userData?.name || userData?.email,
            paymentMethod: "stripe",
            paymentType: purchaseType === "credit_pack" ? "Credit Pack" : "Balance Top-up",
          })
          .catch((err) => {
            logger.error("[Stripe Queue] Failed to log payment to Discord", { error: err });
          });
      });
    });
  }

  if (!isDuplicate) {
    try {
      const existingInvoice = await invoicesService.getByStripeInvoiceId(`cs_${session.id}`);

      if (!existingInvoice) {
        const amountTotal = session.amount_total
          ? (session.amount_total / 100).toString()
          : credits.toString();

        await invoicesService.create({
          organization_id: organizationId,
          stripe_invoice_id: `cs_${session.id}`,
          stripe_customer_id: session.customer as string,
          stripe_payment_intent_id: paymentIntentId,
          amount_due: amountTotal,
          amount_paid: amountTotal,
          currency: session.currency || "usd",
          status: "paid",
          invoice_type: purchaseType,
          invoice_number: undefined,
          invoice_pdf: undefined,
          hosted_invoice_url: undefined,
          credits_added: credits.toString(),
          metadata: {
            type: purchaseType,
            session_id: session.id,
            ...(appId && { app_id: appId }),
          },
          paid_at: new Date(),
        });

        logger.debug(`[Stripe Queue] Invoice created for checkout session ${session.id}`);
      } else {
        logger.debug(`[Stripe Queue] Invoice already exists for checkout session ${session.id}`);
      }
    } catch (invoiceError) {
      // Invoice row failure is non-critical: credits were already added.
      // Log and continue so we do not retry the whole event for this.
      logger.error("[Stripe Queue] Non-critical error creating invoice record", invoiceError);
    }
  }
}

// ---------------------------------------------------------------------------
// payment_intent.succeeded
// ---------------------------------------------------------------------------

async function handlePaymentIntentSucceeded(event: Stripe.Event): Promise<void> {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  logger.debug(`[Stripe Queue] Payment intent succeeded: ${paymentIntent.id}`);

  // One-time and auto-top-up use PaymentIntent directly (no checkout
  // session). Referral splits run only for checkout.session.completed —
  // affiliate markup is applied when the PaymentIntent is created, so
  // the only payout here is the auto-top-up affiliate fee.
  const purchaseType = paymentIntent.metadata?.type;

  if (!purchaseType || purchaseType === "credit_pack") {
    logger.debug(
      `[Stripe Queue] Skipping payment intent ${paymentIntent.id} - type: ${purchaseType || "unknown"}`,
    );
    return;
  }

  const organizationId = paymentIntent.metadata?.organization_id;
  const creditsStr = paymentIntent.metadata?.credits;
  const credits = creditsStr ? parseAndValidateCredits(creditsStr) : null;

  if (!organizationId || !credits) {
    logger.warn(
      `[Stripe Queue] Permanent failure - Invalid metadata in payment intent ${paymentIntent.id}`,
      { hasOrgId: !!organizationId, hasValidCredits: !!credits },
    );
    return;
  }

  const affiliateFeeStr = paymentIntent.metadata?.affiliate_fee_amount;
  const affiliateFeeAmount = affiliateFeeStr ? Number.parseFloat(affiliateFeeStr) : 0;
  const affiliateOwnerId = paymentIntent.metadata?.affiliate_owner_id;
  const affiliateCodeId = paymentIntent.metadata?.affiliate_code_id;

  if (affiliateFeeStr && (!Number.isFinite(affiliateFeeAmount) || affiliateFeeAmount <= 0)) {
    logger.warn(
      `[Stripe Queue] Permanent failure - Invalid affiliate metadata in payment intent ${paymentIntent.id}`,
      { affiliateFeeStr },
    );
    return;
  }

  const existingTransaction = await creditsService.getTransactionByStripePaymentIntent(
    paymentIntent.id,
  );
  const isDuplicate = !!existingTransaction;

  if (isDuplicate) {
    logger.debug(
      `[Stripe Queue] Per-row dedup hit - Payment intent ${paymentIntent.id} already credited`,
    );
  }

  const description =
    purchaseType === "auto_top_up"
      ? `Auto top-up - $${credits.toFixed(2)}`
      : `One-time purchase - $${credits.toFixed(2)}`;

  if (!isDuplicate) {
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

    logger.info(
      `[Stripe Queue] Credits added: ${credits} to org ${organizationId} (${purchaseType})`,
    );

    invalidateOrgTierCache(organizationId).catch((err) =>
      logger.warn("[Stripe Queue] Failed to invalidate org tier cache", {
        error: err instanceof Error ? err.message : String(err),
      }),
    );

    organizationsRepository.findById(organizationId).then((org) => {
      discordService
        .logPaymentReceived({
          paymentId: paymentIntent.id,
          amount: credits,
          currency: paymentIntent.currency,
          credits,
          organizationId,
          organizationName: org?.name,
          paymentMethod: "stripe",
          paymentType: purchaseType === "auto_top_up" ? "Auto Top-up" : "One-time Purchase",
        })
        .catch((err) => {
          logger.error("[Stripe Queue] Failed to log payment to Discord", { error: err });
        });
    });
  }

  if (
    purchaseType === "auto_top_up" &&
    affiliateFeeAmount > 0 &&
    affiliateOwnerId &&
    affiliateCodeId
  ) {
    const result = await redeemableEarningsService.addEarnings({
      userId: affiliateOwnerId,
      amount: affiliateFeeAmount,
      source: "affiliate",
      sourceId: `affiliate_auto_topup:${paymentIntent.id}:${affiliateCodeId}`,
      dedupeBySourceId: true,
      description: `Auto top-up affiliate fee for $${credits.toFixed(2)} purchase`,
      metadata: {
        buyer_user_id: paymentIntent.metadata?.user_id,
        buyer_org_id: organizationId,
        payment_intent_id: paymentIntent.id,
        total_charged: paymentIntent.metadata?.total_charged,
      },
    });

    if (!result.success) {
      logger.error(
        `[Stripe Queue] Failed to credit auto top-up affiliate payout for ${paymentIntent.id}`,
        { error: result.error, affiliateOwnerId, affiliateCodeId },
      );
      throw new Error(`Failed to process auto top-up affiliate payout: ${result.error}`);
    }
  }

  if (isDuplicate) {
    return;
  }

  // Invoice creation is non-critical — credits were already added above.
  try {
    const invoiceIdOrObject = (
      paymentIntent as Stripe.PaymentIntent & {
        invoice?: string | Stripe.Invoice | null;
      }
    ).invoice;
    if (invoiceIdOrObject) {
      const invoiceId = isInvoiceExpanded(invoiceIdOrObject)
        ? invoiceIdOrObject.id
        : invoiceIdOrObject;

      const existingInvoice = await invoicesService.getByStripeInvoiceId(invoiceId);

      if (!existingInvoice) {
        const stripe = requireStripe();
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
          hosted_invoice_url: stripeInvoice.hosted_invoice_url || undefined,
          credits_added: credits.toString(),
          metadata: {
            type: purchaseType,
          },
          paid_at: stripeInvoice.status_transitions?.paid_at
            ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
            : undefined,
        });

        logger.debug(`[Stripe Queue] Invoice created for payment intent ${paymentIntent.id}`);
      }
    } else {
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

        logger.debug(`[Stripe Queue] Invoice created for direct payment ${paymentIntent.id}`);
      } else {
        logger.debug(`[Stripe Queue] Invoice already exists for payment ${paymentIntent.id}`);
      }
    }
  } catch (invoiceError) {
    logger.error("[Stripe Queue] Non-critical error creating invoice record", invoiceError);
  }
}

// ---------------------------------------------------------------------------
// payment_intent.payment_failed
// ---------------------------------------------------------------------------

function handlePaymentIntentFailed(event: Stripe.Event): void {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  logger.warn(`[Stripe Queue] Payment intent failed: ${paymentIntent.id}`);

  const orgId = paymentIntent.metadata?.organization_id;
  const userId = paymentIntent.metadata?.user_id;
  const purchaseType = paymentIntent.metadata?.type;
  const intendedCredits = paymentIntent.metadata?.credits
    ? parseAndValidateCredits(paymentIntent.metadata.credits)
    : null;

  const lastPaymentError = paymentIntent.last_payment_error;
  const errorReason = lastPaymentError?.message || lastPaymentError?.code || "Payment failed";

  // Use org-prefixed ID as fallback when user ID is missing (matches the
  // auto-top-up failure tracking pattern).
  const trackingId = userId || (orgId ? `org:${orgId}` : null);

  if (trackingId && orgId) {
    trackServerEvent(trackingId, "checkout_failed", {
      payment_method: "stripe",
      amount: intendedCredits || undefined,
      currency: paymentIntent.currency || "usd",
      organization_id: orgId,
      purchase_type: purchaseType,
      error_reason: errorReason,
      stripe_payment_intent_id: paymentIntent.id,
    });
  } else {
    logger.warn(`[Stripe Queue] Cannot track checkout_failed - missing metadata`, {
      paymentIntentId: paymentIntent.id,
      hasUserId: !!userId,
      hasOrgId: !!orgId,
      errorReason,
    });
  }
}
