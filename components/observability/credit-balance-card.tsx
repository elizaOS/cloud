"use client";

import { BrandCard } from "@/components/brand";
import { TrendingUp, TrendingDown, Wallet, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreditBalanceCardProps {
  balance: string;
  daysRemaining: number;
  dailySpend: string;
  weeklySpend: string;
  className?: string;
}

export function CreditBalanceCard({
  balance,
  daysRemaining,
  dailySpend,
  weeklySpend,
  className,
}: CreditBalanceCardProps) {
  const displayDays = daysRemaining > 999 ? "999+" : daysRemaining;
  const isLowBalance = daysRemaining < 30;

  return (
    <BrandCard
      corners={true}
      className={cn(
        "relative overflow-hidden border-emerald-500/40 transition-all hover:border-emerald-500/60",
        isLowBalance && "border-amber-500/40 hover:border-amber-500/60",
        className
      )}
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent" />
      
      <div className="relative space-y-6 p-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-white/50">
              <Wallet className="h-4 w-4" />
              Credit Balance
            </div>
          </div>
          <div
            className={cn(
              "rounded-none border px-2 py-1 text-xs font-bold uppercase tracking-wide",
              isLowBalance
                ? "border-amber-500/40 bg-amber-500/20 text-amber-400"
                : "border-emerald-500/40 bg-emerald-500/20 text-emerald-400"
            )}
          >
            {isLowBalance ? "Low Balance" : "Active"}
          </div>
        </div>

        {/* Balance Display */}
        <div>
          <div className="text-5xl font-bold text-white">{balance}</div>
          <div className="mt-2 flex items-center gap-2 text-sm text-white/60">
            <Clock className="h-4 w-4" />
            <span>~{displayDays} days remaining</span>
          </div>
        </div>

        {/* Spending Stats */}
        <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
          <div>
            <div className="text-xs font-medium text-white/50">Daily Spend</div>
            <div className="mt-1 text-2xl font-semibold text-white">
              {dailySpend}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-white/50">This Week</div>
            <div className="mt-1 text-2xl font-semibold text-white">
              {weeklySpend}
            </div>
          </div>
        </div>
      </div>
    </BrandCard>
  );
}
