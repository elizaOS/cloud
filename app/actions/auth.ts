"use server";

import { requireAuth } from "@/lib/auth";
import { getOrganizationById } from "@/lib/queries/organizations";

/**
 * Server action to get user's organization credit balance
 */
export async function getCreditBalance(): Promise<number> {
  const user = await requireAuth();
  const organization = await getOrganizationById(user.organization_id);
  return organization?.credit_balance || 0;
}
