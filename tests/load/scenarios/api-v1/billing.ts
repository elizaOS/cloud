import http from "k6/http";
import { check, group, sleep } from "k6";
import { getBaseUrl } from "../../config/environments";
import { getAuthHeaders } from "../../helpers/auth";
import { parseBody } from "../../helpers/assertions";
import { recordHttpError } from "../../helpers/metrics";
import { Counter } from "k6/metrics";

const baseUrl = getBaseUrl();
const headers = getAuthHeaders();
const billingQueries = new Counter("billing_queries");

function billingGet<T>(path: string): T | null {
  const res = http.get(`${baseUrl}${path}`, { headers, tags: { endpoint: "billing" } });
  if (!check(res, { [`${path} 200`]: (r) => r.status === 200 })) {
    recordHttpError(res.status);
    return null;
  }
  billingQueries.add(1);
  return parseBody<T>(res);
}

export function getBillingUsage(days = 30) {
  return billingGet<Record<string, unknown>>(`/api/billing/usage?days=${days}`);
}

export function listPaymentMethods(): unknown[] {
  return billingGet<{ paymentMethods: unknown[] }>("/api/payment-methods/list")?.paymentMethods || [];
}

export function listInvoices(): unknown[] {
  return billingGet<{ invoices: unknown[] }>("/api/invoices/list")?.invoices || [];
}

export function getAutoTopUpSettings() {
  return billingGet<Record<string, unknown>>("/api/auto-top-up/settings");
}

export function getQuotaLimits() {
  return billingGet<Record<string, unknown>>("/api/quotas/limits");
}

export function getQuotaUsage() {
  return billingGet<Record<string, unknown>>("/api/quotas/usage");
}

export function billingOperationsCycle() {
  group("Billing Ops", () => {
    getBillingUsage(30);
    sleep(0.3);
    listPaymentMethods();
    sleep(0.3);
    listInvoices();
    sleep(0.3);
    getAutoTopUpSettings();
    sleep(0.3);
    getQuotaLimits();
    getQuotaUsage();
  });
  sleep(1);
}

export default function () {
  billingOperationsCycle();
}
