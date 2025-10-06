import { db, schema, eq, desc, sql } from "@/lib/db";
import type { CreditTransaction } from "@/lib/types";

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
  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, organizationId),
    columns: {
      credit_balance: true,
    },
  });

  if (!org) {
    throw new Error("Organization not found");
  }

  return org.credit_balance;
}
