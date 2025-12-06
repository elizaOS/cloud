/**
 * Billing page client component for purchasing credit packs.
 * Displays available credit packs and handles Stripe checkout session creation.
 *
 * @param props - Billing page configuration
 * @param props.creditPacks - Array of available credit packs
 * @param props.currentCredits - User's current credit balance
 */

"use client";

import { useState } from "react";
import { CreditPackCard } from "./credit-pack-card";
import { toast } from "sonner";

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

    const { url } = await response.json();

    if (!url) {
      throw new Error("No checkout URL returned");
    }

    window.location.href = url;
    setLoading(null);
  };

  // Determine which pack is popular (middle one)
  const middleIndex = Math.floor(creditPacks.length / 2);

  return (
    <div className="space-y-8">
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Balance</h3>
          <div className="text-3xl font-bold">
            ${Number(currentCredits).toFixed(2)}
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
