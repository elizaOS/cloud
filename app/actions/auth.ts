"use server";

import { requireAuth } from "@/lib/auth";
import { organizationsService } from "@/lib/services";

/**
 * Server action to get user's organization credit balance
 */
export async function getCreditBalance(): Promise<number> {
  const user = await requireAuth();
  const organization = await organizationsService.getById(user.organization_id);
  return organization?.credit_balance || 0;
}
