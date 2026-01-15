/**
 * Earnings simulator component for visualizing potential earnings.
 * Shows "what if" scenarios based on user count and spend amounts.
 */

"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { BrandCard, CornerBrackets } from "@/components/brand";
import { Calculator, Users, DollarSign, TrendingUp } from "lucide-react";
import { Slider } from "@/components/ui/slider";

interface EarningsSimulatorProps {
  markupPercentage: number;
  purchaseSharePercentage: number;
  className?: string;
}

export function EarningsSimulator({
  markupPercentage,
  purchaseSharePercentage,
  className,
}: EarningsSimulatorProps) {
  const [users, setUsers] = useState(100);
  const [spendPerUser, setSpendPerUser] = useState(10);

  const calculations = useMemo(() => {
    const totalSpend = users * spendPerUser;

    // Inference earnings: users spend on AI, creator gets markup
    // Assume 80% of spend goes to inference costs
    const inferenceSpend = totalSpend * 0.8;
    const inferenceEarnings = inferenceSpend * (markupPercentage / 100);

    // Purchase earnings: creator gets % of credit purchases
    // Assume 20% of spend is new credit purchases
    const purchaseSpend = totalSpend * 0.2;
    const purchaseEarnings = purchaseSpend * (purchaseSharePercentage / 100);

    const totalEarnings = inferenceEarnings + purchaseEarnings;

    return {
      totalSpend,
      inferenceEarnings,
      purchaseEarnings,
      totalEarnings,
    };
  }, [users, spendPerUser, markupPercentage, purchaseSharePercentage]);

  return (
    <BrandCard className={cn("relative overflow-hidden", className)}>
      <CornerBrackets size="sm" className="opacity-20" />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-purple-500/20">
          <Calculator className="h-4 w-4 text-purple-400" />
        </div>
        <div>
          <h3 className="text-sm font-medium text-white">
            Earnings Calculator
          </h3>
          <p className="text-xs text-white/40">See your potential earnings</p>
        </div>
      </div>

      {/* Inputs */}
      <div className="relative z-10 space-y-4 mb-6">
        {/* Users slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/50 flex items-center gap-1.5">
              <Users className="h-3 w-3" />
              Monthly Active Users
            </span>
            <span className="text-sm font-mono text-white">{users}</span>
          </div>
          <Slider
            value={[users]}
            onValueChange={([v]) => setUsers(v)}
            min={10}
            max={1000}
            step={10}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-white/30">
            <span>10</span>
            <span>1,000</span>
          </div>
        </div>

        {/* Spend per user slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/50 flex items-center gap-1.5">
              <DollarSign className="h-3 w-3" />
              Avg. Spend per User
            </span>
            <span className="text-sm font-mono text-white">
              ${spendPerUser}
            </span>
          </div>
          <Slider
            value={[spendPerUser]}
            onValueChange={([v]) => setSpendPerUser(v)}
            min={1}
            max={100}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-white/30">
            <span>$1</span>
            <span>$100</span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-4" />

      {/* Results */}
      <div className="relative z-10 space-y-3">
        <div className="flex items-center gap-2 text-xs text-white/50">
          <TrendingUp className="h-3 w-3" />
          <span>Estimated Monthly Earnings</span>
        </div>

        {/* Total Spend */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/60">Total User Spend</span>
          <span className="font-mono text-white/80">
            ${calculations.totalSpend.toFixed(2)}
          </span>
        </div>

        {/* Inference earnings */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-purple-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            Inference Markup ({markupPercentage}%)
          </span>
          <span className="font-mono text-purple-400">
            +${calculations.inferenceEarnings.toFixed(2)}
          </span>
        </div>

        {/* Purchase earnings */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-yellow-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            Purchase Share ({purchaseSharePercentage}%)
          </span>
          <span className="font-mono text-yellow-400">
            +${calculations.purchaseEarnings.toFixed(2)}
          </span>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/10" />

        {/* Total */}
        <div className="flex items-center justify-between">
          <span className="text-white font-medium">Your Earnings</span>
          <span className="text-xl font-bold gradient-text">
            ${calculations.totalEarnings.toFixed(2)}
          </span>
        </div>

        {/* Per user breakdown */}
        <div className="text-[10px] text-white/30 text-right">
          ≈ ${(calculations.totalEarnings / users).toFixed(4)} per user
        </div>
      </div>
    </BrandCard>
  );
}
