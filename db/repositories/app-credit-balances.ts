import { db } from "../client";
import {
  appCreditBalances,
  type AppCreditBalance,
  type NewAppCreditBalance,
} from "../schemas/app-credit-balances";
import { eq, and, sql, desc } from "drizzle-orm";

export type { AppCreditBalance, NewAppCreditBalance };

export class AppCreditBalancesRepository {
  async findById(id: string): Promise<AppCreditBalance | undefined> {
    return await db.query.appCreditBalances.findFirst({
      where: eq(appCreditBalances.id, id),
    });
  }

  async findByAppAndUser(
    appId: string,
    userId: string
  ): Promise<AppCreditBalance | undefined> {
    return await db.query.appCreditBalances.findFirst({
      where: and(
        eq(appCreditBalances.app_id, appId),
        eq(appCreditBalances.user_id, userId)
      ),
    });
  }

  async listByApp(appId: string): Promise<AppCreditBalance[]> {
    return await db.query.appCreditBalances.findMany({
      where: eq(appCreditBalances.app_id, appId),
      orderBy: [desc(appCreditBalances.credit_balance)],
    });
  }

  async listByUser(userId: string): Promise<AppCreditBalance[]> {
    return await db.query.appCreditBalances.findMany({
      where: eq(appCreditBalances.user_id, userId),
      orderBy: [desc(appCreditBalances.updated_at)],
    });
  }

  async create(data: NewAppCreditBalance): Promise<AppCreditBalance> {
    const [balance] = await db
      .insert(appCreditBalances)
      .values(data)
      .returning();
    return balance;
  }

  async getOrCreate(
    appId: string,
    userId: string,
    organizationId: string
  ): Promise<AppCreditBalance> {
    const existing = await this.findByAppAndUser(appId, userId);
    if (existing) {
      return existing;
    }

    return await this.create({
      app_id: appId,
      user_id: userId,
      organization_id: organizationId,
    });
  }

  async addCredits(
    appId: string,
    userId: string,
    organizationId: string,
    amount: number
  ): Promise<{
    balance: AppCreditBalance;
    newBalance: number;
  }> {
    return await db.transaction(async (tx) => {
      let balance = await tx.query.appCreditBalances.findFirst({
        where: and(
          eq(appCreditBalances.app_id, appId),
          eq(appCreditBalances.user_id, userId)
        ),
      });

      if (!balance) {
        const [newBalance] = await tx
          .insert(appCreditBalances)
          .values({
            app_id: appId,
            user_id: userId,
            organization_id: organizationId,
            credit_balance: String(amount),
            total_purchased: String(amount),
          })
          .returning();

        return {
          balance: newBalance,
          newBalance: amount,
        };
      }

      const [updated] = await tx
        .update(appCreditBalances)
        .set({
          credit_balance: sql`${appCreditBalances.credit_balance} + ${amount}`,
          total_purchased: sql`${appCreditBalances.total_purchased} + ${amount}`,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(appCreditBalances.app_id, appId),
            eq(appCreditBalances.user_id, userId)
          )
        )
        .returning();

      return {
        balance: updated,
        newBalance: Number(updated.credit_balance),
      };
    });
  }

  async deductCredits(
    appId: string,
    userId: string,
    amount: number
  ): Promise<{
    success: boolean;
    balance: AppCreditBalance | null;
    newBalance: number;
  }> {
    return await db.transaction(async (tx) => {
      const [balance] = await tx
        .select()
        .from(appCreditBalances)
        .where(
          and(
            eq(appCreditBalances.app_id, appId),
            eq(appCreditBalances.user_id, userId)
          )
        )
        .for("update");

      if (!balance) {
        return {
          success: false,
          balance: null,
          newBalance: 0,
        };
      }

      const currentBalance = Number(balance.credit_balance);

      if (currentBalance < amount) {
        return {
          success: false,
          balance,
          newBalance: currentBalance,
        };
      }

      const newBalance = currentBalance - amount;
      const [updated] = await tx
        .update(appCreditBalances)
        .set({
          credit_balance: String(newBalance),
          total_spent: sql`${appCreditBalances.total_spent} + ${amount}`,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(appCreditBalances.app_id, appId),
            eq(appCreditBalances.user_id, userId)
          )
        )
        .returning();

      return {
        success: true,
        balance: updated,
        newBalance,
      };
    });
  }

  async getBalance(appId: string, userId: string): Promise<number> {
    const balance = await this.findByAppAndUser(appId, userId);
    return balance ? Number(balance.credit_balance) : 0;
  }

  async getTotalAppBalance(appId: string): Promise<{
    totalBalance: number;
    totalPurchased: number;
    totalSpent: number;
    userCount: number;
  }> {
    const result = await db
      .select({
        totalBalance: sql<string>`COALESCE(SUM(${appCreditBalances.credit_balance}), 0)`,
        totalPurchased: sql<string>`COALESCE(SUM(${appCreditBalances.total_purchased}), 0)`,
        totalSpent: sql<string>`COALESCE(SUM(${appCreditBalances.total_spent}), 0)`,
        userCount: sql<number>`COUNT(*)`,
      })
      .from(appCreditBalances)
      .where(eq(appCreditBalances.app_id, appId));

    return {
      totalBalance: Number(result[0]?.totalBalance || 0),
      totalPurchased: Number(result[0]?.totalPurchased || 0),
      totalSpent: Number(result[0]?.totalSpent || 0),
      userCount: Number(result[0]?.userCount || 0),
    };
  }
}

// Export singleton instance
export const appCreditBalancesRepository = new AppCreditBalancesRepository();

