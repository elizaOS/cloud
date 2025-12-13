import { eq, desc, and } from "drizzle-orm";
import { db } from "../client";
import {
  creditTransactions,
  type CreditTransaction,
  type NewCreditTransaction,
} from "../schemas/credit-transactions";

export type { CreditTransaction, NewCreditTransaction };

/**
 * Repository for credit transaction database operations.
 */
export class CreditTransactionsRepository {
  /**
   * Finds a credit transaction by ID.
   */
  async findById(id: string): Promise<CreditTransaction | undefined> {
    return await db.query.creditTransactions.findFirst({
      where: eq(creditTransactions.id, id),
    });
  }

  /**
   * Finds a credit transaction by Stripe payment intent ID.
   */
  async findByStripePaymentIntent(
    paymentIntentId: string,
  ): Promise<CreditTransaction | undefined> {
    return await db.query.creditTransactions.findFirst({
      where: eq(creditTransactions.stripe_payment_intent_id, paymentIntentId),
    });
  }

  /**
   * Lists credit transactions for an organization, ordered by creation date.
   */
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

  /**
   * Lists credit transactions for an organization filtered by type.
   */
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

<<<<<<< HEAD
  /**
   * Creates a new credit transaction.
   */
=======
>>>>>>> 2379ae49c4454bd91c14c080b9a37ac33464cf74
  async create(data: NewCreditTransaction): Promise<CreditTransaction> {
    const [transaction] = await db
      .insert(creditTransactions)
      .values(data)
      .returning();
    return transaction;
  }
}

<<<<<<< HEAD
/**
 * Singleton instance of CreditTransactionsRepository.
 */
=======
// Export singleton instance
>>>>>>> 2379ae49c4454bd91c14c080b9a37ac33464cf74
export const creditTransactionsRepository = new CreditTransactionsRepository();
