/**
 * Credit balance display component showing current credit balance.
 * Fetches and displays balance with loading state.
 */

"use client";

import { useEffect, useState } from "react";
import { getCreditBalance } from "@/app/actions/auth";
import { Loader2 } from "lucide-react";

export function CreditBalanceDisplay() {
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCreditBalance() {
      const balance = await getCreditBalance();
      setCreditBalance(balance);
      setLoading(false);
    }

    fetchCreditBalance();
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border bg-muted/50 p-4">
        <div className="text-sm text-muted-foreground">Current Balance</div>
        <div className="flex items-center justify-center py-2">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/50 p-4">
      <div className="text-sm text-muted-foreground">Current Balance</div>
      <div className="text-3xl font-bold mt-1">
        ${creditBalance !== null ? Number(creditBalance).toFixed(2) : "0.00"}
      </div>
      <div className="text-sm text-muted-foreground">USD</div>
    </div>
  );
}
