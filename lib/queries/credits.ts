import { db, schema, eq, desc } from "@/lib/db";
import type { CreditTransaction } from "@/lib/types";
import { creditEventEmitter } from "@/lib/events/credit-events";
import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";
import { CacheInvalidation } from "@/lib/cache/invalidation";

export async function deductCredits(
  organizationId: string,
  amount: number,
  description?: string,
  userId?: string,
): Promise<{
  success: boolean;
  newBalance: number;
  transaction: CreditTransaction;
}> {
  if (amount <= 0) {
    throw new Error("Amount must be positive");
  }

  if (!Number.isFinite(amount)) {
    throw new Error("Amount must be a finite number");
  }

  const roundedAmount = Math.ceil(amount);

  return await db.transaction(async (tx) => {
    const [org] = await tx
      .select({
        id: schema.organizations.id,
        credit_balance: schema.organizations.credit_balance,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId))
      .for('update');

    if (!org) {
      throw new Error("Organization not found");
    }

    const newBalance = org.credit_balance - roundedAmount;

    if (newBalance < 0) {
      return {
        success: false,
        newBalance: org.credit_balance,
        transaction: {} as CreditTransaction,
      };
    }

    await tx
      .update(schema.organizations)
      .set({
        credit_balance: newBalance,
        updated_at: new Date(),
      })
      .where(eq(schema.organizations.id, organizationId));

    const [transaction] = await tx
      .insert(schema.creditTransactions)
      .values({
        organization_id: organizationId,
        user_id: userId,
        amount: -roundedAmount,
        type: "usage",
        description: description || "API usage",
      })
      .returning();

    return { success: true, newBalance, transaction };
  }).then(async (result) => {
    if (result.success) {
      creditEventEmitter.emitCreditUpdate({
        organizationId,
        newBalance: result.newBalance,
        delta: -roundedAmount,
        reason: description || "API usage",
        userId,
        timestamp: new Date(),
      });

      await CacheInvalidation.onCreditMutation(organizationId);
    }
    return result;
  });
}

export async function addCredits(
  organizationId: string,
  amount: number,
  type: "purchase" | "adjustment" | "refund",
  description?: string,
  userId?: string,
  stripePaymentIntentId?: string,
): Promise<{
  success: boolean;
  newBalance: number;
  transaction: CreditTransaction;
}> {
  if (amount <= 0) {
    throw new Error("Amount must be positive");
  }

  if (!Number.isFinite(amount)) {
    throw new Error("Amount must be a finite number");
  }

  const roundedAmount = Math.ceil(amount);

  return await db.transaction(async (tx) => {
    const [org] = await tx
      .select({
        id: schema.organizations.id,
        credit_balance: schema.organizations.credit_balance,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organizationId))
      .for('update');

    if (!org) {
      throw new Error("Organization not found");
    }

    const newBalance = org.credit_balance + roundedAmount;

    await tx
      .update(schema.organizations)
      .set({
        credit_balance: newBalance,
        updated_at: new Date(),
      })
      .where(eq(schema.organizations.id, organizationId));

    const [transaction] = await tx
      .insert(schema.creditTransactions)
      .values({
        organization_id: organizationId,
        user_id: userId,
        amount: roundedAmount,
        type,
        description: description || `Credit ${type}`,
        stripe_payment_intent_id: stripePaymentIntentId,
      })
      .returning();

    return { success: true, newBalance, transaction };
  }).then(async (result) => {
    creditEventEmitter.emitCreditUpdate({
      organizationId,
      newBalance: result.newBalance,
      delta: roundedAmount,
      reason: description || `Credit ${type}`,
      userId,
      timestamp: new Date(),
    });

    await CacheInvalidation.onCreditMutation(organizationId);

    return result;
  });
}

export async function getCreditTransactionsByOrganization(
  organizationId: string,
  options?: {
    limit?: number;
    offset?: number;
  },
): Promise<CreditTransaction[]> {
  const { limit = 100, offset = 0 } = options || {};

  return await db.query.creditTransactions.findMany({
    where: eq(schema.creditTransactions.organization_id, organizationId),
    orderBy: desc(schema.creditTransactions.created_at),
    limit,
    offset,
  });
}

export async function getCreditTransactionById(
  id: string,
): Promise<CreditTransaction | undefined> {
  return await db.query.creditTransactions.findFirst({
    where: eq(schema.creditTransactions.id, id),
  });
}

export async function getCreditBalance(
  organizationId: string,
): Promise<number> {
  const cacheKey = CacheKeys.org.credits(organizationId);

  const cached = await cache.get<{ balance: number; timestamp: Date }>(
    cacheKey
  );
  if (cached) return cached.balance;

  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, organizationId),
    columns: {
      credit_balance: true,
    },
  });

  if (!org) {
    throw new Error("Organization not found");
  }

  await cache.set(
    cacheKey,
    { balance: org.credit_balance, timestamp: new Date() },
    CacheTTL.org.credits
  );

  return org.credit_balance;
}

export async function checkSufficientCredits(
  organizationId: string,
  requiredAmount: number,
): Promise<{ sufficient: boolean; balance: number; required: number }> {
  const balance = await getCreditBalance(organizationId);
  return {
    sufficient: balance >= requiredAmount,
    balance,
    required: requiredAmount,
  };
}
