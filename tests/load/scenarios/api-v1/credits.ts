import http from "k6/http";
import { check, group, sleep } from "k6";
import { getBaseUrl } from "../../config/environments";
import { getAuthHeaders } from "../../helpers/auth";
import { parseBody } from "../../helpers/assertions";
import { creditsChecked, creditBalance, recordHttpError } from "../../helpers/metrics";

const baseUrl = getBaseUrl();
const headers = getAuthHeaders();

export function getBalance(): number {
  const res = http.get(`${baseUrl}/api/credits/balance`, { headers, tags: { endpoint: "credits", critical: "true" } });
  if (!check(res, { "balance 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return -1;
  }
  creditsChecked.add(1);
  const balance = parseBody<{ balance: number }>(res).balance;
  creditBalance.add(balance);
  return balance;
}

export function listTransactions(limit = 10): unknown[] {
  const res = http.get(`${baseUrl}/api/credits/transactions?limit=${limit}`, { headers, tags: { endpoint: "credits" } });
  if (!check(res, { "transactions 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return [];
  }
  return parseBody<{ transactions: unknown[] }>(res).transactions || [];
}

export function getBillingUsage(days = 7): Record<string, unknown> | null {
  const res = http.get(`${baseUrl}/api/billing/usage?days=${days}`, { headers, tags: { endpoint: "credits" } });
  if (!check(res, { "billing 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return null;
  }
  return parseBody<Record<string, unknown>>(res);
}

export function getCreditSummary(): Record<string, unknown> | null {
  const res = http.post(
    `${baseUrl}/api/a2a`,
    JSON.stringify({ jsonrpc: "2.0", method: "a2a.getCreditSummary", params: {}, id: Date.now() }),
    { headers, tags: { endpoint: "credits" } }
  );
  if (!check(res, { "summary 200": (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return null;
  }
  return parseBody<{ result?: { summary: Record<string, unknown> } }>(res).result?.summary || null;
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
