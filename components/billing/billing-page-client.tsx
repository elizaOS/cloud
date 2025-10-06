"use client";

import { useState } from "react";
import { CreditPackCard } from "./credit-pack-card";
import { toast } from "sonner";
import { loadStripe } from "@stripe/stripe-js";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
);

interface CreditPack {
  id: string;
  name: string;
  description: string | null;
  credits: number;
  price_cents: number;
  stripe_price_id: string;
  is_active: boolean;
  sort_order: number;
}

interface BillingPageClientProps {
  creditPacks: CreditPack[];
  currentCredits: number;
}

export function BillingPageClient({
  creditPacks,
  currentCredits,
}: BillingPageClientProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handlePurchase = async (creditPackId: string) => {
    try {
      setLoading(creditPackId);

      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ creditPackId }),
      });

      if (!response.ok) {
        throw new Error("Failed to create checkout session");
      }

      const { sessionId } = await response.json();

      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error("Stripe failed to load");
      }

      const { error } = await stripe.redirectToCheckout({ sessionId });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error("Purchase error:", error);
      toast.error("Failed to initiate purchase. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  // Determine which pack is popular (middle one)
  const middleIndex = Math.floor(creditPacks.length / 2);

  return (
    <div className="space-y-8">
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Current Balance</h3>
            <p className="text-sm text-muted-foreground">
              Available credits in your account
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">
              {currentCredits.toLocaleString()}
            </div>
            <div className="text-sm text-muted-foreground">credits</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {creditPacks.map((pack, index) => (
          <CreditPackCard
            key={pack.id}
            id={pack.id}
            name={pack.name}
            description={pack.description}
            credits={pack.credits}
            priceCents={pack.price_cents}
            isPopular={index === middleIndex}
            onPurchase={handlePurchase}
            loading={loading === pack.id}
          />
        ))}
      </div>
    </div>
  );
}
