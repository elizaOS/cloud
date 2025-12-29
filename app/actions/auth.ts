/**
 * Auth actions.
 *
 * This module re-exports client API functions for auth operations.
 * Previously used "use server" directives, now uses client API routes.
 */

import { creditsApi } from "@/lib/api/client";

/**
 * Gets the credit balance for the authenticated user's organization.
 */
export async function getCreditBalance(): Promise<number> {
  const response = await creditsApi.getBalance();
  return response.balance;
}
