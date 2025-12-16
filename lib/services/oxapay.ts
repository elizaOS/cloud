import { logger } from "@/lib/utils/logger";

export type OxaPayNetwork =
  | "ERC20"
  | "TRC20"
  | "BEP20"
  | "POLYGON"
  | "SOL"
  | "BASE"
  | "ARB"
  | "OP";

export interface OxaPayInvoiceResult {
  trackId: string;
  payLink: string;
  amount: number;
  currency: string;
  expiresAt: Date;
}

export interface OxaPayPaymentStatus {
  trackId: string;
  status: string;
  amount: number;
  currency: string;
  transactions: Array<{
    txHash: string;
    amount: number;
    currency: string;
    network: string;
    address: string;
    status: string;
    confirmations: number;
  }>;
}

const OXAPAY_API_BASE = "https://api.oxapay.com";

function getMerchantApiKey(): string {
  const apiKey = process.env.OXAPAY_MERCHANT_API_KEY;
  if (!apiKey) {
    throw new Error("OXAPAY_MERCHANT_API_KEY not configured");
  }
  return apiKey;
}

export function isOxaPayConfigured(): boolean {
  return Boolean(process.env.OXAPAY_MERCHANT_API_KEY);
}

class OxaPayService {
  /**
   * Create an invoice payment using OxaPay's merchant request API.
   * This returns a payLink that redirects users to OxaPay's hosted payment page.
   */
  async createInvoice(params: {
    amount: number;
    currency?: string;
    payCurrency?: string;
    network?: OxaPayNetwork;
    orderId?: string;
    description?: string;
    callbackUrl?: string;
    returnUrl?: string;
    email?: string;
    lifetime?: number;
  }): Promise<OxaPayInvoiceResult> {
    const merchantKey = getMerchantApiKey();

    const {
      amount,
      currency = "USD",
      payCurrency,
      network,
      orderId,
      description,
      callbackUrl,
      returnUrl,
      email,
      lifetime = 1800,
    } = params;

    logger.info("[OxaPay] Creating invoice", {
      amount,
      currency,
      payCurrency,
      network,
      orderId,
    });

    const requestBody: Record<string, unknown> = {
      merchant: merchantKey,
      amount,
      currency,
      lifeTime: lifetime / 60,
      feePaidByPayer: 0,
      underPaidCover: 2.5,
    };

    if (payCurrency) requestBody.payCurrency = payCurrency;
    if (network) requestBody.network = network;
    if (orderId) requestBody.orderId = orderId;
    if (description) requestBody.description = description;
    if (callbackUrl) requestBody.callbackUrl = callbackUrl;
    if (returnUrl) requestBody.returnUrl = returnUrl;
    if (email) requestBody.email = email;

    const response = await fetch(`${OXAPAY_API_BASE}/merchants/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (data.result !== 100) {
      logger.error("[OxaPay] Invoice creation failed", {
        result: data.result,
        message: data.message,
      });
      throw new Error(data.message || "Invoice creation failed");
    }

    logger.info("[OxaPay] Invoice created", {
      trackId: data.trackId,
      hasPayLink: !!data.payLink,
    });

    return {
      trackId: data.trackId,
      payLink: data.payLink,
      amount,
      currency,
      expiresAt: new Date(Date.now() + lifetime * 1000),
    };
  }

  async getPaymentStatus(trackId: string): Promise<OxaPayPaymentStatus> {
    const merchantKey = getMerchantApiKey();

    logger.info("[OxaPay] Checking payment status", { trackId });

    const response = await fetch(`${OXAPAY_API_BASE}/merchants/inquiry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        merchant: merchantKey,
        trackId,
      }),
    });

    const data = await response.json();

    if (data.result !== 100) {
      logger.error("[OxaPay] Payment status check failed", {
        result: data.result,
        message: data.message,
      });
      throw new Error(data.message || "Payment status check failed");
    }

    return {
      trackId: data.trackId,
      status: data.status,
      amount: parseFloat(data.amount) || 0,
      currency: data.currency,
      transactions: data.txID ? [{
        txHash: data.txID,
        amount: parseFloat(data.payAmount) || 0,
        currency: data.payCurrency || "",
        network: data.network || "",
        address: data.address || "",
        status: data.status,
        confirmations: 1,
      }] : [],
    };
  }

  async getSupportedCurrencies(): Promise<
    Array<{
      symbol: string;
      name: string;
      networks: Array<{
        network: string;
        name: string;
        depositMin: number;
        withdrawFee: number;
      }>;
    }>
  > {
    const response = await fetch(`${OXAPAY_API_BASE}/api/currencies`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!data || typeof data !== "object") {
      throw new Error("Failed to fetch supported currencies");
    }

    const currencies = Object.entries(data)
      .filter(([_, info]: [string, any]) => info.status)
      .map(([_, info]: [string, any]) => ({
        symbol: info.symbol,
        name: info.name,
        networks: Object.entries(info.networks || {}).map(([_, netInfo]: [string, any]) => ({
          network: netInfo.network,
          name: netInfo.name,
          depositMin: netInfo.deposit_min,
          withdrawFee: netInfo.withdraw_fee,
        })),
      }));

    return currencies;
  }

  async getSystemStatus(): Promise<boolean> {
    try {
      const response = await fetch(`${OXAPAY_API_BASE}/api/status`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const data = await response.json();
      return data?.status === true;
    } catch {
      return false;
    }
  }

  /**
   * Check if payment is confirmed and safe to deliver goods/credits.
   * Per OxaPay docs:
   * - "Paid" = Payment confirmed by network (for invoice/white_label payments)
   * - "Confirmed" = Payout confirmed (for payout transactions)
   * Note: OxaPay API returns lowercase status values, so we normalize to lowercase.
   */
  isPaymentConfirmed(status: string): boolean {
    const normalized = status.toLowerCase();
    return normalized === "paid" || normalized === "confirmed";
  }

  /**
   * Check if payment is pending (awaiting blockchain confirmation).
   * Per OxaPay docs:
   * - "Waiting" = Waiting for payer to send payment
   * - "Paying" = Payer sent payment, awaiting blockchain confirmation
   * - "Confirming" = Transaction confirming (for payouts)
   */
  isPaymentPending(status: string): boolean {
    const normalized = status.toLowerCase();
    return normalized === "waiting" || normalized === "paying" || normalized === "confirming";
  }

  isPaymentExpired(status: string): boolean {
    return status.toLowerCase() === "expired";
  }

  isPaymentFailed(status: string): boolean {
    const normalized = status.toLowerCase();
    return normalized === "failed" || normalized === "refunded";
  }
}

export const oxaPayService = new OxaPayService();
