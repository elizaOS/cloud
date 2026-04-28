import { useQuery } from "@tanstack/react-query";
import { api } from "../api-client";

export interface CreditsBalance {
  balance: number;
  currency?: string;
  [key: string]: unknown;
}

export interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  created_at: string;
  [key: string]: unknown;
}

/**
 * GET /api/credits/balance — cached for 30s by default. Pass `fresh: true` to
 * bypass the server-side cache (matches the legacy `?fresh=true` query).
 */
export function useCreditsBalance(opts: { fresh?: boolean } = {}) {
  return useQuery({
    queryKey: ["credits", "balance", opts.fresh ?? false],
    queryFn: () =>
      api<CreditsBalance>(opts.fresh ? "/api/credits/balance?fresh=true" : "/api/credits/balance"),
  });
}

/**
 * GET /api/credits/transactions — recent credit ledger. `hours` defaults to
 * 24 to match the dashboard usage tab.
 */
export function useCreditTransactions(hours = 24) {
  return useQuery({
    queryKey: ["credits", "transactions", hours],
    queryFn: () =>
      api<{ transactions: CreditTransaction[] }>(`/api/credits/transactions?hours=${hours}`).then(
        (r) => r.transactions ?? [],
      ),
  });
}
