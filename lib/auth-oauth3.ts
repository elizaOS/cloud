/**
 * OAuth3 Authentication Adapter
 * 
 * Drop-in replacement for Privy authentication using decentralized OAuth3.
 * Can be used alongside or instead of Privy.
 */

import { usersService } from "@/lib/services/users";
import { apiKeysService } from "@/lib/services/api-keys";
import { userSessionsService } from "@/lib/services/user-sessions";
import { logger } from "@/lib/utils/logger";
import type { UserWithOrganization, ApiKey } from "@/lib/types";
import { cache } from "react";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import {
  keccak256,
  toBytes,
  toHex,
  verifyMessage,
  type Address,
  type Hex,
} from "viem";

// OAuth3 TEE Agent endpoint
const OAUTH3_AGENT_URL = process.env.OAUTH3_AGENT_URL ?? "http://localhost:4200";
const OAUTH3_CHAIN_ID = parseInt(process.env.OAUTH3_CHAIN_ID ?? "420691");

export interface OAuth3Session {
  sessionId: Hex;
  identityId: Hex;
  smartAccount: Address;
  expiresAt: number;
  provider: OAuth3Provider;
  providerId: string;
  providerHandle: string;
  attestation: OAuth3Attestation;
}

export interface OAuth3Attestation {
  quote: Hex;
  measurement: Hex;
  reportData: Hex;
  timestamp: number;
  provider: string;
  verified: boolean;
}

export type OAuth3Provider =
  | "wallet"
  | "farcaster"
  | "google"
  | "github"
  | "twitter"
  | "discord"
  | "apple";

export type OAuth3AuthResult = {
  user: UserWithOrganization;
  apiKey?: ApiKey;
  authMethod: "oauth3_session" | "api_key";
  session: OAuth3Session;
};

/**
 * Verify an OAuth3 session token
 */
async function verifyOAuth3Token(token: string): Promise<OAuth3Session | null> {
  const response = await fetch(`${OAUTH3_AGENT_URL}/session/${token}`, {
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    return null;
  }

  const session = (await response.json()) as OAuth3Session;

  if (session.expiresAt < Date.now()) {
    return null;
  }

  return session;
}

/**
 * Create or get user from OAuth3 session
 */
async function syncUserFromOAuth3(
  session: OAuth3Session
): Promise<UserWithOrganization> {
  const oauth3UserId = `oauth3:${session.identityId}`;

  let user = await usersService.getByPrivyId(oauth3UserId);

  if (!user) {
    user = await usersService.create({
      privy_id: oauth3UserId,
      email:
        session.provider === "google"
          ? session.providerHandle
          : `${session.providerHandle}@oauth3.jeju.network`,
      display_name: session.providerHandle,
      avatar_url: null,
      wallet_address: session.smartAccount,
      farcaster_fid:
        session.provider === "farcaster"
          ? parseInt(session.providerId)
          : undefined,
      farcaster_username:
        session.provider === "farcaster" ? session.providerHandle : undefined,
    });

    logger.info(`[OAuth3] Created new user from OAuth3: ${user.id}`);
  }

  return user;
}

/**
 * Ensure user has a default API key
 */
async function ensureUserHasApiKey(
  userId: string,
  organizationId: string
): Promise<void> {
  if (!userId?.trim() || !organizationId?.trim()) {
    return;
  }

  const existingKeys =
    await apiKeysService.listByOrganization(organizationId);
  const userHasKey = existingKeys.some((key) => key.user_id === userId);

  if (!userHasKey) {
    await apiKeysService.create({
      user_id: userId,
      organization_id: organizationId,
      name: "Default API Key (OAuth3)",
      is_active: true,
    });
  }
}

/**
 * Get the current authenticated user from OAuth3 token
 */
export const getCurrentUserOAuth3 = cache(
  async (): Promise<UserWithOrganization | null> => {
    const cookieStore = await cookies();
    const authToken = cookieStore.get("oauth3-token");

    if (!authToken) {
      return null;
    }

    const session = await verifyOAuth3Token(authToken.value);

    if (!session) {
      return null;
    }

    const user = await syncUserFromOAuth3(session);

    if (user.organization_id) {
      await ensureUserHasApiKey(user.id, user.organization_id);
    }

    return user;
  }
);

/**
 * Authenticate a request using OAuth3 (session or API key)
 */
export async function authenticateRequestOAuth3(
  request: NextRequest
): Promise<OAuth3AuthResult | null> {
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    if (token.startsWith("jj_")) {
      const apiKey = await apiKeysService.validateKey(token);
      if (apiKey?.is_active) {
        const user = await usersService.getById(apiKey.user_id);
        if (user) {
          return {
            user,
            apiKey,
            authMethod: "api_key",
            session: {
              sessionId: keccak256(toBytes(`api:${apiKey.id}`)),
              identityId: keccak256(toBytes(`user:${user.id}`)),
              smartAccount: (user.wallet_address ||
                "0x0000000000000000000000000000000000000000") as Address,
              expiresAt: Date.now() + 86400000,
              provider: "wallet",
              providerId: user.id,
              providerHandle: user.display_name || user.email || "User",
              attestation: {
                quote: "0x" as Hex,
                measurement: "0x" as Hex,
                reportData: "0x" as Hex,
                timestamp: Date.now(),
                provider: "api_key",
                verified: true,
              },
            },
          };
        }
      }
    }

    const session = await verifyOAuth3Token(token);
    if (session) {
      const user = await syncUserFromOAuth3(session);
      return {
        user,
        authMethod: "oauth3_session",
        session,
      };
    }
  }

  const oauth3Token = request.cookies.get("oauth3-token")?.value;
  if (oauth3Token) {
    const session = await verifyOAuth3Token(oauth3Token);
    if (session) {
      const user = await syncUserFromOAuth3(session);
      return {
        user,
        authMethod: "oauth3_session",
        session,
      };
    }
  }

  return null;
}

