/**
 * Credits service for managing organization credit balances and transactions.
 */

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
import { organizationsService } from "./organizations";
import {
  canSendLowCreditsEmail,
  markLowCreditsEmailSent,
} from "@/lib/email/utils/rate-limiter";
import { CacheInvalidation } from "@/lib/cache/invalidation";
import { invalidateOrganizationCache } from "@/lib/cache/organizations-cache";
import { userSessionsService } from "./user-sessions";
import { logger } from "@/lib/utils/logger";

/**
 * Parameters for adding credits to an organization.
 */
export interface AddCreditsParams {
  organizationId: string;
  amount: number;
  description: string;
  metadata?: Record<string, unknown>;
  stripePaymentIntentId?: string;
}

/**
 * Parameters for deducting credits from an organization.
 */
export interface DeductCreditsParams {
  /** Organization ID. */
  organizationId: string;
  /** Amount to deduct in USD. */
  amount: number;
  /** Description of the deduction. */
  description: string;
  /** Optional metadata. */
  metadata?: Record<string, unknown>;
  /** Optional session token for tracking. */
  session_token?: string;
  /** Optional tokens consumed for usage tracking. */
  tokens_consumed?: number;
}

export interface ReserveAndDeductParams extends DeductCreditsParams {
  /** Minimum balance required before deduction (prevents race conditions) */
  minimumBalanceRequired?: number;
}

