/**
 * Withdrawal dialog component with confirmation and celebration effects.
 * Shows processing state and confetti on successful withdrawal.
 */

"use client";

import { useState, useCallback } from "react";
import confetti from "canvas-confetti";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CornerBrackets } from "@/components/brand";
import {
  Loader2,
  Wallet,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

interface WithdrawDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appId: string;
  withdrawableBalance: number;
  payoutThreshold: number;
  onSuccess?: (newBalance: number) => void;
}

type WithdrawState = "confirm" | "processing" | "success" | "error";

export function WithdrawDialog({
  open,
  onOpenChange,
  appId,
  withdrawableBalance,
  payoutThreshold,
  onSuccess,
}: WithdrawDialogProps) {
  const [state, setState] = useState<WithdrawState>("confirm");
  const [amount, setAmount] = useState(withdrawableBalance.toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [newBalance, setNewBalance] = useState(0);

  const parsedAmount = parseFloat(amount) || 0;
  const isValidAmount =
    parsedAmount >= payoutThreshold && parsedAmount <= withdrawableBalance;

  const triggerConfetti = useCallback(() => {
    // Fire confetti from both sides
    const count = 200;
    const defaults = {
      origin: { y: 0.7 },
      zIndex: 9999,
    };

    function fire(particleRatio: number, opts: confetti.Options) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio),
      });
    }

    // Left side burst
    fire(0.25, {
      spread: 26,
      startVelocity: 55,
      origin: { x: 0.2, y: 0.7 },
      colors: ["#FF5800", "#FF8C00", "#FFD700"],
    });

    // Right side burst
    fire(0.25, {
      spread: 26,
      startVelocity: 55,
      origin: { x: 0.8, y: 0.7 },
      colors: ["#FF5800", "#FF8C00", "#FFD700"],
    });

    // Center burst
    fire(0.35, {
      spread: 100,
      decay: 0.91,
      scalar: 0.8,
      origin: { x: 0.5, y: 0.6 },
      colors: ["#FF5800", "#FF8C00", "#FFD700", "#FFFFFF"],
    });

    // Smaller follow-up burst
    setTimeout(() => {
      fire(0.1, {
        spread: 120,
        startVelocity: 25,
        decay: 0.92,
        scalar: 1.2,
        origin: { x: 0.5, y: 0.5 },
        colors: ["#FF5800", "#22C55E"],
      });
    }, 200);
  }, []);

  const handleWithdraw = async () => {
    setState("processing");
    setError(null);

    try {
      const response = await fetch(`/api/v1/apps/${appId}/earnings/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parsedAmount }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setState("error");
        setError(data.error || "Withdrawal failed. Please try again.");
        return;
      }

      setNewBalance(data.newBalance ?? 0);
      setState("success");
      triggerConfetti();
      onSuccess?.(data.newBalance ?? 0);
    } catch (err) {
      setState("error");
      setError(
        err instanceof Error
          ? err.message
          : "Network error. Please check your connection and try again.",
      );
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after dialog closes
    setTimeout(() => {
      setState("confirm");
      setAmount(withdrawableBalance.toFixed(2));
      setError(null);
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-black/95 border-white/10 backdrop-blur-xl">
        <CornerBrackets size="lg" color="#FF5800" className="opacity-30" />

        {state === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <Wallet className="h-5 w-5 text-[#FF5800]" />
                Withdraw Earnings
              </DialogTitle>
              <DialogDescription className="text-white/60">
                Mark earnings as withdrawn. These funds are already in your
                redeemable balance and can be redeemed as elizaOS tokens.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Balance display */}
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10">
                <span className="text-sm text-white/60">Available Balance</span>
                <span className="text-lg font-mono font-bold text-green-400">
                  ${withdrawableBalance.toFixed(2)}
                </span>
              </div>

              {/* Amount input */}
              <div className="space-y-2">
                <label className="text-sm text-white/60">
                  Withdrawal Amount
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
                    $
                  </span>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-7 bg-white/5 border-white/10 text-white font-mono"
                    min={payoutThreshold}
                    max={withdrawableBalance}
                    step="0.01"
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/40">
                    Minimum: ${payoutThreshold.toFixed(2)}
                  </span>
                  <button
                    onClick={() => setAmount(withdrawableBalance.toFixed(2))}
                    className="text-[#FF5800] hover:text-[#FF8C00] transition-colors"
                  >
                    Withdraw All
                  </button>
                </div>
              </div>

              {/* Validation message */}
              {!isValidAmount && parsedAmount > 0 && (
                <div className="flex items-center gap-2 text-xs text-red-400">
                  <AlertCircle className="h-3 w-3" />
                  {parsedAmount < payoutThreshold
                    ? `Minimum withdrawal is $${payoutThreshold.toFixed(2)}`
                    : `Maximum withdrawal is $${withdrawableBalance.toFixed(2)}`}
                </div>
              )}
            </div>

            <DialogFooter className="flex gap-2">
              <Button
                variant="ghost"
                onClick={handleClose}
                className="text-white/60 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={handleWithdraw}
                disabled={!isValidAmount}
                className="bg-gradient-to-r from-[#FF5800] to-[#FF8C00] text-white hover:opacity-90 disabled:opacity-50"
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                Withdraw ${parsedAmount.toFixed(2)}
              </Button>
            </DialogFooter>
          </>
        )}

        {state === "processing" && (
          <div className="py-12 text-center">
            <div className="relative mx-auto w-16 h-16 mb-4">
              <div className="absolute inset-0 border-2 border-[#FF5800]/30 rounded-lg animate-pulse" />
              <div className="absolute inset-2 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-[#FF5800] animate-spin" />
              </div>
              <CornerBrackets size="sm" color="#FF5800" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">
              Processing Withdrawal
            </h3>
            <p className="text-sm text-white/60">
              This may take a few moments...
            </p>
          </div>
        )}

        {state === "success" && (
          <div className="py-8 text-center">
            <div className="relative mx-auto w-20 h-20 mb-6">
              <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping" />
              <div className="absolute inset-0 flex items-center justify-center bg-green-500/10 rounded-full border border-green-500/30">
                <CheckCircle2 className="h-10 w-10 text-green-400" />
              </div>
            </div>
            <h3 className="text-xl font-bold gradient-text mb-2 flex items-center justify-center gap-2">
              <Sparkles className="h-5 w-5 text-[#FF5800]" />
              Withdrawal Complete!
              <Sparkles className="h-5 w-5 text-[#FF5800]" />
            </h3>
            <p className="text-white/60 mb-2">
              ${parsedAmount.toFixed(2)} marked as withdrawn
            </p>
            <p className="text-xs text-white/40 mb-4">
              Visit your Earnings page to redeem as elizaOS tokens
            </p>
            <div className="inline-block p-3 bg-white/5 rounded-lg border border-white/10">
              <span className="text-xs text-white/40">Remaining App Balance</span>
              <p className="text-lg font-mono font-bold text-white">
                ${newBalance.toFixed(2)}
              </p>
            </div>
            <DialogFooter className="mt-6">
              <Button
                onClick={handleClose}
                className="w-full bg-gradient-to-r from-[#FF5800] to-[#FF8C00] text-white"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        )}

        {state === "error" && (
          <div className="py-8 text-center">
            <div className="mx-auto w-16 h-16 mb-4 flex items-center justify-center bg-red-500/10 rounded-full border border-red-500/30">
              <AlertCircle className="h-8 w-8 text-red-400" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">
              Withdrawal Failed
            </h3>
            <p className="text-sm text-red-400 mb-4">{error}</p>
            <DialogFooter className="flex gap-2 justify-center">
              <Button
                variant="ghost"
                onClick={handleClose}
                className="text-white/60 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={() => setState("confirm")}
                className="bg-white/10 hover:bg-white/20 text-white"
              >
                Try Again
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
