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
import { emailService } from "@/lib/services/email";
import { invitesService } from "@/lib/services/invites";
import { discordService } from "@/lib/services/discord";
import { apiKeysService } from "@/lib/services/api-keys";
import { creditsService } from "@/lib/services/credits";
import { organizationInvitesRepository, usersRepository } from "@/db/repositories";
import {
  abuseDetectionService,
  type SignupContext,
} from "@/lib/services/abuse-detection";
import type { UserWithOrganization } from "@/lib/types";
import { getRandomUserAvatar } from "@/lib/utils/default-user-avatar";

const DEFAULT_INITIAL_CREDITS = 5.0;
const getInitialCredits = (): number => {
  const envValue = process.env.INITIAL_FREE_CREDITS;
  if (envValue) {
    const parsed = parseFloat(envValue);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return DEFAULT_INITIAL_CREDITS;
};

export interface SyncOptions {
  signupContext?: SignupContext;
  skipAbuseCheck?: boolean;
}

function isRecoverablePrivyProjectionConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const extractErrorMetadata = (
    candidate: unknown,
  ): { code?: string; constraint?: string; detail?: string; message: string } => {
    if (!candidate || typeof candidate !== "object") {
      return { message: String(candidate ?? "") };
    }

    const typedCandidate = candidate as {
      code?: unknown;
      constraint?: unknown;
      detail?: unknown;
      message?: unknown;
    };

    return {
      code:
        typeof typedCandidate.code === "string" ? typedCandidate.code : undefined,
      constraint:
        typeof typedCandidate.constraint === "string"
          ? typedCandidate.constraint
          : undefined,
      detail:
        typeof typedCandidate.detail === "string"
          ? typedCandidate.detail
          : undefined,
      message:
        typeof typedCandidate.message === "string"
          ? typedCandidate.message
          : String(candidate),
    };
  };

  const errorMetadata = extractErrorMetadata(error);
  const causeMetadata =
    "cause" in error ? extractErrorMetadata(error.cause) : { message: "" };
  const isUniqueViolation =
    errorMetadata.code === "23505" || causeMetadata.code === "23505";
  const constraintName =
    errorMetadata.constraint ?? causeMetadata.constraint ?? "";
  const conflictText = [
    errorMetadata.message,
    errorMetadata.detail,
    causeMetadata.message,
    causeMetadata.detail,
  ]
    .filter(Boolean)
    .join(" ");
  const hasExactPrivyConstraint =
    errorMetadata.constraint === "user_identities_privy_user_id_unique" ||
    causeMetadata.constraint === "user_identities_privy_user_id_unique";
  const hasSyntheticPrivyProjectionConflict =
    /\bprivy projection conflict\b/i.test(conflictText);

  if (isUniqueViolation && hasExactPrivyConstraint) {
    return true;
  }

  return hasSyntheticPrivyProjectionConflict;
}

async function recoverCanonicalPrivyUser(
  expectedUserId: string,
  privyUserId: string,
  context: "invite" | "signup",
  error: unknown,
): Promise<boolean> {
  if (!isRecoverablePrivyProjectionConflict(error)) {
    return false;
  }

  const projection = await usersService.getPrivyIdentityForWrite(privyUserId);
  if (!projection || projection.user_id !== expectedUserId) {
    return false;
  }

  const user = await usersService.getByPrivyIdForWrite(privyUserId);
  if (!user || user.id !== expectedUserId) {
    return false;
  }

  logger.warn("[PrivySync] Recovered from stale Privy identity projection conflict", {
    context,
    expectedUserId,
    privyUserId,
    error: error instanceof Error ? error.message : String(error),
  });

  return true;
}

async function rollbackCreatedUserSafely(
  userId: string,
  context: "invite" | "signup",
  originalError: unknown,
): Promise<void> {
  try {
    await usersRepository.delete(userId);
  } catch (rollbackError) {
    logger.error("[PrivySync] Failed to roll back newly created user", {
      context,
      userId,
      originalError:
        originalError instanceof Error
          ? originalError.message
          : String(originalError),
      rollbackError:
        rollbackError instanceof Error
          ? rollbackError.message
          : String(rollbackError),
    });
  }
}

/**
 * Generates a unique organization slug from an email address.
 *
 * @param email - Email address.
 * @returns Unique slug string.
 */
function generateSlugFromEmail(email: string): string {
  const username = email.split("@")[0];
  const sanitized = username.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const random = Math.random().toString(36).substring(2, 8);
  const timestamp = Date.now().toString(36).slice(-4);
  return `${sanitized}-${timestamp}${random}`;
}

/**
 * Generates a unique organization slug from a wallet address.
 *
 * @param walletAddress - Wallet address.
 * @returns Unique slug string.
 */
function generateSlugFromWallet(walletAddress: string): string {
  const shortAddress = walletAddress.substring(0, 8);
  const sanitized = shortAddress.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const random = Math.random().toString(36).substring(2, 8);
  const timestamp = Date.now().toString(36).slice(-4);
  return `wallet-${sanitized}-${timestamp}${random}`;
}

