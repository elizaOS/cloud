import { db, schema, eq } from "@/lib/db";
import type { Organization, NewOrganization } from "@/lib/types";
import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL } from "@/lib/cache/keys";

export async function getOrganizationById(
  id: string,
): Promise<Organization | undefined> {
  const cacheKey = CacheKeys.org.data(id);

  const cached = await cache.get<Organization>(cacheKey);
  if (cached) return cached;

  const org = await db.query.organizations.findFirst({
    where: eq(schema.organizations.id, id),
  });

  if (org) {
    await cache.set(cacheKey, org, CacheTTL.org.data);
  }

  return org;
}

export async function getOrganizationBySlug(
  slug: string,
): Promise<Organization | undefined> {
  return await db.query.organizations.findFirst({
    where: eq(schema.organizations.slug, slug),
  });
}

export async function createOrganization(
  data: NewOrganization,
): Promise<Organization> {
  const [organization] = await db
    .insert(schema.organizations)
    .values(data)
    .returning();
  return organization;
}

export async function updateOrganization(
  id: string,
  data: Partial<NewOrganization>,
): Promise<Organization | undefined> {
  const [updated] = await db
    .update(schema.organizations)
    .set({
      ...data,
      updated_at: new Date(),
    })
    .where(eq(schema.organizations.id, id))
    .returning();

  if (updated) {
    await cache.del(CacheKeys.org.data(id));
    await cache.del(CacheKeys.org.dashboard(id));
  }

  return updated;
}

export async function updateCreditBalance(
  organizationId: string,
  amount: number,
): Promise<{ success: boolean; newBalance: number }> {
  const result = await db.transaction(async (tx) => {
    const org = await tx.query.organizations.findFirst({
      where: eq(schema.organizations.id, organizationId),
    });

    if (!org) {
      throw new Error("Organization not found");
    }

    const newBalance = org.credit_balance + amount;

    if (newBalance < 0) {
      throw new Error("Insufficient credits");
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
