import {
  cryptoPaymentsRepository,
  type CryptoPayment,
} from "@/db/repositories/crypto-payments";
import { creditsService } from "./credits";
import { invoicesService } from "./invoices";
import {
  cdpWalletService,
  type CdpNetwork,
  getDefaultNetwork,
  isCdpConfigured,
} from "./cdp-wallet";
import { logger } from "@/lib/utils/logger";
import { v4 as uuidv4 } from "uuid";

const PAYMENT_EXPIRY_MINUTES = 30;

export interface CreatePaymentParams {
  organizationId: string;
  userId?: string;
  amount: number;
  network?: CdpNetwork;
}

export interface PaymentStatus {
  id: string;
  status: CryptoPayment["status"];
  paymentAddress: string;
  expectedAmount: string;
  receivedAmount?: string;
  creditsToAdd: string;
  network: string;
  token: string;
  transactionHash?: string;
  expiresAt: Date;
  createdAt: Date;
  confirmedAt?: Date;
}

class CryptoPaymentsService {
  async createPayment(params: CreatePaymentParams): Promise<{
    payment: CryptoPayment;
    paymentAddress: string;
    network: CdpNetwork;
    expiresAt: Date;
    usdcAddress: string;
  }> {
    const { organizationId, userId, amount, network = getDefaultNetwork() } = params;

    if (!isCdpConfigured()) {
      throw new Error("CDP wallet service not configured");
    }

    if (amount < 5 || amount > 1000) {
      throw new Error("Amount must be between $5 and $1000");
    }

    const { address, expiresAt } = await cdpWalletService.createPaymentAddress(network);
    const networkConfig = cdpWalletService.getNetworkConfig(network);

    const payment = await cryptoPaymentsRepository.create({
      organization_id: organizationId,
      user_id: userId,
      payment_address: address,
      expected_amount: amount.toFixed(6),
      credits_to_add: amount.toFixed(2),
      network,
      token: "USDC",
      token_address: networkConfig.usdcAddress,
      status: "pending",
      expires_at: expiresAt,
      metadata: {},
    });

    logger.info("[Crypto Payments] Payment created", {
      paymentId: payment.id,
      organizationId,
      amount,
      network,
      address,
    });

    return {
      payment,
      paymentAddress: address,
      network,
      expiresAt,
      usdcAddress: networkConfig.usdcAddress,
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

    if (payment.status !== "pending") {
      return {
        confirmed: payment.status === "confirmed",
        payment: this.formatPaymentStatus(payment),
      };
    }

    if (new Date() > payment.expires_at) {
      await cryptoPaymentsRepository.markAsExpired(payment.id);
      const updatedPayment = await cryptoPaymentsRepository.findById(payment.id);
      return {
        confirmed: false,
        payment: this.formatPaymentStatus(updatedPayment!),
      };
    }

    const result = await cdpWalletService.checkForPayment(
      payment.payment_address,
      parseFloat(payment.expected_amount),
      payment.network as CdpNetwork,
    );

    if (result.received && result.transactionHash) {
      await this.confirmPayment(
        payment.id,
        result.transactionHash,
        result.blockNumber || "0",
        result.amount,
      );

      const confirmedPayment = await cryptoPaymentsRepository.findById(payment.id);
      return {
        confirmed: true,
        payment: this.formatPaymentStatus(confirmedPayment!),
      };
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
      description: `USDC payment on ${payment.network}`,
      metadata: {
        crypto_payment_id: payment.id,
        transaction_hash: txHash,
        network: payment.network,
        token: payment.token,
        received_amount: receivedAmount,
      },
    });

    await invoicesService.create({
      organization_id: payment.organization_id,
      stripe_invoice_id: `crypto_${payment.id}`,
      stripe_customer_id: `org_${payment.organization_id}`,
      stripe_payment_intent_id: txHash,
      amount_due: payment.expected_amount,
      amount_paid: receivedAmount,
      currency: "usdc",
      status: "paid",
      invoice_type: "crypto_payment",
      credits_added: payment.credits_to_add,
      metadata: {
        payment_method: "crypto",
        network: payment.network,
        token: payment.token,
        transaction_hash: txHash,
        block_number: blockNumber,
      },
    });

    logger.info("[Crypto Payments] Payment confirmed and credits added", {
      paymentId,
      txHash,
      creditsAdded: creditsToAdd,
      organizationId: payment.organization_id,
    });
  }

  async verifyAndConfirmByTxHash(
    paymentId: string,
    txHash: string,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const payment = await cryptoPaymentsRepository.findById(paymentId);
    if (!payment) {
      return { success: false, message: "Payment not found" };
    }

    if (payment.status === "confirmed") {
      return { success: true, message: "Payment already confirmed" };
    }

    const verification = await cdpWalletService.verifyTransaction(
      txHash,
      payment.payment_address,
      parseFloat(payment.expected_amount),
      payment.network as CdpNetwork,
    );

    if (!verification.verified) {
      return { success: false, message: "Transaction verification failed" };
    }

    if ((verification.confirmations || 0) < 1) {
      return { success: false, message: "Waiting for confirmation" };
    }

    await this.confirmPayment(
      payment.id,
      txHash,
      verification.blockNumber || "0",
      verification.amount || payment.expected_amount,
    );

    return { success: true, message: "Payment confirmed" };
  }

  async listPaymentsByOrganization(organizationId: string): Promise<PaymentStatus[]> {
    const payments = await cryptoPaymentsRepository.listByOrganization(organizationId);
    return payments.map((p) => this.formatPaymentStatus(p));
  }

  async expirePendingPayments(): Promise<number> {
    const expired = await cryptoPaymentsRepository.listExpiredPendingPayments();
    let count = 0;

    for (const payment of expired) {
      await cryptoPaymentsRepository.markAsExpired(payment.id);
      count++;
    }

    if (count > 0) {
      logger.info("[Crypto Payments] Expired pending payments", { count });
    }

    return count;
  }

  private formatPaymentStatus(payment: CryptoPayment): PaymentStatus {
    return {
      id: payment.id,
      status: payment.status as PaymentStatus["status"],
      paymentAddress: payment.payment_address,
      expectedAmount: payment.expected_amount,
      receivedAmount: payment.received_amount || undefined,
      creditsToAdd: payment.credits_to_add,
      network: payment.network,
      token: payment.token,
      transactionHash: payment.transaction_hash || undefined,
      expiresAt: payment.expires_at,
      createdAt: payment.created_at,
      confirmedAt: payment.confirmed_at || undefined,
    };
  }
}

export const cryptoPaymentsService = new CryptoPaymentsService();
