import { requireStripe, STRIPE_CURRENCY } from "@/lib/stripe";
import {
  organizationsRepository,
  usersRepository,
  type Organization,
} from "@/db/repositories";
import { creditsService } from "./credits";
import { invoicesService } from "./invoices";
import { emailService } from "./email";
import type Stripe from "stripe";
import { logger } from "@/lib/utils/logger";

/**
 * Constants for one-time purchase validation
 */
export const PURCHASE_LIMITS = {
  MIN_AMOUNT: 1,
  MAX_AMOUNT: 1000,
} as const;

/**
 * Parameters for creating a one-time purchase
 */
export interface CreatePurchaseParams {
  organizationId: string;
  amount: number;
  paymentMethodId?: string;
  confirmImmediately?: boolean;
}

/**
 * Result of creating a purchase
 */
export interface CreatePurchaseResult {
  paymentIntentId: string;
  clientSecret: string | null;
  status: Stripe.PaymentIntent.Status;
  amount: number;
}

/**
 * Service for managing one-time credit purchases
 * Handles PaymentIntent creation and confirmation for custom amount purchases ($1-$1000)
 */
export class PurchasesService {
  /**
   * Validate purchase amount is within allowed range
   *
   * @param amount - The purchase amount in USD
   * @throws Error if amount is out of range
   */
  private validateAmount(amount: number): void {
    if (amount < PURCHASE_LIMITS.MIN_AMOUNT) {
      throw new Error(
        `Purchase amount must be at least $${PURCHASE_LIMITS.MIN_AMOUNT}`,
      );
    }
    if (amount > PURCHASE_LIMITS.MAX_AMOUNT) {
      throw new Error(
        `Purchase amount cannot exceed $${PURCHASE_LIMITS.MAX_AMOUNT}`,
      );
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Purchase amount must be a valid positive number");
    }
  }

  /**
   * Get or create Stripe customer for an organization
   * Used internally to ensure organization has a Stripe customer before purchase
   *
   * @param org - The organization object
   * @returns Stripe customer ID
   * @throws Error if customer creation fails
   */
  private async ensureStripeCustomer(org: Organization): Promise<string> {
    if (org.stripe_customer_id) {
      return org.stripe_customer_id;
    }

    try {
      const customer = await requireStripe().customers.create({
        name: org.name,
        email: org.billing_email || undefined,
        metadata: {
          organization_id: org.id,
        },
      });

      // Update organization with new customer ID
      await organizationsRepository.update(org.id, {
        stripe_customer_id: customer.id,
        updated_at: new Date(),
      });

      return customer.id;
    } catch (error) {
      logger.error("Failed to create Stripe customer:", error);
      throw new Error("Failed to create payment customer. Please try again.");
    }
  }

