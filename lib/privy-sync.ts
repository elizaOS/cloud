/**
 * Privy User Synchronization
 *
 * Shared logic for syncing Privy users to the local database.
 * Used by both:
 * 1. Webhook handler (background sync)
 * 2. Just-in-time sync (fallback for race conditions)
 */

import {
  usersService,
  organizationsService,
  emailService,
  invitesService,
  discordService,
  apiKeysService,
} from "@/lib/services";
import type { UserWithOrganization } from "@/lib/types";

function generateSlugFromEmail(email: string): string {
  const username = email.split("@")[0];
  const sanitized = username.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const random = Math.random().toString(36).substring(2, 8);
  const timestamp = Date.now().toString(36).slice(-4);
  return `${sanitized}-${timestamp}${random}`;
}

function generateSlugFromWallet(walletAddress: string): string {
  const shortAddress = walletAddress.substring(0, 8);
  const sanitized = shortAddress.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const random = Math.random().toString(36).substring(2, 8);
  const timestamp = Date.now().toString(36).slice(-4);
  return `wallet-${sanitized}-${timestamp}${random}`;
}

// Define flexible interface for Privy user data
// Handles both webhook payload and SDK User type
interface PrivyUserData {
  id: string;
  email?: { address: string };
  name?: string | null;
  linkedAccounts?: Array<Record<string, unknown>>;
  wallet?: {
    address: string;
    chainType: "ethereum" | "solana";
    verified?: boolean;
  };
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

  console.log("[PrivySync] Received user data:", {
    privyUserId: privyUser.id,
    hasEmail: !!privyUser.email,
    emailAddress: privyUser.email?.address,
    hasLinkedAccounts: !!privyUser.linkedAccounts,
    linkedAccountsCount: privyUser.linkedAccounts?.length || 0,
    accountTypes: privyUser.linkedAccounts?.map((a) => a.type) || [],
  });

  // Extract email
  let email: string | undefined;
  if (privyUser.email?.address) {
    email = privyUser.email.address.toLowerCase().trim();
  }

  // Try to get email from linked accounts if not in primary email field
  if (!email && privyUser.linkedAccounts) {
    for (const account of privyUser.linkedAccounts) {
      // Check for email account type
      if (
        "address" in account &&
        account.type === "email" &&
        typeof account.address === "string"
      ) {
        email = account.address.toLowerCase().trim();
        break;
      }
      // Check for OAuth providers (google_oauth, discord_oauth, github_oauth, etc.)
      // These have an 'email' field directly on the account object
      if (
        "email" in account &&
        typeof account.email === "string" &&
        account.email.length > 0 &&
        typeof account.type === "string" &&
        account.type.includes("oauth")
      ) {
        email = account.email.toLowerCase().trim();
        break;
      }
    }
  }

  // Extract wallet address from linkedAccounts
  let walletAddress: string | undefined;
  let walletChainType: "ethereum" | "solana" | undefined;
  let walletVerified = false;

  if (privyUser.linkedAccounts) {
    for (const account of privyUser.linkedAccounts) {
      // Check for wallet account types
      if (
        (account.type === "wallet" ||
          account.type === "ethereum_wallet" ||
          account.type === "solana_wallet") &&
        "address" in account &&
        typeof account.address === "string"
      ) {
        walletAddress = account.address.toLowerCase();
        // Determine chain type from account type or chainType field
        if ("chainType" in account && typeof account.chainType === "string") {
          walletChainType = account.chainType.includes("solana")
            ? "solana"
            : "ethereum";
        } else if (account.type === "solana_wallet") {
          walletChainType = "solana";
        } else {
          walletChainType = "ethereum";
        }
        walletVerified = "verified" in account && account.verified === true;
        break;
      }
    }
  }

  console.log("[PrivySync] Extracted data:", {
    privyUserId,
    email,
    walletAddress,
    walletChainType,
    walletVerified,
  });

