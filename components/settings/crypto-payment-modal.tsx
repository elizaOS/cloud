"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Copy, CheckCircle, AlertCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface CryptoPaymentModalProps {
  paymentId: string;
  paymentAddress: string;
  expectedAmount: string;
  network: string;
  tokenAddress: string;
  expiresAt: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface PaymentStatus {
  status: string;
  confirmed: boolean;
  receivedAmount?: string;
  transactionHash?: string;
}

export function CryptoPaymentModal({
  paymentId,
  paymentAddress,
  expectedAmount,
  network,
  tokenAddress,
  expiresAt,
  onClose,
  onSuccess,
}: CryptoPaymentModalProps) {
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [manualTxHash, setManualTxHash] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  const checkPaymentStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/crypto/payments/${paymentId}`);
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        if (data.confirmed || data.status === "confirmed") {
          setIsPolling(false);
          toast.success("Payment confirmed! Credits added to your account.");
          onSuccess();
        } else if (data.status === "expired") {
          setIsPolling(false);
          toast.error("Payment expired");
        }
      }
    } catch {
      // Silent fail on status check
    }
  }, [paymentId, onSuccess]);

  useEffect(() => {
    checkPaymentStatus();
    const interval = setInterval(checkPaymentStatus, 10000);
    return () => clearInterval(interval);
  }, [checkPaymentStatus]);

  useEffect(() => {
    const expires = new Date(expiresAt).getTime();
    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expires - now) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        setIsPolling(false);
      }
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copied`);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleManualConfirm = async () => {
    if (!manualTxHash || !/^0x[a-fA-F0-9]{64}$/.test(manualTxHash)) {
      toast.error("Please enter a valid transaction hash");
      return;
    }

    setIsConfirming(true);
    try {
      const response = await fetch(`/api/crypto/payments/${paymentId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionHash: manualTxHash }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success("Payment confirmed!");
        onSuccess();
      } else {
        toast.error(data.message || "Could not verify transaction");
      }
    } catch {
      toast.error("Failed to verify transaction");
    } finally {
      setIsConfirming(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getExplorerUrl = (address: string, type: "address" | "token") => {
    const base = network === "base"
      ? "https://basescan.org"
      : "https://sepolia.basescan.org";
    return type === "token"
      ? `${base}/token/${tokenAddress}?a=${address}`
      : `${base}/address/${address}`;
  };

  const isExpired = timeLeft === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md backdrop-blur-sm bg-[rgba(10,10,10,0.95)] border border-brand-surface p-6 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-white/60 hover:text-white"
        >
          ✕
        </button>

        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#FF5800]" />
            <h3 className="text-base font-mono text-[#e1e1e1] uppercase">
              USDC Payment
            </h3>
          </div>

          {isExpired ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
              <p className="text-white font-mono">Payment Expired</p>
              <p className="text-white/60 text-sm mt-2">
                Please create a new payment request
              </p>
            </div>
          ) : status?.confirmed || status?.status === "confirmed" ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
              <p className="text-white font-mono">Payment Confirmed</p>
              <p className="text-white/60 text-sm mt-2">
                ${expectedAmount} has been added to your balance
              </p>
            </div>
          ) : (
            <>
              <div className="text-center">
                <p className="text-3xl font-mono text-white">
                  ${expectedAmount} <span className="text-sm text-white/60">USDC</span>
                </p>
                <p className="text-sm text-white/60 mt-1">
                  on {network === "base" ? "Base Mainnet" : "Base Sepolia"}
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-mono text-white/60 uppercase block mb-2">
                    Send USDC to this address
                  </label>
                  <div className="flex items-center gap-2 bg-[rgba(29,29,29,0.5)] border border-[rgba(255,255,255,0.1)] p-3">
                    <code className="text-sm text-white font-mono flex-1 break-all">
                      {paymentAddress}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(paymentAddress, "Address")}
                      className="text-white/60 hover:text-white p-1"
                    >
                      {copied === "Address" ? (
                        <CheckCircle className="h-4 w-4 text-green-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <a
                    href={getExplorerUrl(paymentAddress, "address")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#FF5800] hover:underline mt-1 inline-flex items-center gap-1"
                  >
                    View on Explorer <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/60 font-mono">Time remaining</span>
                  <span className={`font-mono ${timeLeft < 300 ? "text-red-400" : "text-white"}`}>
                    {formatTime(timeLeft)}
                  </span>
                </div>

                <div className="flex items-center justify-center gap-2 text-white/60">
                  {isPolling && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span className="text-xs font-mono">
                    Waiting for payment...
                  </span>
                </div>

                <div className="border-t border-[rgba(255,255,255,0.1)] pt-4">
                  <label className="text-xs font-mono text-white/60 uppercase block mb-2">
                    Already sent? Enter transaction hash
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={manualTxHash}
                      onChange={(e) => setManualTxHash(e.target.value)}
                      placeholder="0x..."
                      className="flex-1 bg-[rgba(29,29,29,0.5)] border border-[rgba(255,255,255,0.1)] p-2 text-white font-mono text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleManualConfirm}
                      disabled={isConfirming || !manualTxHash}
                      className="bg-[#FF5800] px-4 py-2 text-white font-mono text-sm hover:bg-[#FF5800]/80 disabled:opacity-50"
                    >
                      {isConfirming ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Verify"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
