import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import { cache } from "@/lib/cache/client";
import { validateAndConsumeSIWE } from "@/lib/utils/siwe-helpers";
import { findOrCreateUserByWalletAddress } from "@/lib/services/wallet-signup";
import { apiKeysService } from "@/lib/services/api-keys";
import { withRateLimit, RateLimitPresets } from "@/lib/middleware/rate-limit";
import type { Organization } from "@/db/repositories/organizations";

interface VerifyBody {
  message: string;
  signature: `0x${string}`;
}

function buildResponse(
  plainKey: string,
  address: string,
  isNewAccount: boolean,
  user: { id: string; wallet_address: string | null; organization_id: string | null },
  org: Organization | null,
) {
  return NextResponse.json({
    apiKey: plainKey,
    address: getAddress(address),
    isNewAccount,
    user: {
      id: user.id,
      wallet_address: user.wallet_address,
      organization_id: user.organization_id,
    },
    organization: org
      ? { id: org.id, name: org.name, slug: org.slug }
      : null,
  });
}

/**
 * POST /api/auth/siwe/verify
 * Body: { message, signature }. Validates domain + signature, consumes nonce, then findOrCreateUserByWalletAddress + issue API key.
 * WHY new key each time: client may have lost previous key; SIWE is the recovery path. Rate limit STRICT (account creation + key issuance).
 */
async function handler(request: NextRequest) {
  if (!cache.isAvailable()) {
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as VerifyBody | null;
  if (!body?.message || !body?.signature) {
    return NextResponse.json(
      { error: "message and signature are required" },
      { status: 400 },
    );
  }

  let address: string;
  try {
    const result = await validateAndConsumeSIWE(body.message, body.signature);
    address = result.address;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 401 },
    );
  }

  const { user, isNewAccount } = await findOrCreateUserByWalletAddress(address);

  if (!user.organization_id) {
    return NextResponse.json(
      { error: "Organization creation failed - please try again" },
      { status: 400 }
    );
  }

  // Only deactivate previous SIWE-generated keys, not all user keys
  await apiKeysService.deactivateUserKeysByName(user.id, "SIWE sign-in");

  const { plainKey } = await apiKeysService.create({
    user_id: user.id,
    organization_id: user.organization_id,
    name: "SIWE sign-in", 
    is_active: true,
  });

  return buildResponse(plainKey, address, isNewAccount, user, user.organization ?? null);
}

export const POST = withRateLimit(handler, RateLimitPresets.STRICT);
