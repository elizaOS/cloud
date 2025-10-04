"use server";

import { signOut } from "@workos-inc/authkit-nextjs";
import { requireAuth } from "@/lib/auth";
import { getOrganizationById } from "@/lib/queries/organizations";

/**
 * Server action to handle user sign out
 */
export async function handleSignOut() {
  await signOut();
}

/**
 * Server action to get user's organization credit balance
 */
export async function getCreditBalance(): Promise<number> {
  const user = await requireAuth();
  const organization = await getOrganizationById(user.organization_id);
  return organization?.credit_balance || 0;
}
