/**
 * OAuth3 User Sync
 *
 * Handles syncing user data from OAuth3 sessions to the local database.
 * Replaces Privy sync functionality.
 */

import { usersService } from "@/lib/services/users";
import { organizationsService } from "@/lib/services/organizations";
import { logger } from "@/lib/utils/logger";
import type { UserWithOrganization } from "@/lib/types";
import type { OAuth3User, OAuth3TokenClaims } from "@/lib/auth/oauth3-client";

/**
 * Generate OAuth3 user ID from identity
 */
function getOAuth3UserId(identityId: string): string {
  return `oauth3:${identityId}`;
}

/**
 * Generates a unique organization slug from a wallet address.
 */
export function generateSlugFromWallet(walletAddress: string): string {
  const shortAddress = walletAddress.substring(0, 8);
  const sanitized = shortAddress.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const random = Math.random().toString(36).substring(2, 8);
  const timestamp = Date.now().toString(36).slice(-4);
  return `wallet-${sanitized}-${timestamp}${random}`;
}

/**
 * Sync user from OAuth3 session to database
 */
export async function syncUserFromOAuth3(
  oauth3User: OAuth3User
): Promise<UserWithOrganization> {
  const oauth3UserId = getOAuth3UserId(oauth3User.identityId);

  logger.info("[OAuth3Sync] Syncing user", {
    identityId: oauth3User.identityId.substring(0, 16),
    provider: oauth3User.provider,
  });

  // Check if user already exists
  let user = await usersService.getByPrivyId(oauth3UserId);

  if (user) {
    // Update existing user
    const updates: Record<string, unknown> = {};

    if (oauth3User.email && oauth3User.email !== user.email) {
      updates.email = oauth3User.email;
    }

    if (oauth3User.displayName && oauth3User.displayName !== user.display_name) {
      updates.display_name = oauth3User.displayName;
    }

    if (oauth3User.avatarUrl && oauth3User.avatarUrl !== user.avatar_url) {
      updates.avatar_url = oauth3User.avatarUrl;
    }

    if (oauth3User.smartAccount && oauth3User.smartAccount !== user.wallet_address) {
      updates.wallet_address = oauth3User.smartAccount;
    }

    // Handle Farcaster linking
    if (oauth3User.farcasterFid && oauth3User.farcasterFid !== user.farcaster_fid) {
      updates.farcaster_fid = oauth3User.farcasterFid;
    }

    if (oauth3User.farcasterUsername && oauth3User.farcasterUsername !== user.farcaster_username) {
      updates.farcaster_username = oauth3User.farcasterUsername;
    }

    // Check linked accounts for Farcaster
    const farcasterAccount = oauth3User.linkedAccounts?.find(
      (a) => a.provider === "farcaster"
    );
    if (farcasterAccount) {
      updates.farcaster_fid = parseInt(farcasterAccount.providerId);
      updates.farcaster_username = farcasterAccount.handle;
    }

    if (Object.keys(updates).length > 0) {
      user = await usersService.update(user.id, updates);
      logger.info("[OAuth3Sync] Updated user", {
        userId: user.id,
        updates: Object.keys(updates),
      });
    }

    return user;
  }

  // Create new user
  logger.info("[OAuth3Sync] Creating new user", {
    identityId: oauth3User.identityId.substring(0, 16),
    provider: oauth3User.provider,
  });

  // Determine email
  let email = oauth3User.email;
  if (!email) {
    // Generate email from provider handle
    email = `${oauth3User.providerHandle.replace(/[^a-zA-Z0-9]/g, "")}@oauth3.jeju.network`;
  }

  // Determine display name
  const displayName =
    oauth3User.displayName ||
    oauth3User.providerHandle ||
    oauth3User.smartAccount.substring(0, 10);

  // Check for Farcaster in linked accounts
  const farcasterAccount = oauth3User.linkedAccounts?.find(
    (a) => a.provider === "farcaster"
  );

  user = await usersService.create({
    privy_id: oauth3UserId,
    email,
    display_name: displayName,
    avatar_url: oauth3User.avatarUrl || null,
    wallet_address: oauth3User.smartAccount,
    farcaster_fid: farcasterAccount
      ? parseInt(farcasterAccount.providerId)
      : oauth3User.farcasterFid,
    farcaster_username: farcasterAccount
      ? farcasterAccount.handle
      : oauth3User.farcasterUsername,
  });

  logger.info("[OAuth3Sync] Created new user", {
    userId: user.id,
    organizationId: user.organization_id,
  });

  return user;
}

