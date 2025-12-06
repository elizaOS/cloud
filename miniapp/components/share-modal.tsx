"use client";

import {
  Check,
  Copy,
  Gift,
  Loader2,
  Share2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { claimShareReward, getReferralInfo, getRewardsStatus } from "@/lib/cloud-api";

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

export function ShareModal({ isOpen, onClose, shareContent }: ShareModalProps) {
  const [loading, setLoading] = useState(true);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [shareStatus, setShareStatus] = useState<{
    x: { claimed: boolean; amount: number };
    farcaster: { claimed: boolean; amount: number };
  } | null>(null);
  const [stats, setStats] = useState<{
    totalReferrals: number;
    totalEarnings: number;
  } | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
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
  };

  const copyCode = async () => {
    if (!referralCode) return;
    await navigator.clipboard.writeText(referralCode);
    setCopied(true);
    toast.success("Referral code copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Share link copied!");
  };

  const shareOnX = async () => {
    const text = shareContent?.text || "Check out this awesome AI chat app!";
    const url = shareContent?.url || shareUrl;
    
    // Claim reward immediately (server-side tracking)
    if (!shareStatus?.x.claimed) {
      setClaiming("x");
      const result = await claimShareReward("x", "app_share", url);
      if (result.success) {
        toast.success(result.message);
        setShareStatus(prev => prev ? { ...prev, x: { ...prev.x, claimed: true } } : null);
      } else if (result.alreadyAwarded) {
        setShareStatus(prev => prev ? { ...prev, x: { ...prev.x, claimed: true } } : null);
      }
      setClaiming(null);
    }

    // Open share window
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(tweetUrl, "_blank", "width=550,height=420");
  };

  const shareOnFarcaster = async () => {
    const text = shareContent?.text || "Check out this awesome AI chat app!";
    const url = shareContent?.url || shareUrl;
    
    // Claim reward immediately (server-side tracking)
    if (!shareStatus?.farcaster.claimed) {
      setClaiming("farcaster");
      const result = await claimShareReward("farcaster", "app_share", url);
      if (result.success) {
        toast.success(result.message);
        setShareStatus(prev => prev ? { ...prev, farcaster: { ...prev.farcaster, claimed: true } } : null);
      } else if (result.alreadyAwarded) {
        setShareStatus(prev => prev ? { ...prev, farcaster: { ...prev.farcaster, claimed: true } } : null);
      }
      setClaiming(null);
    }

    // Open share window
    const castUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(url)}`;
    window.open(castUrl, "_blank", "width=550,height=420");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 overflow-hidden rounded-2xl bg-[#0f0a18] border border-white/10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-pink-500" />
            <h2 className="text-lg font-semibold text-white">Share & Earn</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5 text-white/60" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Stats */}
            {stats && stats.totalEarnings > 0 && (
              <div className="flex items-center justify-center gap-6 p-4 rounded-xl bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-pink-500/20">
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">{stats.totalReferrals}</p>
                  <p className="text-xs text-white/60">Referrals</p>
                </div>
                <div className="h-8 w-px bg-white/20" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-400">${stats.totalEarnings.toFixed(2)}</p>
                  <p className="text-xs text-white/60">Earned</p>
                </div>
              </div>
            )}

            {/* Referral Code */}
            <div className="space-y-2">
              <p className="text-sm text-white/60">Your referral code</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 font-mono text-lg text-white text-center tracking-wider">
                  {referralCode}
                </div>
                <button
                  onClick={copyCode}
                  className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                >
                  {copied ? (
                    <Check className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <Copy className="h-5 w-5 text-white/60" />
                  )}
                </button>
              </div>
              <p className="text-xs text-white/40">
                Friends get $0.50 • You get $1.00 (+$0.50 when they link social) + 5% of their purchases
              </p>
            </div>

            {/* Share Buttons */}
            <div className="space-y-2">
              <p className="text-sm text-white/60">Share to earn credits daily</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={shareOnX}
                  disabled={claiming === "x"}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all ${
                    shareStatus?.x.claimed
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-white/5 border-white/10 hover:bg-white/10 text-white"
                  }`}
                >
                  {claiming === "x" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <XIcon className="h-5 w-5" />
                      <span className="font-medium">
                        {shareStatus?.x.claimed ? "Claimed" : `+$${shareStatus?.x.amount.toFixed(2)}`}
                      </span>
                    </>
                  )}
                </button>
                <button
                  onClick={shareOnFarcaster}
                  disabled={claiming === "farcaster"}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all ${
                    shareStatus?.farcaster.claimed
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-white/5 border-white/10 hover:bg-white/10 text-white"
                  }`}
                >
                  {claiming === "farcaster" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <FarcasterIcon className="h-5 w-5" />
                      <span className="font-medium">
                        {shareStatus?.farcaster.claimed ? "Claimed" : `+$${shareStatus?.farcaster.amount.toFixed(2)}`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Copy Link */}
            <button
              onClick={copyLink}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white font-medium hover:opacity-90 transition-opacity"
            >
              <Share2 className="h-4 w-4" />
              Copy Share Link
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

