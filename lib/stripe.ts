/**
 * Stripe integration for payment processing with lazy initialization.
 * Allows builds to succeed without STRIPE_SECRET_KEY, with runtime checks.
 */

import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

/**
 * Lazily initializes and returns the Stripe client instance.
 * Throws an error if STRIPE_SECRET_KEY is not configured.
 *
 * @returns Stripe client instance.
 * @throws Error if STRIPE_SECRET_KEY is not set.
 */
function getStripe(): Stripe {
  if (!stripeInstance) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error(
        "STRIPE_SECRET_KEY is not set in environment variables. " +
          "Please configure Stripe to use payment features."
      );
    }
    stripeInstance = new Stripe(secretKey, {
      apiVersion: "2025-11-17.clover",
      typescript: true,
    });
  }
  return stripeInstance;
}

/**
 * Get a type-safe Stripe client instance.
 * This is the RECOMMENDED way to access Stripe - it throws early if not configured.
 *
 * @example
 * ```typescript
 * const stripe = requireStripe();
 * const session = await stripe.checkout.sessions.create({...});
 * ```
 *
 * @returns Stripe client instance.
 * @throws Error if STRIPE_SECRET_KEY is not configured.
 */
export function requireStripe(): Stripe {
  return getStripe();
}

/**
 * Check if Stripe is configured without throwing an error.
 * Useful for conditional feature enablement.
 *
 * @example
 * ```typescript
 * if (isStripeConfigured()) {
 *   // Show payment UI
 * } else {
 *   // Show "payment not configured" message
 * }
 * ```
 *
 * @returns True if Stripe is configured, false otherwise.
 */
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * TypeScript assertion function that narrows the type after checking Stripe configuration.
 * Useful when you need to ensure Stripe is configured before proceeding.
 *
 * @example
 * ```typescript
 * function processPayment() {
 *   assertStripeConfigured();
 *   // TypeScript now knows Stripe is configured
 *   const stripe = requireStripe();
 * }
 * ```
 *
 * @throws Error if Stripe is not configured.
 */
export function assertStripeConfigured(): asserts process is {
  env: { STRIPE_SECRET_KEY: string };
} {
  if (!isStripeConfigured()) {
    throw new Error(
      "Stripe is not configured. Please set STRIPE_SECRET_KEY environment variable."
    );
  }
}

/**
 * Default currency for Stripe transactions.
 */
export const STRIPE_CURRENCY = "usd";
