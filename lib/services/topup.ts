/**
 * Resolve topup recipient: from wallet signature headers (if present) or from body.walletAddress.
 * WHY wallet sig first: when present, credit the signer so payer and credited account match; otherwise
 * require body.walletAddress for backward compatibility with frontends that only send body.
 */

import type { NextRequest } from "next/server";
import { verifyWalletSignature } from "@/lib/auth/wallet-auth";
import { findOrCreateUserByWalletAddress } from "@/lib/services/wallet-signup";
import type { UserWithOrganization } from "@/lib/types";

export interface TopupRecipient {
  user: UserWithOrganization;
  organizationId: string;
  /** Wallet address to return in response (signed wallet or body value). */
  walletAddress: string;
}

/**
 * Returns the user/org to credit for a topup. If wallet sig headers are present and valid,
 * uses the signer's wallet; otherwise requires body.walletAddress and find-or-creates.
 * @throws when headers present but invalid (caller should return 401), or when body.walletAddress missing (400).
 */
export async function getTopupRecipient(
  request: NextRequest,
  body: { walletAddress?: string; ref?: string; referral_code?: string; appOwnerId?: string },
): Promise<TopupRecipient> {
  const hasWalletSig =
    !!request.headers.get("X-Wallet-Address") &&
    !!request.headers.get("X-Timestamp") &&
    !!request.headers.get("X-Wallet-Signature");

  if (hasWalletSig) {
    const walletUser = await verifyWalletSignature(request);
    if (!walletUser) throw new Error("Wallet signature verification failed");
    return {
      user: walletUser,
      organizationId: walletUser.organization_id!,
      walletAddress: walletUser.wallet_address ?? request.headers.get("X-Wallet-Address")!,
    };
  }

  if (!body?.walletAddress?.trim()) {
    throw new Error("walletAddress is required (body or wallet signature headers)");
  }

  const { user } = await findOrCreateUserByWalletAddress(body.walletAddress, {
    grantInitialCredits: false,
  });

  return {
    user,
    organizationId: user.organization_id!,
    walletAddress: body.walletAddress,
  };
}
