/**
 * Stripe integration for payment processing.
 *
 * Uses lazy initialization to allow the app to build without
 * STRIPE_SECRET_KEY set. The error is thrown only when Stripe
 * methods are actually invoked at runtime.
 */

import Stripe from "stripe";

let stripeInstance: Stripe | null = null;
let stripeInitError: Error | null = null;

/**
 * Get the Stripe client instance (lazy initialization).
 * Returns null if STRIPE_SECRET_KEY is not configured.
 */
function initStripe(): Stripe | null {
  if (stripeInstance) return stripeInstance;
  if (stripeInitError) return null;

  if (!process.env.STRIPE_SECRET_KEY) {
    stripeInitError = new Error(
      "STRIPE_SECRET_KEY is not set in environment variables",
    );
    return null;
  }

  try {
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-11-17.clover",
      typescript: true,
    });
    return stripeInstance;
  } catch (error) {
    stripeInitError = error instanceof Error ? error : new Error(String(error));
    return null;
  }
}

/**
 * Get the Stripe client instance.
 * Throws an error if STRIPE_SECRET_KEY is not configured.
 */
export function getStripe(): Stripe {
  const instance = initStripe();
  if (!instance) {
    throw (
      stripeInitError ||
      new Error("STRIPE_SECRET_KEY is not set in environment variables")
    );
  }
  return instance;
}

/**
 * Stripe client instance configured with the secret key.
 * Uses a Proxy for fully lazy initialization - only throws
 * when methods are actually called, not during module load or build.
 */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(target, prop, receiver) {
    // Return undefined for symbol properties (used by bundlers/debuggers)
    if (typeof prop === "symbol") {
      return undefined;
    }
    // Return a function that throws for any property access
    // This defers the error until the method is actually called
    const instance = initStripe();
    if (!instance) {
      // Return a proxy that throws when invoked
      return new Proxy(() => {}, {
        get() {
          throw (
            stripeInitError ||
            new Error("STRIPE_SECRET_KEY is not set in environment variables")
          );
        },
        apply() {
          throw (
            stripeInitError ||
            new Error("STRIPE_SECRET_KEY is not set in environment variables")
          );
        },
      });
    }
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});

/**
 * Check if Stripe is configured (has secret key).
 */
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * Default currency for Stripe transactions.
 */
export const STRIPE_CURRENCY = "usd";
