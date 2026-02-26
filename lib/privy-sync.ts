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
import { getInitialCredits, generateSlugFromWallet, generateSlugFromEmail } from "@/lib/utils/signup-helpers";
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
export interface SyncOptions {
  signupContext?: SignupContext;
  skipAbuseCheck?: boolean;
}

/**
 * Error type with orphaned organization tracking.
 */
type SyncError = Error & {
  __orphanedOrgId?: string;
};

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

      user = (await usersService.getByPrivyId(privyUserId))!;
    }

    return user;
  }

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

  let orgSlug: string;
  if (email) {
    orgSlug = generateSlugFromEmail(email);
  } else if (walletAddress) {
    orgSlug = generateSlugFromWallet(walletAddress);
  } else if (name) {
    const sanitized = name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const random = Math.random().toString(36).substring(2, 8);
    const timestamp = Date.now().toString(36).slice(-4);
    orgSlug = `${sanitized}-${timestamp}${random}`;
  } else {
    throw new Error(
      `Cannot generate organization slug for user ${privyUserId}`,
    );
  }

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

  const initialCredits = getInitialCredits();
  
  let organization: Awaited<ReturnType<typeof organizationsService.create>>;
  try {
    const org = await organizationsService.create({
      name: `${name}'s Organization`,
      slug: orgSlug,
      credit_balance: "0.00",
    });

    try {
      if (signupContext) {
        await abuseDetectionService.recordSignupMetadata(
          org.id,
          signupContext,
        );
      }

      // Review: createdOrgId is retained for future cleanup, though currently unused in this flow.
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
            throw new Error(`Failed to grant welcome credits for organization ${org.id}`);
          }
        }
      }

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
      try {
        await organizationsService.delete(org.id);
      } catch (cleanupError) {
        console.error(
          `[PrivySync] Failed to clean up orphaned org ${org.id}:`,
          cleanupError,
        );
        if (innerError && typeof innerError === "object") {
          (innerError as SyncError).__orphanedOrgId = org.id;
        }
      }
      throw innerError;
    }
    
    organization = org;
  } catch (error) {
    const isDuplicateError =
      error &&
      typeof error === "object" &&
      (("code" in error && error.code === "23505") ||
        ("cause" in error &&
          error.cause &&
          typeof error.cause === "object" &&
          "code" in error.cause &&
          error.cause.code === "23505"));

    // Use existing orphanId if set, otherwise undefined
    const orphanedOrgId = (error as SyncError).__orphanedOrgId;

    if (orphanedOrgId) {
      try {
        await organizationsService.delete(orphanedOrgId);
        console.info(
          `[PrivySync] Cleaned up orphaned org ${orphanedOrgId} after duplicate-key error.`,
        );
      } catch (cleanupError) {
        console.error(
          `[PrivySync] CRITICAL: Failed to delete orphaned org ${orphanedOrgId}:`,
          cleanupError,
        );
        throw new Error(
          `Failed to clean up orphaned organization ${orphanedOrgId} after duplicate user creation. Manual cleanup required.`
        );
      }
    }

    if (!isDuplicateError) {
      throw error;
    }

    let existingUser: UserWithOrganization | undefined;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, 50 * Math.pow(2, attempt - 1)),
        );
      }

      existingUser = await usersService.getByPrivyId(privyUserId);

      if (existingUser) {
        break;
      }

      if (email) {
        existingUser = await usersService.getByEmailWithOrganization(email);
      }
      if (existingUser) {
        if (existingUser.privy_user_id !== privyUserId) {
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

    console.error(
      `Duplicate key error but user ${privyUserId} not found after ${maxRetries} retries`,
    );
    throw error;
  }

  const userWithOrg = await usersService.getByPrivyId(privyUserId);

  if (!userWithOrg) {
    throw new Error(`Failed to fetch newly created user ${privyUserId}`);
  }

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
    const existingKeys =
      await apiKeysService.listByOrganization(organizationId);
    const userHasKey = existingKeys.some((key) => key.user_id === userId);

    if (userHasKey) {
      return;
    }

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
