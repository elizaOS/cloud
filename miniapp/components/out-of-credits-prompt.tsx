"use client";

import { AlertCircle, CheckCircle2, CreditCard, Gift } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ShareModal, useShareStatus } from "./share-modal";

interface OutOfCreditsPromptProps {
  currentBalance?: number;
  inline?: boolean;
}

export function OutOfCreditsPrompt({
  currentBalance = 0,
  inline = false,
}: OutOfCreditsPromptProps) {
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const { allClaimedToday, availableToday } = useShareStatus();

  const content = (
    <div className={`${inline ? "" : "p-6"} space-y-4`}>
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-amber-500/10 p-2">
          <AlertCircle className="h-5 w-5 text-amber-500" />
        </div>
        <h3 className="font-semibold text-white">
          {currentBalance <= 0
            ? "Out of credits"
            : `${Math.round(currentBalance * 100).toLocaleString()} credits left`}
        </h3>
      </div>

      {allClaimedToday === true ? (
        // All shares claimed - show only buy credits option
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span className="text-xs text-emerald-400">
              Daily share rewards claimed!
            </span>
          </div>
          <Link
            href="/settings"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/20 px-4 py-3 font-medium text-emerald-400 transition-all hover:bg-emerald-500/30"
          >
            <CreditCard className="h-4 w-4" />
            Buy Credits
          </Link>
        </div>
      ) : (
        // Show both options when shares are available or still loading
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setShareModalOpen(true)}
            className="from-brand/20 to-accent-brand/20 border-brand/30 text-brand-400 hover:from-brand/30 hover:to-accent-brand/30 flex items-center justify-center gap-2 rounded-xl border bg-gradient-to-r px-4 py-3 font-medium transition-all"
          >
            <Gift className="h-4 w-4" />
            {availableToday > 0
              ? `Earn ${Math.round(availableToday).toLocaleString()} credits`
              : "Share & Earn"}
          </button>
          <Link
            href="/settings"
            className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/20 px-4 py-3 font-medium text-emerald-400 transition-all hover:bg-emerald-500/30"
          >
            <CreditCard className="h-4 w-4" />
            Buy Credits
          </Link>
        </div>
      )}

      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
      />
    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0f0a18]/80 backdrop-blur-sm">
      {content}
    </div>
  );
}
