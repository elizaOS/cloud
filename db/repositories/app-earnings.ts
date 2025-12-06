import { db } from "../client";
import {
  appEarnings,
  appEarningsTransactions,
  type AppEarnings,
  type NewAppEarnings,
  type AppEarningsTransaction,
  type NewAppEarningsTransaction,
} from "../schemas/app-earnings";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";

export type {
  AppEarnings,
  NewAppEarnings,
  AppEarningsTransaction,
  NewAppEarningsTransaction,
};

export class AppEarningsRepository {
  async findByAppId(appId: string): Promise<AppEarnings | undefined> {
    return await db.query.appEarnings.findFirst({
      where: eq(appEarnings.app_id, appId),
    });
  }

  async getOrCreate(appId: string): Promise<AppEarnings> {
    const existing = await this.findByAppId(appId);
    if (existing) {
      return existing;
    }

    const [created] = await db
      .insert(appEarnings)
      .values({ app_id: appId })
      .onConflictDoNothing()
      .returning();

    if (!created) {
      const refetched = await this.findByAppId(appId);
      if (!refetched) {
        throw new Error(`Failed to create or find earnings for app ${appId}`);
      }
      return refetched;
    }

    return created;
  }

  async addInferenceEarnings(
    appId: string,
    amount: number
  ): Promise<AppEarnings> {
    await this.getOrCreate(appId);

    const [updated] = await db
      .update(appEarnings)
      .set({
        total_lifetime_earnings: sql`${appEarnings.total_lifetime_earnings} + ${amount}`,
        total_inference_earnings: sql`${appEarnings.total_inference_earnings} + ${amount}`,
        pending_balance: sql`${appEarnings.pending_balance} + ${amount}`,
        updated_at: new Date(),
      })
      .where(eq(appEarnings.app_id, appId))
      .returning();

    return updated;
  }

  async addPurchaseEarnings(
    appId: string,
    amount: number
  ): Promise<AppEarnings> {
    await this.getOrCreate(appId);

    const [updated] = await db
      .update(appEarnings)
      .set({
        total_lifetime_earnings: sql`${appEarnings.total_lifetime_earnings} + ${amount}`,
        total_purchase_earnings: sql`${appEarnings.total_purchase_earnings} + ${amount}`,
        pending_balance: sql`${appEarnings.pending_balance} + ${amount}`,
        updated_at: new Date(),
      })
      .where(eq(appEarnings.app_id, appId))
      .returning();

    return updated;
  }

  async releasePendingToWithdrawable(appId: string): Promise<AppEarnings> {
    const earnings = await this.findByAppId(appId);
    if (!earnings) {
      throw new Error(`Earnings not found for app ${appId}`);
    }

    const pendingAmount = Number(earnings.pending_balance);
    if (pendingAmount <= 0) {
      return earnings;
    }

    const [updated] = await db
      .update(appEarnings)
      .set({
        pending_balance: "0.00",
        withdrawable_balance: sql`${appEarnings.withdrawable_balance} + ${pendingAmount}`,
        updated_at: new Date(),
      })
      .where(eq(appEarnings.app_id, appId))
      .returning();

    return updated;
  }

