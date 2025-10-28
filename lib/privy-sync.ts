/**
 * Privy User Synchronization
 *
 * Shared logic for syncing Privy users to the local database.
 * Used by both:
 * 1. Webhook handler (background sync)
 * 2. Just-in-time sync (fallback for race conditions)
 */

import { usersService, organizationsService } from "@/lib/services";
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
  privyUser: PrivyUserData,
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
      if (
        "address" in account &&
        account.type === "email" &&
        typeof account.address === "string"
      ) {
        email = account.address.toLowerCase().trim();
        break;
      }
      if ("email" in account && typeof account.email === "string") {
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
      if ("name" in account && typeof account.name === "string") {
        name = account.name;
        break;
      }
    }
  }
  if (!name) {
    name = email.split("@")[0];
  }

  // Check if user already exists
  let user = await usersService.getByPrivyId(privyUserId);

  if (user) {
    // Update user if needed
    const shouldUpdate =
      user.name !== name || user.email !== email || !user.email_verified;

    if (shouldUpdate) {
      await usersService.update(user.id, {
        name,
        email,
        email_verified: true,
        updated_at: new Date(),
      });

      // Refresh user with organization
      user = (await usersService.getByPrivyId(privyUserId))!;
    }

    return user;
  }

  // Create new user and organization
  let orgSlug = generateSlugFromEmail(email);

  // Ensure slug is unique
  let attempts = 0;
  while (await organizationsService.getBySlug(orgSlug)) {
    attempts++;
    if (attempts > 10) {
      throw new Error(
        `Failed to generate unique organization slug for ${email}`,
      );
    }
    orgSlug = generateSlugFromEmail(email);
  }

  // Create organization
  const organization = await organizationsService.create({
    name: `${name}'s Organization`,
    slug: orgSlug,
    credit_balance: 5.0, // Initial $5.00 USD
  });

  // Create user - handle race condition where another request created the user
  try {
    await usersService.create({
      privy_user_id: privyUserId,
      email,
      email_verified: true,
      name,
      organization_id: organization.id,
      role: "owner",
      is_active: true,
    });
  } catch (error) {
    // Check if this is a duplicate key error (race condition or duplicate email)
    // Drizzle/PostgreSQL errors can have code at top level or in cause property
    const isDuplicateError =
      error &&
      typeof error === "object" &&
      (("code" in error && error.code === "23505") ||
        ("cause" in error &&
          error.cause &&
          typeof error.cause === "object" &&
          "code" in error.cause &&
          error.cause.code === "23505"));

    if (isDuplicateError) {
      console.log(
        `Duplicate key error detected for user ${privyUserId}, handling race condition...`,
      );

      // Try to find existing user with retries (in case parallel transaction hasn't committed yet)
      let existingUser: UserWithOrganization | undefined;
      const maxRetries = 3;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (attempt > 0) {
          // Wait a bit for the other transaction to commit
          await new Promise((resolve) =>
            setTimeout(resolve, 50 * Math.pow(2, attempt - 1)),
          );
          console.log(
            `Retry ${attempt}/${maxRetries} to find existing user ${privyUserId}`,
          );
        }

        // Try to find by Privy ID first (most common race condition)
        existingUser = await usersService.getByPrivyId(privyUserId);

        if (existingUser) {
          break;
        }

        // If not found by Privy ID, try by email (edge case: email constraint violated)
        existingUser = await usersService.getByEmailWithOrganization(email);
        if (existingUser) {
          // Check if it's the same Privy user or a different one
          if (existingUser.privy_user_id !== privyUserId) {
            console.warn(
              `User with email ${email} already exists with different Privy ID: ${existingUser.privy_user_id}`,
            );
            // Clean up orphaned org and throw - this is a data integrity issue
            try {
              await organizationsService.delete(organization.id);
            } catch (cleanupError) {
              console.error(
                "Failed to clean up orphaned organization:",
                cleanupError,
              );
            }
            throw new Error(
              `Email ${email} is already registered with a different account`,
            );
          }
          break;
        }
      }

      if (existingUser) {
        console.log(
          `Found existing user ${privyUserId}, cleaning up orphaned org and returning existing user`,
        );
        // Clean up the orphaned organization we just created
        try {
          await organizationsService.delete(organization.id);
        } catch (cleanupError) {
          console.error(
            "Failed to clean up orphaned organization:",
            cleanupError,
          );
        }
        return existingUser;
      }

      // Couldn't find existing user even after retries - cleanup and rethrow
      console.error(
        `Duplicate key error but user ${privyUserId} not found after ${maxRetries} retries - cleaning up and rethrowing`,
      );
      try {
        await organizationsService.delete(organization.id);
      } catch (cleanupError) {
        console.error(
          "Failed to clean up orphaned organization:",
          cleanupError,
        );
      }
    }
    // Not a duplicate key error or couldn't find the existing user - rethrow
    console.error(
      `Failed to create user ${privyUserId}:`,
      error instanceof Error ? error.message : error,
    );
    throw error;
  }

  // Return user with organization
  const userWithOrg = await usersService.getByPrivyId(privyUserId);

  if (!userWithOrg) {
    throw new Error(`Failed to fetch newly created user ${privyUserId}`);
  }

  return userWithOrg;
}
