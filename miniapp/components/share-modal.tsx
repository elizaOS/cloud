"use client";

import {
  Check,
  CheckCircle2,
  Copy,
  Gift,
  Loader2,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { siteConfig } from "@/app/config";
import {
  claimShareReward,
  getReferralInfo,
  getRewardsStatus,
} from "@/lib/cloud-api";

// Platform icons as simple components
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function FarcasterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.24 20.772h-.856V11.58H6.616v9.192H5.76V3.228h12.48v17.544zM3.264 5.316V3.228H1.2v2.088h2.064zm17.472 0V3.228H22.8v2.088h-2.064zM1.2 7.404v2.088h2.064V7.404H1.2zm19.536 0v2.088H22.8V7.404h-2.064z" />
    </svg>
  );
}

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareContent?: {
    title: string;
    text: string;
    url: string;
  };
}

/**
 * Hook to fetch and cache share/rewards status.
 * Can be used by other components to check if user has claimed shares today.
 */
export function useShareStatus() {
  const [shareStatus, setShareStatus] = useState<{
    x: { claimed: boolean; amount: number };
    farcaster: { claimed: boolean; amount: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatus() {
      const rewardsStatus = await getRewardsStatus();
      setShareStatus({
        x: rewardsStatus.sharing.status.x,
        farcaster: rewardsStatus.sharing.status.farcaster,
      });
      setLoading(false);
    }
    fetchStatus();
  }, []);

  // While loading, use undefined to avoid showing wrong values
  const allClaimedToday = loading
    ? undefined
    : shareStatus?.x.claimed && shareStatus?.farcaster.claimed;
  const anyClaimedToday = loading
    ? undefined
    : shareStatus?.x.claimed || shareStatus?.farcaster.claimed;
  const availableToday = loading
    ? 50 // Show reasonable default while loading (50 credits)
    : (shareStatus?.x.claimed ? 0 : (shareStatus?.x.amount || 0) * 100) +
      (shareStatus?.farcaster.claimed
        ? 0
        : (shareStatus?.farcaster.amount || 0) * 100);

  return {
    shareStatus,
    loading,
    allClaimedToday,
    anyClaimedToday,
    availableToday,
  };
}

