/**
 * Privy User Synchronization
 *
 * Shared logic for syncing Privy users to the local database.
 * Used by both:
 * 1. Webhook handler (background sync)
 * 2. Just-in-time sync (fallback for race conditions)
 */

import { usersService } from "@/lib/services/users";
import { organizationsService } from "@/lib/services/organizations";
import { creditsService } from "@/lib/services/credits";
import { generateSlugFromWallet, generateSlugFromEmail, getInitialCredits } from "@/lib/utils/signup-helpers";
import { invitesService } from "@/lib/services/invites";
import { discordService } from "@/lib/services/discord";
import { apiKeysService } from "@/lib/services/api-keys";
import { organizationInvitesRepository } from "@/db/repositories";
import {
  abuseDetectionService,
  type SignupContext,
} from "@/lib/services/abuse-detection";
import type { UserWithOrganization } from "@/lib/types";
import { getRandomUserAvatar } from "@/lib/utils/default-user-avatar";
import { emailService } from "@/lib/services/email";
import type { User as PrivyUser } from "@privy-io/server-auth";

/**
 * Options for syncing a Privy user.
 */
interface SyncOptions {
  signupContext?: SignupContext;
  skipAbuseCheck?: boolean;
}

/**
 * Type for Privy user data that handles both SDK User and webhook payloads.
 * Uses the SDK User type as the base since it's more complete.
 */
type PrivyUserData = PrivyUser;

/**
 * Sync a Privy user to the local database
 * Creates user and organization if they don't exist
 * Updates user data if it has changed
 */
