"use client";

import {
  AlertCircle,
  Coins,
  Loader2,
  Mail,
  Plus,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { AppBilling,Billing, CreditPack } from "@/lib/cloud-api";
import {
  createCheckoutSession,
  getBilling,
  getCreditPacks,
} from "@/lib/cloud-api";
import { useAuth } from "@/lib/use-auth";

// Helper to convert dollars to credits (1 credit = $0.01)
function dollarsToCredits(dollars: string | number): number {
  const amount = typeof dollars === "string" ? parseFloat(dollars) : dollars;
  return Math.round(amount * 100);
}

export default function SettingsPage() {
  const router = useRouter();
  const { ready, authenticated, user, logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [appBilling, setAppBilling] = useState<AppBilling | null>(null);

  // Credit packs modal state
  const [showCreditPacks, setShowCreditPacks] = useState(false);
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [loadingPacks, setLoadingPacks] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [customCredits, setCustomCredits] = useState("");

  // Redirect to home if not authenticated
  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const billingData = await getBilling();
    setBilling(billingData.billing);
    setAppBilling(billingData.appBilling || null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authenticated) {
      // Defer fetch to avoid cascading renders
      queueMicrotask(() => {
        fetchData();
      });
    }
  }, [authenticated, fetchData]);

  // Fetch credit packs when modal opens
  const handleOpenCreditPacks = useCallback(async () => {
    setShowCreditPacks(true);
    if (creditPacks.length === 0) {
      setLoadingPacks(true);
      const packs = await getCreditPacks();
      setCreditPacks(packs);
      setLoadingPacks(false);
    }
  }, [creditPacks.length]);

  // Handle checkout - convert credits to dollars for API
  const handleCheckout = useCallback(
    async (packId?: string, credits?: number) => {
      const loadingId = packId || "custom";
      setCheckoutLoading(loadingId);
      // Convert credits to dollars for the API (1 credit = $0.01)
      const amount = credits ? credits / 100 : undefined;
      const { url } = await createCheckoutSession({
        creditPackId: packId,
        amount: amount,
        successUrl: `${window.location.origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}/settings?canceled=true`,
      });

      if (url) {
        window.location.href = url;
      }
      setCheckoutLoading(null);
    },
    []
  );

  const handleCustomCreditsCheckout = useCallback(() => {
    const credits = parseInt(customCredits, 10);
    // Minimum 500 credits ($5), maximum 100,000 credits ($1000)
    if (isNaN(credits) || credits < 500 || credits > 100000) {
      setError("Please enter credits between 500 and 100,000");
      return;
    }
    handleCheckout(undefined, credits);
  }, [customCredits, handleCheckout]);

  if (!ready || !authenticated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
      </div>
    );
  }

  const displayEmail = user?.email || null;
  const displayName = user?.name || null;

  // Convert dollar values to credits for display
  // Use app-specific credits if monetization is enabled, otherwise org credits
  let creditBalance = 0;
  if (appBilling?.monetizationEnabled && appBilling.creditBalance !== undefined) {
    creditBalance = dollarsToCredits(appBilling.creditBalance);
  } else if (billing) {
    creditBalance = dollarsToCredits(billing.creditBalance);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Account Section */}
      <section className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-medium text-white">
          <User className="h-5 w-5 text-brand-400" />
          Account
        </h2>
        <div className="space-y-4 rounded-lg border border-white/10 bg-white/5 p-4">
          {displayName && (
            <div className="flex items-center gap-3">
              <User className="h-4 w-4 text-white/40" />
              <p className="text-sm text-white">{displayName}</p>
            </div>
          )}
          {displayEmail && (
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-white/40" />
              <p className="text-sm text-white">{displayEmail}</p>
            </div>
          )}
          <button
            onClick={logout}
            className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400 hover:bg-red-500/20"
          >
            Sign Out
          </button>
        </div>
      </section>

      {/* Credits Section */}
      <section className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-medium text-white">
          <Coins className="h-5 w-5 text-brand-400" />
          Credits
        </h2>

        {loading ? (
          <div className="flex items-center justify-center rounded-lg border border-white/10 bg-white/5 py-8">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
          </div>
        ) : billing ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            {/* Credit Balance with Add Button */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-white">
                  {creditBalance.toLocaleString()}
                </p>
                <p className="text-sm text-white/40">credits</p>
              </div>
              <button
                onClick={handleOpenCreditPacks}
                className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
              >
                <Plus className="h-4 w-4" />
                Add Credits
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-center text-sm text-white/60">
            Unable to load credits
          </div>
        )}
      </section>

      {/* Credit Packs Modal */}
      {showCreditPacks && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowCreditPacks(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/10 bg-[#0a0612] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">Add Credits</h3>
              <button
                onClick={() => setShowCreditPacks(false)}
                className="text-white/60 hover:text-white"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {loadingPacks ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-brand" />
              </div>
            ) : (
              <>
                {/* Credit Packs */}
                <div className="mb-6 space-y-3">
                  {creditPacks.map((pack) => {
                    const packCredits = dollarsToCredits(pack.credits);
                    const bonusCredits = pack.bonusCredits
                      ? dollarsToCredits(pack.bonusCredits)
                      : 0;
                    return (
                      <button
                        key={pack.id}
                        onClick={() => handleCheckout(pack.id)}
                        disabled={checkoutLoading !== null}
                        className={`relative w-full rounded-lg border p-4 text-left transition ${
                          pack.isPopular
                            ? "border-brand/50 bg-brand/10"
                            : "border-white/10 bg-white/5 hover:border-white/20"
                        } ${checkoutLoading !== null ? "opacity-50" : ""}`}
                      >
                        {pack.isPopular && (
                          <span className="absolute -top-2 right-3 flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-white">
                            <Sparkles className="h-3 w-3" /> Popular
                          </span>
                        )}
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-white">{pack.name}</p>
                            {pack.description && (
                              <p className="text-xs text-white/60">
                                {pack.description}
                              </p>
                            )}
                            <p className="mt-1 text-lg font-bold text-brand-400">
                              {packCredits.toLocaleString()} credits
                            </p>
                            {bonusCredits > 0 && (
                              <p className="text-xs text-green-400">
                                +{bonusCredits.toLocaleString()} bonus credits
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-white">
                              ${parseFloat(pack.price).toFixed(2)}
                            </p>
                            {checkoutLoading === pack.id && (
                              <Loader2 className="mt-1 h-4 w-4 animate-spin text-brand-400" />
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Amount */}
                <div className="border-t border-white/10 pt-4">
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={customCredits}
                        onChange={(e) => setCustomCredits(e.target.value)}
                        placeholder="500 - 100,000"
                        min="500"
                        max="100000"
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white placeholder:text-white/30 focus:border-brand focus:outline-none"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40">
                        credits
                      </span>
                    </div>
                    <button
                      onClick={handleCustomCreditsCheckout}
                      disabled={checkoutLoading !== null || !customCredits}
                      className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                    >
                      {checkoutLoading === "custom" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      Add
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-white/40">
                    Min 500, max 100,000
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