  // Validation: User must have email OR wallet (hybrid approach)
  if (!email && !walletAddress) {
    console.error("[PrivySync] Validation failed - no email or wallet:", {
      privyUserId,
      hasEmail: !!email,
      hasWallet: !!walletAddress,
    });
    throw new Error(
      `User ${privyUserId} has neither email nor wallet - cannot sync`,
    );
  }

  // Extract name from various sources
  let name = privyUser.name;
  if (!name && privyUser.linkedAccounts) {
    for (const account of privyUser.linkedAccounts) {
      // Prioritize OAuth provider names
      if (
        "name" in account &&
        typeof account.name === "string" &&
        account.name.length > 0
      ) {
        name = account.name;
        break;
      }
      // Fallback to username for providers like Discord/GitHub
      if (
        !name &&
        "username" in account &&
        typeof account.username === "string" &&
        account.username.length > 0
      ) {
        name = account.username;
      }
    }
  }
  if (!name && email) {
    name = email.split("@")[0];
  } else if (!name && walletAddress) {
    name = `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`;
  }

  // Check if user already exists
  let user = await usersService.getByPrivyId(privyUserId);

  if (user) {
    // Update user if needed
    const shouldUpdate =
      user.name !== name ||
      user.email !== email ||
      user.wallet_address !== walletAddress ||
      (email && !user.email_verified) ||
      (walletAddress && !user.wallet_verified);

    if (shouldUpdate) {
      await usersService.update(user.id, {
        name,
        email: email || user.email,
        email_verified: !!email || user.email_verified,
        wallet_address: walletAddress || user.wallet_address,
        wallet_chain_type: walletChainType || user.wallet_chain_type,
        wallet_verified: walletVerified,
        updated_at: new Date(),
      });

      // Refresh user with organization
      user = (await usersService.getByPrivyId(privyUserId))!;
    }

    return user;
  }

  // Check for pending invite first (before creating new organization)
  if (email) {
    const pendingInvite = await invitesService.findPendingInviteByEmail(email);

    if (pendingInvite) {
      console.log(
        `Found pending invite for ${email}, joining organization ${pendingInvite.organization_id}`,
      );

      try {
        const newUser = await usersService.create({
          privy_user_id: privyUserId,
          email: email || null,
          email_verified: !!email,
          wallet_address: walletAddress || null,
          wallet_chain_type: walletChainType || null,
          wallet_verified: walletVerified,
          name,
          organization_id: pendingInvite.organization_id,
          role: pendingInvite.invited_role,
          is_active: true,
        });

        const { organizationInvitesRepository } = await import(
          "@/db/repositories"
        );
        await organizationInvitesRepository.markAsAccepted(
          pendingInvite.id,
          newUser.id,
        );

        const userWithOrg = await usersService.getByPrivyId(privyUserId);

        if (!userWithOrg) {
          throw new Error(
            `Failed to fetch newly created user ${privyUserId} after accepting invite`,
          );
        }

        console.log(
          `User ${privyUserId} successfully joined organization ${pendingInvite.organization_id} via invite`,
        );

        // Log to Discord (fire-and-forget)
        discordService
          .logUserSignup({
            userId: userWithOrg.id,
            privyUserId: userWithOrg.privy_user_id!,
            email: userWithOrg.email || null,
            name: userWithOrg.name || null,
            walletAddress: userWithOrg.wallet_address || null,
            organizationId: userWithOrg.organization?.id || "",
            organizationName: userWithOrg.organization?.name || "",
            role: userWithOrg.role,
            isNewOrganization: false,
          })
          .catch((error) => {
            console.error(
              "[PrivySync] Failed to log signup to Discord:",
              error,
            );
          });

        return userWithOrg;
      } catch (error) {
        console.error(
          `Failed to create user from invite for ${privyUserId}:`,
          error,
        );
        throw error;
      }
    }
  }

  // Create new user and organization
  let orgSlug: string;
  if (email) {
    orgSlug = generateSlugFromEmail(email);
  } else if (walletAddress) {
    orgSlug = generateSlugFromWallet(walletAddress);
  } else {
    throw new Error("Cannot generate org slug without email or wallet");
  }

