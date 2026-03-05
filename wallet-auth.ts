```
import { NextRequest } from "next/server";
import { verifyMessage } from "viem";
import { usersService } from "@/lib/services/users";
import { logger } from "@/lib/utils/logger";
import type { UserWithOrganization } from "@/lib/types";
import { cache as redisCache } from "@/lib/cache/client";

const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000; // 5 minutes

export async function verifyWalletSignature(
  request: NextRequest
): Promise<UserWithOrganization | null> {
  const walletAddress = request.headers.get("X-Wallet-Address");
  const timestampStr = request.headers.get("X-Timestamp");
  const signature = request.headers.get("X-Wallet-Signature");

  if (!walletAddress || !timestampStr || !signature) {
    return null;
  }

  // 1. Verify Timestamp
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    throw new Error("Invalid timestamp format");
  }

  const now = Date.now();
  if (Math.abs(now - timestamp) > MAX_TIMESTAMP_AGE_MS) {
    throw new Error("Signature timestamp expired");
  }

  // 2. Reconstruct the message
  const method = request.method;
  const path = request.nextUrl.pathname;
  const nonce = `${walletAddress}-${timestamp}-${method}-${path}`;
  const message = `Eliza Cloud Authentication\nTimestamp: ${timestamp}\nMethod: ${method}\nPath: ${path}`;

  // 4. Verify Signature
  try {
    const isValid = await verifyMessage({
      address: walletAddress as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!isValid) {
      throw new Error("Invalid wallet signature");
    }
  } catch (error) {
    logger.error("Wallet signature verification failed", error);
    throw new Error("Signature verification failed");
  }

  // 3. Check Redis for nonce to prevent replay
  const nonceKey = `wallet-nonce:${nonce}`;
  const nonceExists = await redisCache.get(nonceKey);
  if (nonceExists) {
    throw new Error("Signature has already been used");
  }

  // Set nonce with 5-min expiry matching timestamp window
  await redisCache.set(nonceKey, "used", MAX_TIMESTAMP_AGE_MS / 1000);

  // 4. Lookup User & Organization
  const user = await usersService.getByWalletAddressWithOrganization(walletAddress);
  if (!user) {
    throw new Error("User associated with wallet address not found");
  }

  if (!user.is_active) {
    throw new Error("User account is inactive");
  }

  if (!user.organization?.is_active) {
    throw new Error("Organization is inactive");
  }

  return user;
}
```
