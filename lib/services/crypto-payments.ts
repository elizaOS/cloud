import {
  cryptoPaymentsRepository,
  type CryptoPayment,
} from "@/db/repositories/crypto-payments";
import { creditsService } from "./credits";
import { invoicesService } from "./invoices";
import { oxaPayService, isOxaPayConfigured, type OxaPayNetwork } from "./oxapay";
import { logger } from "@/lib/utils/logger";

export interface CreatePaymentParams {
  organizationId: string;
  userId?: string;
  amount: number;
  currency?: string;
  payCurrency?: string;
  network?: OxaPayNetwork;
}

export interface PaymentStatus {
  id: string;
  trackId: string;
  status: string;
  paymentAddress: string;
  expectedAmount: string;
  receivedAmount?: string;
  creditsToAdd: string;
  network: string;
  token: string;
  qrCode?: string;
  transactionHash?: string;
  expiresAt: Date;
  createdAt: Date;
  confirmedAt?: Date;
}

class CryptoPaymentsService {
  async createPayment(params: CreatePaymentParams): Promise<{
    payment: CryptoPayment;
    paymentAddress: string;
    payAmount: number;
    payCurrency: string;
    network: string;
    qrCode: string;
    expiresAt: Date;
    trackId: string;
  }> {
    const {
      organizationId,
      userId,
      amount,
      currency = "USD",
      payCurrency = "USDT",
      network,
    } = params;

    if (!isOxaPayConfigured()) {
      throw new Error("OxaPay payment service not configured");
    }

    if (amount < 1 || amount > 10000) {
      throw new Error("Amount must be between $1 and $10,000");
    }

    const callbackUrl =
      process.env.OXAPAY_CALLBACK_URL ||
      `${process.env.NEXT_PUBLIC_APP_URL}/api/crypto/webhook`;

    const oxaPayment = await oxaPayService.createPayment({
      amount,
      currency,
      payCurrency,
      network,
      orderId: `${organizationId.replace(/-/g, "").slice(0, 12)}_${Date.now()}`,
      description: `Credit purchase - $${amount}`,
      callbackUrl,
      lifetime: 1800,
    });

    const payment = await cryptoPaymentsRepository.create({
      organization_id: organizationId,
      user_id: userId,
      payment_address: oxaPayment.address,
      expected_amount: oxaPayment.payAmount.toString(),
      credits_to_add: amount.toFixed(2),
      network: oxaPayment.network,
      token: oxaPayment.payCurrency,
      token_address: null,
      status: "pending",
      expires_at: oxaPayment.expiresAt,
      metadata: {
        oxapay_track_id: oxaPayment.trackId,
        qr_code: oxaPayment.qrCode,
        rate: oxaPayment.rate,
        fiat_currency: currency,
        fiat_amount: amount,
      },
    });

    logger.info("[Crypto Payments] Payment created via OxaPay", {
      paymentId: payment.id,
      trackId: oxaPayment.trackId,
      organizationId,
      amount,
      payCurrency,
      network: oxaPayment.network,
    });

    return {
      payment,
      paymentAddress: oxaPayment.address,
      payAmount: oxaPayment.payAmount,
      payCurrency: oxaPayment.payCurrency,
      network: oxaPayment.network,
      qrCode: oxaPayment.qrCode,
      expiresAt: oxaPayment.expiresAt,
      trackId: oxaPayment.trackId,
    };
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus | null> {
    const payment = await cryptoPaymentsRepository.findById(paymentId);
    if (!payment) return null;

    return this.formatPaymentStatus(payment);
  }

  async checkAndConfirmPayment(paymentId: string): Promise<{
    confirmed: boolean;
    payment: PaymentStatus;
  }> {
    const payment = await cryptoPaymentsRepository.findById(paymentId);
    if (!payment) {
      throw new Error("Payment not found");
    }

    if (payment.status === "confirmed") {
      return {
        confirmed: true,
        payment: this.formatPaymentStatus(payment),
      };
    }

    if (payment.status === "expired" || payment.status === "failed") {
      return {
        confirmed: false,
        payment: this.formatPaymentStatus(payment),
      };
    }

    const trackId = (payment.metadata as Record<string, unknown>)
      ?.oxapay_track_id as string;
    if (!trackId) {
      throw new Error("Missing OxaPay track ID");
    }

    try {
      const oxaStatus = await oxaPayService.getPaymentStatus(trackId);

      if (oxaPayService.isPaymentConfirmed(oxaStatus.status)) {
        const tx = oxaStatus.transactions[0];
        await this.confirmPayment(
          payment.id,
          tx?.txHash || trackId,
          "0",
          payment.expected_amount,
        );

        const confirmedPayment = await cryptoPaymentsRepository.findById(
          payment.id,
        );
        return {
          confirmed: true,
          payment: this.formatPaymentStatus(confirmedPayment!),
        };
      }

      if (oxaPayService.isPaymentExpired(oxaStatus.status)) {
        await cryptoPaymentsRepository.markAsExpired(payment.id);
        const expiredPayment = await cryptoPaymentsRepository.findById(
          payment.id,
        );
        return {
          confirmed: false,
          payment: this.formatPaymentStatus(expiredPayment!),
        };
      }

      if (oxaPayService.isPaymentFailed(oxaStatus.status)) {
        await cryptoPaymentsRepository.markAsFailed(payment.id, oxaStatus.status);
        const failedPayment = await cryptoPaymentsRepository.findById(payment.id);
        return {
          confirmed: false,
          payment: this.formatPaymentStatus(failedPayment!),
        };
      }
    } catch (error) {
      logger.error("[Crypto Payments] Failed to check OxaPay status", {
        paymentId,
        trackId,
        error,
      });
    }

    return {
      confirmed: false,
      payment: this.formatPaymentStatus(payment),
    };
  }

  async confirmPayment(
    paymentId: string,
    txHash: string,
    blockNumber: string,
    receivedAmount: string,
  ): Promise<void> {
    const payment = await cryptoPaymentsRepository.findById(paymentId);
    if (!payment) {
      throw new Error("Payment not found");
    }

    if (payment.status === "confirmed") {
      logger.info("[Crypto Payments] Payment already confirmed", { paymentId });
      return;
    }

    const existingTx = await cryptoPaymentsRepository.findByTransactionHash(txHash);
    if (existingTx && existingTx.id !== paymentId) {
      throw new Error("Transaction already processed");
    }

    await cryptoPaymentsRepository.markAsConfirmed(
      paymentId,
      txHash,
      blockNumber,
      receivedAmount,
    );

    const creditsToAdd = parseFloat(payment.credits_to_add);
    await creditsService.addCredits({
      organizationId: payment.organization_id,
      amount: creditsToAdd,
      description: `Crypto payment (${payment.token} on ${payment.network})`,
      metadata: {
        crypto_payment_id: payment.id,
        transaction_hash: txHash,
        network: payment.network,
        token: payment.token,
        received_amount: receivedAmount,
        oxapay_track_id: (payment.metadata as Record<string, unknown>)
          ?.oxapay_track_id,
      },
    });

    await invoicesService.create({
      organization_id: payment.organization_id,
      stripe_invoice_id: `crypto_${payment.id}`,
      stripe_customer_id: `org_${payment.organization_id}`,
      stripe_payment_intent_id: txHash,
      amount_due: payment.credits_to_add,
      amount_paid: receivedAmount,
      currency: payment.token.toLowerCase(),
      status: "paid",
      invoice_type: "crypto_payment",
      credits_added: payment.credits_to_add,
      metadata: {
        payment_method: "crypto",
        provider: "oxapay",
        network: payment.network,
        token: payment.token,
        transaction_hash: txHash,
        oxapay_track_id: (payment.metadata as Record<string, unknown>)
          ?.oxapay_track_id,
      },
    });

    logger.info("[Crypto Payments] Payment confirmed and credits added", {
      paymentId,
      txHash,
      creditsAdded: creditsToAdd,
      organizationId: payment.organization_id,
    });
  }

  async handleWebhook(payload: {
    track_id: string;
    status: string;
    amount?: number;
    pay_amount?: number;
    address?: string;
    txID?: string;
  }): Promise<{ success: boolean; message: string }> {
    const { track_id, status, txID } = payload;

    logger.info("[Crypto Payments] Webhook received", { track_id, status });

    const payments = await cryptoPaymentsRepository.listPendingPayments();
    const payment = payments.find(
      (p) =>
        (p.metadata as Record<string, unknown>)?.oxapay_track_id === track_id,
    );

    if (!payment) {
      logger.warn("[Crypto Payments] Payment not found for webhook", {
        track_id,
      });
      return { success: false, message: "Payment not found" };
    }

    if (oxaPayService.isPaymentConfirmed(status)) {
      await this.confirmPayment(
        payment.id,
        txID || track_id,
        "0",
        payment.expected_amount,
      );
      return { success: true, message: "Payment confirmed" };
    }

    if (oxaPayService.isPaymentExpired(status)) {
      await cryptoPaymentsRepository.markAsExpired(payment.id);
      return { success: true, message: "Payment marked as expired" };
    }

    if (oxaPayService.isPaymentFailed(status)) {
      await cryptoPaymentsRepository.markAsFailed(payment.id, status);
      return { success: true, message: "Payment marked as failed" };
    }

    return { success: true, message: "Webhook processed" };
  }

  async listPaymentsByOrganization(
    organizationId: string,
  ): Promise<PaymentStatus[]> {
    const payments =
      await cryptoPaymentsRepository.listByOrganization(organizationId);
    return payments.map((p) => this.formatPaymentStatus(p));
  }

  async getSupportedCurrencies() {
    return oxaPayService.getSupportedCurrencies();
  }

  async getSystemStatus() {
    return oxaPayService.getSystemStatus();
  }

  private formatPaymentStatus(payment: CryptoPayment): PaymentStatus {
    const metadata = payment.metadata as Record<string, unknown>;
    return {
      id: payment.id,
      trackId: (metadata?.oxapay_track_id as string) || "",
      status: payment.status,
      paymentAddress: payment.payment_address,
      expectedAmount: payment.expected_amount,
      receivedAmount: payment.received_amount || undefined,
      creditsToAdd: payment.credits_to_add,
      network: payment.network,
      token: payment.token,
      qrCode: (metadata?.qr_code as string) || undefined,
      transactionHash: payment.transaction_hash || undefined,
      expiresAt: payment.expires_at,
      createdAt: payment.created_at,
      confirmedAt: payment.confirmed_at || undefined,
    };
  }
}

export const cryptoPaymentsService = new CryptoPaymentsService();
