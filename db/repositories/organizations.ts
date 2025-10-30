import { eq } from "drizzle-orm";
import { db } from "../client";
import {
  organizations,
  type Organization,
  type NewOrganization,
} from "../schemas/organizations";
import type { CreditTransaction } from "../schemas/credit-transactions";

export type { Organization, NewOrganization };

export class OrganizationsRepository {
  async findById(id: string): Promise<Organization | undefined> {
    return await db.query.organizations.findFirst({
      where: eq(organizations.id, id),
    });
  }

  async findBySlug(slug: string): Promise<Organization | undefined> {
    return await db.query.organizations.findFirst({
      where: eq(organizations.slug, slug),
    });
  }

  async findByStripeCustomerId(
    stripeCustomerId: string
  ): Promise<Organization | undefined> {
    return await db.query.organizations.findFirst({
      where: eq(organizations.stripe_customer_id, stripeCustomerId),
    });
  }

  async findWithUsers(id: string) {
    return await db.query.organizations.findFirst({
      where: eq(organizations.id, id),
      with: {
        users: true,
      },
    });
  }

  async create(data: NewOrganization): Promise<Organization> {
    const [organization] = await db
      .insert(organizations)
      .values(data)
      .returning();
    return organization;
  }

  async update(
    id: string,
    data: Partial<NewOrganization>
  ): Promise<Organization | undefined> {
    const [updated] = await db
      .update(organizations)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(eq(organizations.id, id))
      .returning();
    return updated;
  }

  async updateCreditBalance(
    organizationId: string,
    amount: number
  ): Promise<{ success: boolean; newBalance: number }> {
    const result = await db.transaction(async (tx) => {
      const org = await tx.query.organizations.findFirst({
        where: eq(organizations.id, organizationId),
      });

      if (!org) {
        throw new Error("Organization not found");
      }

      const currentBalance = Number(org.credit_balance);
      const newBalance = currentBalance + amount;

      if (newBalance < 0) {
        throw new Error("Insufficient balance");
      }

      await tx
        .update(organizations)
        .set({
          credit_balance: String(newBalance),
          updated_at: new Date(),
        })
        .where(eq(organizations.id, organizationId));

      return { success: true, newBalance };
    });

    return result;
  }

  async delete(id: string): Promise<void> {
    await db.delete(organizations).where(eq(organizations.id, id));
  }

  async deductCreditsWithTransaction(
    organizationId: string,
    amount: number,
    description: string,
    userId?: string
  ): Promise<{
    success: boolean;
    newBalance: number;
    transaction: CreditTransaction;
  }> {
    return await db.transaction(async (tx) => {
      const org = await tx.query.organizations.findFirst({
        where: eq(organizations.id, organizationId),
      });

      if (!org) {
        throw new Error("Organization not found");
      }

      const currentBalance = Number(org.credit_balance);

      if (currentBalance < amount) {
        throw new Error(
          `Insufficient balance. Required: ${amount}, Available: ${currentBalance.toFixed(2)}`
        );
      }

      const newBalance = currentBalance - amount;

      await tx
        .update(organizations)
        .set({
          credit_balance: String(newBalance),
          updated_at: new Date(),
        })
        .where(eq(organizations.id, organizationId));

      const { creditTransactions } = await import(
        "../schemas/credit-transactions"
      );

      const [creditTx] = await tx
        .insert(creditTransactions)
        .values({
          organization_id: organizationId,
          user_id: userId || null,
          amount: String(-amount),
          type: "debit",
          description,
          created_at: new Date(),
        })
        .returning();

      return { success: true, newBalance, transaction: creditTx };
    });
  }
}

// Export singleton instance
export const organizationsRepository = new OrganizationsRepository();
