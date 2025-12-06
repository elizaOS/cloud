import { eq, asc } from "drizzle-orm";
import { db } from "../client";
import {
  creditPacks,
  type CreditPack,
  type NewCreditPack,
} from "../schemas/credit-packs";

export type { CreditPack, NewCreditPack };

/**
 * Repository for credit pack database operations.
 */
export class CreditPacksRepository {
  /**
   * Finds a credit pack by ID.
   */
  async findById(id: string): Promise<CreditPack | undefined> {
    return await db.query.creditPacks.findFirst({
      where: eq(creditPacks.id, id),
    });
  }

  /**
   * Finds a credit pack by Stripe price ID.
   */
  async findByStripePriceId(
    stripePriceId: string,
  ): Promise<CreditPack | undefined> {
    return await db.query.creditPacks.findFirst({
      where: eq(creditPacks.stripe_price_id, stripePriceId),
    });
  }

  /**
   * Lists all active credit packs, ordered by sort order.
   */
  async listActive(): Promise<CreditPack[]> {
    return await db.query.creditPacks.findMany({
      where: eq(creditPacks.is_active, true),
      orderBy: asc(creditPacks.sort_order),
    });
  }

  /**
   * Lists all credit packs, ordered by sort order.
   */
  async listAll(): Promise<CreditPack[]> {
    return await db.query.creditPacks.findMany({
      orderBy: asc(creditPacks.sort_order),
    });
  }

  /**
   * Creates a new credit pack.
   */
  async create(data: NewCreditPack): Promise<CreditPack> {
    const [creditPack] = await db.insert(creditPacks).values(data).returning();
    return creditPack;
  }

  /**
   * Updates an existing credit pack.
   */
  async update(
    id: string,
    data: Partial<NewCreditPack>,
  ): Promise<CreditPack | undefined> {
    const [updated] = await db
      .update(creditPacks)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(eq(creditPacks.id, id))
      .returning();
    return updated;
  }

  /**
   * Deletes a credit pack by ID.
   */
  async delete(id: string): Promise<void> {
    await db.delete(creditPacks).where(eq(creditPacks.id, id));
  }
}

/**
 * Singleton instance of CreditPacksRepository.
 */
export const creditPacksRepository = new CreditPacksRepository();
