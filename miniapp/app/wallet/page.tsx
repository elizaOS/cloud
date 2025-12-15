"use client";

import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  Loader2,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { fetchApi } from "@/lib/cloud-api";
import { useAuth } from "@/lib/use-auth";

interface RedemptionBalance {
  summary: {
    totalEarned: number;
    totalPending: number;
    totalWithdrawable: number;
    totalRedeemed: number;
    totalAvailableToRedeem: number;
  };
  apps: Array<{
    appId: string;
    appName: string;
    totalEarned: number;
    pendingBalance: number;
    withdrawableBalance: number;
    totalRedeemed: number;
    canRedeem: boolean;
    vestingEndsAt?: string;
  }>;
  limits: {
    minRedemptionUsd: number;
    maxSingleRedemptionUsd: number;
    userDailyLimitUsd: number;
    userHourlyLimitUsd: number;
    vestingPeriodDays: number;
  };
  eligibility: {
    canRedeem: boolean;
    reason?: string;
    cooldownEndsAt?: string;
    dailyLimitRemaining?: number;
  };
}

interface Redemption {
  id: string;
  pointsAmount: number;
  usdValue: number;
  elizaAmount: number;
  elizaPriceUsd: number;
  network: string;
  payoutAddress: string;
  status: string;
  txHash?: string;
  createdAt: string;
  completedAt?: string;
  failureReason?: string;
}

interface Quote {
  network: string;
  tokenAddress: string;
  pointsAmount: number;
  usdValue: number;
  twapPriceUsd: number;
  elizaAmount: number;
  safetySpreadPercent: number;
  tokensAvailable: boolean;
  validUntil: string;
  requiresDelay: boolean;
  limits: {
    minRedemptionUsd: number;
    maxRedemptionUsd: number;
  };
}