export function ShareModal({ isOpen, onClose, shareContent }: ShareModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [shareStatus, setShareStatus] = useState<{
    x: { claimed: boolean; amount: number };
    farcaster: { claimed: boolean; amount: number };
  } | null>(null);
  const [stats, setStats] = useState<{
    totalReferrals: number;
    totalEarnings: number;
  } | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [referralInfo, rewardsStatus] = await Promise.all([
      getReferralInfo(),
      getRewardsStatus(),
    ]);

    setReferralCode(referralInfo.code);
    setShareUrl(referralInfo.shareUrl);
    setShareStatus({
      x: rewardsStatus.sharing.status.x,
      farcaster: rewardsStatus.sharing.status.farcaster,
    });
    setStats({
      totalReferrals: referralInfo.stats.totalReferrals,
      totalEarnings: referralInfo.stats.totalEarnings,
    });
    setLoading(false);
  }, []);

  // Load data when modal opens
  useEffect(() => {
    if (isOpen) {
      // Defer fetch to avoid cascading renders
      queueMicrotask(() => {
        loadData();
      });
    }
  }, [isOpen, loadData]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const copyCode = async () => {
    if (!referralCode) return;
    await navigator.clipboard.writeText(referralCode);
    setCopied(true);
    toast.success("Referral code copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const copyLink = useCallback(async () => {
    await navigator.clipboard.writeText(shareUrl);
    setLinkCopied(true);
    toast.success("Share link copied to clipboard!");
    setTimeout(() => setLinkCopied(false), 2500);
  }, [shareUrl]);

  const shareOnX = async () => {
    // Prevent double clicks and already claimed shares
    if (shareStatus?.x.claimed || claiming === "x") {
      return;
    }

    const text = shareContent?.text || siteConfig.sharing.defaultText;
    const url = shareContent?.url || shareUrl;

    // Claim reward immediately (server-side tracking)
    setClaiming("x");
    const result = await claimShareReward("x", "app_share", url);
    if (result.success) {
      toast.success(
        `🎉 +${Math.round((result.amount || 0) * 100)} credits earned!`,
        {
          description: "Thanks for sharing on X!",
        },
      );
      setShareStatus((prev) =>
        prev ? { ...prev, x: { ...prev.x, claimed: true } } : null,
      );
      // Open share window only after successful claim
      const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
      window.open(tweetUrl, "_blank", "width=550,height=420");
    } else if (result.alreadyAwarded) {
      // Not an error - just informational
      toast.info("X share already claimed today", {
        description: "Come back tomorrow for more rewards!",
      });
      setShareStatus((prev) =>
        prev ? { ...prev, x: { ...prev.x, claimed: true } } : null,
      );
    } else {
      toast.error(result.message || "Failed to claim reward");
    }
    setClaiming(null);
  };

  const shareOnFarcaster = async () => {
    // Prevent double clicks and already claimed shares
    if (shareStatus?.farcaster.claimed || claiming === "farcaster") {
      return;
    }

    const text = shareContent?.text || siteConfig.sharing.defaultText;
    const url = shareContent?.url || shareUrl;

    // Claim reward immediately (server-side tracking)
    setClaiming("farcaster");
    const result = await claimShareReward("farcaster", "app_share", url);
    if (result.success) {
      toast.success(
        `🎉 +${Math.round((result.amount || 0) * 100)} credits earned!`,
        {
          description: "Thanks for sharing on Farcaster!",
        },
      );
      setShareStatus((prev) =>
        prev
          ? { ...prev, farcaster: { ...prev.farcaster, claimed: true } }
          : null,
      );
      // Open share window only after successful claim
      const castUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(url)}`;
      window.open(castUrl, "_blank", "width=550,height=420");
    } else if (result.alreadyAwarded) {
      // Not an error - just informational
      toast.info("Farcaster share already claimed today", {
        description: "Come back tomorrow for more rewards!",
      });
      setShareStatus((prev) =>
        prev
          ? { ...prev, farcaster: { ...prev.farcaster, claimed: true } }
          : null,
      );
    } else {
      toast.error(result.message || "Failed to claim reward");
    }
    setClaiming(null);
  };

  // Handle backdrop click to close
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm duration-200"
      onClick={handleBackdropClick}
    >
      <div className="animate-in zoom-in-95 relative mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0f0a18] shadow-2xl duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <Gift className="text-brand h-5 w-5" />
            <h2 className="text-lg font-semibold text-white">Share & Earn</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 transition-colors hover:bg-white/10"
            aria-label="Close modal"
          >
            <X className="h-5 w-5 text-white/60" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="text-brand h-8 w-8 animate-spin" />
          </div>
        ) : error ? (
          <div className="space-y-4 p-6 text-center">
            <p className="text-red-400">{error}</p>
            <button
              onClick={loadData}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20"
            >
              Try Again
            </button>
          </div>
        ) : (
          <div className="space-y-5 p-6">
            {/* Stats - Always show, with zero state */}
            <div className="from-brand/10 to-accent-brand/10 border-brand/20 flex items-center justify-center gap-6 rounded-xl border bg-gradient-to-r p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">
                  {stats?.totalReferrals || 0}
                </p>
                <p className="text-xs text-white/60">Referrals</p>
              </div>
              <div className="h-8 w-px bg-white/20" />
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-400">
                  {Math.round(
                    (stats?.totalEarnings || 0) * 100,
                  ).toLocaleString()}
                </p>
                <p className="text-xs text-white/60">Credits Earned</p>
              </div>
            </div>

            {/* Share Buttons Section */}
            {shareStatus?.x.claimed && shareStatus?.farcaster.claimed ? (
              // All shares claimed today - show success message
              <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                <Sparkles className="h-5 w-5 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-400">
                  Today&apos;s rewards collected
                </span>
              </div>
            ) : (
              // Show share buttons for unclaimed platforms
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-white/60">Share to earn</p>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs font-medium text-emerald-400">
                    {(shareStatus?.x.claimed
                      ? 0
                      : (shareStatus?.x.amount || 0) * 100) +
                      (shareStatus?.farcaster.claimed
                        ? 0
                        : (shareStatus?.farcaster.amount || 0) * 100)}{" "}
                    credits available
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {/* X/Twitter Button */}
                  <button
                    onClick={shareOnX}
                    disabled={
                      claiming === "x" || shareStatus?.x.claimed === true
                    }
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-4 py-4 transition-all ${
                      shareStatus?.x.claimed
                        ? "border-emerald-500/30 bg-emerald-500/10"
                        : claiming === "x"
                          ? "cursor-not-allowed border-white/10 bg-white/5 opacity-60"
                          : "hover:border-brand/30 border-white/10 bg-white/5 hover:scale-[1.02] hover:bg-white/10 active:scale-[0.98]"
                    }`}
                  >
                    {claiming === "x" ? (
                      <Loader2 className="text-brand-400 h-6 w-6 animate-spin" />
                    ) : shareStatus?.x.claimed ? (
                      <>
                        <div className="flex items-center gap-1.5">
                          <XIcon className="h-5 w-5 text-emerald-400" />
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        </div>
                        <span className="text-xs text-emerald-400">
                          Claimed
                        </span>
                      </>
                    ) : (
                      <>
                        <XIcon className="h-6 w-6 text-white" />
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-white/60">X</span>
                          <span className="text-xs font-semibold text-emerald-400">
                            +{Math.round((shareStatus?.x.amount || 0) * 100)}{" "}
                            credits
                          </span>
                        </div>
                      </>
                    )}
                  </button>

                  {/* Farcaster Button */}
                  <button
                    onClick={shareOnFarcaster}
                    disabled={
                      claiming === "farcaster" ||
                      shareStatus?.farcaster.claimed === true
                    }
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-4 py-4 transition-all ${
                      shareStatus?.farcaster.claimed
                        ? "border-emerald-500/30 bg-emerald-500/10"
                        : claiming === "farcaster"
                          ? "cursor-not-allowed border-white/10 bg-white/5 opacity-60"
                          : "hover:border-accent-brand/30 border-white/10 bg-white/5 hover:scale-[1.02] hover:bg-white/10 active:scale-[0.98]"
                    }`}
                  >
                    {claiming === "farcaster" ? (
                      <Loader2 className="text-accent-brand-400 h-6 w-6 animate-spin" />
                    ) : shareStatus?.farcaster.claimed ? (
                      <>
                        <div className="flex items-center gap-1.5">
                          <FarcasterIcon className="h-5 w-5 text-emerald-400" />
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        </div>
                        <span className="text-xs text-emerald-400">
                          Claimed
                        </span>
                      </>
                    ) : (
                      <>
                        <FarcasterIcon className="h-6 w-6 text-white" />
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-white/60">
                            Farcaster
                          </span>
                          <span className="text-xs font-semibold text-emerald-400">
                            +
                            {Math.round(
                              (shareStatus?.farcaster.amount || 0) * 100,
                            )}{" "}
                            credits
                          </span>
                        </div>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-white/40">or share your link</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            {/* Referral Code & Link */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 overflow-hidden rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center font-mono text-sm tracking-wider text-white">
                  <span className="block truncate">{referralCode}</span>
                </div>
                <button
                  onClick={copyCode}
                  className="flex-shrink-0 rounded-xl border border-white/10 bg-white/5 p-3 transition-colors hover:bg-white/10"
                  title="Copy referral code"
                >
                  {copied ? (
                    <Check className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <Copy className="h-5 w-5 text-white/60" />
                  )}
                </button>
              </div>
            </div>

            {/* Copy Link - Primary CTA */}
            <button
              onClick={copyLink}
              className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 font-medium transition-all ${
                linkCopied
                  ? "border border-emerald-500/30 bg-emerald-500/20 text-emerald-400"
                  : "from-brand to-accent-brand-600 bg-gradient-to-r text-white hover:scale-[1.01] hover:opacity-90 active:scale-[0.99]"
              }`}
            >
              {linkCopied ? (
                <>
                  <Check className="h-4 w-4" />
                  Link Copied!
                </>
              ) : (
                <>
                  <Share2 className="h-4 w-4" />
                  Copy Referral Link
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