  /**
   * Create a PaymentIntent for a one-time credit purchase
   *
   * @param params - Purchase parameters
   * @returns Payment intent details including client secret for frontend confirmation
   * @throws Error if validation fails or Stripe API errors occur
   */
  async createPurchase(
    params: CreatePurchaseParams,
  ): Promise<CreatePurchaseResult> {
    const {
      organizationId,
      amount,
      paymentMethodId,
      confirmImmediately = false,
    } = params;

    // Validate amount
    this.validateAmount(amount);

    // Get organization
    const org = await organizationsRepository.findById(organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    // Ensure organization has a Stripe customer
    const customerId = await this.ensureStripeCustomer(org);

    // Create PaymentIntent
    try {
      const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
        amount: Math.round(amount * 100), // Convert to cents
        currency: STRIPE_CURRENCY,
        customer: customerId,
        metadata: {
          organization_id: organizationId,
          credits: amount.toFixed(2),
          type: "one_time_purchase",
        },
        description: `One-time balance top-up - $${amount.toFixed(2)}`,
        // Enable automatic payment methods for better UX
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "never", // Keep it simple for now
        },
      };

      // If payment method is provided, attach it and optionally confirm
      if (paymentMethodId) {
        paymentIntentParams.payment_method = paymentMethodId;
        if (confirmImmediately) {
          paymentIntentParams.confirm = true;
          paymentIntentParams.return_url = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`;
        }
      }

      const paymentIntent =
        await requireStripe().paymentIntents.create(paymentIntentParams);

      // CRITICAL: If payment succeeded immediately, add credits synchronously
      // This prevents race condition where client fetches balance before webhook fires
      // Webhook will still fire but will be deduplicated (already has duplicate check)
      if (paymentIntent.status === "succeeded") {
        logger.info(
          `[PurchasesService] Payment succeeded immediately, adding ${amount} credits synchronously for org ${organizationId}`,
        );

        await creditsService.addCredits({
          organizationId,
          amount,
          description: `One-time purchase - $${amount.toFixed(2)}`,
          metadata: {
            type: "one_time_purchase",
            payment_intent_id: paymentIntent.id,
          },
          stripePaymentIntentId: paymentIntent.id,
        });

        logger.info(
          `[PurchasesService] ✓ Credits added synchronously for payment ${paymentIntent.id}`,
        );

        // Create invoice record synchronously to prevent race condition
        // The invoice list will be empty if we wait for webhook to fire
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
            const stripeInvoice = await requireStripe().invoices.retrieve(invoiceId);

            await invoicesService.create({
              organization_id: organizationId,
              stripe_invoice_id: stripeInvoice.id,
              stripe_customer_id: stripeInvoice.customer as string,
              stripe_payment_intent_id: paymentIntent.id,
              amount_due: (stripeInvoice.amount_due / 100).toString(),
              amount_paid: (stripeInvoice.amount_paid / 100).toString(),
              currency: stripeInvoice.currency,
              status: stripeInvoice.status || "draft",
              invoice_type: "one_time_purchase",
              invoice_number: stripeInvoice.number || undefined,
              invoice_pdf: stripeInvoice.invoice_pdf || undefined,
              hosted_invoice_url: stripeInvoice.hosted_invoice_url || undefined,
              credits_added: amount.toString(),
              metadata: {
                type: "one_time_purchase",
              },
              paid_at: stripeInvoice.status_transitions?.paid_at
                ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
                : undefined,
            });

            logger.info(
              `[PurchasesService] ✓ Created invoice record for payment ${paymentIntent.id}`,
            );
          }
        } else {
          // No Stripe invoice, create a simple invoice record
          await invoicesService.create({
            organization_id: organizationId,
            stripe_invoice_id: `pi_${paymentIntent.id}`,
            stripe_customer_id: paymentIntent.customer as string,
            stripe_payment_intent_id: paymentIntent.id,
            amount_due: (paymentIntent.amount / 100).toString(),
            amount_paid: (paymentIntent.amount_received / 100).toString(),
            currency: paymentIntent.currency,
            status: "paid",
            invoice_type: "one_time_purchase",
            invoice_number: undefined,
            invoice_pdf: undefined,
            hosted_invoice_url: undefined,
            credits_added: amount.toString(),
            metadata: {
              type: "one_time_purchase",
            },
            paid_at: new Date(),
          });

          logger.info(
            `[PurchasesService] ✓ Created invoice record for direct payment ${paymentIntent.id}`,
          );
        }

        // Send purchase confirmation email
        this.sendPurchaseConfirmationEmail(
          organizationId,
          amount,
          paymentIntent.id,
          paymentMethodId,
        );
      }

      return {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        status: paymentIntent.status,
        amount: amount,
      };
    } catch (error) {
      logger.error("Failed to create payment intent:", error);

      if (error instanceof Error) {
        // Check for specific Stripe errors
        if (error.message.includes("customer")) {
          throw new Error(
            "Invalid customer information. Please contact support.",
          );
        }
        if (error.message.includes("payment_method")) {
          throw new Error(
            "Invalid payment method. Please try a different card.",
          );
        }
        throw new Error(`Payment setup failed: ${error.message}`);
      }

      throw new Error("Failed to setup payment. Please try again.");
    }
  }

  /**
   * Retrieve a PaymentIntent by ID
   * Used to check the status of a payment on the frontend
   *
   * @param paymentIntentId - The Stripe PaymentIntent ID
   * @param organizationId - The organization ID (for authorization)
   * @returns Payment intent object or null if not found or unauthorized
   */
  async getPaymentIntent(
    paymentIntentId: string,
    organizationId: string,
  ): Promise<Stripe.PaymentIntent | null> {
    const paymentIntent = await requireStripe().paymentIntents.retrieve(paymentIntentId);

    // Verify the payment intent belongs to this organization
    if (paymentIntent.metadata?.organization_id !== organizationId) {
      console.warn(
        `Unauthorized access attempt to payment intent ${paymentIntentId} by org ${organizationId}`,
      );
      return null;
    }

    return paymentIntent;
  }

  /**
   * Confirm a PaymentIntent with a payment method
   * Used when payment method is attached after PaymentIntent creation
   *
   * @param paymentIntentId - The Stripe PaymentIntent ID
   * @param paymentMethodId - The payment method to use
   * @param organizationId - The organization ID (for authorization)
   * @returns Updated payment intent
   * @throws Error if confirmation fails or unauthorized
   */
  async confirmPaymentIntent(
    paymentIntentId: string,
    paymentMethodId: string,
    organizationId: string,
  ): Promise<Stripe.PaymentIntent> {
    // First verify ownership
    const existingPaymentIntent = await this.getPaymentIntent(
      paymentIntentId,
      organizationId,
    );

    if (!existingPaymentIntent) {
      throw new Error("Payment intent not found or unauthorized");
    }

    try {
      const paymentIntent = await requireStripe().paymentIntents.confirm(
        paymentIntentId,
        {
          payment_method: paymentMethodId,
        },
      );

      return paymentIntent;
    } catch (error) {
      logger.error(
        `Failed to confirm payment intent ${paymentIntentId}:`,
        error,
      );

      if (error instanceof Error) {
        throw new Error(`Payment confirmation failed: ${error.message}`);
      }

      throw new Error("Failed to confirm payment. Please try again.");
    }
  }

  /**
   * Cancel a PaymentIntent
   * Used if user abandons the purchase flow
   *
   * @param paymentIntentId - The Stripe PaymentIntent ID
   * @param organizationId - The organization ID (for authorization)
   * @returns Cancelled payment intent or null if not found/unauthorized
   */
  async cancelPaymentIntent(
    paymentIntentId: string,
    organizationId: string,
  ): Promise<Stripe.PaymentIntent | null> {
    // First verify ownership
    const existingPaymentIntent = await this.getPaymentIntent(
      paymentIntentId,
      organizationId,
    );

    if (!existingPaymentIntent) {
      return null;
    }

    // Only cancel if it's cancellable
    if (
      existingPaymentIntent.status === "succeeded" ||
      existingPaymentIntent.status === "canceled"
    ) {
      return existingPaymentIntent;
    }

    const cancelledIntent = await requireStripe().paymentIntents.cancel(paymentIntentId);
    return cancelledIntent;
  }

  private async sendPurchaseConfirmationEmail(
    organizationId: string,
    amount: number,
    paymentIntentId: string,
    paymentMethodId?: string,
  ): Promise<void> {
    logger.info(
      `[PurchasesService] sendPurchaseConfirmationEmail START for org ${organizationId}`,
    );

    const org = await organizationsRepository.findById(organizationId);
    if (!org) {
      logger.error(
        `[PurchasesService] CRITICAL: Cannot send email - org ${organizationId} not found`,
      );
      return;
    }
    logger.info(`[PurchasesService] Organization found: ${org.name}`);

    logger.info(`[PurchasesService] Fetching users for org ${organizationId}`);
    const users = await usersRepository.listByOrganization(organizationId);
    logger.info(`[PurchasesService] Found ${users.length} users`);

    if (!users || users.length === 0) {
      logger.error(
        `[PurchasesService] CRITICAL: No users found for org ${organizationId} - EMAIL NOT SENT`,
      );
      return;
    }

    const userEmail = users[0].email;
    logger.info(`[PurchasesService] User email: ${userEmail || "NONE"}`);

    if (!userEmail) {
      logger.error(
        `[PurchasesService] CRITICAL: No email for user in org ${organizationId} - EMAIL NOT SENT`,
      );
      return;
    }

    let paymentMethodDisplay = "Card";
    if (paymentMethodId) {
      const paymentMethod =
        await requireStripe().paymentMethods.retrieve(paymentMethodId);
      if (paymentMethod.card) {
        paymentMethodDisplay = `${paymentMethod.card.brand} ••••${paymentMethod.card.last4}`;
      }
    }

    const currentBalance = Number(org.credit_balance);
    const previousBalance = currentBalance - amount;
    const transactionDate = new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://eliza.cloud";
    const dashboardUrl = `${appUrl}/dashboard/billing`;
    const invoiceUrl = `${appUrl}/dashboard/invoices/${paymentIntentId}`;

    const emailData = {
      email: userEmail,
      organizationName: org.name,
      purchaseAmount: amount,
      creditsAdded: amount,
      previousBalance,
      newBalance: currentBalance,
      paymentMethod: paymentMethodDisplay,
      transactionDate,
      invoiceNumber: paymentIntentId,
      invoiceUrl,
      dashboardUrl,
    };

    logger.info(
      `[PurchasesService] Calling emailService.sendPurchaseConfirmationEmail with:`,
    );
    logger.info(JSON.stringify(emailData, null, 2));

    await emailService.sendPurchaseConfirmationEmail(emailData);

    logger.info(
      `[PurchasesService] ✓ Purchase confirmation email sent to ${userEmail}`,
    );
  }
}

// Export singleton instance
export const purchasesService = new PurchasesService();
