"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CornerBrackets } from "@/components/brand";
import { CreditCard } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface BuyCreditsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBalance: number;
  paymentMethod: string;
  onBuyCredits: (amount: number) => void;
}

export function BuyCreditsModal({
  open,
  onOpenChange,
  currentBalance,
  paymentMethod,
  onBuyCredits,
}: BuyCreditsModalProps) {
  const [amount, setAmount] = useState("");

  const amountValue = parseFloat(amount) || 0;
  const creditAmount = amountValue; // 1:1 ratio for now

  const handleBuy = () => {
    if (amountValue > 0) {
      onBuyCredits(amountValue);
      setAmount("");
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    setAmount("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-950 border border-brand-surface p-4 sm:p-6 md:p-10 max-w-[95vw] sm:max-w-[480px]">
        <CornerBrackets size="md" className="opacity-50" />

        <div className="relative z-10 flex flex-col gap-6 md:gap-10 items-center">
          {/* Title */}
          <DialogHeader>
            <DialogTitle className="text-xl sm:text-2xl font-mono font-bold text-[#e1e1e1] text-center tracking-tight">
              Buy credits
            </DialogTitle>
          </DialogHeader>

          {/* Content */}
          <div className="flex flex-col gap-4 md:gap-6 w-full">
            {/* Current Balance Display */}
            <div className="w-full">
              <div className="backdrop-blur-sm bg-[rgba(10,10,10,0.75)] border border-brand-surface py-4 md:py-6">
                <div className="flex flex-col items-center justify-center gap-1 px-4">
                  <p className="text-3xl sm:text-[40px] font-mono text-white tracking-tight">
                    ${currentBalance.toFixed(2)}
                  </p>
                  <p className="text-xs sm:text-sm text-white/60 text-center">
                    Remaining balance
                  </p>
                </div>
              </div>
            </div>

            {/* Payment Method */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm sm:text-base font-mono text-[#e1e1e1]">
                Charged to
              </Label>
              <div className="border border-brand-surface flex items-center justify-between gap-2 px-2 py-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <CreditCard className="h-4 w-4 text-[#A2A2A2] flex-shrink-0" />
                  <p className="text-sm sm:text-base font-mono text-[#e1e1e1] tracking-tight truncate">
                    {paymentMethod}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-sm sm:text-base font-mono text-white underline hover:text-white/80 transition-colors flex-shrink-0"
                >
                  Edit
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-brand-surface w-full" />

            {/* Amount Input */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm sm:text-base font-mono font-medium text-[#e1e1e1]">
                Amount
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="backdrop-blur-sm bg-[rgba(29,29,29,0.3)] border border-[rgba(255,255,255,0.15)] text-[#717171] h-11"
                placeholder="$0.00"
              />
            </div>

            {/* Summary */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs sm:text-sm font-mono font-medium text-[#e1e1e1]">
                  Amount credited
                </p>
                <p className="text-xs sm:text-sm font-mono text-[#717171]">
                  ${amountValue.toFixed(2)}
                </p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs sm:text-sm font-mono font-medium text-[#e1e1e1]">
                  Credit amount
                </p>
                <p className="text-xs sm:text-sm font-mono text-[#717171]">
                  {creditAmount.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 sm:gap-4 w-full">
              <button
                type="button"
                onClick={handleCancel}
                className="relative bg-[rgba(255,88,0,0.25)] px-6 py-3 hover:bg-[rgba(255,88,0,0.35)] transition-colors"
              >
                <CornerBrackets size="sm" className="opacity-70" />
                <span className="relative z-10 text-[#FF5800] font-mono font-medium text-sm sm:text-base">
                  Cancel
                </span>
              </button>

              <button
                type="button"
                onClick={handleBuy}
                disabled={amountValue <= 0}
                className="bg-white px-6 py-3 hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-black font-mono font-medium text-sm sm:text-base">
                  Buy credits
                </span>
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
