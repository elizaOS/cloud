/**
 * Stripe integration for payment processing.
 */

import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

/**
 * Get the Stripe client instance (lazy initialization).
 * Throws at runtime if STRIPE_SECRET_KEY is not configured.
 */
function getStripeClient(): Stripe {
  if (stripeInstance) {
    return stripeInstance;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
  }

  stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-11-17.clover",
    typescript: true,
  });

  return stripeInstance;
}

/**
 * Stripe client instance configured with the secret key.
 * Lazily initialized to avoid build-time errors when env var is not set.
 */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const client = getStripeClient();
    const value = client[prop as keyof Stripe];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

/**
 * Check if Stripe is configured.
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Default currency for Stripe transactions.
 */
export const STRIPE_CURRENCY = "usd";
