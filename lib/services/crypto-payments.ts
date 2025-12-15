import {
  cryptoPaymentsRepository,
  type CryptoPayment,
} from "@/db/repositories/crypto-payments";
import { db } from "@/db/client";
import { creditsService } from "./credits";
import { invoicesService } from "./invoices";
import { oxaPayService, isOxaPayConfigured, type OxaPayNetwork } from "./oxapay";
import { logger } from "@/lib/utils/logger";
import {
  PAYMENT_EXPIRATION_SECONDS,
  MIN_PAYMENT_AMOUNT,
  MAX_PAYMENT_AMOUNT,
  validatePaymentAmount,
  type OxaPayNetwork as ConfigOxaPayNetwork,
} from "@/lib/config/crypto";
import Decimal from "decimal.js";
import { validate as uuidValidate } from "uuid";

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

interface PaymentMetadata {
  oxapay_track_id?: string;
  qr_code?: string;
  rate?: number;
  fiat_currency?: string;
  fiat_amount?: number;
  [key: string]: unknown;
}

/**
 * Type guard to safely extract metadata with proper typing.
 */
function extractMetadata(metadata: unknown): PaymentMetadata {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }
  return metadata as PaymentMetadata;
}

/**
 * Safely extract track ID from metadata.
 */
function getTrackId(metadata: unknown): string {
  const meta = extractMetadata(metadata);
  const trackId = meta.oxapay_track_id;
  
  if (typeof trackId !== "string" || !trackId) {
    throw new Error("Missing or invalid OxaPay track ID");
  }
  
  return trackId;
}

/**
 * Validate UUID format.
 */