export async function syncUserFromPrivy(
  privyUser: PrivyUserData,
  options: SyncOptions = {},
): Promise<UserWithOrganization> {
  const { signupContext, skipAbuseCheck = false } = options;
  const privyUserId = privyUser.id;

  // Extract email (optional - only some OAuth providers share this)
  let email: string | undefined;

  // Try primary email field first
  if (privyUser.email?.address) {
    email = privyUser.email.address.toLowerCase().trim();
  }

  // Try linked accounts if no primary email
  if (!email && privyUser.linkedAccounts) {
    for (const account of privyUser.linkedAccounts) {
      // Email account type
      if (
        account.type === "email" &&
        "address" in account &&
        typeof account.address === "string"
      ) {
        email = account.address.toLowerCase().trim();
        break;
      }

      // OAuth providers (Discord, Google, etc.) may include email
      if (
        account.type.includes("oauth") &&
        "email" in account &&
        typeof account.email === "string" &&
        account.email.length > 0
      ) {
        email = account.email.toLowerCase().trim();
        break;
      }
    }
  }

  // Extract wallet (optional)
  let walletAddress: string | undefined;
  let walletChainType: "ethereum" | "solana" | undefined;
  let walletVerified = false;

  if (privyUser.linkedAccounts) {
    for (const account of privyUser.linkedAccounts) {
      if (
        account.type === "wallet" &&
        "address" in account &&
        typeof account.address === "string"
      ) {
        walletAddress = account.address.toLowerCase();
        walletChainType =
          "chainType" in account &&
          typeof account.chainType === "string" &&
          account.chainType.includes("solana")
            ? "solana"
            : "ethereum";
        walletVerified = "verified" in account && account.verified === true;
        break;
      }
    }
  }

  // Extract name - prioritize: OAuth name > OAuth username > email > wallet
  let name: string | null | undefined;

  if (privyUser.linkedAccounts) {
    // Try OAuth account name first
    for (const account of privyUser.linkedAccounts) {
      if (
        "name" in account &&
        typeof account.name === "string" &&
        account.name.length > 0
      ) {
        name = account.name;
        break;
      }
    }

    // Fallback to OAuth username (GitHub, Discord, etc.)
    if (!name) {
      for (const account of privyUser.linkedAccounts) {
        if (
          "username" in account &&
          typeof account.username === "string" &&
          account.username.length > 0
        ) {
          name = account.username;
          break;
        }
      }
    }
  }

  // Final fallbacks for name
  if (!name && email) {
    name = email.split("@")[0]; // Use email prefix
  } else if (!name && walletAddress) {
    name = `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`; // Truncated wallet
  } else if (!name) {
    name = `user-${privyUserId.substring(11, 19)}`; // Last resort: use part of Privy ID
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
      const newUser = await usersService.create({
        privy_user_id: privyUserId,
        email: email || null,
        email_verified: !!email,
        wallet_address: walletAddress || null,
        wallet_chain_type: walletChainType || null,
        wallet_verified: walletVerified,
        name,
        avatar: getRandomUserAvatar(),
        organization_id: pendingInvite.organization_id,
        role: pendingInvite.invited_role,
        is_active: true,
      });

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
          console.error("[SYNC] Discord log failed:", error);
        });

      return userWithOrg;
    }
  }

  // Check if email is already taken by a different Privy account (account linking)
  if (email) {
    const existingByEmail =
      await usersService.getByEmailWithOrganization(email);
    if (existingByEmail && existingByEmail.privy_user_id !== privyUserId) {
      console.info(
        `Linking Privy account for ${email}: ${existingByEmail.privy_user_id} → ${privyUserId}`,
      );
      await usersService.update(existingByEmail.id, {
        privy_user_id: privyUserId,
        updated_at: new Date(),
      });
      const linkedUser = await usersService.getByPrivyId(privyUserId);
      if (!linkedUser) {
        throw new Error(
          `Failed to fetch user after Privy account linking for ${email}`,
        );
      }
      return linkedUser;
    }
  }

  // Create new user and organization
  // Check for abuse before creating new account
  if (!skipAbuseCheck && signupContext) {
    const abuseCheck = await abuseDetectionService.checkSignupAbuse({
      email,
      ipAddress: signupContext.ipAddress,
      fingerprint: signupContext.fingerprint,
      userAgent: signupContext.userAgent,
    });

    if (!abuseCheck.allowed) {
      throw new Error(
        abuseCheck.reason || "Signup blocked due to suspicious activity",
      );
    }
  }

  // Generate organization slug - require at least email, wallet, or name
  let orgSlug: string;
  if (email) {
    orgSlug = generateSlugFromEmail(email);
  } else if (walletAddress) {
    orgSlug = generateSlugFromWallet(walletAddress);
  } else if (name) {
    // Use name from OAuth username (GitHub, Discord, etc.)
    const sanitized = name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const random = Math.random().toString(36).substring(2, 8);
    const timestamp = Date.now().toString(36).slice(-4);
    orgSlug = `${sanitized}-${timestamp}${random}`;
  } else {
    // Should never reach here - name always has a fallback
    throw new Error(
      `Cannot generate organization slug for user ${privyUserId}`,
    );
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

  // Sequential org + credits + user creation with compensating cleanup.
  // Services use their own global dbWrite connection and do not accept a
  // transaction parameter, so db.transaction() would be ineffective. Instead,
  // if any step after org creation fails, we delete the org to avoid orphans.
  const initialCredits = getInitialCredits();
  
  let organization: Awaited<ReturnType<typeof organizationsService.create>>;
  let createdOrgId: string | undefined;
  try {
    const org = await organizationsService.create({
      name: `${name}'s Organization`,
      slug: orgSlug,
      credit_balance: "0.00",
    });
    createdOrgId = org.id;

    try {
      // Record signup metadata for future abuse detection
      if (signupContext) {
        await abuseDetectionService.recordSignupMetadata(
          org.id,
          signupContext,
        );
      }

      // Add initial free credits via creditsService for proper tracking.
      if (initialCredits > 0) {
        try {
          await creditsService.addCredits({
            organizationId: org.id,
            amount: initialCredits,
            description: "Initial free credits - Welcome bonus",
            metadata: {
              type: "initial_free_credits",
              source: "signup",
            },
          });
        } catch (creditError) {
          console.error(
            `[PrivySync] Failed to add initial credits to org ${org.id}:`,
            creditError,
          );
          // Fallback: update credit balance directly so new accounts aren't left with 0 credits
          try {
            await organizationsService.update(org.id, {
              credit_balance: initialCredits.toFixed(2),
            });
            console.info(
              `[PrivySync] Fallback credit balance set for org ${org.id}: ${initialCredits}`,
            );
          } catch (fallbackError) {
            console.error(
              `[PrivySync] CRITICAL: Both credit service and fallback balance update failed for org ${org.id}.`,
              fallbackError,
            );
            // Both credit paths failed - throw to prevent account creation with 0 credits
            throw new Error(`Failed to grant welcome credits for organization ${org.id}`);
          }
        }
      }

      // Create user
      await usersService.create({
        privy_user_id: privyUserId,
        email: email || null,
        email_verified: !!email,
        wallet_address: walletAddress || null,
        wallet_chain_type: walletChainType || null,
        wallet_verified: walletVerified,
        name,
        avatar: getRandomUserAvatar(),
        organization_id: org.id,
        role: "owner",
        is_active: true,
      });
    } catch (innerError) {
      // Compensating cleanup: delete the org we just created to avoid orphans.
      // On 23505 duplicate-key errors, the winning request created its own org,
      // so ours is orphaned either way. We must always attempt deletion here.
      let cleanupSucceeded = false;
      try {
        await organizationsService.delete(org.id);
        cleanupSucceeded = true;
      } catch (cleanupError) {
        console.error(
          `[PrivySync] Failed to clean up orphaned org ${org.id}:`,
          cleanupError,
        );
      }

      // Attach cleanup status so outer catch can retry if needed
      if (
        innerError &&
        typeof innerError === "object" &&
        !cleanupSucceeded
      ) {
        (innerError as Record<string, unknown>).__orphanedOrgId = org.id;
      }
      throw innerError;
    }
    
    organization = org;
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

    if (!isDuplicateError) {
      throw error;
    }

    // Duplicate key confirmed — clean up orphaned org if inner catch failed to do so.
    // Use createdOrgId tracked at creation time as the reliable source, falling back
    // to the __orphanedOrgId flag attached by the inner catch.
    const orphanedOrgId =
      createdOrgId ||
      (error &&
        typeof error === "object" &&
        "__orphanedOrgId" in error &&
        typeof (error as Record<string, unknown>).__orphanedOrgId === "string"
          ? ((error as Record<string, unknown>).__orphanedOrgId as string)
          : undefined);

    if (orphanedOrgId) {
      try {
        await organizationsService.delete(orphanedOrgId);
        console.info(
          `[PrivySync] Successfully cleaned up orphaned org ${orphanedOrgId} on retry`,
        );
      } catch (retryCleanupError) {
        console.error(
          `[PrivySync] CRITICAL: Retry cleanup of orphaned org ${orphanedOrgId} also failed.`,
          retryCleanupError,
        );
        // Both cleanup attempts failed - abort to prevent proceeding with orphaned org in DB
        throw new Error(
          `Failed to clean up orphaned organization ${orphanedOrgId} after duplicate user creation. Manual cleanup required.`
        );
      }
    }

    // Duplicate key: race condition — try to find existing user with retries.
    let existingUser: UserWithOrganization | undefined;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        // Wait a bit for the other transaction to commit
        await new Promise((resolve) =>
          setTimeout(resolve, 50 * Math.pow(2, attempt - 1)),
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
        if (existingUser.privy_user_id !== privyUserId) {
          // Same email, different Privy auth method (e.g. email login → Google OAuth)
          // Link accounts by updating to the new Privy ID
          console.info(
            `Linking Privy account for ${email}: ${existingUser.privy_user_id} → ${privyUserId}`,
          );
          await usersService.update(existingUser.id, {
            privy_user_id: privyUserId,
            updated_at: new Date(),
          });
          const linkedUser = await usersService.getByPrivyId(privyUserId);
          if (!linkedUser) {
            throw new Error(
              `Failed to fetch user after Privy account linking for ${email}`,
            );
          }
          return linkedUser;
        }
        break;
      }
    }

    if (existingUser) {
      return existingUser;
    }

    // Couldn't find existing user even after retries - rethrow
    console.error(
      `Duplicate key error but user ${privyUserId} not found after ${maxRetries} retries`,
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
      creditBalance: initialCredits,
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
  discordService.logUserSignup({
    userId: userWithOrg.id,
    privyUserId: userWithOrg.privy_user_id!,
    email: userWithOrg.email || null,
    name: userWithOrg.name || null,
    walletAddress: userWithOrg.wallet_address || null,
    organizationId: userWithOrg.organization?.id || "",
    organizationName: userWithOrg.organization?.name || "",
    role: userWithOrg.role,
    isNewOrganization: true,
  });

  // Auto-generate default API key for new user (fire-and-forget)
  void ensureUserHasApiKey(userWithOrg.id, userWithOrg.organization?.id || "");

  return userWithOrg;
}

/**
 * Ensures a user has a default API key for programmatic access.
 * Creates one if it doesn't exist.
 *
 * @param userId - User ID.
 * @param organizationId - Organization ID.
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
      return;
    }

    // Create default API key
    await apiKeysService.create({
      user_id: userId,
      organization_id: organizationId,
      name: "Default API Key",
      is_active: true,
    });
  } catch (error) {
    console.error(
      `[PrivySync] Error creating API key for user ${userId}:`,
      error,
    );
    throw error;
  }
}

/**
 * Queues a welcome email to be sent to a new user.
 *
 * @param data - Welcome email data.
 */
async function queueWelcomeEmail(data: {
  email: string;
  userName: string;
  organizationName: string;
  creditBalance: number;
}): Promise<void> {
  await emailService.sendWelcomeEmail({
    ...data,
    dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
  });
}
