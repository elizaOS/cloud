"use client";

import { AlertCircle, CheckCircle2, CreditCard, Gift } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ShareModal, useShareStatus } from "./share-modal";

interface OutOfCreditsPromptProps {
  currentBalance?: number;
  onClose?: () => void;
  inline?: boolean;
}

export function OutOfCreditsPrompt({
  currentBalance = 0,
  onClose: _onClose,
  inline = false,
}: OutOfCreditsPromptProps) {
  void _onClose; // Reserved for future use
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const { allClaimedToday, availableToday } = useShareStatus();

  const content = (
    <div className={`${inline ? "" : "p-6"} space-y-4`}>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-amber-500/10">
          <AlertCircle className="h-5 w-5 text-amber-500" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white">Low on credits</h3>
          <p className="text-sm text-white/60 mt-1">
            {currentBalance <= 0
              ? "You've run out of credits."
              : `You have $${currentBalance.toFixed(2)} remaining.`}
          </p>
        </div>
      </div>

      {allClaimedToday === true ? (
        // All shares claimed - show only buy credits option
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span className="text-xs text-emerald-400">Daily share rewards claimed!</span>
          </div>
          <Link
            href="/settings"
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-medium hover:bg-emerald-500/30 transition-all"
          >
            <CreditCard className="h-4 w-4" />
            Buy Credits
          </Link>
        </div>
      ) : (
        // Show both options when shares are available or still loading
        <>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setShareModalOpen(true)}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-pink-500/20 to-purple-500/20 border border-pink-500/30 text-pink-400 font-medium hover:from-pink-500/30 hover:to-purple-500/30 transition-all"
            >
              <Gift className="h-4 w-4" />
              {availableToday > 0 ? `Earn $${availableToday.toFixed(2)}` : "Share & Earn"}
            </button>
            <Link
              href="/settings"
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-medium hover:bg-emerald-500/30 transition-all"
            >
              <CreditCard className="h-4 w-4" />
              Buy Credits
            </Link>
          </div>

          <p className="text-xs text-white/40 text-center">
            Share with friends to earn credits • Get 5% of their purchases forever
          </p>
        </>
      )}

      <ShareModal isOpen={shareModalOpen} onClose={() => setShareModalOpen(false)} />
    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <div className="rounded-2xl bg-[#0f0a18]/80 border border-white/10 backdrop-blur-sm overflow-hidden">
      {content}
    </div>
  );
}