function validateUuid(id: string, fieldName: string): void {
  if (!uuidValidate(id)) {
    throw new Error(`Invalid ${fieldName}: must be a valid UUID`);
  }
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

    validateUuid(organizationId, "organization ID");
    
    if (userId) {
      validateUuid(userId, "user ID");
    }

    if (!isOxaPayConfigured()) {
      throw new Error("Payment service not configured");
    }

    const amountDecimal = new Decimal(amount);
    const validation = validatePaymentAmount(amountDecimal);
    
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const callbackUrl =
      process.env.OXAPAY_CALLBACK_URL ||
      `${process.env.NEXT_PUBLIC_APP_URL}/api/crypto/webhook`;

    const orderId = `${organizationId.replace(/-/g, "").slice(0, 12)}_${Date.now()}`;

    const oxaPayment = await oxaPayService.createPayment({
      amount,
      currency,
      payCurrency,
      network,
      orderId,
      description: `Credit purchase - $${amount}`,
      callbackUrl,
      lifetime: PAYMENT_EXPIRATION_SECONDS,
    });

    const payment = await cryptoPaymentsRepository.create({
      organization_id: organizationId,
      user_id: userId,
      payment_address: oxaPayment.address,
      expected_amount: oxaPayment.payAmount.toString(),
      credits_to_add: amountDecimal.toFixed(2),
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
    validateUuid(paymentId, "payment ID");
    
    const payment = await cryptoPaymentsRepository.findById(paymentId);
    if (!payment) return null;

    return this.formatPaymentStatus(payment);
  }

  async checkAndConfirmPayment(paymentId: string): Promise<{
    confirmed: boolean;
    payment: PaymentStatus;
  }> {
    validateUuid(paymentId, "payment ID");
    
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

    const trackId = getTrackId(payment.metadata);

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
        if (!confirmedPayment) {
          throw new Error("Failed to retrieve confirmed payment");
        }
        
        return {
          confirmed: true,
          payment: this.formatPaymentStatus(confirmedPayment),
        };
      }

      if (oxaPayService.isPaymentExpired(oxaStatus.status)) {
        await cryptoPaymentsRepository.markAsExpired(payment.id);
        const expiredPayment = await cryptoPaymentsRepository.findById(
          payment.id,
        );
        if (!expiredPayment) {
          throw new Error("Failed to retrieve expired payment");
        }
        
        return {
          confirmed: false,
          payment: this.formatPaymentStatus(expiredPayment),
        };
      }

      if (oxaPayService.isPaymentFailed(oxaStatus.status)) {
        await cryptoPaymentsRepository.markAsFailed(payment.id, oxaStatus.status);
        const failedPayment = await cryptoPaymentsRepository.findById(payment.id);
        if (!failedPayment) {
          throw new Error("Failed to retrieve failed payment");
        }
        
        return {
          confirmed: false,
          payment: this.formatPaymentStatus(failedPayment),
        };
      }
    } catch (error) {
      logger.error("[Crypto Payments] Failed to check OxaPay status", {
        paymentId,
        trackId,
        error,
      });
      throw error;
    }

    return {
      confirmed: false,
      payment: this.formatPaymentStatus(payment),
    };
  }

  /**
   * Confirm a payment with database transaction to prevent race conditions.
   */
  async confirmPayment(
    paymentId: string,
    txHash: string,
    blockNumber: string,
    receivedAmount: string,
  ): Promise<void> {
    validateUuid(paymentId, "payment ID");

    await db.transaction(async (tx) => {
      const payment = await cryptoPaymentsRepository.findById(paymentId);
      if (!payment) {
        throw new Error("Payment not found");
      }

      if (payment.status === "confirmed") {
        logger.info("[Crypto Payments] Payment already confirmed", {
          paymentId,
        });
        return;
      }

      const existingTx =
        await cryptoPaymentsRepository.findByTransactionHash(txHash);
      if (existingTx && existingTx.id !== paymentId) {
        throw new Error("Transaction already processed for another payment");
      }

      await cryptoPaymentsRepository.markAsConfirmed(
        paymentId,
        txHash,
        blockNumber,
        receivedAmount,
      );

      const creditsDecimal = new Decimal(payment.credits_to_add);
      await creditsService.addCredits({
        organizationId: payment.organization_id,
        amount: creditsDecimal.toNumber(),
        description: `Crypto payment (${payment.token} on ${payment.network})`,
        metadata: {
          crypto_payment_id: payment.id,
          transaction_hash: txHash,
          network: payment.network,
          token: payment.token,
          received_amount: receivedAmount,
          oxapay_track_id: getTrackId(payment.metadata),
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
          oxapay_track_id: getTrackId(payment.metadata),
        },
      });

      logger.info("[Crypto Payments] Payment confirmed and credits added", {
        paymentId,
        txHash,
        creditsAdded: creditsDecimal.toString(),
        organizationId: payment.organization_id,
      });
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

    if (typeof track_id !== "string" || typeof status !== "string") {
      throw new Error("Invalid webhook payload");
    }

    logger.info("[Crypto Payments] Webhook received", { track_id, status });

    const payments = await cryptoPaymentsRepository.listPendingPayments();
    const payment = payments.find((p) => {
      const metadata = extractMetadata(p.metadata);
      return metadata.oxapay_track_id === track_id;
    });

    if (!payment) {
      logger.warn("[Crypto Payments] Payment not found for webhook", {
        track_id,
      });
      return { success: false, message: "Payment not found" };
    }

    try {
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
    } catch (error) {
      logger.error("[Crypto Payments] Webhook processing error", {
        track_id,
        error,
      });
      throw error;
    }
  }

  async listPaymentsByOrganization(
    organizationId: string,
  ): Promise<PaymentStatus[]> {
    validateUuid(organizationId, "organization ID");
    
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

  async listExpiredPendingPayments(): Promise<CryptoPayment[]> {
    return cryptoPaymentsRepository.listExpiredPendingPayments();
  }

  private formatPaymentStatus(payment: CryptoPayment): PaymentStatus {
    const metadata = extractMetadata(payment.metadata);
    
    return {
      id: payment.id,
      trackId: (typeof metadata.oxapay_track_id === "string"
        ? metadata.oxapay_track_id
        : ""),
      status: payment.status,
      paymentAddress: payment.payment_address,
      expectedAmount: payment.expected_amount,
      receivedAmount: payment.received_amount || undefined,
      creditsToAdd: payment.credits_to_add,
      network: payment.network,
      token: payment.token,
      qrCode: (typeof metadata.qr_code === "string"
        ? metadata.qr_code
        : undefined),
      transactionHash: payment.transaction_hash || undefined,
      expiresAt: payment.expires_at,
      createdAt: payment.created_at,
      confirmedAt: payment.confirmed_at || undefined,
    };
  }
}

export const cryptoPaymentsService = new CryptoPaymentsService();