/**
 * Initialize OAuth3 login flow
 */
export async function initOAuth3Login(
  provider: OAuth3Provider,
  redirectUri: string,
  appId?: Hex
): Promise<{ authUrl: string; state: string; sessionId: Hex }> {
  const response = await fetch(`${OAUTH3_AGENT_URL}/auth/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      appId: appId ?? keccak256(toBytes("jeju-cloud-default")),
      redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to initialize OAuth3 login: ${response.status}`);
  }

  return response.json();
}

/**
 * Complete OAuth3 login flow
 */
export async function completeOAuth3Login(
  state: string,
  code: string
): Promise<OAuth3Session> {
  const response = await fetch(`${OAUTH3_AGENT_URL}/auth/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, code }),
  });

  if (!response.ok) {
    throw new Error(`Failed to complete OAuth3 login: ${response.status}`);
  }

  return response.json();
}

/**
 * Login with wallet signature (SIWE-style)
 */
export async function loginWithWallet(
  address: Address,
  signature: Hex,
  message: string
): Promise<OAuth3Session> {
  const isValid = await verifyMessage({
    address,
    message,
    signature,
  });

  if (!isValid) {
    throw new Error("Invalid wallet signature");
  }

  const response = await fetch(`${OAUTH3_AGENT_URL}/auth/wallet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address,
      signature,
      message,
      appId: keccak256(toBytes("jeju-cloud-default")),
    }),
  });

  if (!response.ok) {
    throw new Error(`Wallet login failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Login with Farcaster
 */
export async function loginWithFarcaster(
  fid: number,
  custodyAddress: Address,
  signature: Hex,
  message: string
): Promise<OAuth3Session> {
  const response = await fetch(`${OAUTH3_AGENT_URL}/auth/farcaster`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fid,
      custodyAddress,
      signature,
      message,
      appId: keccak256(toBytes("jeju-cloud-default")),
    }),
  });

  if (!response.ok) {
    throw new Error(`Farcaster login failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Logout / invalidate session
 */
export async function logoutOAuth3(sessionId: Hex): Promise<void> {
  await fetch(`${OAUTH3_AGENT_URL}/session/${sessionId}`, {
    method: "DELETE",
  });
}

/**
 * Get TEE attestation for current session
 */
export async function getOAuth3Attestation(): Promise<OAuth3Attestation> {
  const response = await fetch(`${OAUTH3_AGENT_URL}/attestation`);

  if (!response.ok) {
    throw new Error(`Failed to get attestation: ${response.status}`);
  }

  return response.json();
}

/**
 * Check if OAuth3 agent is available
 */
export async function isOAuth3Available(): Promise<boolean> {
  const response = await fetch(`${OAUTH3_AGENT_URL}/health`, {
    signal: AbortSignal.timeout(2000),
  }).catch(() => null);

  return response?.ok ?? false;
}
