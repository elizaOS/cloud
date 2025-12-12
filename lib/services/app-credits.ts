/**
 * Service for managing app-specific credit balances and purchases.
 */

import {
  appCreditBalancesRepository,
  type AppCreditBalance,
} from "@/db/repositories/app-credit-balances";
import { appsRepository, type App } from "@/db/repositories/apps";
import { appEarningsRepository } from "@/db/repositories/app-earnings";
import { apps } from "@/db/schemas/apps";
import { db } from "@/db/client";
import { eq, sql } from "drizzle-orm";
import { logger } from "@/lib/utils/logger";
import { usersRepository } from "@/db/repositories/users";
import { redeemableEarningsService } from "./redeemable-earnings";

/**
 * Parameters for purchasing app credits.
 */
export interface AppCreditPurchaseParams {
  appId: string;
  userId: string;
  organizationId: string;
  purchaseAmount: number;
  stripePaymentIntentId?: string; // For deduplication on webhook retries
}

/**
 * Result of purchasing app credits.
 */
export interface AppCreditPurchaseResult {
  success: boolean;
  creditsAdded: number;
  platformOffset: number;
  creatorEarnings: number;
  newBalance: number;
  balance: AppCreditBalance;
}

/**
 * Parameters for deducting app credits.
 */
export interface AppCreditDeductionParams {
  appId: string;
  userId: string;
  baseCost: number;
  description: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result of deducting app credits.
 */
export interface AppCreditDeductionResult {
  success: boolean;
  baseCost: number;
  creatorMarkup: number;
  totalCost: number;
  creatorEarnings: number;
  newBalance: number;
  message?: string;
}

/**
 * Service for managing app-specific credit balances, purchases, and deductions.
 */
export class AppCreditsService {
  async getBalance(
    appId: string,
    userId: string,
  ): Promise<{
    balance: number;
    totalPurchased: number;
    totalSpent: number;
  } | null> {
    const creditBalance = await appCreditBalancesRepository.findByAppAndUser(
      appId,
      userId,
    );

    if (!creditBalance) {
      return null;
    }

    return {
      balance: Number(creditBalance.credit_balance),
      totalPurchased: Number(creditBalance.total_purchased),
      totalSpent: Number(creditBalance.total_spent),
    };
  }

  async getOrCreateBalance(
    appId: string,
    userId: string,
    organizationId: string,
  ): Promise<AppCreditBalance> {
    return await appCreditBalancesRepository.getOrCreate(
      appId,
      userId,
      organizationId,
    );
  }

  /**
   * Add credits to an app-specific balance (for rewards, bonuses, etc.)
   * Unlike processPurchase, this doesn't involve revenue sharing.
   */
  async addCredits(
    appId: string,
    userId: string,
    amount: number,
    description: string,
  ): Promise<{ newBalance: number }> {
    // Get user's organization ID to ensure balance exists
    const user = await usersRepository.findById(userId);

    if (!user?.organization_id) {
      throw new Error(`User not found or has no organization: ${userId}`);
    }

    const { newBalance } = await appCreditBalancesRepository.addCredits(
      appId,
      userId,
      user.organization_id,
      amount,
    );

    logger.info("[AppCredits] Added credits (reward/bonus)", {
      appId,
      userId,
      amount,
      description,
      newBalance,
    });

    return { newBalance };
  }

