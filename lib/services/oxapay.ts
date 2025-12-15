import oxapay from "oxapay";
import { logger } from "@/lib/utils/logger";

const PaymentClient = oxapay.v1.payment;
const CommonClient = oxapay.v1.common;

export type OxaPayNetwork =
  | "ERC20"
  | "TRC20"
  | "BEP20"
  | "POLYGON"
  | "SOL"
  | "BASE"
  | "ARB"
  | "OP";

export interface OxaPayPaymentResult {
  trackId: string;
  address: string;
  amount: number;
  currency: string;
  payAmount: number;
  payCurrency: string;
  network: string;
  qrCode: string;
  expiresAt: Date;
  rate: number;
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

let paymentClientInstance: InstanceType<typeof PaymentClient> | null = null;
let commonClientInstance: InstanceType<typeof CommonClient> | null = null;

function getPaymentClient(): InstanceType<typeof PaymentClient> {
  if (paymentClientInstance) {
    return paymentClientInstance;
  }

  const apiKey = process.env.OXAPAY_MERCHANT_API_KEY;
  if (!apiKey) {
    throw new Error("OXAPAY_MERCHANT_API_KEY not configured");
  }

  paymentClientInstance = new PaymentClient(apiKey);
  return paymentClientInstance;
}

function getCommonClient(): InstanceType<typeof CommonClient> {
  if (commonClientInstance) {
    return commonClientInstance;
  }

  commonClientInstance = new CommonClient();
  return commonClientInstance;
}

export function isOxaPayConfigured(): boolean {
  return Boolean(process.env.OXAPAY_MERCHANT_API_KEY);
}

class OxaPayService {
  async createPayment(params: {
    amount: number;
    currency?: string;
    payCurrency?: string;
    network?: OxaPayNetwork;
    orderId?: string;
    description?: string;
    callbackUrl?: string;
    email?: string;
    lifetime?: number;
  }): Promise<OxaPayPaymentResult> {
    const client = getPaymentClient();

    const {
      amount,
      currency = "USD",
      payCurrency = "USDT",
      network,
      orderId,
      description,
      callbackUrl,
      email,
      lifetime = 1800,
    } = params;

    logger.info("[OxaPay] Creating payment", {
      amount,
      currency,
      payCurrency,
      network,
      orderId,
    });

    const response = await client.generateWhiteLabel({
      amount,
      currency,
      pay_currency: payCurrency,
      network,
      order_id: orderId,
      description,
      callback_url: callbackUrl,
      email,
      lifetime,
      fee_paid_by_payer: 0,
    });

    const hasError = response.error && Object.keys(response.error).length > 0;
    if (response.status !== 200 || hasError) {
      logger.error("[OxaPay] Payment creation failed", {
        error: response.error,
        message: response.message,
      });
      throw new Error(response.error?.message || response.message || "Payment creation failed");
    }

    const data = response.data;

    logger.info("[OxaPay] Payment created", {
      trackId: data.track_id,
      address: data.address,
      payAmount: data.pay_amount,
    });

    return {
      trackId: data.track_id,
      address: data.address,
      amount: data.amount,
      currency: data.currency,
      payAmount: data.pay_amount,
      payCurrency: data.pay_currency,
      network: data.network,
      qrCode: data.qr_code,
      expiresAt: new Date(data.expired_at * 1000),
      rate: data.rate,
    };
  }

  async getPaymentStatus(trackId: string): Promise<OxaPayPaymentStatus> {
    const client = getPaymentClient();

    logger.info("[OxaPay] Checking payment status", { trackId });

    const response = await client.paymentInfo({ track_id: trackId });

    const hasError = response.error && Object.keys(response.error).length > 0;
    if (response.status !== 200 || hasError) {
      logger.error("[OxaPay] Payment status check failed", {
        error: response.error,
        message: response.message,
      });
      throw new Error(response.error?.message || response.message || "Payment status check failed");
    }

    const data = response.data;

    return {
      trackId: data.track_id,
      status: data.status,
      amount: data.amount,
      currency: data.currency,
      transactions: (data.txs || []).map((tx) => ({
        txHash: tx.tx_hash,
        amount: tx.amount,
        currency: tx.currency,
        network: tx.network,
        address: tx.address,
        status: tx.status,
        confirmations: tx.confirmations,
      })),
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
    const client = getCommonClient();

    const response = await client.supportedCurrencies();

    if (response.status !== 200) {
      throw new Error("Failed to fetch supported currencies");
    }

    const currencies = Object.entries(response.data)
      .filter(([_, info]) => info.status)
      .map(([symbol, info]) => ({
        symbol: info.symbol,
        name: info.name,
        networks: Object.entries(info.networks || {}).map(([_, netInfo]) => ({
          network: netInfo.network,
          name: netInfo.name,
          depositMin: netInfo.deposit_min,
          withdrawFee: netInfo.withdraw_fee,
        })),
      }));

    return currencies;
  }

  async getSystemStatus(): Promise<boolean> {
    const client = getCommonClient();

    try {
      const response = await client.systemStatus();
      return response.status === 200 && response.data?.status === true;
    } catch {
      return false;
    }
  }

  isPaymentConfirmed(status: string): boolean {
    return status === "Paid" || status === "Confirmed";
  }

  isPaymentPending(status: string): boolean {
    return status === "Waiting" || status === "Confirming";
  }

  isPaymentExpired(status: string): boolean {
    return status === "Expired";
  }

  isPaymentFailed(status: string): boolean {
    return status === "Failed" || status === "Refunded";
  }
}

export const oxaPayService = new OxaPayService();
