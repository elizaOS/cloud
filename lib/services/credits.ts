import {
  creditTransactionsRepository,
  creditPacksRepository,
  type CreditTransaction,
  type NewCreditTransaction,
  type CreditPack,
} from "@/db/repositories";
import { db } from "@/db/client";
import { organizations } from "@/db/schemas/organizations";
import { creditTransactions } from "@/db/schemas/credit-transactions";
import { eq } from "drizzle-orm";
import { emailService } from "./email";
import {
  canSendLowCreditsEmail,
  markLowCreditsEmailSent,
} from "@/lib/email/utils/rate-limiter";
import { invalidateOrganizationCache } from "@/lib/cache/organizations-cache";

// Parameter types for consistent API signatures
export interface AddCreditsParams {
  organizationId: string;
  amount: number;
  description: string;
  metadata?: Record<string, unknown>;
  stripePaymentIntentId?: string;
}

export interface DeductCreditsParams {
  organizationId: string;
  amount: number;
  description: string;
  metadata?: Record<string, unknown>;
}

export class CreditsService {
  // Credit Transactions
  async getTransactionById(id: string): Promise<CreditTransaction | undefined> {
    return await creditTransactionsRepository.findById(id);
  }

  async getTransactionByStripePaymentIntent(
    paymentIntentId: string,
  ): Promise<CreditTransaction | undefined> {
    return await creditTransactionsRepository.findByStripePaymentIntent(
      paymentIntentId,
    );
  }

  async listTransactionsByOrganization(
    organizationId: string,
    limit?: number,
  ): Promise<CreditTransaction[]> {
    return await creditTransactionsRepository.listByOrganization(
      organizationId,
      limit,
    );
  }

  async listTransactionsByOrganizationAndType(
    organizationId: string,
    type: string,
  ): Promise<CreditTransaction[]> {
    return await creditTransactionsRepository.listByOrganizationAndType(
      organizationId,
      type,
    );
  }

  async createTransaction(
    data: NewCreditTransaction,
  ): Promise<CreditTransaction> {
    return await creditTransactionsRepository.create(data);
  }

  async addCredits(params: AddCreditsParams): Promise<{
    transaction: CreditTransaction;
    newBalance: number;
  }> {
    const {
      organizationId,
      amount,
      description,
      metadata,
      stripePaymentIntentId,
    } = params;

    // FIXED: Wrap in atomic transaction to prevent inconsistency between
    // transaction record and balance update
    return await db.transaction(async (tx) => {
      // Create transaction record
      const [transaction] = await tx
        .insert(creditTransactions)
        .values({
          organization_id: organizationId,
          amount: String(amount),
          type: "credit",
          description,
          metadata: metadata || {},
          stripe_payment_intent_id: stripePaymentIntentId,
          created_at: new Date(),
        })
        .returning();

      // Get current organization state
      const org = await tx.query.organizations.findFirst({
        where: eq(organizations.id, organizationId),
      });

      if (!org) {
        throw new Error("Organization not found");
      }

      const currentBalance = Number.parseFloat(String(org.credit_balance));
      const newBalance = currentBalance + amount;

      // Update organization balance atomically
      await tx
        .update(organizations)
        .set({
          credit_balance: String(newBalance),
          updated_at: new Date(),
        })
        .where(eq(organizations.id, organizationId));

      return { transaction, newBalance };
    }).then(async (result) => {
      // Invalidate organization cache since balance changed
      invalidateOrganizationCache(organizationId).catch((error) => {
        console.error("[CreditsService] Failed to invalidate org cache:", error);
      });
      return result;
    });
  }

