import { stripe, STRIPE_CURRENCY } from "@/lib/stripe";
import { organizationsRepository, type Organization } from "@/db/repositories";
import type Stripe from "stripe";

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
      const customer = await stripe.customers.create({
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
      console.error("Failed to create Stripe customer:", error);
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

      const paymentIntent = await stripe.paymentIntents.create(
        paymentIntentParams,
      );

      return {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        status: paymentIntent.status,
        amount: amount,
      };
    } catch (error) {
      console.error("Failed to create payment intent:", error);

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
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId,
      );

      // Verify the payment intent belongs to this organization
      if (paymentIntent.metadata?.organization_id !== organizationId) {
        console.warn(
          `Unauthorized access attempt to payment intent ${paymentIntentId} by org ${organizationId}`,
        );
        return null;
      }

      return paymentIntent;
    } catch (error) {
      console.error(
        `Failed to retrieve payment intent ${paymentIntentId}:`,
        error,
      );
      return null;
    }
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
      const paymentIntent = await stripe.paymentIntents.confirm(
        paymentIntentId,
        {
          payment_method: paymentMethodId,
        },
      );

      return paymentIntent;
    } catch (error) {
      console.error(
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

    try {
      const cancelledIntent = await stripe.paymentIntents.cancel(
        paymentIntentId,
      );
      return cancelledIntent;
    } catch (error) {
      console.error(`Failed to cancel payment intent ${paymentIntentId}:`, error);
      return null;
    }
  }
}

// Export singleton instance
export const purchasesService = new PurchasesService();