/**
 * Service for managing credits, transactions, and credit packs.
 */
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

    // IDEMPOTENCY: If stripePaymentIntentId is provided, check for existing transaction
    // This prevents race conditions when both synchronous and webhook calls try to add credits
    if (stripePaymentIntentId) {
      const existingTransaction =
        await this.getTransactionByStripePaymentIntent(stripePaymentIntentId);

      if (existingTransaction) {
        logger.info(
          `[CreditsService] Idempotency: Payment intent ${stripePaymentIntentId} already processed (transaction ${existingTransaction.id})`
        );

        // Get current balance to return consistent response
        const org = await organizationsRepository.findById(organizationId);
        if (!org) {
          throw new Error("Organization not found");
        }

        return {
          transaction: existingTransaction,
          newBalance: Number.parseFloat(String(org.credit_balance)),
        };
      }
    }

    // FIXED: Wrap in atomic transaction to prevent inconsistency between
    // transaction record and balance update
    const result = await db
      .transaction(async (tx) => {
        // Double-check inside transaction to handle race condition where both
        // threads passed the first check but haven't inserted yet
        if (stripePaymentIntentId) {
          const existingInTx = await tx.query.creditTransactions.findFirst({
            where: eq(
              creditTransactions.stripe_payment_intent_id,
              stripePaymentIntentId
            ),
          });

          if (existingInTx) {
            logger.info(
              `[CreditsService] Race condition detected: Payment intent ${stripePaymentIntentId} was inserted by another thread`
            );

            // Get current balance
            const org = await tx.query.organizations.findFirst({
              where: eq(organizations.id, organizationId),
            });

            if (!org) {
              throw new Error("Organization not found");
            }

            return {
              transaction: existingInTx,
              newBalance: Number.parseFloat(String(org.credit_balance)),
            };
          }
        }

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

        // Get current organization state with row-level lock to prevent concurrent modifications
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

        // Update organization balance atomically
        await tx
          .update(organizations)
          .set({
            credit_balance: String(newBalance),
            updated_at: new Date(),
          })
          .where(eq(organizations.id, organizationId));

        return { transaction, newBalance };
      })
      .then(async (result) => {
        // Invalidate organization cache since balance changed
        invalidateOrganizationCache(organizationId).catch((error) => {
          logger.error(
            "[CreditsService] Failed to invalidate org cache:",
            error
          );
        });
        return result;
      });

    // Invalidate balance cache immediately after transaction
    await CacheInvalidation.onCreditMutation(organizationId);

    return result;
  }

  async deductCredits(params: DeductCreditsParams): Promise<{
    success: boolean;
    newBalance: number;
    transaction: CreditTransaction | null;
  }> {
    // Delegate to reserveAndDeduct with no minimum balance requirement
    return this.reserveAndDeductCredits(params);
  }

  /**
   * Atomically check balance and deduct credits in a single transaction.
   * This prevents TOCTOU race conditions by using row-level locking.
   *
   * @param minimumBalanceRequired - Optional minimum balance that must exist BEFORE deduction
   *                                 (useful for reserving credits for estimated costs)
   */
  async reserveAndDeductCredits(params: ReserveAndDeductParams): Promise<{
    success: boolean;
    newBalance: number;
    transaction: CreditTransaction | null;
    reason?: "insufficient_balance" | "below_minimum" | "org_not_found";
  }> {
    const {
      organizationId,
      amount,
      description,
      metadata,
      session_token,
      tokens_consumed,
      minimumBalanceRequired = 0,
    } = params;

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
          return {
            success: false,
            newBalance: 0,
            transaction: null,
            reason: "org_not_found" as const,
          };
        }

        const currentBalance = Number.parseFloat(String(org.credit_balance));

        // Check if balance meets minimum requirement BEFORE deduction
        if (
          minimumBalanceRequired > 0 &&
          currentBalance < minimumBalanceRequired
        ) {
          return {
            success: false,
            newBalance: currentBalance,
            transaction: null,
            reason: "below_minimum" as const,
          };
        }

        const newBalance = currentBalance - amount;

        // Return early if insufficient credits, without creating a transaction
        if (newBalance < 0) {
          return {
            success: false,
            newBalance: currentBalance,
            transaction: null,
            reason: "insufficient_balance" as const,
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
            logger.error(
              "[CreditsService] Failed to invalidate org cache:",
              error
            );
          });
          // Invalidate balance cache immediately after successful deduction
          await CacheInvalidation.onCreditMutation(organizationId);

          // Track session usage if session_token is provided
          if (session_token) {
            userSessionsService
              .trackUsage({
                session_token,
                credits_used: amount,
                requests_made: 1,
                tokens_consumed: tokens_consumed || 0,
              })
              .catch((error) => {
                logger.error(
                  "[CreditsService] Failed to track session usage:",
                  error
                );
              });
          }

          // Check if auto top-up should be triggered
          this.checkAndTriggerAutoTopUp(
            organizationId,
            result.newBalance
          ).catch((error) => {
            logger.error(
              "[CreditsService] Failed to check auto top-up:",
              error
            );
          });

          // Queue low credits email
          this.queueLowCreditsEmail(organizationId, result.newBalance).catch(
            (error) => {
              logger.error(
                "[CreditsService] Failed to queue low credits email:",
                error
              );
            }
          );
        }
        return result;
      });
  }

  /**
   * Check if auto top-up should be triggered after credit deduction
   * This is called automatically after every successful credit deduction
   */
  private async checkAndTriggerAutoTopUp(
    organizationId: string,
    newBalance: number
  ): Promise<void> {
    try {
      // Get organization details
      const org = await organizationsRepository.findById(organizationId);
      if (!org) {
        return;
      }

      // Check if auto top-up is enabled
      if (!org.auto_top_up_enabled) {
        return;
      }

      const threshold = Number(org.auto_top_up_threshold || 0);

      // Check if balance is below threshold
      if (newBalance >= threshold) {
        return;
      }

      logger.info(
        `[CreditsService] Auto top-up triggered: balance $${newBalance.toFixed(2)} < threshold $${threshold.toFixed(2)}`
      );

      // Import auto top-up service dynamically for lazy loading (only when needed)
      const { autoTopUpService } = await import("./auto-top-up");

      // Execute auto top-up asynchronously (don't block the main operation)
      autoTopUpService.executeAutoTopUp(org).catch((error) => {
        logger.error(
          `[CreditsService] Auto top-up execution failed for org ${organizationId}:`,
          error
        );
      });
    } catch (error) {
      logger.error(
        `[CreditsService] Error checking auto top-up for org ${organizationId}:`,
        error
      );
    }
  }

  private async queueLowCreditsEmail(
    organizationId: string,
    currentBalance: number
  ): Promise<void> {
    try {
      const threshold = parseInt(
        process.env.LOW_CREDITS_THRESHOLD || "1000",
        10
      );

      if (currentBalance <= 0 || currentBalance > threshold) {
        return;
      }

      const canSend = await canSendLowCreditsEmail(organizationId);
      if (!canSend) {
        return;
      }

      const org = await organizationsService.getById(organizationId);
      if (!org) {
        return;
      }

      const recipientEmail = org.billing_email;
      if (!recipientEmail) {
        logger.debug("[CreditsService] No billing email for organization", {
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
      logger.error(
        `[CreditsService] Error queueing low credits email for org ${organizationId}:`,
        error
      );
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

    return await db
      .transaction(async (tx) => {
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
      })
      .then(async (result) => {
        // Invalidate organization cache since balance changed
        invalidateOrganizationCache(organizationId).catch((error) => {
          logger.error(
            "[CreditsService] Failed to invalidate org cache:",
            error
          );
        });
        return result;
      });
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

      const newBalance = org.credit_balance + amount;

      // Update balance
      await tx
        .update(organizations)
        .set({
          credit_balance: newBalance,
          updated_at: new Date(),
        })
        .where(eq(organizations.id, organizationId));

      // Create refund transaction record
      const [transaction] = await tx
        .insert(creditTransactions)
        .values({
          organization_id: organizationId,
          amount: amount,
          type: "refund",
          description,
          metadata: metadata || {},
          created_at: new Date(),
        })
        .returning();

      return { transaction, newBalance };
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