  async deductCredits(params: DeductCreditsParams): Promise<{
    success: boolean;
    newBalance: number;
    transaction: CreditTransaction | null;
  }> {
    const { organizationId, amount, description, metadata } = params;

    if (amount <= 0) {
      throw new Error("Amount must be positive");
    }

    // CRITICAL FIX: Wrap entire operation in atomic transaction with row-level
    // locking to prevent race conditions where concurrent requests could cause
    // negative balance (TOCTOU vulnerability)
    return await db
      .transaction(async (tx) => {
        // Lock the organization row with FOR UPDATE to prevent concurrent access
        // This ensures atomicity and prevents race conditions
        const [org] = await tx
          .select()
          .from(organizations)
          .where(eq(organizations.id, organizationId))
          .for("update");

        if (!org) {
          throw new Error("Organization not found");
        }

        const currentBalance = Number.parseFloat(String(org.credit_balance));
        const newBalance = currentBalance - amount;

        // Return early if insufficient credits, without creating a transaction
        if (newBalance < 0) {
          return {
            success: false,
            newBalance: currentBalance,
            transaction: null,
          };
        }

        // Update balance atomically
        await tx
          .update(organizations)
          .set({
            credit_balance: String(newBalance),
            updated_at: new Date(),
          })
          .where(eq(organizations.id, organizationId));

        // Create transaction record
        const [transaction] = await tx
          .insert(creditTransactions)
          .values({
            organization_id: organizationId,
            amount: String(-amount),
            type: "debit",
            description,
            metadata: metadata || {},
            created_at: new Date(),
          })
          .returning();

        const result = { success: true, newBalance, transaction };

        return result;
      })
      .then(async (result) => {
        // Invalidate organization cache if balance changed
        if (result.success) {
          invalidateOrganizationCache(organizationId).catch((error) => {
            console.error("[CreditsService] Failed to invalidate org cache:", error);
          });
        }
        if (result.success) {
          this.queueLowCreditsEmail(organizationId, result.newBalance).catch(
            (error) => {
              console.error(
                "[CreditsService] Failed to queue low credits email:",
                error,
              );
            },
          );
        }
        return result;
      });
  }

  private async queueLowCreditsEmail(
    organizationId: string,
    currentBalance: number,
  ): Promise<void> {
    try {
      const threshold = parseInt(
        process.env.LOW_CREDITS_THRESHOLD || "1000",
        10,
      );

      if (currentBalance <= 0 || currentBalance > threshold) {
        return;
      }

      const canSend = await canSendLowCreditsEmail(organizationId);
      if (!canSend) {
        return;
      }

      const { organizationsService } = await import("./organizations");
      const org = await organizationsService.getById(organizationId);
      if (!org) {
        return;
      }

      const recipientEmail = org.billing_email;
      if (!recipientEmail) {
        console.warn("[CreditsService] No billing email for organization", {
          organizationId,
        });
        return;
      }

      const sent = await emailService.sendLowCreditsEmail({
        email: recipientEmail,
        organizationName: org.name,
        currentBalance,
        threshold,
        billingUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
      });

      if (sent) {
        await markLowCreditsEmailSent(organizationId);
      }
    } catch (error) {
      console.error("[CreditsService] Error sending low credits email:", error);
    }
  }

  /**
   * Refund credits (e.g., when a generation fails after deduction)
   * Creates a credit transaction to restore the amount
   */
  async refundCredits(params: AddCreditsParams): Promise<{
    transaction: CreditTransaction;
    newBalance: number;
  }> {
    const { organizationId, amount, description, metadata } = params;

    if (amount <= 0) {
      throw new Error("Refund amount must be positive");
    }

    return await db.transaction(async (tx) => {
      // Lock the organization row
      const [org] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .for("update");

      if (!org) {
        throw new Error("Organization not found");
      }

      const currentBalance = Number.parseFloat(String(org.credit_balance));
      const newBalance = currentBalance + amount;

      // Update balance
      await tx
        .update(organizations)
        .set({
          credit_balance: String(newBalance),
          updated_at: new Date(),
        })
        .where(eq(organizations.id, organizationId));

      // Create refund transaction record
      const [transaction] = await tx
        .insert(creditTransactions)
        .values({
          organization_id: organizationId,
          amount: String(amount),
          type: "refund",
          description,
          metadata: metadata || {},
          created_at: new Date(),
        })
        .returning();

      return { transaction, newBalance };
    }).then(async (result) => {
      // Invalidate organization cache since balance changed
      invalidateOrganizationCache(organizationId).catch((error) => {
        console.error("[CreditsService] Failed to invalidate org cache:", error);
      });
      return result;
    });
  }

  // Credit Packs
  async getCreditPackById(id: string): Promise<CreditPack | undefined> {
    return await creditPacksRepository.findById(id);
  }

  async getCreditPackByStripePriceId(
    stripePriceId: string,
  ): Promise<CreditPack | undefined> {
    return await creditPacksRepository.findByStripePriceId(stripePriceId);
  }

  async listActiveCreditPacks(): Promise<CreditPack[]> {
    return await creditPacksRepository.listActive();
  }

  async listAllCreditPacks(): Promise<CreditPack[]> {
    return await creditPacksRepository.listAll();
  }
}

// Export singleton instance
export const creditsService = new CreditsService();
