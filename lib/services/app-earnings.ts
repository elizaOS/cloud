/**
 * Service for managing app earnings and revenue tracking.
 */

import {
  appEarningsRepository,
  type AppEarnings,
  type AppEarningsTransaction,
} from "@/db/repositories/app-earnings";
import { appsRepository } from "@/db/repositories/apps";
import { logger } from "@/lib/utils/logger";

/**
 * Summary of app earnings.
 */
export interface EarningsSummary {
  totalLifetimeEarnings: number;
  totalInferenceEarnings: number;
  totalPurchaseEarnings: number;
  pendingBalance: number;
  withdrawableBalance: number;
  totalWithdrawn: number;
  payoutThreshold: number;
}

/**
 * Earnings breakdown by period.
 */
export interface EarningsBreakdown {
  period: "day" | "week" | "month" | "all_time";
  inferenceEarnings: number;
  purchaseEarnings: number;
  total: number;
}

/**
 * Service for tracking and querying app earnings and revenue.
 */
export class AppEarningsService {
  async getEarningsSummary(appId: string): Promise<EarningsSummary | null> {
    const earnings = await appEarningsRepository.findByAppId(appId);

    if (!earnings) {
      return null;
    }

    return {
      totalLifetimeEarnings: Number(earnings.total_lifetime_earnings),
      totalInferenceEarnings: Number(earnings.total_inference_earnings),
      totalPurchaseEarnings: Number(earnings.total_purchase_earnings),
      pendingBalance: Number(earnings.pending_balance),
      withdrawableBalance: Number(earnings.withdrawable_balance),
      totalWithdrawn: Number(earnings.total_withdrawn),
      payoutThreshold: Number(earnings.payout_threshold),
    };
  }

  async getEarningsBreakdown(
    appId: string
  ): Promise<{
    today: EarningsBreakdown;
    thisWeek: EarningsBreakdown;
    thisMonth: EarningsBreakdown;
    allTime: EarningsBreakdown;
  }> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const allTimeStart = new Date(2020, 0, 1); // Far past date

    const [todayTotals, weekTotals, monthTotals, allTimeTotals] = await Promise.all([
      appEarningsRepository.getTransactionTotalsByType(appId, startOfDay, now),
      appEarningsRepository.getTransactionTotalsByType(appId, startOfWeek, now),
      appEarningsRepository.getTransactionTotalsByType(appId, startOfMonth, now),
      appEarningsRepository.getTransactionTotalsByType(appId, allTimeStart, now),
    ]);

    return {
      today: {
        period: "day",
        inferenceEarnings: todayTotals.inference_markup,
        purchaseEarnings: todayTotals.purchase_share,
        total: todayTotals.inference_markup + todayTotals.purchase_share,
      },
      thisWeek: {
        period: "week",
        inferenceEarnings: weekTotals.inference_markup,
        purchaseEarnings: weekTotals.purchase_share,
        total: weekTotals.inference_markup + weekTotals.purchase_share,
      },
      thisMonth: {
        period: "month",
        inferenceEarnings: monthTotals.inference_markup,
        purchaseEarnings: monthTotals.purchase_share,
        total: monthTotals.inference_markup + monthTotals.purchase_share,
      },
      allTime: {
        period: "all_time",
        inferenceEarnings: allTimeTotals.inference_markup,
        purchaseEarnings: allTimeTotals.purchase_share,
        total: allTimeTotals.inference_markup + allTimeTotals.purchase_share,
      },
    };
  }

  async getDailyEarningsChart(
    appId: string,
    days: number = 30
  ): Promise<
    Array<{
      date: string;
      inferenceEarnings: number;
      purchaseEarnings: number;
      total: number;
    }>
  > {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const data = await appEarningsRepository.getDailyEarnings(
      appId,
      startDate,
      endDate
    );

    return data.map((d) => ({
      date: d.date,
      inferenceEarnings: d.inference_earnings,
      purchaseEarnings: d.purchase_earnings,
      total: d.total,
    }));
  }

  async getTransactionHistory(
    appId: string,
    options?: {
      limit?: number;
      offset?: number;
      type?: "inference_markup" | "purchase_share" | "withdrawal" | "adjustment";
    }
  ): Promise<AppEarningsTransaction[]> {
    if (options?.type) {
      return await appEarningsRepository.listTransactionsByType(
        appId,
        options.type,
        options?.limit || 50
      );
    }

    return await appEarningsRepository.listTransactions(
      appId,
      options?.limit || 50,
      options?.offset || 0
    );
  }

  async updatePayoutThreshold(appId: string, threshold: number): Promise<void> {
    if (threshold < 1) {
      throw new Error("Payout threshold must be at least $1.00");
    }

    await appEarningsRepository.updatePayoutThreshold(appId, threshold);

    logger.info("[AppEarnings] Updated payout threshold", { appId, threshold });
  }

  async releasePendingEarnings(appId: string): Promise<void> {
    await appEarningsRepository.releasePendingToWithdrawable(appId);

    logger.info("[AppEarnings] Released pending earnings", { appId });
  }

  async requestWithdrawal(
    appId: string,
    amount: number
  ): Promise<{ success: boolean; message: string; transactionId?: string }> {
    const app = await appsRepository.findById(appId);
    if (!app) {
      return { success: false, message: "App not found" };
    }

    if (!app.monetization_enabled) {
      return { success: false, message: "Monetization is not enabled for this app" };
    }

    const result = await appEarningsRepository.processWithdrawal(appId, amount);
    if (!result.success) {
      return { success: false, message: result.message };
    }

    const transaction = await appEarningsRepository.createTransaction({
      app_id: appId,
      type: "withdrawal",
      amount: String(-amount),
      description: `Withdrawal of $${amount.toFixed(2)}`,
      metadata: { requested_at: new Date().toISOString(), status: "pending" },
    });

    logger.info("[AppEarnings] Withdrawal requested", { appId, amount, transactionId: transaction.id });

    return { success: true, message: `Withdrawal of $${amount.toFixed(2)} requested successfully`, transactionId: transaction.id };
  }

}

// Export singleton instance
export const appEarningsService = new AppEarningsService();

