import {
  cryptoPaymentsRepository,
  type CryptoPayment,
} from "@/db/repositories/crypto-payments";
import { db } from "@/db/client";
import { cryptoPayments } from "@/db/schemas/crypto-payments";
import { eq } from "drizzle-orm";
import { creditsService } from "./credits";
import { invoicesService } from "./invoices";
import { oxaPayService, isOxaPayConfigured, type OxaPayNetwork } from "./oxapay";
import { logger, redact } from "@/lib/utils/logger";
import {
  PAYMENT_EXPIRATION_SECONDS,
  MIN_PAYMENT_AMOUNT,
  MAX_PAYMENT_AMOUNT,
  validatePaymentAmount,
  type OxaPayNetwork as ConfigOxaPayNetwork,
} from "@/lib/config/crypto";
import {
  createCryptoInvoiceId,
  createCryptoCustomerId,
} from "@/lib/constants/invoice-ids";
import Decimal from "decimal.js";
import { validate as uuidValidate } from "uuid";
import { z } from "zod";

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

const paymentMetadataSchema = z.object({
  oxapay_track_id: z.string().optional(),
  qr_code: z.string().optional(),
  rate: z.number().optional(),
  fiat_currency: z.string().optional(),
  fiat_amount: z.number().optional(),
}).passthrough();

type PaymentMetadata = z.infer<typeof paymentMetadataSchema>;

/**
 * Safely extract metadata with runtime validation.
 */
