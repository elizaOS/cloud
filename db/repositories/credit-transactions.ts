import {
  eq,
  desc,
  and,
} from "drizzle-orm";
import { db } from "../client";
import { creditTransactions, type CreditTransaction, type NewCreditTransaction } from "../schemas/credit-transactions";

export type { CreditTransaction, NewCreditTransaction };

export class CreditTransactionsRepository {
  async findById(id: string): Promise<CreditTransaction | undefined> {
    return await db.query.creditTransactions.findFirst({
      where: eq(creditTransactions.id, id),
    });
  }

  async findByStripePaymentIntent(
    paymentIntentId: string,
  ): Promise<CreditTransaction | undefined> {
    return await db.query.creditTransactions.findFirst({
      where: eq(
        creditTransactions.stripe_payment_intent_id,
        paymentIntentId,
      ),
    });
  }

  async listByOrganization(
    organizationId: string,
    limit?: number,
  ): Promise<CreditTransaction[]> {
    return await db.query.creditTransactions.findMany({
      where: eq(creditTransactions.organization_id, organizationId),
      orderBy: desc(creditTransactions.created_at),
      limit,
    });
  }

  async listByOrganizationAndType(
    organizationId: string,
    type: string,
  ): Promise<CreditTransaction[]> {
    return await db.query.creditTransactions.findMany({
      where: and(
        eq(creditTransactions.organization_id, organizationId),
        eq(creditTransactions.type, type),
      ),
      orderBy: desc(creditTransactions.created_at),
    });
  }

  async create(
    data: NewCreditTransaction,
  ): Promise<CreditTransaction> {
    const [transaction] = await db
      .insert(creditTransactions)
      .values(data)
      .returning();
    return transaction;
  }
}

// Export singleton instance
export const creditTransactionsRepository =
  new CreditTransactionsRepository();
