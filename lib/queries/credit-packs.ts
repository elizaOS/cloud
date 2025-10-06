import { db } from "@/db/drizzle";
import * as schema from "@/db/sass/schema";
import { eq } from "drizzle-orm";
import type { CreditPack } from "@/lib/types";

export async function listActiveCreditPacks(): Promise<CreditPack[]> {
  return await db.query.creditPacks.findMany({
    where: eq(schema.creditPacks.is_active, true),
    orderBy: [schema.creditPacks.sort_order, schema.creditPacks.price_cents],
  });
}

export async function getCreditPackByPriceId(
  stripePriceId: string
): Promise<CreditPack | undefined> {
  return await db.query.creditPacks.findFirst({
    where: eq(schema.creditPacks.stripe_price_id, stripePriceId),
  });
}

export async function getCreditPackById(
  id: string
): Promise<CreditPack | undefined> {
  return await db.query.creditPacks.findFirst({
    where: eq(schema.creditPacks.id, id),
  });
}
