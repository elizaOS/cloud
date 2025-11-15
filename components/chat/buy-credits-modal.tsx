"use client";

import { useState } from "react";
import { CornerBrackets } from "@/components/brand";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface BuyCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BuyCreditsModal({ isOpen, onClose }: BuyCreditsModalProps) {
  const router = useRouter();
  const [amount, setAmount] = useState("200");
  const [autoTopUp, setAutoTopUp] = useState(false);
  const [triggerAmount, setTriggerAmount] = useState("200");
  const [targetAmount, setTargetAmount] = useState("500");
  const [isPurchasing, setIsPurchasing] = useState(false);

  if (!isOpen) return null;

  const handleBuyCredits = async () => {
    try {
      setIsPurchasing(true);
      const purchaseAmount = parseFloat(amount);

      if (isNaN(purchaseAmount) || purchaseAmount <= 0) {
        toast.error("Please enter a valid amount");
        return;
      }

      const response = await fetch("/api/purchases/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: purchaseAmount,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create purchase");
      }

      const data = await response.json();

      if (data.status === "succeeded") {
        toast.success(
          `Successfully purchased $${purchaseAmount.toFixed(2)} in credits`
        );
        router.refresh();
        onClose();
      } else {
        toast.info(
          `Payment is ${data.status}. Credits will be added when payment completes.`
        );
        onClose();
      }
    } catch (error) {
      console.error("Error buying credits:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to purchase credits"
      );
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className="fixed inset-0 z-[102] bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close modal"
      />

      {/* Modal container */}
      <div className="fixed inset-0 z-[103] flex items-center justify-center px-4">
        <div
          className="relative bg-[#0a0a0a] border border-[#252527] px-10 py-10 flex flex-col items-center gap-10 w-full max-w-[600px]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Corner brackets decoration */}
          <CornerBrackets size="md" color="#a1a1a1" />

          {/* Title */}
          <div className="flex flex-col items-center gap-2">
            <h2
              className="text-center"
              style={{
                fontFamily: "var(--font-roboto-mono)",
                fontWeight: 700,
                fontSize: "24px",
                lineHeight: "normal",
                letterSpacing: "-0.24px",
                color: "#e1e1e1",
              }}
            >
              Buy Credits
            </h2>
          </div>

          {/* Form Content */}
          <div className="w-full flex flex-col gap-6">
            {/* Amount of credits */}
            <div className="flex flex-col gap-2">
              <label
                style={{
                  fontFamily: "var(--font-roboto-mono)",
                  fontWeight: 500,
                  fontSize: "16px",
                  lineHeight: "normal",
                  color: "#e1e1e1",
                }}
              >
                Amount of credits
              </label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full h-11 bg-[rgba(29,29,29,0.3)] border border-[rgba(255,255,255,0.15)] px-4 py-3 backdrop-blur-sm"
                style={{
                  fontFamily: "var(--font-roboto-mono)",
                  fontWeight: 400,
                  fontSize: "14px",
                  lineHeight: "normal",
                  color: "#717171",
                }}
                placeholder="$200"
              />
            </div>

            {/* Auto-top up section */}
            <div className="flex items-start justify-between gap-4 bg-[#0a0a0a]">
              <div className="flex-1 flex flex-col gap-2">
                <p
                  style={{
                    fontFamily: "var(--font-roboto-mono)",
                    fontWeight: 400,
                    fontSize: "16px",
                    lineHeight: "normal",
                    color: "#e1e1e1",
                  }}
                >
                  Auto-top up
                </p>
                <p
                  style={{
                    fontFamily: "var(--font-roboto-mono)",
                    fontWeight: 400,
                    fontSize: "14px",
                    lineHeight: "20px",
                    letterSpacing: "-0.042px",
                    color: "rgba(255,255,255,0.6)",
                  }}
                >
                  Auto-reload your balance when it hits 0, by the amount you
                  set prior
                </p>
              </div>

              {/* Toggle switch */}
              <button
                onClick={() => setAutoTopUp(!autoTopUp)}
                className={`relative h-3.5 w-7 rounded-full transition-colors ${
                  autoTopUp ? "bg-[#ff5800]" : "bg-[#3d3d3d]"
                }`}
                aria-label="Toggle auto-top up"
              >
                <div
                  className={`absolute top-[3px] h-2 w-2 rounded-full bg-[#1d1d1d] transition-transform ${
                    autoTopUp ? "translate-x-[18px]" : "translate-x-[3px]"
                  }`}
                />
              </button>
            </div>

            {/* Auto-top up amount fields (shown when auto-top up is enabled) */}
            {autoTopUp && (
              <div className="flex gap-6">
                <div className="flex-1 flex flex-col gap-2">
                  <label
                    style={{
                      fontFamily: "var(--font-roboto-mono)",
                      fontWeight: 500,
                      fontSize: "16px",
                      lineHeight: "normal",
                      color: "#e1e1e1",
                    }}
                  >
                    When credit balance is
                  </label>
                  <input
                    type="text"
                    value={triggerAmount}
                    onChange={(e) => setTriggerAmount(e.target.value)}
                    className="w-full h-11 bg-[rgba(29,29,29,0.3)] border border-[rgba(255,255,255,0.15)] px-4 py-3 backdrop-blur-sm"
                    style={{
                      fontFamily: "var(--font-roboto-mono)",
                      fontWeight: 400,
                      fontSize: "14px",
                      lineHeight: "normal",
                      color: "#717171",
                    }}
                    placeholder="$200"
                  />
                </div>

                <div className="flex-1 flex flex-col gap-2">
                  <label
                    style={{
                      fontFamily: "var(--font-roboto-mono)",
                      fontWeight: 500,
                      fontSize: "16px",
                      lineHeight: "normal",
                      color: "#e1e1e1",
                    }}
                  >
                    Bring credit balance to
                  </label>
                  <input
                    type="text"
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    className="w-full h-11 bg-[rgba(29,29,29,0.3)] border border-[rgba(255,255,255,0.15)] px-4 py-3 backdrop-blur-sm"
                    style={{
                      fontFamily: "var(--font-roboto-mono)",
                      fontWeight: 400,
                      fontSize: "14px",
                      lineHeight: "normal",
                      color: "#717171",
                    }}
                    placeholder="500$"
                  />
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex flex-col items-center gap-2 w-full">
              {/* Buy Credits Button */}
              <button
                onClick={handleBuyCredits}
                disabled={isPurchasing}
                className="relative w-full px-6 py-3 bg-[rgba(255,88,0,0.25)] hover:bg-[rgba(255,88,0,0.35)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {/* Button corner brackets */}
                <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[#ff5800]" />
                <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-[#ff5800]" />
                <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-[#ff5800]" />
                <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-[#ff5800]" />

                <span
                  style={{
                    fontFamily: "var(--font-roboto-mono)",
                    fontWeight: 500,
                    fontSize: "16px",
                    lineHeight: "normal",
                    color: "#ff5800",
                  }}
                >
                  {isPurchasing ? "Processing..." : "Buy Credits"}
                </span>
              </button>

              {/* Cancel Button */}
              <button
                onClick={onClose}
                disabled={isPurchasing}
                style={{
                  fontFamily: "var(--font-roboto-mono)",
                  fontWeight: 500,
                  fontSize: "16px",
                  lineHeight: "normal",
                  color: "#717171",
                }}
                className="hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
