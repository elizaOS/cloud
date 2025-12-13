import { group, sleep } from "k6";
import { httpGet, httpPost } from "../../helpers/http";
import { creditsChecked, creditBalance } from "../../helpers/metrics";

export function getBalance(): number {
  const body = httpGet<{ balance: number }>("/api/credits/balance", { tags: { endpoint: "credits", critical: "true" } });
  if (!body?.balance) return -1;
  creditsChecked.add(1);
  creditBalance.add(body.balance);
  return body.balance;
}

export function listTransactions(limit = 10): unknown[] {
  const body = httpGet<{ transactions: unknown[] }>(`/api/credits/transactions?limit=${limit}`, { tags: { endpoint: "credits" } });
  return body?.transactions ?? [];
}

export function getBillingUsage(days = 7): Record<string, unknown> | null {
  return httpGet<Record<string, unknown>>(`/api/billing/usage?days=${days}`, { tags: { endpoint: "credits" } });
}

export function getCreditSummary(): Record<string, unknown> | null {
  const body = httpPost<{ result: { summary: Record<string, unknown> } }>(
    "/api/a2a",
    { jsonrpc: "2.0", method: "a2a.getCreditSummary", params: {}, id: Date.now() },
    { tags: { endpoint: "credits" } }
  );
  return body?.result?.summary ?? null;
}

export function creditOperationsCycle() {
  group("Credit Ops", () => {
    getBalance();
    sleep(0.3);
    listTransactions(10);
    sleep(0.3);
    getBillingUsage(7);
    sleep(0.3);
    getCreditSummary();
  });
  sleep(1);
}

export function balancePolling() {
  group("Balance Polling", () => {
    for (let i = 0; i < 5; i++) {
      getBalance();
      sleep(0.2);
    }
  });
}

export default function () {
  creditOperationsCycle();
}
