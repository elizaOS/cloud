"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CornerBrackets } from "@/components/brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface AutoTopUpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentAutoTopUp: boolean;
  currentAmount: number;
  currentThreshold: number;
  onUpdate: (enabled: boolean, amount: number, threshold: number) => void;
}

export function AutoTopUpModal({
  open,
  onOpenChange,
  currentAutoTopUp,
  currentAmount,
  currentThreshold,
  onUpdate,
}: AutoTopUpModalProps) {
  const [enabled, setEnabled] = useState(currentAutoTopUp);
  const [amount, setAmount] = useState(currentAmount.toString());
  const [threshold, setThreshold] = useState(currentThreshold.toString());

  const handleUpdate = () => {
    const amountValue = parseFloat(amount) || 0;
    const thresholdValue = parseFloat(threshold) || 0;
    onUpdate(enabled, amountValue, thresholdValue);
    onOpenChange(false);
  };

  const handleCancel = () => {
    // Reset to original values
    setEnabled(currentAutoTopUp);
    setAmount(currentAmount.toString());
    setThreshold(currentThreshold.toString());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-950 border border-brand-surface p-10 max-w-[480px]">
        <CornerBrackets size="md" className="opacity-50" />

        <div className="relative z-10 flex flex-col gap-10 items-center">
          {/* Title */}
          <DialogHeader>
            <DialogTitle className="text-2xl font-mono font-bold text-[#e1e1e1] text-center tracking-tight">
              Set auto-top up
            </DialogTitle>
          </DialogHeader>

          {/* Content */}
          <div className="flex flex-col gap-6 w-full items-end">
            {/* Auto-top up Toggle */}
            <div className="flex items-start w-full">
              <div className="flex-1 flex flex-col gap-2">
                <p className="text-base font-mono text-[#e1e1e1]">
                  Auto-top up
                </p>
                <p className="text-sm text-white/60">
                  Auto-reload your balance when it falls below threshold
                </p>
              </div>

              <div className="flex flex-col items-end">
                <Switch
                  checked={enabled}
                  onCheckedChange={setEnabled}
                  className="data-[state=checked]:bg-[#FF5800]"
                />
              </div>
            </div>

            {/* Amount to top up */}
            <div className="flex flex-col gap-2 w-full">
              <Label className="text-base font-mono font-medium text-[#e1e1e1]">
                Amount to top up
              </Label>
              <Input
                type="number"
                step="1"
                min="1"
                max="1000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="backdrop-blur-sm bg-[rgba(29,29,29,0.3)] border border-[rgba(255,255,255,0.15)] text-[#717171] h-11"
                placeholder="$50"
              />
            </div>

            {/* Balance Threshold */}
            <div className="flex flex-col gap-2 w-full">
              <Label className="text-base font-mono font-medium text-[#e1e1e1]">
                Balance threshold
              </Label>
              <Input
                type="number"
                step="1"
                min="0"
                max="1000"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="backdrop-blur-sm bg-[rgba(29,29,29,0.3)] border border-[rgba(255,255,255,0.15)] text-[#717171] h-11"
                placeholder="$10"
              />
              <p className="text-xs text-white/50 font-mono">
                Auto-top up triggers when balance falls below this amount
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-4 w-full justify-end">
              <button
                type="button"
                onClick={handleCancel}
                className="relative bg-[rgba(255,88,0,0.25)] px-6 py-3 hover:bg-[rgba(255,88,0,0.35)] transition-colors"
              >
                <CornerBrackets size="sm" className="opacity-70" />
                <span className="relative z-10 text-[#FF5800] font-mono font-medium text-base">
                  Cancel
                </span>
              </button>

              <button
                type="button"
                onClick={handleUpdate}
                className="bg-white px-6 py-3 hover:bg-white/90 transition-colors"
              >
                <span className="text-black font-mono font-medium text-base">
                  Update
                </span>
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