function extractMetadata(metadata: unknown): PaymentMetadata {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }
  
  const result = paymentMetadataSchema.safeParse(metadata);
  if (!result.success) {
    logger.warn("[Crypto Payments] Invalid metadata format", { error: result.error });
    return {};
  }
  
  return result.data;
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
      paymentId: redact.paymentId(payment.id),
      trackId: redact.trackId(oxaPayment.trackId),
      organizationId: redact.orgId(organizationId),
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
        paymentId: redact.paymentId(paymentId),
        trackId: redact.trackId(trackId),
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
   * Uses row-level locking to prevent double-spending attacks.
   */
  async confirmPayment(
    paymentId: string,
    txHash: string,
    blockNumber: string,
    receivedAmount: string,
  ): Promise<void> {
    validateUuid(paymentId, "payment ID");

    await db.transaction(async (tx) => {
      const paymentResult = await tx
        .select()
        .from(cryptoPayments)
        .where(eq(cryptoPayments.id, paymentId))
        .for("update");

      const payment = paymentResult[0];

      if (!payment) {
        throw new Error("Payment not found");
      }

      if (payment.status === "confirmed") {
        logger.info("[Crypto Payments] Payment already confirmed", {
          paymentId: redact.paymentId(paymentId),
        });
        return;
      }

      if (payment.expires_at < new Date()) {
        logger.error("[Crypto Payments] Cannot confirm expired payment", {
          paymentId: redact.paymentId(paymentId),
          expiresAt: payment.expires_at,
        });
        throw new Error("Payment has expired");
      }

      const existingTx = await tx
        .select()
        .from(cryptoPayments)
        .where(eq(cryptoPayments.transaction_hash, txHash))
        .for("update");

      if (existingTx.length > 0 && existingTx[0].id !== paymentId) {
        logger.error("[Crypto Payments] Double-spend attempt detected", {
          paymentId: redact.paymentId(paymentId),
          txHash: redact.txHash(txHash),
          existingPaymentId: redact.paymentId(existingTx[0].id),
        });
        throw new Error("Transaction already processed for another payment");
      }

      await tx
        .update(cryptoPayments)
        .set({
          status: "confirmed",
          transaction_hash: txHash,
          block_number: blockNumber,
          received_amount: receivedAmount,
          confirmed_at: new Date(),
        })
        .where(eq(cryptoPayments.id, paymentId));

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

      // Create invoice with clearly namespaced IDs to distinguish from Stripe invoices.
      // These are NOT actual Stripe IDs - they use OXAPAY_* prefix for clarity.
      await invoicesService.create({
        organization_id: payment.organization_id,
        stripe_invoice_id: createCryptoInvoiceId(payment.id),
        stripe_customer_id: createCryptoCustomerId(payment.organization_id),
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
        paymentId: redact.paymentId(paymentId),
        txHash: redact.txHash(txHash),
        creditsAdded: creditsDecimal.toString(),
        organizationId: redact.orgId(payment.organization_id),
      });
    });
  }

  /**
   * Verify and confirm a payment using a provided transaction hash.
   * This allows users to manually confirm payments by providing their transaction hash.
   * 
   * SECURITY: This method performs on-chain verification via OxaPay API to ensure:
   * - The transaction hash exists and is associated with this payment
   * - The transaction has sufficient confirmations
   * - The amount received matches the expected amount
   * - Uses database transaction with row-level locking to prevent race conditions
   */
  async verifyAndConfirmByTxHash(
    paymentId: string,
    txHash: string,
  ): Promise<{ success: boolean; message: string }> {
    validateUuid(paymentId, "payment ID");

    try {
      // Use a database transaction with row-level locking to prevent race conditions
      // This ensures only one request can process the confirmation at a time
      return await db.transaction(async (tx) => {
        // Acquire a row-level lock on the payment record
        const paymentResult = await tx
          .select()
          .from(cryptoPayments)
          .where(eq(cryptoPayments.id, paymentId))
          .for("update");

        const payment = paymentResult[0];

        if (!payment) {
          return { success: false, message: "Payment not found" };
        }

        if (payment.status === "confirmed") {
          return { success: true, message: "Payment already confirmed" };
        }

        if (payment.status === "expired") {
          return { success: false, message: "Payment has expired" };
        }

        if (payment.status === "failed") {
          return { success: false, message: "Payment has failed" };
        }

        // Get the OxaPay track ID to verify on-chain
        let trackId: string;
        try {
          trackId = getTrackId(payment.metadata);
        } catch {
          logger.error("[Crypto Payments] Missing track ID for on-chain verification", {
            paymentId: redact.paymentId(paymentId),
            txHash: redact.txHash(txHash),
          });
          return { success: false, message: "Payment configuration error - missing track ID" };
        }

        // Verify the transaction on-chain via OxaPay API
        const oxaStatus = await oxaPayService.getPaymentStatus(trackId);
        
        // Check if the payment is confirmed on OxaPay's side
        if (!oxaPayService.isPaymentConfirmed(oxaStatus.status)) {
          logger.warn("[Crypto Payments] On-chain verification failed - payment not confirmed", {
            paymentId: redact.paymentId(paymentId),
            txHash: redact.txHash(txHash),
            trackId: redact.trackId(trackId),
            oxaPayStatus: oxaStatus.status,
          });
          return { 
            success: false, 
            message: `Payment not yet confirmed by blockchain. Current status: ${oxaStatus.status}`,
          };
        }

        // Verify the provided transaction hash matches one from OxaPay
        const matchingTx = oxaStatus.transactions.find(
          (txn) => txn.txHash.toLowerCase() === txHash.toLowerCase()
        );

        if (!matchingTx) {
          // List the valid transaction hashes for debugging (redacted)
          const validHashes = oxaStatus.transactions.map(txn => redact.txHash(txn.txHash));
          logger.warn("[Crypto Payments] Transaction hash not found in OxaPay records", {
            paymentId: redact.paymentId(paymentId),
            providedTxHash: redact.txHash(txHash),
            trackId: redact.trackId(trackId),
            validTransactions: validHashes,
          });
          return {
            success: false,
            message: "Transaction hash not found in payment records. Please ensure you submitted the correct transaction hash.",
          };
        }

        // Verify the transaction has enough confirmations (at least 1 for confirmed status)
        if (matchingTx.confirmations < 1) {
          logger.warn("[Crypto Payments] Transaction has insufficient confirmations", {
            paymentId: redact.paymentId(paymentId),
            txHash: redact.txHash(txHash),
            confirmations: matchingTx.confirmations,
          });
          return {
            success: false,
            message: `Transaction needs more confirmations. Current: ${matchingTx.confirmations}`,
          };
        }

        // Verify the amount is correct (with tolerance for minor differences)
        const expectedAmount = new Decimal(payment.expected_amount);
        const receivedAmount = new Decimal(matchingTx.amount);
        const tolerance = expectedAmount.mul(0.01); // 1% tolerance for fees
        
        if (receivedAmount.lt(expectedAmount.minus(tolerance))) {
          logger.warn("[Crypto Payments] Received amount less than expected", {
            paymentId: redact.paymentId(paymentId),
            txHash: redact.txHash(txHash),
            expected: expectedAmount.toString(),
            received: receivedAmount.toString(),
          });
          return {
            success: false,
            message: `Received amount (${receivedAmount}) is less than expected (${expectedAmount})`,
          };
        }

        // Check if this transaction hash is already used by another payment
        const existingTxResult = await tx
          .select()
          .from(cryptoPayments)
          .where(eq(cryptoPayments.transaction_hash, txHash))
          .for("update");

        if (existingTxResult.length > 0 && existingTxResult[0].id !== paymentId) {
          logger.error("[Crypto Payments] Double-spend attempt detected", {
            paymentId: redact.paymentId(paymentId),
            txHash: redact.txHash(txHash),
            existingPaymentId: redact.paymentId(existingTxResult[0].id),
          });
          return {
            success: false,
            message: "Transaction already processed for another payment",
          };
        }

        logger.info("[Crypto Payments] On-chain verification successful", {
          paymentId: redact.paymentId(paymentId),
          txHash: redact.txHash(txHash),
          trackId: redact.trackId(trackId),
          confirmations: matchingTx.confirmations,
          receivedAmount: matchingTx.amount,
        });

        // Update the payment record
        await tx
          .update(cryptoPayments)
          .set({
            status: "confirmed",
            transaction_hash: txHash,
            block_number: "0",
            received_amount: matchingTx.amount.toString(),
            confirmed_at: new Date(),
          })
          .where(eq(cryptoPayments.id, paymentId));

        // Add credits
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
            received_amount: matchingTx.amount.toString(),
            oxapay_track_id: trackId,
          },
        });

        // Create invoice with clearly namespaced IDs to distinguish from Stripe invoices.
        // These are NOT actual Stripe IDs - they use OXAPAY_* prefix for clarity.
        await invoicesService.create({
          organization_id: payment.organization_id,
          stripe_invoice_id: createCryptoInvoiceId(payment.id),
          stripe_customer_id: createCryptoCustomerId(payment.organization_id),
          stripe_payment_intent_id: txHash,
          amount_due: payment.credits_to_add,
          amount_paid: matchingTx.amount.toString(),
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
            oxapay_track_id: trackId,
          },
        });

        logger.info("[Crypto Payments] Manual confirmation successful", {
          paymentId: redact.paymentId(paymentId),
          txHash: redact.txHash(txHash),
          creditsAdded: creditsDecimal.toString(),
          organizationId: redact.orgId(payment.organization_id),
        });

        return {
          success: true,
          message: "Payment confirmed successfully",
        };
      });
    } catch (error) {
      logger.error("[Crypto Payments] Manual confirmation failed", {
        paymentId: redact.paymentId(paymentId),
        txHash: redact.txHash(txHash),
        error,
      });

      return {
        success: false,
        message: error instanceof Error ? error.message : "Confirmation failed",
      };
    }
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

    logger.info("[Crypto Payments] Webhook received", { track_id: redact.trackId(track_id), status });

    const payment = await cryptoPaymentsRepository.findByTrackId(track_id);

    if (!payment) {
      logger.warn("[Crypto Payments] Payment not found for webhook", {
        track_id: redact.trackId(track_id),
      });
      return { success: false, message: "Payment not found" };
    }

    if (payment.status !== "pending") {
      logger.info("[Crypto Payments] Payment already processed", {
        track_id: redact.trackId(track_id),
        status: payment.status,
      });
      return { success: true, message: "Payment already processed" };
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
        track_id: redact.trackId(track_id),
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