import type { User as PrivyUser } from "@privy-io/server-auth";
import { logger } from "@/lib/utils/logger";

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
    try {
      await usersService.upsertPrivyIdentity(user.id, privyUserId);
    } catch (error) {
      logger.warn("[PrivySync] Failed to repair Privy identity projection for existing user", {
        userId: user.id,
        privyUserId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

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

      // Refresh user with organization from primary to avoid replica lag
      user = (await usersService.getByPrivyIdForWrite(privyUserId))!;
    }

    return user;
  }

  // Check for pending invite first (before creating new organization)
  if (email) {
    const pendingInvite = await invitesService.findPendingInviteByEmail(email);

    if (pendingInvite) {
      let newUser: Awaited<ReturnType<typeof usersService.create>> | undefined;

      try {
        newUser = await usersService.create({
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
        await usersService.upsertPrivyIdentity(newUser.id, privyUserId);
      } catch (error) {
        const recovered =
          newUser &&
          (await recoverCanonicalPrivyUser(
            newUser.id,
            privyUserId,
            "invite",
            error,
          ));

        if (newUser && !recovered) {
          await rollbackCreatedUserSafely(newUser.id, "invite", error);
        }
        if (!recovered) {
          throw error;
        }
      }

      const userWithOrg = await usersService.getByPrivyIdForWrite(privyUserId);

      if (!userWithOrg) {
        throw new Error(
          `Failed to fetch newly created user ${privyUserId} after accepting invite`,
        );
      }

      await organizationInvitesRepository.markAsAccepted(
        pendingInvite.id,
        userWithOrg.id,
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
      const previousPrivyUserId = existingByEmail.privy_user_id;

      await usersService.update(existingByEmail.id, {
        privy_user_id: privyUserId,
        updated_at: new Date(),
      });

      try {
        await usersService.upsertPrivyIdentity(existingByEmail.id, privyUserId);
      } catch (error) {
        await usersService.update(existingByEmail.id, {
          privy_user_id: previousPrivyUserId,
          updated_at: new Date(),
        });
        throw error;
      }

      const linkedUser = await usersService.getByPrivyIdForWrite(privyUserId);
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

  // Create organization with zero balance initially
  const organization = await organizationsService.create({
    name: `${name}'s Organization`,
    slug: orgSlug,
    credit_balance: "0.00",
  });

  // Record signup metadata for future abuse detection
  if (signupContext) {
    await abuseDetectionService.recordSignupMetadata(
      organization.id,
      signupContext,
    );
  }

  // Add initial free credits via creditsService for proper tracking
  const initialCredits = getInitialCredits();

  if (initialCredits > 0) {
    try {
      await creditsService.addCredits({
        organizationId: organization.id,
        amount: initialCredits,
        description: "Initial free credits - Welcome bonus",
        metadata: {
          type: "initial_free_credits",
          source: "signup",
        },
      });
    } catch (error) {
      // Fallback: update organization balance directly if addCredits fails
      await organizationsService.update(organization.id, {
        credit_balance: String(initialCredits),
      });
    }
  }

  // Create user - handle race condition where another request created the user
  let createdUser: Awaited<ReturnType<typeof usersService.create>> | undefined;

  try {
    createdUser = await usersService.create({
      privy_user_id: privyUserId,
      email: email || null,
      email_verified: !!email,
      wallet_address: walletAddress || null,
      wallet_chain_type: walletChainType || null,
      wallet_verified: walletVerified,
      name,
      avatar: getRandomUserAvatar(),
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
      // Try to find existing user with retries (in case parallel transaction hasn't committed yet)
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
        existingUser = await usersService.getByPrivyIdForWrite(privyUserId);

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
            const previousPrivyUserId = existingUser.privy_user_id;
            await usersService.update(existingUser.id, {
              privy_user_id: privyUserId,
              updated_at: new Date(),
            });
            try {
              await usersService.upsertPrivyIdentity(existingUser.id, privyUserId);
            } catch (upsertError) {
              await usersService.update(existingUser.id, {
                privy_user_id: previousPrivyUserId,
                updated_at: new Date(),
              });
              throw upsertError;
            }
            await organizationsService.delete(organization.id);
            const linkedUser = await usersService.getByPrivyIdForWrite(privyUserId);
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
        // Clean up the orphaned organization we just created
        await organizationsService.delete(organization.id);
        return existingUser;
      }

      // Couldn't find existing user even after retries - cleanup and rethrow
      console.error(
        `Duplicate key error but user ${privyUserId} not found after ${maxRetries} retries - cleaning up and rethrowing`,
      );
      await organizationsService.delete(organization.id);
    }
    // Not a duplicate key error or couldn't find the existing user - rethrow
    console.error(
      `Failed to create user ${privyUserId}:`,
      error instanceof Error ? error.message : error,
    );
    throw error;
  }

  if (!createdUser) {
    throw new Error(`Failed to create user ${privyUserId}`);
  }

  try {
    await usersService.upsertPrivyIdentity(createdUser.id, privyUserId);
  } catch (error) {
    const recovered = await recoverCanonicalPrivyUser(
      createdUser.id,
      privyUserId,
      "signup",
      error,
    );

    if (!recovered) {
      await rollbackCreatedUserSafely(createdUser.id, "signup", error);
      await organizationsService.delete(organization.id);
      throw error;
    }
  }

  // Return user with organization
  const userWithOrg = await usersService.getByPrivyIdForWrite(privyUserId);

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
    logger.warn("[PrivySync] No email available for welcome email", {
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
 * Ensure user has a default API key for programmatic access
 * Creates one if it doesn't exist
 */
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
    logger.warn("[PrivySync] Invalid userId, skipping API key creation");
    return;
  }

  if (!organizationId || organizationId.trim() === "") {
    logger.warn(
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