  async processWithdrawal(
    appId: string,
    amount: number
  ): Promise<{
    success: boolean;
    earnings: AppEarnings | null;
    message: string;
  }> {
    return await db.transaction(async (tx) => {
      const [earnings] = await tx
        .select()
        .from(appEarnings)
        .where(eq(appEarnings.app_id, appId))
        .for("update");

      if (!earnings) {
        return {
          success: false,
          earnings: null,
          message: "Earnings record not found",
        };
      }

      const withdrawable = Number(earnings.withdrawable_balance);
      const threshold = Number(earnings.payout_threshold);

      if (amount < threshold) {
        return {
          success: false,
          earnings,
          message: `Amount must be at least $${threshold.toFixed(2)}`,
        };
      }

      if (withdrawable < amount) {
        return {
          success: false,
          earnings,
          message: `Insufficient withdrawable balance: $${withdrawable.toFixed(2)}`,
        };
      }

      const [updated] = await tx
        .update(appEarnings)
        .set({
          withdrawable_balance: sql`${appEarnings.withdrawable_balance} - ${amount}`,
          total_withdrawn: sql`${appEarnings.total_withdrawn} + ${amount}`,
          last_withdrawal_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(appEarnings.app_id, appId))
        .returning();

      return {
        success: true,
        earnings: updated,
        message: "Withdrawal processed successfully",
      };
    });
  }

  async updatePayoutThreshold(
    appId: string,
    threshold: number
  ): Promise<AppEarnings> {
    const [updated] = await db
      .update(appEarnings)
      .set({
        payout_threshold: String(threshold),
        updated_at: new Date(),
      })
      .where(eq(appEarnings.app_id, appId))
      .returning();

    return updated;
  }

  async createTransaction(
    data: NewAppEarningsTransaction
  ): Promise<AppEarningsTransaction> {
    const [transaction] = await db
      .insert(appEarningsTransactions)
      .values(data)
      .returning();
    return transaction;
  }

  async listTransactions(
    appId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<AppEarningsTransaction[]> {
    return await db.query.appEarningsTransactions.findMany({
      where: eq(appEarningsTransactions.app_id, appId),
      orderBy: [desc(appEarningsTransactions.created_at)],
      limit,
      offset,
    });
  }

  async listTransactionsByType(
    appId: string,
    type: string,
    limit: number = 50
  ): Promise<AppEarningsTransaction[]> {
    return await db.query.appEarningsTransactions.findMany({
      where: and(
        eq(appEarningsTransactions.app_id, appId),
        eq(appEarningsTransactions.type, type)
      ),
      orderBy: [desc(appEarningsTransactions.created_at)],
      limit,
    });
  }

  async findTransactionByPaymentIntent(
    appId: string,
    paymentIntentId: string
  ): Promise<AppEarningsTransaction | undefined> {
    // Use SQL JSONB containment for efficient query
    const result = await db
      .select()
      .from(appEarningsTransactions)
      .where(
        and(
          eq(appEarningsTransactions.app_id, appId),
          sql`${appEarningsTransactions.metadata} @> ${JSON.stringify({ stripePaymentIntentId: paymentIntentId })}::jsonb`
        )
      )
      .limit(1);
    
    return result[0];
  }

  async getTransactionTotalsByType(
    appId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    inference_markup: number;
    purchase_share: number;
    withdrawal: number;
    adjustment: number;
  }> {
    const result = await db
      .select({
        type: appEarningsTransactions.type,
        total: sql<string>`COALESCE(SUM(${appEarningsTransactions.amount}), 0)`,
      })
      .from(appEarningsTransactions)
      .where(
        and(
          eq(appEarningsTransactions.app_id, appId),
          gte(appEarningsTransactions.created_at, startDate),
          lte(appEarningsTransactions.created_at, endDate)
        )
      )
      .groupBy(appEarningsTransactions.type);

    const totals = {
      inference_markup: 0,
      purchase_share: 0,
      withdrawal: 0,
      adjustment: 0,
    };

    for (const row of result) {
      if (row.type in totals) {
        totals[row.type as keyof typeof totals] = Number(row.total);
      }
    }

    return totals;
  }

  async getDailyEarnings(
    appId: string,
    startDate: Date,
    endDate: Date
  ): Promise<
    Array<{
      date: string;
      inference_earnings: number;
      purchase_earnings: number;
      total: number;
    }>
  > {
    const result = await db
      .select({
        date: sql<string>`DATE(${appEarningsTransactions.created_at})`,
        type: appEarningsTransactions.type,
        total: sql<string>`COALESCE(SUM(${appEarningsTransactions.amount}), 0)`,
      })
      .from(appEarningsTransactions)
      .where(
        and(
          eq(appEarningsTransactions.app_id, appId),
          gte(appEarningsTransactions.created_at, startDate),
          lte(appEarningsTransactions.created_at, endDate)
        )
      )
      .groupBy(
        sql`DATE(${appEarningsTransactions.created_at})`,
        appEarningsTransactions.type
      )
      .orderBy(sql`DATE(${appEarningsTransactions.created_at})`);

    const byDate: Record<
      string,
      { inference_earnings: number; purchase_earnings: number; total: number }
    > = {};

    for (const row of result) {
      if (!byDate[row.date]) {
        byDate[row.date] = {
          inference_earnings: 0,
          purchase_earnings: 0,
          total: 0,
        };
      }

      const amount = Number(row.total);
      if (row.type === "inference_markup") {
        byDate[row.date].inference_earnings = amount;
      } else if (row.type === "purchase_share") {
        byDate[row.date].purchase_earnings = amount;
      }
      byDate[row.date].total += amount;
    }

    return Object.entries(byDate).map(([date, data]) => ({
      date,
      ...data,
    }));
  }
}

// Export singleton instance
export const appEarningsRepository = new AppEarningsRepository();