  async processPurchase(
    params: AppCreditPurchaseParams,
  ): Promise<AppCreditPurchaseResult> {
    const {
      appId,
      userId,
      organizationId,
      purchaseAmount,
      stripePaymentIntentId,
    } = params;

    const app = await appsRepository.findById(appId);
    if (!app) {
      throw new Error(`App not found: ${appId}`);
    }

    // Deduplication check for Stripe webhook retries
    if (stripePaymentIntentId) {
      const existingTransaction =
        await appEarningsRepository.findTransactionByPaymentIntent(
          appId,
          stripePaymentIntentId,
        );
      if (existingTransaction) {
        logger.info("[AppCredits] Duplicate purchase detected, skipping", {
          appId,
          userId,
          stripePaymentIntentId,
        });
        // Return existing balance info - get or create to ensure we always have a balance record
        const balance = await appCreditBalancesRepository.getOrCreate(
          appId,
          userId,
          organizationId,
        );
        return {
          success: true,
          creditsAdded: 0, // Already processed
          platformOffset: 0,
          creatorEarnings: 0,
          newBalance: Number(balance.credit_balance),
          balance,
        };
      }
    }

    // Only apply platform offset and creator share if monetization is enabled
    // Users always get full credits for their purchase
    const platformOffset = app.monetization_enabled
      ? Math.min(Number(app.platform_offset_amount), purchaseAmount)
      : 0;
    const amountAfterOffset = purchaseAmount - platformOffset;
    const creatorSharePercentage = app.monetization_enabled
      ? Number(app.purchase_share_percentage) / 100
      : 0;
    const creatorEarnings = amountAfterOffset * creatorSharePercentage;
    const creditsToAdd = purchaseAmount;

    logger.info("[AppCredits] Processing purchase", {
      appId,
      userId,
      purchaseAmount,
      platformOffset,
      creatorEarnings,
      creditsToAdd,
    });

    const { balance, newBalance } =
      await appCreditBalancesRepository.addCredits(
        appId,
        userId,
        organizationId,
        creditsToAdd,
      );

    // Track app user activity for purchase (this will create app_users record if new user)
    await this.trackAppUserActivity(app, userId, "0.00", {
      type: "purchase",
      purchaseAmount,
      creditsAdded: creditsToAdd,
      ...(stripePaymentIntentId && { stripePaymentIntentId }),
    });

    // CRITICAL: Always create a transaction record for deduplication purposes
    // Even when monetization is disabled, we need to track the purchase
    if (app.monetization_enabled && creatorEarnings > 0) {
      await this.recordCreatorEarnings(
        appId,
        userId,
        "purchase_share",
        creatorEarnings,
        {
          purchaseAmount,
          platformOffset,
          creatorSharePercentage: Number(app.purchase_share_percentage),
          ...(stripePaymentIntentId && { stripePaymentIntentId }),
        },
      );

      await db
        .update(apps)
        .set({
          total_creator_earnings: sql`${apps.total_creator_earnings} + ${creatorEarnings}`,
          total_platform_revenue: sql`${apps.total_platform_revenue} + ${platformOffset}`,
          updated_at: new Date(),
        })
        .where(eq(apps.id, appId));
    } else if (stripePaymentIntentId) {
      // Monetization disabled but still need transaction record for deduplication
      await appEarningsRepository.createTransaction({
        app_id: appId,
        user_id: userId,
        type: "credit_purchase",
        amount: "0", // No earnings when monetization disabled
        description: "Credit purchase (monetization disabled)",
        metadata: {
          purchaseAmount,
          creditsAdded: creditsToAdd,
          stripePaymentIntentId,
          monetizationDisabled: true,
        },
      });
    }

    return {
      success: true,
      creditsAdded: creditsToAdd,
      platformOffset,
      creatorEarnings,
      newBalance,
      balance,
    };
  }

  async deductCredits(
    params: AppCreditDeductionParams,
  ): Promise<AppCreditDeductionResult> {
    const { appId, userId, baseCost, description, metadata } = params;

    const app = await appsRepository.findById(appId);
    if (!app) {
      return {
        success: false,
        baseCost,
        creatorMarkup: 0,
        totalCost: baseCost,
        creatorEarnings: 0,
        newBalance: 0,
        message: `App not found: ${appId}`,
      };
    }

    // Only apply markup if monetization is enabled
    // Otherwise, users pay base cost only and creator earns nothing
    const markupPercentage = app.monetization_enabled
      ? Number(app.inference_markup_percentage)
      : 0;
    const creatorMarkup = baseCost * (markupPercentage / 100);
    const totalCost = baseCost + creatorMarkup;

    const result = await appCreditBalancesRepository.deductCredits(
      appId,
      userId,
      totalCost,
    );

    if (!result.success) {
      return {
        success: false,
        baseCost,
        creatorMarkup,
        totalCost,
        creatorEarnings: 0,
        newBalance: result.newBalance,
        message: result.balance
          ? `Insufficient balance. Required: $${totalCost.toFixed(2)}, Available: $${result.newBalance.toFixed(2)}`
          : "No credit balance found for this app",
      };
    }

    // Track app user activity (creates/updates app_users record)
    await this.trackAppUserActivity(
      app,
      userId,
      totalCost.toFixed(4),
      metadata,
    );

    if (app.monetization_enabled && creatorMarkup > 0) {
      await this.recordCreatorEarnings(
        appId,
        userId,
        "inference_markup",
        creatorMarkup,
        {
          baseCost,
          markupPercentage,
          totalCost,
          description,
          ...metadata,
        },
      );

      await db
        .update(apps)
        .set({
          total_creator_earnings: sql`${apps.total_creator_earnings} + ${creatorMarkup}`,
          total_platform_revenue: sql`${apps.total_platform_revenue} + ${baseCost}`,
          updated_at: new Date(),
        })
        .where(eq(apps.id, appId));
    }

    logger.info("[AppCredits] Deducted credits", {
      appId,
      userId,
      baseCost,
      creatorMarkup,
      totalCost,
      newBalance: result.newBalance,
    });

    return {
      success: true,
      baseCost,
      creatorMarkup,
      totalCost,
      creatorEarnings: creatorMarkup,
      newBalance: result.newBalance,
    };
  }

