/**
 * Privy User Synchronization
 * 
 * Shared logic for syncing Privy users to the local database.
 * Used by both:
 * 1. Webhook handler (background sync)
 * 2. Just-in-time sync (fallback for race conditions)
 */

import {
  createUser,
  getUserByPrivyId,
  updateUser,
} from "@/lib/queries/users";
import {
  createOrganization,
  getOrganizationBySlug,
} from "@/lib/queries/organizations";
import type { UserWithOrganization } from "@/lib/types";

function generateSlugFromEmail(email: string): string {
  const username = email.split("@")[0];
  const sanitized = username.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const random = Math.random().toString(36).substring(2, 8);
  const timestamp = Date.now().toString(36).slice(-4);
  return `${sanitized}-${timestamp}${random}`;
}

// Define flexible interface for Privy user data
// Handles both webhook payload and SDK User type
interface PrivyUserData {
  id: string;
  email?: { address: string };
  name?: string | null;
  linkedAccounts?: Array<Record<string, unknown>>; // Privy's linked accounts are complex union types
}

/**
 * Sync a Privy user to the local database
 * Creates user and organization if they don't exist
 * Updates user data if it has changed
 */
export async function syncUserFromPrivy(
  privyUser: PrivyUserData
): Promise<UserWithOrganization> {
  const privyUserId = privyUser.id;
  
  // Extract email
  let email: string | undefined;
  if (privyUser.email?.address) {
    email = privyUser.email.address.toLowerCase().trim();
  }
  
  // Try to get email from linked accounts if not in primary email field
  if (!email && privyUser.linkedAccounts) {
    for (const account of privyUser.linkedAccounts) {
      if ('address' in account && account.type === 'email' && typeof account.address === 'string') {
        email = account.address.toLowerCase().trim();
        break;
      }
      if ('email' in account && typeof account.email === 'string') {
        email = account.email.toLowerCase().trim();
        break;
      }
    }
  }

  if (!email) {
    throw new Error(`User ${privyUserId} has no email address - cannot sync`);
  }

  // Extract name from various sources
  let name = privyUser.name;
  if (!name && privyUser.linkedAccounts) {
    for (const account of privyUser.linkedAccounts) {
      if ('name' in account && typeof account.name === 'string') {
        name = account.name;
        break;
      }
    }
  }
  if (!name) {
    name = email.split("@")[0];
  }

  // Check if user already exists
  let user = await getUserByPrivyId(privyUserId);

  if (user) {
    // Update user if needed
    const shouldUpdate =
      user.name !== name ||
      user.email !== email ||
      !user.email_verified;

    if (shouldUpdate) {
      await updateUser(user.id, {
        name,
        email,
        email_verified: true,
        updated_at: new Date(),
      });
      
      // Refresh user with organization
      user = (await getUserByPrivyId(privyUserId))!;
    }

    return user;
  }

  // Create new user and organization
  let orgSlug = generateSlugFromEmail(email);
  
  // Ensure slug is unique
  let attempts = 0;
  while (await getOrganizationBySlug(orgSlug)) {
    attempts++;
    if (attempts > 10) {
      throw new Error(`Failed to generate unique organization slug for ${email}`);
    }
    orgSlug = generateSlugFromEmail(email);
  }

  // Create organization
  const organization = await createOrganization({
    name: `${name}'s Organization`,
    slug: orgSlug,
    credit_balance: 50000, // Initial credits
  });

  // Create user
  await createUser({
    privy_user_id: privyUserId,
    email,
    email_verified: true,
    name,
    organization_id: organization.id,
    role: "owner",
    is_active: true,
  });

  // Return user with organization
  const userWithOrg = await getUserByPrivyId(privyUserId);
  
  if (!userWithOrg) {
    throw new Error(`Failed to fetch newly created user ${privyUserId}`);
  }

  return userWithOrg;
}
