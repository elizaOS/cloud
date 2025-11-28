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
    console.log('[BillingClient] 🛒 handlePurchase called with creditPackId:', creditPackId);
    try {
      setLoading(creditPackId);

      console.log('[BillingClient] 📤 Sending request to /api/stripe/create-checkout-session');
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ creditPackId }),
      });

      console.log('[BillingClient] 📥 Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[BillingClient] ❌ Error response:', errorData);
        throw new Error(errorData.error || "Failed to create checkout session");
      }

      const data = await response.json();
      console.log('[BillingClient] ✅ Response data:', data);
      const { url } = data;

      if (!url) {
        throw new Error("No checkout URL returned");
      }

      console.log('[BillingClient] 🔗 Redirecting to:', url);
      window.location.href = url;
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
              Available balance in your account
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">
              ${Number(currentCredits).toFixed(2)}
            </div>
            <div className="text-sm text-muted-foreground">USD</div>
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
