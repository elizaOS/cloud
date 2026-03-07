import { db } from "@/db/client";
import { agentServerWallets } from "@/db/schemas/agent-server-wallets";
import { eq } from "drizzle-orm";
import { getPrivyClient } from "@/lib/auth/privy-client";
import type { WalletApiWalletResponseType } from "@privy-io/server-auth";
import { verifyMessage } from "viem";
import { cache } from "@/lib/cache/client";

class WalletAlreadyExistsError extends Error {
  constructor() {
    super("Wallet already exists for this client address");
    this.name = "WalletAlreadyExistsError";
  }
}

class RpcRequestExpiredError extends Error {
  constructor() {
    super("RPC request expired: Timestamp must be within the last 5 minutes");
    this.name = "RpcRequestExpiredError";
  }
}

class InvalidRpcSignatureError extends Error {
  constructor() {
    super(
      "Invalid RPC signature: The client address does not match the signature for this payload.",
    );
    this.name = "InvalidRpcSignatureError";
  }
}

class RpcReplayError extends Error {
  constructor() {
    super("RPC nonce already used: Request appears to be a replay attack");
    this.name = "RpcReplayError";
  }
}

class ServerWalletNotFoundError extends Error {
  constructor() {
    super(
      "Server wallet not found: No provisioned Privy Server Wallet matches this client address.",
    );
    this.name = "ServerWalletNotFoundError";
  }
}

export interface ProvisionWalletParams {
  organizationId: string;
  userId: string;
  characterId: string | null;
  clientAddress: string;
  chainType: "evm" | "solana";
}

export async function provisionServerWallet({
  organizationId,
  userId,
  characterId,
  clientAddress,
  chainType,
}: ProvisionWalletParams) {
  const privy = getPrivyClient();
  let wallet: WalletApiWalletResponseType | null = null;

  try {
    wallet = await privy.walletApi.create({
      chainType: chainType === "evm" ? "ethereum" : "solana",
    });

    const [record] = await db
      .insert(agentServerWallets)
      .values({
        organization_id: organizationId,
        user_id: userId,
        character_id: characterId,
        privy_wallet_id: wallet.id,
        address: wallet.address,
        chain_type: chainType,
        client_address: clientAddress,
      })
      .returning();

    return record;
  } catch (error: unknown) {
    const code =
      error instanceof Error ? Reflect.get(error, "code") : undefined;
    const isUniqueViolation =
      code === "23505" ||
      (error instanceof Error && error.message.includes("unique constraint"));
    if (isUniqueViolation) {
      if (wallet?.id) {
        const walletId = wallet.id;
        const walletApiWithDelete = privy.walletApi as unknown as {
          delete?: (walletId: string) => Promise<void>;
        };

        if (walletApiWithDelete.delete) {
          await walletApiWithDelete.delete(walletId).catch(() => {
            console.error(
              `Failed to clean up orphaned Privy wallet ${walletId}`,
            );
          });
        } else {
          console.warn(
            `Privy SDK does not expose wallet deletion; orphaned wallet ${walletId} may require manual cleanup`,
          );
        }
      }
      throw new WalletAlreadyExistsError();
    }
    throw error;
  }
}

/** Returns the organization_id that owns the server wallet for this client address, or null if none. */
export async function getOrganizationIdForClientAddress(
  clientAddress: string,
): Promise<string | null> {
  const row = await db
    .select({ organization_id: agentServerWallets.organization_id })
    .from(agentServerWallets)
    .where(eq(agentServerWallets.client_address, clientAddress))
    .limit(1);
  return row[0]?.organization_id ?? null;
}

export interface RpcPayload {
  method: string;
  params: unknown[];
  timestamp: number;
  nonce: string;
}

export interface ExecuteParams {
  clientAddress: string;
  payload: RpcPayload;
  signature: `0x${string}`;
}

export async function executeServerWalletRpc({
  clientAddress,
  payload,
  signature,
}: ExecuteParams) {
  const now = Date.now();
  if (!payload.timestamp || now - payload.timestamp > 5 * 60 * 1000) {
    throw new RpcRequestExpiredError();
  }

  const isValid = await verifyMessage({
    address: clientAddress as `0x${string}`,
    message: JSON.stringify(payload),
    signature,
  });

  if (!isValid) {
    throw new InvalidRpcSignatureError();
  }

  const nonceKey = `rpc-nonce:${clientAddress}:${payload.nonce}`;
  const nonceSet = await cache.setIfNotExists(
    nonceKey,
    "1",
    24 * 60 * 60 * 1000,
  );
  if (!nonceSet) {
    throw new RpcReplayError();
  }

  const walletRecord = await db.query.agentServerWallets.findFirst({
    where: eq(agentServerWallets.client_address, clientAddress),
  });

  if (!walletRecord) {
    throw new ServerWalletNotFoundError();
  }

  const privy = getPrivyClient();

  return await privy.walletApi.rpc({
    walletId: walletRecord.privy_wallet_id,
    method: payload.method as any,
    params: payload.params as any,
  });
}