const NETWORKS = [
  { id: "base", name: "Base", icon: "🔵" },
  { id: "ethereum", name: "Ethereum", icon: "⟠" },
  { id: "bnb", name: "BNB Chain", icon: "🟡" },
  { id: "solana", name: "Solana", icon: "◎" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "text-yellow-400 bg-yellow-500/10",
  approved: "text-blue-400 bg-blue-500/10",
  processing: "text-blue-400 bg-blue-500/10",
  completed: "text-emerald-400 bg-emerald-500/10",
  failed: "text-red-400 bg-red-500/10",
  rejected: "text-red-400 bg-red-500/10",
};

function formatAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatNumber(n: number, decimals = 2): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function WalletPage() {
  const router = useRouter();
  const { ready, authenticated } = useAuth();

  // State
  const [balance, setBalance] = useState<RedemptionBalance | null>(null);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redemption form state
  const [showRedeemForm, setShowRedeemForm] = useState(false);
  const [selectedApp, setSelectedApp] = useState<string>("");
  const [selectedNetwork, setSelectedNetwork] = useState<string>("base");
  const [payoutAddress, setPayoutAddress] = useState("");
  const [pointsAmount, setPointsAmount] = useState<number>(0);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [balanceRes, redemptionsRes] = await Promise.all([
      fetchApi<RedemptionBalance & { success: boolean; error?: string }>(
        "/api/v1/redemptions/balance",
      ),
      fetchApi<{
        success: boolean;
        redemptions?: Redemption[];
        error?: string;
      }>("/api/v1/redemptions?limit=10"),
    ]);

    if (balanceRes.success) {
      setBalance(balanceRes);
    } else {
      setError(balanceRes.error || "Failed to load balance");
    }

    if (redemptionsRes.success) {
      setRedemptions(redemptionsRes.redemptions || []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (authenticated) {
      // Defer to avoid cascading renders
      queueMicrotask(() => {
        fetchData();
      });
    }
  }, [authenticated, fetchData]);

  // Fetch quote when params change
  const fetchQuote = useCallback(async () => {
    if (!selectedNetwork || pointsAmount < 100) {
      setQuote(null);
      return;
    }

    setQuoteLoading(true);
    const res = await fetchApi<{
      success: boolean;
      quote?: Quote;
      error?: string;
    }>(
      `/api/v1/redemptions/quote?network=${selectedNetwork}&pointsAmount=${pointsAmount}`,
    );

    if (res.success && res.quote) {
      setQuote(res.quote);
    } else {
      setQuote(null);
      if (res.error) {
        setRedeemError(res.error);
      }
    }
    setQuoteLoading(false);
  }, [selectedNetwork, pointsAmount]);

  useEffect(() => {
    const timer = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timer);
  }, [fetchQuote]);

  // Handle redemption
  const handleRedeem = async () => {
    if (!selectedApp || !payoutAddress || !pointsAmount || !quote) {
      setRedeemError("Please fill in all fields");
      return;
    }

    setRedeemLoading(true);
    setRedeemError(null);

    const res = await fetchApi<{ success: boolean; error?: string }>(
      "/api/v1/redemptions",
      {
        method: "POST",
        body: JSON.stringify({
          appId: selectedApp,
          pointsAmount,
          network: selectedNetwork,
          payoutAddress,
        }),
      },
    );

    if (res.success) {
      setRedeemSuccess(true);
      setShowRedeemForm(false);
      fetchData();
    } else {
      setRedeemError(res.error || "Redemption failed");
    }

    setRedeemLoading(false);
  };

  if (!ready || !authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="text-brand h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#0a0512] to-black">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <Link
            href="/settings"
            className="rounded-full p-2 transition-colors hover:bg-white/5"
          >
            <ArrowLeft className="h-5 w-5 text-white/60" />
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Wallet className="text-brand h-6 w-6" />
            Wallet & Earnings
          </h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="text-brand h-8 w-8 animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
            <AlertCircle className="mx-auto mb-2 h-8 w-8 text-red-400" />
            <p className="text-red-400">{error}</p>
          </div>
        ) : balance ? (
          <>
            {/* Balance Overview */}
            <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-6">
              <div className="mb-6 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-white/40">Available to Redeem</p>
                  <p className="text-3xl font-bold text-emerald-400">
                    ${formatNumber(balance.summary.totalWithdrawable)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-white/40">Pending (Vesting)</p>
                  <p className="text-2xl font-semibold text-yellow-400">
                    ${formatNumber(balance.summary.totalPending)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-white/40">Total Earned: </span>
                  <span className="text-white">
                    ${formatNumber(balance.summary.totalEarned)}
                  </span>
                </div>
                <div>
                  <span className="text-white/40">Total Redeemed: </span>
                  <span className="text-white">
                    ${formatNumber(balance.summary.totalRedeemed)}
                  </span>
                </div>
              </div>

              {/* Eligibility Status */}
              <div className="mt-4 border-t border-white/10 pt-4">
                {balance.eligibility.canRedeem ? (
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-sm">Ready to redeem</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-yellow-400">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm">
                      {balance.eligibility.reason}
                    </span>
                  </div>
                )}
              </div>

              {/* Redeem Button */}
              <button
                onClick={() => setShowRedeemForm(true)}
                disabled={!balance.eligibility.canRedeem}
                className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium transition-all ${
                  balance.eligibility.canRedeem
                    ? "bg-brand hover:bg-brand-600 text-white"
                    : "cursor-not-allowed bg-white/10 text-white/40"
                }`}
              >
                <ArrowUpRight className="h-4 w-4" />
                Redeem to elizaOS Tokens
              </button>
            </div>

            {/* Info Box */}
            <div className="mb-6 rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
              <div className="flex gap-3">
                <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-400" />
                <div className="text-sm text-blue-200">
                  <p className="mb-1 font-medium">How Redemption Works</p>
                  <ul className="space-y-1 text-blue-300/80">
                    <li>• 1 point = $0.01 USD value</li>
                    <li>
                      • Points convert to elizaOS tokens at current TWAP price
                    </li>
                    <li>
                      • Earned points vest for{" "}
                      {balance.limits.vestingPeriodDays} days before redemption
                    </li>
                    <li>
                      • Min: ${balance.limits.minRedemptionUsd}, Max: $
                      {balance.limits.maxSingleRedemptionUsd}
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* App Balances */}
            {balance.apps.length > 0 && (
              <div className="mb-6">
                <h2 className="mb-3 text-lg font-semibold text-white">
                  Earnings by App
                </h2>
                <div className="space-y-2">
                  {balance.apps.map((app) => (
                    <div
                      key={app.appId}
                      className="rounded-lg border border-white/10 bg-white/5 p-4"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-medium text-white">
                          {app.appName}
                        </span>
                        <span className="font-semibold text-emerald-400">
                          ${formatNumber(app.withdrawableBalance)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-white/40">
                        <span>
                          Pending: ${formatNumber(app.pendingBalance)}
                        </span>
                        <span>Earned: ${formatNumber(app.totalEarned)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Redemptions */}
            {redemptions.length > 0 && (
              <div>
                <h2 className="mb-3 text-lg font-semibold text-white">
                  Recent Redemptions
                </h2>
                <div className="space-y-2">
                  {redemptions.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-lg border border-white/10 bg-white/5 p-4"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status]}`}
                          >
                            {r.status}
                          </span>
                          <span className="font-medium text-white">
                            ${formatNumber(r.usdValue)} →{" "}
                            {formatNumber(r.elizaAmount, 4)} ELIZA
                          </span>
                        </div>
                        <span className="text-xs text-white/40">
                          {new Date(r.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-white/40">
                        <span>
                          {r.network} • {formatAddress(r.payoutAddress)}
                        </span>
                        {r.txHash && (
                          <a
                            href={`https://basescan.org/tx/${r.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand hover:text-brand-400 flex items-center gap-1"
                          >
                            View TX <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}

        {/* Redemption Modal */}
        {showRedeemForm && balance && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0512] p-6">
              <h2 className="mb-6 text-xl font-bold text-white">
                Redeem Points to elizaOS
              </h2>

              {redeemSuccess ? (
                <div className="py-8 text-center">
                  <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-400" />
                  <p className="mb-2 font-medium text-white">
                    Redemption Submitted!
                  </p>
                  <p className="mb-4 text-sm text-white/60">
                    Your tokens will be sent within 24 hours.
                  </p>
                  <button
                    onClick={() => {
                      setShowRedeemForm(false);
                      setRedeemSuccess(false);
                    }}
                    className="bg-brand rounded-lg px-6 py-2 font-medium text-white"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <>
                  {/* App Selection */}
                  <div className="mb-4">
                    <label className="mb-2 block text-sm text-white/60">
                      Select App
                    </label>
                    <select
                      value={selectedApp}
                      onChange={(e) => setSelectedApp(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
                    >
                      <option value="">Choose an app...</option>
                      {balance.apps
                        .filter((a) => a.canRedeem)
                        .map((app) => (
                          <option key={app.appId} value={app.appId}>
                            {app.appName} ($
                            {formatNumber(app.withdrawableBalance)})
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Network Selection */}
                  <div className="mb-4">
                    <label className="mb-2 block text-sm text-white/60">
                      Network
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {NETWORKS.map((net) => (
                        <button
                          key={net.id}
                          onClick={() => setSelectedNetwork(net.id)}
                          className={`flex items-center gap-2 rounded-lg border px-4 py-3 transition-all ${
                            selectedNetwork === net.id
                              ? "border-brand bg-brand/10 text-white"
                              : "border-white/10 bg-white/5 text-white/60 hover:border-white/20"
                          }`}
                        >
                          <span>{net.icon}</span>
                          <span>{net.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="mb-4">
                    <label className="mb-2 block text-sm text-white/60">
                      Points to Redeem
                    </label>
                    <input
                      type="number"
                      value={pointsAmount || ""}
                      onChange={(e) =>
                        setPointsAmount(parseInt(e.target.value) || 0)
                      }
                      min={100}
                      max={100000}
                      placeholder="Min 100 ($1.00)"
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white"
                    />
                    <p className="mt-1 text-xs text-white/40">
                      = ${(pointsAmount / 100).toFixed(2)} USD value
                    </p>
                  </div>

                  {/* Payout Address */}
                  <div className="mb-4">
                    <label className="mb-2 block text-sm text-white/60">
                      {selectedNetwork === "solana" ? "Solana" : "EVM"} Wallet
                      Address
                    </label>
                    <input
                      type="text"
                      value={payoutAddress}
                      onChange={(e) => setPayoutAddress(e.target.value)}
                      placeholder={
                        selectedNetwork === "solana"
                          ? "Your Phantom address..."
                          : "0x..."
                      }
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white"
                    />
                    <p className="mt-1 text-xs text-yellow-400">
                      ⚠️ Use a personal wallet (MetaMask, Phantom). Exchange
                      addresses may lose funds.
                    </p>
                  </div>

                  {/* Quote */}
                  {quoteLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="text-brand h-5 w-5 animate-spin" />
                    </div>
                  ) : quote ? (
                    <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-white/60">
                          You&apos;ll receive
                        </span>
                        <span className="text-xl font-bold text-emerald-400">
                          {formatNumber(quote.elizaAmount, 4)} ELIZA
                        </span>
                      </div>
                      <div className="space-y-1 text-xs text-white/40">
                        <div>
                          TWAP Price: ${formatNumber(quote.twapPriceUsd, 6)}
                        </div>
                        <div>Safety spread: {quote.safetySpreadPercent}%</div>
                        <div>
                          Valid until:{" "}
                          {new Date(quote.validUntil).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Error */}
                  {redeemError && (
                    <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                      {redeemError}
                    </div>
                  )}

                  {/* Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowRedeemForm(false)}
                      className="flex-1 rounded-lg border border-white/10 px-4 py-3 text-white/60 hover:bg-white/5"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRedeem}
                      disabled={
                        redeemLoading ||
                        !quote ||
                        !selectedApp ||
                        !payoutAddress
                      }
                      className="bg-brand hover:bg-brand-600 flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {redeemLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <ArrowUpRight className="h-4 w-4" />
                          Redeem
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
