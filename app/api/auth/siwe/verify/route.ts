/**
 * SIWE Verify Endpoint
 *
 * Handles both sign-in (existing wallet) and sign-up (new wallet) in a single
 * request. This is intentional: agents shouldn't need to know whether an account
 * exists before authenticating. They sign a message and get back an API key.
 *
 * The response always includes `isNewAccount` so callers can branch on it if
 * they need to (e.g., show a welcome flow or skip straight to funding).
 *
 * Security model:
 * - Nonce is single-use (consumed from Redis before proceeding)
 * - Domain in the SIWE message must match our canonical app URL
 * - Signature is verified via ecrecover, not trusted from the client
 * - Rate limited with STRICT preset (unauthenticated endpoint)
 * - Abuse detection runs before any resource creation on signup
 *
 * Why not IP-bind nonces: Agents run on serverless infra, VPNs, and shared
 * IPs. Binding nonces to IP would break legitimate use without meaningful
 * security gain over HTTPS + single-use + TTL.
 */

import { type NextRequest, NextResponse } from "next/server";
import { parseSiweMessage } from "viem/siwe";
import { recoverMessageAddress, getAddress, type Hex } from "viem";
import { cache } from "@/lib/cache/client";
import { CacheKeys } from "@/lib/cache/keys";
import { atomicConsume } from "@/lib/cache/consume";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import { usersService } from "@/lib/services/users";
import { apiKeysService } from "@/lib/services/api-keys";
import { organizationsService } from "@/lib/services/organizations";
import { creditsService } from "@/lib/services/credits";
import { abuseDetectionService } from "@/lib/services/abuse-detection";
import { getRandomUserAvatar } from "@/lib/utils/default-user-avatar";
// Import from shared utility to ensure SIWE and Privy auth create accounts consistently
import { generateSlugFromWallet, getInitialCredits } from "@/lib/utils/signup-helpers";
import { getAppUrl } from "@/lib/utils/app-url";
import type { UserWithOrganization } from "@/lib/types";