/**
 * Sync user from OAuth3 token claims
 */
export async function syncUserFromClaims(
  claims: OAuth3TokenClaims
): Promise<UserWithOrganization> {
  const oauth3User: OAuth3User = {
    identityId: claims.identityId,
    smartAccount: claims.smartAccount,
    provider: claims.provider,
    providerId: claims.providerId,
    providerHandle: claims.providerHandle,
    linkedAccounts: [],
  };

  return syncUserFromOAuth3(oauth3User);
}

/**
 * Sync user from Privy (compatibility wrapper)
 * This accepts the old Privy user format and converts it to OAuth3 format
 */
export async function syncUserFromPrivy(
  privyUser: {
    id: string;
    email?: { address: string };
    phone?: { number: string };
    wallet?: { address: string };
    farcaster?: { fid: number; username: string };
    google?: { email: string; name: string };
    twitter?: { username: string };
    discord?: { username: string };
    github?: { username: string };
    linkedAccounts?: Array<{
      type: string;
      address?: string;
      email?: string;
      phoneNumber?: string;
      fid?: number;
      username?: string;
    }>;
  }
): Promise<UserWithOrganization> {
  // Convert Privy user to OAuth3 format
  const oauth3User: OAuth3User = {
    identityId: privyUser.id as `0x${string}`,
    smartAccount: (privyUser.wallet?.address || "0x0000000000000000000000000000000000000000") as `0x${string}`,
    provider: determineProvider(privyUser),
    providerId: privyUser.id,
    providerHandle: determineHandle(privyUser),
    email: privyUser.email?.address || privyUser.google?.email,
    displayName: privyUser.google?.name || determineHandle(privyUser),
    farcasterFid: privyUser.farcaster?.fid,
    farcasterUsername: privyUser.farcaster?.username,
    linkedAccounts: (privyUser.linkedAccounts || []).map((account) => ({
      provider: account.type,
      providerId: account.fid?.toString() || account.address || account.email || "",
      handle: account.username || account.email || account.address || "",
    })),
  };

  return syncUserFromOAuth3(oauth3User);
}

function determineProvider(privyUser: {
  wallet?: { address: string };
  email?: { address: string };
  google?: { email: string };
  farcaster?: { fid: number };
  twitter?: { username: string };
  discord?: { username: string };
  github?: { username: string };
}): string {
  if (privyUser.wallet?.address) return "wallet";
  if (privyUser.google?.email) return "google";
  if (privyUser.farcaster?.fid) return "farcaster";
  if (privyUser.twitter?.username) return "twitter";
  if (privyUser.discord?.username) return "discord";
  if (privyUser.github?.username) return "github";
  if (privyUser.email?.address) return "email";
  return "unknown";
}

function determineHandle(privyUser: {
  wallet?: { address: string };
  email?: { address: string };
  google?: { email: string; name?: string };
  farcaster?: { username: string };
  twitter?: { username: string };
  discord?: { username: string };
  github?: { username: string };
}): string {
  if (privyUser.google?.name) return privyUser.google.name;
  if (privyUser.farcaster?.username) return privyUser.farcaster.username;
  if (privyUser.twitter?.username) return privyUser.twitter.username;
  if (privyUser.discord?.username) return privyUser.discord.username;
  if (privyUser.github?.username) return privyUser.github.username;
  if (privyUser.email?.address) return privyUser.email.address.split("@")[0];
  if (privyUser.wallet?.address) return privyUser.wallet.address.substring(0, 10);
  return "User";
}