  // Ensure slug is unique
  let attempts = 0;
  while (await organizationsService.getBySlug(orgSlug)) {
    attempts++;
    if (attempts > 10) {
      throw new Error(
        `Failed to generate unique organization slug for user ${privyUserId}`,
      );
    }
    orgSlug = email
      ? generateSlugFromEmail(email)
      : generateSlugFromWallet(walletAddress!);
  }

  // Create organization
  const INITIAL_BALANCE = 5.0; // $5.00 USD starting balance
  const organization = await organizationsService.create({
    name: `${name}'s Organization`,
    slug: orgSlug,
    credit_balance: String(INITIAL_BALANCE),
  });

  // Create user - handle race condition where another request created the user
  try {
    await usersService.create({
      privy_user_id: privyUserId,
      email: email || null,
      email_verified: !!email,
      wallet_address: walletAddress || null,
      wallet_chain_type: walletChainType || null,
      wallet_verified: walletVerified,
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
        if (email) {
          existingUser = await usersService.getByEmailWithOrganization(email);
        }
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

  // Send welcome email asynchronously (fire-and-forget)
  const recipientEmail = email || userWithOrg.organization?.billing_email;
  if (recipientEmail) {
    queueWelcomeEmail({
      email: recipientEmail,
      userName: name || "there",
      organizationName: userWithOrg.organization?.name || "",
      creditBalance: Number(userWithOrg.organization?.credit_balance || 0),
    }).catch((error) => {
      console.error("[PrivySync] Failed to send welcome email:", error);
    });
  } else {
    console.warn("[PrivySync] No email available for welcome email", {
      userId: userWithOrg.id,
      walletAddress: walletAddress,
    });
  }

  // Log to Discord (fire-and-forget)
  discordService
    .logUserSignup({
      userId: userWithOrg.id,
      privyUserId: userWithOrg.privy_user_id!,
      email: userWithOrg.email || null,
      name: userWithOrg.name || null,
      walletAddress: userWithOrg.wallet_address || null,
      organizationId: userWithOrg.organization?.id || "",
      organizationName: userWithOrg.organization?.name || "",
      role: userWithOrg.role,
      isNewOrganization: true,
    })
    .catch((error) => {
      console.error("[PrivySync] Failed to log signup to Discord:", error);
    });

  // Auto-generate default API key for new user (fire-and-forget)
  ensureUserHasApiKey(userWithOrg.id, userWithOrg.organization?.id || "").catch(
    (error) => {
      console.error("[PrivySync] Failed to create default API key:", error);
    },
  );

  return userWithOrg;
}

/**
 * Ensure user has a default API key for programmatic access
 * Creates one if it doesn't exist
 */
async function ensureUserHasApiKey(
  userId: string,
  organizationId: string,
): Promise<void> {
  // Validate inputs
  if (!userId || userId.trim() === "") {
    console.warn("[PrivySync] Invalid userId, skipping API key creation");
    return;
  }

  if (!organizationId || organizationId.trim() === "") {
    console.warn(
      `[PrivySync] No organization for user ${userId}, skipping API key creation`,
    );
    return;
  }

  try {
    // Check if user already has an API key
    const existingKeys =
      await apiKeysService.listByOrganization(organizationId);
    const userHasKey = existingKeys.some((key) => key.user_id === userId);

    if (userHasKey) {
      console.log(`[PrivySync] User ${userId} already has an API key`);
      return;
    }

    // Create default API key
    await apiKeysService.create({
      user_id: userId,
      organization_id: organizationId,
      name: "Default API Key",
      is_active: true,
    });

    console.log(`[PrivySync] Created default API key for user ${userId}`);
  } catch (error) {
    console.error(
      `[PrivySync] Error creating API key for user ${userId}:`,
      error,
    );
    throw error;
  }
}

async function queueWelcomeEmail(data: {
  email: string;
  userName: string;
  organizationName: string;
  creditBalance: number;
}): Promise<void> {
  try {
    await emailService.sendWelcomeEmail({
      ...data,
      dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    });
  } catch (error) {
    console.error("[PrivySync] Error sending welcome email:", error);
  }
}