function truncateAddress(address: string): string {
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

/**
 * Finds an active API key for this user, or creates one.
 *
 * NOTE: For existing keys, this returns the plaintext key stored in the `key`
 * column of api_keys. The current schema stores plaintext alongside a SHA-256
 * hash. This means SIWE re-authentication recovers the original key rather
 * than issuing a new one -- which is the correct behavior for agents that may
 * have lost their key and are re-authenticating to recover access.
 *
 * If the schema ever migrates to hash-only storage, this function will need
 * to issue new keys on every auth (or return a key prefix for identification).
 */
async function resolveApiKeyForUser(
  user: UserWithOrganization,
): Promise<string> {
  const keys = await apiKeysService.listByOrganization(user.organization_id!);
  const now = new Date();
  const existing = keys.find(
    (k) => k.user_id === user.id && k.is_active && (!k.expires_at || new Date(k.expires_at) > now),
  );

  if (existing) {
    return existing.key;
  }

  const { plainKey } = await apiKeysService.create({
    user_id: user.id,
    organization_id: user.organization_id!,
    name: "Default API Key",
    is_active: true,
  });

  return plainKey;
}

function buildSuccessResponse(
  user: UserWithOrganization,
  apiKey: string,
  address: string,
  isNewAccount: boolean,
) {
  return NextResponse.json({
    apiKey,
    address,
    isNewAccount,
    user: {
      id: user.id,
      name: user.name,
      // Tells callers whether this wallet was previously linked through Privy
      // (web signup). Useful for agents to know if a web dashboard exists.
      privyLinked: !!user.privy_user_id,
    },
    organization: {
      id: user.organization_id,
      name: user.organization?.name,
      creditBalance: user.organization?.credit_balance,
    },
  });
}



type SiweVerifyBody = { message?: string; signature?: string };

async function handleVerify(request: NextRequest) {
  let body: SiweVerifyBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "INVALID_BODY",
        message: "Request must include 'message' and 'signature' fields.",
      },
      { status: 400 },
    );
  }

  if (
    typeof body.message !== "string" ||
    body.message.trim().length === 0 ||
    typeof body.signature !== "string" ||
    body.signature.trim().length === 0
  ) {
    // Review: body is validated immediately after declaration, type narrowing occurs before use cases
    return NextResponse.json(
      {
        error: "INVALID_BODY",
        message: "Request must include 'message' and 'signature' fields.",
      },
      { status: 400 },
    );
  }

  const message = body.message;
  // Some wallets/libraries omit the 0x prefix on hex signatures.
  const signature = body.signature.startsWith("0x")
    ? body.signature
    : `0x${body.signature}`;

  let parsed: ReturnType<typeof parseSiweMessage>;
  try {
    parsed = parseSiweMessage(message);
  } catch {
    return NextResponse.json(
      {
        error: "INVALID_BODY",
        message: "Failed to parse SIWE message. Ensure it follows EIP-4361 format.",
      },
      { status: 400 },
    );
  }

  // parseSiweMessage returns all fields as optional. We must verify the
  // security-critical ones exist before proceeding (per EIP-4361).
  if (!parsed.address || !parsed.nonce || !parsed.domain || !parsed.uri || !parsed.version || !parsed.chainId) {
    return NextResponse.json(
      {
        error: "INVALID_BODY",
        message: "SIWE message is missing required fields.",
      },
      { status: 400 },
    );
  }

  // --- Nonce validation ---
  // First check if cache is available. If Redis is down, nonces can't be validated.
  if (!cache.isAvailable()) {
    return NextResponse.json(
      {
        error: "SERVICE_UNAVAILABLE",
        message: "Authentication service temporarily unavailable. Please try again later.",
      },
      { status: 503 },
    );
  }

  // Atomic consume: returns the number of keys deleted (1 if existed, 0 if not).
  // This prevents race conditions where two concurrent requests could both
  // pass a get() check before either deletes the nonce.
  let deleteCount: number;
  try {
    deleteCount = await atomicConsume(CacheKeys.siwe.nonce(parsed.nonce));
  } catch {
    return NextResponse.json(
      {
        error: "SERVICE_UNAVAILABLE",
        message: "Authentication service temporarily unavailable. Please try again later.",
      },
      { status: 503 },
    // Review: catch block surfaces Redis unavailability as 503 error instead of silent failure
    );
  }
  if (deleteCount === 0) {
    return NextResponse.json(
      {
        error: "INVALID_NONCE",
        message:
          "The nonce has expired or was already used. Request a new nonce and try again.",
      },
      { status: 400 },
    );
  }

  // --- Domain validation ---
  // Prevents phishing: if an attacker tricks a user into signing a message
  // for a different domain, it won't pass verification here.
  //
  // We resolve the canonical URL using the same fallback chain as the rest of
  // the codebase: NEXT_PUBLIC_APP_URL → VERCEL_URL → localhost.  If only
  // getAppUrl() were used and it fell back to a hard-coded default that
  // differs from the actual deployed host, valid SIWE messages would be
  // rejected.
  const appUrl = getAppUrl();
  const expectedDomain = new URL(appUrl).hostname;

  if (parsed.domain !== expectedDomain) {
    return NextResponse.json(
      {
        error: "INVALID_DOMAIN",
        message:
          "The SIWE message domain does not match this server. Use the domain returned by the nonce endpoint.",
      },
      { status: 400 },
    );
  }

  if (parsed.notBefore && new Date(parsed.notBefore) > new Date()) {
    return NextResponse.json(
      {
        error: "MESSAGE_NOT_YET_VALID",
        message:
          "The SIWE message is not yet valid. Check the notBefore timestamp.",
      },
      { status: 400 },
    );
  }

  if (parsed.expirationTime && new Date(parsed.expirationTime) < new Date()) {
    return NextResponse.json(
      {
        error: "MESSAGE_EXPIRED",
        message:
          "The SIWE message has expired. Request a new nonce and sign again.",
      },
      { status: 400 },
    );
  }

  // --- Signature verification ---
  // recoverMessageAddress takes the RAW message string (not the parsed object)
  // because it needs to hash the exact bytes that were signed per EIP-191.
  let recoveredAddress: string;
  try {
    recoveredAddress = await recoverMessageAddress({
      message,
      signature: signature as Hex,
    });
  } catch {
    return NextResponse.json(
      {
        error: "INVALID_SIGNATURE",
        message:
          "The signature does not match the claimed wallet address. Verify you are signing the exact message string.",
      },
      { status: 400 },
    );
  }

  // getAddress() normalizes to EIP-55 checksum case. Ethereum addresses are
  // case-insensitive (0xABC == 0xabc) so raw string comparison would be wrong.
  if (getAddress(recoveredAddress) !== getAddress(parsed.address)) {
    return NextResponse.json(
      {
        error: "INVALID_SIGNATURE",
        message:
          "The signature does not match the claimed wallet address. Verify you are signing the exact message string.",
      },
      { status: 400 },
    );
  }

  // Canonical checksummed form for response; lowercase for DB lookups (the DB
  // stores addresses lowercase for consistent indexing).
  const address = getAddress(recoveredAddress);

  // --- Existing user path ---
  const existingUser = await usersService.getByWalletAddressWithOrganization(
    address.toLowerCase(),
  );

  if (existingUser) {
    if (!existingUser.is_active || !existingUser.organization?.is_active || !existingUser.organization_id) {
      return NextResponse.json(
        {
          error: "ACCOUNT_INACTIVE",
          message: "This account or organization has been deactivated.",
        },
        { status: 403 },
      );
    }

    // Mark wallet as verified for users who originally signed up through Privy.
    // This proves they own the wallet (not just linked it via Privy OAuth).
    if (!existingUser.wallet_verified) {
      await usersService.update(existingUser.id, { wallet_verified: true });
    }

    const apiKey = await resolveApiKeyForUser(existingUser);
    return buildSuccessResponse(existingUser, apiKey, address, false);
  }

  // --- New user path ---
  const ip =
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";

  // Abuse detection runs BEFORE any resource creation to avoid creating
  // orphaned orgs/users that need cleanup.
  const abuseCheck = await abuseDetectionService.checkSignupAbuse({
    ipAddress: ip,
    userAgent,
  });

  if (!abuseCheck.allowed) {
    return NextResponse.json(
      {
        error: "SIGNUP_BLOCKED",
        message:
          abuseCheck.reason || "Signup blocked due to suspicious activity.",
      },
      { status: 403 },
    );
  }

  const displayName = truncateAddress(address);

  // Sequential org + credits + user + API key creation with compensating cleanup.
  // Services use their own global dbWrite connection and do not accept a transaction
  // parameter, so db.transaction() would be ineffective. Instead, if any step after
  // org creation fails, we delete the org as a compensating action.
  //
  // The 23505 duplicate-key handler below mitigates race conditions where two
  // concurrent signups attempt to create the same wallet.
  let signupResult: { user: UserWithOrganization; plainKey: string };
  try {
    let orgSlug = generateSlugFromWallet(address);
    let slugAttempts = 0;
    while (await organizationsService.getBySlug(orgSlug)) {
      slugAttempts++;
      if (slugAttempts > 10) {
        throw new Error("Failed to generate unique organization slug");
      }
      orgSlug = generateSlugFromWallet(address);
    }

    const org = await organizationsService.create({
      name: `${displayName}'s Organization`,
      slug: orgSlug,
      credit_balance: "0.00",
    });

    try {
      await abuseDetectionService.recordSignupMetadata(org.id, {
        ipAddress: ip,
        userAgent,
      });

      const initialCredits = getInitialCredits();
      if (initialCredits > 0) {
        try {
          await creditsService.addCredits({
            organizationId: org.id,
            amount: initialCredits,
            description: "Initial free credits - Welcome bonus",
            metadata: {
              type: "initial_free_credits",
              source: "siwe_signup",
            },
          });
        } catch (creditsError) {
          console.error(
            `[SIWE] Failed to add initial credits for org ${org.id}, continuing signup:`,
            creditsError,
          );
        }
      }

      const user = await usersService.create({
        wallet_address: address.toLowerCase(),
        wallet_chain_type: "ethereum",
        wallet_verified: true,
        privy_user_id: null,
        name: displayName,
        avatar: getRandomUserAvatar(),
        organization_id: org.id,
        role: "owner",
        is_active: true,
      });

      const { plainKey } = await apiKeysService.create({
        user_id: user.id,
        organization_id: org.id,
        name: "Default API Key",
        is_active: true,
      });

      // Return the user with organization attached so we don't need a separate fetch
      const userWithOrg: UserWithOrganization = {
        ...user,
        organization: org,
      } as UserWithOrganization;

      signupResult = { user: userWithOrg, plainKey };
    } catch (innerError) {
      // Compensating cleanup: delete the org we just created to avoid orphans.
      // Any failure after org creation (duplicate-key, API key creation, etc.)
      // means the org has no valid user attached and should be removed.
      try {
        await organizationsService.delete(org.id);
      } catch (cleanupError) {
        console.error(
          `[SIWE] Failed to clean up orphaned org ${org.id}:`,
          cleanupError,
        );
      }
      throw innerError;
    }
  } catch (error) {
    // Handle race condition: two concurrent SIWE requests for the same new
    // wallet. The unique constraint on wallet_address (Postgres error 23505)
    // means the second insert fails. The org is cleaned up via compensating delete above.
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
      // The winning request may not have committed yet, so retry with backoff.
      let raceUser: UserWithOrganization | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, 50 * Math.pow(2, attempt - 1)),
          );
        }
        raceUser = await usersService.getByWalletAddressWithOrganization(
          address.toLowerCase(),
        );
        if (raceUser) break;
      }

      if (raceUser && raceUser.organization_id && raceUser.organization) {
        if (!raceUser.is_active || !raceUser.organization.is_active) {
          return NextResponse.json(
            {
              error: "ACCOUNT_INACTIVE",
              message: "This account or organization has been deactivated.",
            },
            { status: 403 },
          );
        }
        if (!raceUser.wallet_verified) {
          await usersService.update(raceUser.id, { wallet_verified: true });
        }
        const apiKey = await resolveApiKeyForUser(raceUser);
        return buildSuccessResponse(raceUser, apiKey, address, false);
      }
    }
    throw error;
  }

  return buildSuccessResponse(signupResult.user, signupResult.plainKey, address, true);
}

export const POST = withRateLimit(handleVerify, RateLimitPresets.STRICT);
