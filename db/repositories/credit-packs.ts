import {
  eq,
  asc,
} from "drizzle-orm";
import { db } from "../client";
import { creditPacks, type CreditPack, type NewCreditPack } from "../schemas/credit-packs";

export type { CreditPack, NewCreditPack };

export class CreditPacksRepository {
  async findById(id: string): Promise<CreditPack | undefined> {
    return await db.query.creditPacks.findFirst({
      where: eq(creditPacks.id, id),
    });
  }

  async findByStripePriceId(
    stripePriceId: string,
  ): Promise<CreditPack | undefined> {
    return await db.query.creditPacks.findFirst({
      where: eq(creditPacks.stripe_price_id, stripePriceId),
    });
  }

  async listActive(): Promise<CreditPack[]> {
    return await db.query.creditPacks.findMany({
      where: eq(creditPacks.is_active, true),
      orderBy: asc(creditPacks.sort_order),
    });
  }

  async listAll(): Promise<CreditPack[]> {
    return await db.query.creditPacks.findMany({
      orderBy: asc(creditPacks.sort_order),
    });
  }

  async create(data: NewCreditPack): Promise<CreditPack> {
    const [creditPack] = await db
      .insert(creditPacks)
      .values(data)
      .returning();
    return creditPack;
  }

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

  async delete(id: string): Promise<void> {
    await db.delete(creditPacks).where(eq(creditPacks.id, id));
  }
}

// Export singleton instance
export const creditPacksRepository = new CreditPacksRepository();
