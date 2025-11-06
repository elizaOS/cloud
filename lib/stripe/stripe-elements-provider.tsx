"use client";

import { Elements } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useMemo } from "react";

const getStripe = () => {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    console.error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set");
    return null;
  }
  return loadStripe(publishableKey);
};

interface StripeElementsProviderProps {
  children: React.ReactNode;
}

export function StripeElementsProvider({
  children,
}: StripeElementsProviderProps) {
  const stripePromise = useMemo(() => getStripe(), []);

  if (!stripePromise) {
    return <>{children}</>;
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        appearance: {
          theme: "night",
          variables: {
            colorPrimary: "#FF5800",
            colorBackground: "#1d1d1d",
            colorText: "#e1e1e1",
            colorDanger: "#dc2626",
            fontFamily: "monospace",
            borderRadius: "0px",
          },
        },
      }}
    >
      {children}
    </Elements>
  );
}