  async calculateCostWithMarkup(
    appId: string,
    baseCost: number,
  ): Promise<{
    baseCost: number;
    creatorMarkup: number;
    totalCost: number;
    markupPercentage: number;
  }> {
    const app = await appsRepository.findById(appId);

    if (!app) {
      return {
        baseCost,
        creatorMarkup: 0,
        totalCost: baseCost,
        markupPercentage: 0,
      };
    }

    // Only apply markup if monetization is enabled
    const markupPercentage = app.monetization_enabled
      ? Number(app.inference_markup_percentage)
      : 0;
    const creatorMarkup = baseCost * (markupPercentage / 100);
    const totalCost = baseCost + creatorMarkup;

    return {
      baseCost,
      creatorMarkup,
      totalCost,
      markupPercentage,
    };
  }

  async checkBalance(
    appId: string,
    userId: string,
    requiredAmount: number,
  ): Promise<{
    sufficient: boolean;
    balance: number;
    required: number;
  }> {
    const balance = await appCreditBalancesRepository.getBalance(appId, userId);

    return {
      sufficient: balance >= requiredAmount,
      balance,
      required: requiredAmount,
    };
  }

  private async recordCreatorEarnings(
    appId: string,
    userId: string,
    type: "inference_markup" | "purchase_share",
    amount: number,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    // Update app-level earnings tracking
    if (type === "inference_markup") {
      await appEarningsRepository.addInferenceEarnings(appId, amount);
    } else {
      await appEarningsRepository.addPurchaseEarnings(appId, amount);
    }

    // Create transaction record
    await appEarningsRepository.createTransaction({
      app_id: appId,
      user_id: userId,
      type,
      amount: String(amount),
      description:
        type === "inference_markup"
          ? "Inference markup earnings"
          : "Credit purchase share",
      metadata,
    });

    // CRITICAL: Credit the app creator's redeemable_earnings balance
    // This allows them to redeem earnings as elizaOS tokens
    const app = await appsRepository.findById(appId);
    if (app?.created_by_user_id) {
      const result = await redeemableEarningsService.addEarnings({
        userId: app.created_by_user_id,
        amount,
        source: "miniapp",
        sourceId: appId,
        description:
          type === "inference_markup"
            ? `Inference markup from miniapp: ${app.name || appId}`
            : `Purchase share from miniapp: ${app.name || appId}`,
        metadata: {
          appId,
          earningsType: type,
          transactionUserId: userId, // User who triggered this earning
          ...metadata,
        },
      });

      if (!result.success) {
        logger.error("[AppCredits] Failed to credit redeemable earnings", {
          appId,
          creatorId: app.created_by_user_id,
          amount,
          error: result.error,
        });
      } else {
        logger.info("[AppCredits] Credited redeemable earnings to creator", {
          appId,
          creatorId: app.created_by_user_id,
          amount,
          newBalance: result.newBalance,
        });
      }
    }
  }

  /**
   * Track app user activity - creates or updates app_users record
   * This tracks individual users per app for analytics and monetization
   */
  private async trackAppUserActivity(
    app: App,
    userId: string,
    creditsUsed: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await appsRepository.trackAppUserActivity(
      app.id,
      userId,
      creditsUsed,
      metadata,
    );
  }

  async getMonetizationSettings(appId: string): Promise<{
    monetizationEnabled: boolean;
    inferenceMarkupPercentage: number;
    purchaseSharePercentage: number;
    platformOffsetAmount: number;
    totalCreatorEarnings: number;
  } | null> {
    const app = await appsRepository.findById(appId);
    if (!app) return null;

    return {
      monetizationEnabled: app.monetization_enabled,
      inferenceMarkupPercentage: Number(app.inference_markup_percentage),
      purchaseSharePercentage: Number(app.purchase_share_percentage),
      platformOffsetAmount: Number(app.platform_offset_amount),
      totalCreatorEarnings: Number(app.total_creator_earnings),
    };
  }

  async updateMonetizationSettings(
    appId: string,
    settings: {
      monetizationEnabled?: boolean;
      inferenceMarkupPercentage?: number;
      purchaseSharePercentage?: number;
    },
  ): Promise<void> {
    if (
      settings.inferenceMarkupPercentage !== undefined &&
      (settings.inferenceMarkupPercentage < 0 ||
        settings.inferenceMarkupPercentage > 1000)
    ) {
      throw new Error("Inference markup must be between 0% and 1000%");
    }

    if (
      settings.purchaseSharePercentage !== undefined &&
      (settings.purchaseSharePercentage < 0 ||
        settings.purchaseSharePercentage > 100)
    ) {
      throw new Error("Purchase share must be between 0% and 100%");
    }

    await appsRepository.update(appId, {
      ...(settings.monetizationEnabled !== undefined && {
        monetization_enabled: settings.monetizationEnabled,
      }),
      ...(settings.inferenceMarkupPercentage !== undefined && {
        inference_markup_percentage: String(settings.inferenceMarkupPercentage),
      }),
      ...(settings.purchaseSharePercentage !== undefined && {
        purchase_share_percentage: String(settings.purchaseSharePercentage),
      }),
    });

    logger.info("[AppCredits] Updated monetization settings", {
      appId,
      settings,
    });
  }
}

// Export singleton instance
export const appCreditsService = new AppCreditsService();
