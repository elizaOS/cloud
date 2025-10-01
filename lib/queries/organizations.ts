import { db, schema, eq, sql } from '@/lib/db';
import type { Organization, NewOrganization } from '@/lib/types';

export async function getOrganizationById(id: string): Promise<Organization | undefined> {
  return await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, id),
  });
}

export async function getOrganizationBySlug(slug: string): Promise<Organization | undefined> {
  return await db.query.organizations.findFirst({
    where: eq(schema.organizations.slug, slug),
  });
}

export async function createOrganization(data: NewOrganization): Promise<Organization> {
  const [organization] = await db
    .insert(schema.organizations)
    .values(data)
    .returning();
  return organization;
}

export async function updateOrganization(
  id: string,
  data: Partial<NewOrganization>
): Promise<Organization | undefined> {
  const [updated] = await db
    .update(schema.organizations)
    .set({
      ...data,
      updated_at: new Date(),
    })
    .where(eq(schema.organizations.id, id))
    .returning();
  return updated;
}

export async function updateCreditBalance(
  organizationId: string,
  amount: number
): Promise<{ success: boolean; newBalance: number }> {
  const result = await db.transaction(async (tx) => {
    const org = await tx.query.organizations.findFirst({
      where: eq(schema.organizations.id, organizationId),
    });

    if (!org) {
      throw new Error('Organization not found');
    }

    const newBalance = org.credit_balance + amount;

    if (newBalance < 0) {
      throw new Error('Insufficient credits');
    }

    await tx
      .update(schema.organizations)
      .set({
        credit_balance: newBalance,
        updated_at: new Date(),
      })
      .where(eq(schema.organizations.id, organizationId));

    return { success: true, newBalance };
  });

  return result;
}

export async function getOrganizationWithUsers(id: string) {
  return await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, id),
    with: {
      users: true,
    },
  });
}
