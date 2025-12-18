/**
 * Stripe integration for payment processing.
 *
 * Uses lazy initialization to allow the app to build without
 * STRIPE_SECRET_KEY set. The error is thrown only when Stripe
 * methods are actually invoked at runtime.
 *
 * @example
 * // RECOMMENDED: Check configuration before using stripe
 * import { stripe, isStripeConfigured } from "@/lib/stripe";
 *
 * if (!isStripeConfigured()) {
 *   return { error: "Payment processing is not configured" };
 * }
 * const customer = await stripe.customers.create({ email });
 *
 * @example
 * // Alternative: Use getStripe() for explicit error handling
 * import { getStripe, isStripeConfigured } from "@/lib/stripe";
 *
 * try {
 *   const stripe = getStripe();
 *   await stripe.customers.create({ email });
 * } catch (error) {
 *   // Handle missing configuration
 * }
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

function createDeferredErrorProxy(): unknown {
  return new Proxy(() => {}, {
    get() {
      return createDeferredErrorProxy();
    },
    apply() {
      throw (
        stripeInitError ||
        new Error("STRIPE_SECRET_KEY is not set in environment variables")
      );
    },
  });
}

/**
 * Lazy-initialized Stripe client proxy.
 *
 * @warning This is a Proxy object, NOT a real Stripe instance at build time.
 * TypeScript shows this as `Stripe`, but methods will throw at runtime if
 * STRIPE_SECRET_KEY is not configured. Always check `isStripeConfigured()`
 * before using this export in code paths where Stripe may not be set up.
 *
 * @throws {Error} When any method is invoked without STRIPE_SECRET_KEY configured
 */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(target, prop, receiver) {
    if (typeof prop === "symbol") {
      return undefined;
    }
    const instance = initStripe();
    if (!instance) {
      return createDeferredErrorProxy();
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
