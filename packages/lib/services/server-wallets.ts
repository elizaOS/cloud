import type { WalletApiWalletResponseType } from "@privy-io/server-auth";
import { eq } from "drizzle-orm";
import { verifyMessage } from "viem";
import { db } from "@/db/client";
import {
  agentServerWallets,
  type AgentServerWallet,
} from "@/db/schemas/agent-server-wallets";
import { getPrivyClient } from "@/lib/auth/privy-client";
import { cache } from "@/lib/cache/client";
import { WALLET_PROVIDER_FLAGS } from "@/lib/config/wallet-provider-flags";
import { getStewardClient } from "@/lib/services/steward-client";
import { logger } from "@/lib/utils/logger";

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

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
      "Server wallet not found: No provisioned wallet matches this client address.",
    );
    this.name = "ServerWalletNotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProvisionWalletParams {
  organizationId: string;
  userId: string;
  characterId: string | null;
  clientAddress: string;
  chainType: "evm" | "solana";
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

// ---------------------------------------------------------------------------
// Provision — top-level router
// ---------------------------------------------------------------------------

export async function provisionServerWallet(params: ProvisionWalletParams) {
  if (WALLET_PROVIDER_FLAGS.USE_STEWARD_FOR_NEW_WALLETS) {
    return provisionStewardWallet(params);
  }
  return provisionPrivyWallet(params);
}

// ---------------------------------------------------------------------------
// Provision — Steward (new)
// ---------------------------------------------------------------------------

async function provisionStewardWallet({
  organizationId,
  userId,
  characterId,
  clientAddress,
  chainType,
}: ProvisionWalletParams) {
  const steward = getStewardClient();
  const agentName = `cloud-${characterId || clientAddress}`;
  const tenantId = process.env.STEWARD_TENANT_ID || `org-${organizationId}`;

  try {
    // Create agent + wallet in Steward (idempotent — 409 means already exists)
    const agent = await steward.createWallet(agentName, `Agent ${agentName}`, clientAddress);
    const walletAddress = agent.walletAddress;

    if (!walletAddress) {
      throw new Error(`Steward did not return a wallet address for agent ${agentName}`);
    }

    const [record] = await db
      .insert(agentServerWallets)
      .values({
        organization_id: organizationId,
        user_id: userId,
        character_id: characterId,
        wallet_provider: "steward",
        steward_agent_id: agentName,
        steward_tenant_id: tenantId,
        address: walletAddress,
        chain_type: chainType,
        client_address: clientAddress,
      })
      .returning();

    logger.info(
      `[server-wallets] Provisioned Steward wallet for ${agentName}: ${walletAddress}`,
    );
    return record;
  } catch (error: unknown) {
    const code = error instanceof Error ? Reflect.get(error, "code") : undefined;
    const isUniqueViolation =
      code === "23505" ||
      (error instanceof Error && error.message.includes("unique constraint"));
    if (isUniqueViolation) {
      throw new WalletAlreadyExistsError();
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Provision — Privy (legacy)
// ---------------------------------------------------------------------------

async function provisionPrivyWallet({
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
        wallet_provider: "privy",
        privy_wallet_id: wallet.id,
        address: wallet.address,
        chain_type: chainType,
        client_address: clientAddress,
      })
      .returning();

    return record;
  } catch (error: unknown) {
    const code = error instanceof Error ? Reflect.get(error, "code") : undefined;
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
            console.error(`Failed to clean up orphaned Privy wallet ${walletId}`);
          });
        } else {
          logger.warn(
            `Privy SDK does not expose wallet deletion; orphaned wallet ${walletId} may require manual cleanup`,
          );
        }
      }
      throw new WalletAlreadyExistsError();
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Organization lookup
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// RPC execution — top-level (validates signature, routes by provider)
// ---------------------------------------------------------------------------

export async function executeServerWalletRpc({
  clientAddress,
  payload,
  signature,
}: ExecuteParams) {
  // Timestamp check
  const now = Date.now();
  if (!payload.timestamp || now - payload.timestamp > 5 * 60 * 1000) {
    throw new RpcRequestExpiredError();
  }

  // Signature verification
  const isValid = await verifyMessage({
    address: clientAddress as `0x${string}`,
    message: JSON.stringify(payload),
    signature,
  });
  if (!isValid) {
    throw new InvalidRpcSignatureError();
  }

  // Nonce replay protection
  const nonceKey = `rpc-nonce:${clientAddress}:${payload.nonce}`;
  const nonceSet = await cache.setIfNotExists(nonceKey, "1", 24 * 60 * 60 * 1000);
  if (!nonceSet) {
    throw new RpcReplayError();
  }

  // Look up wallet record
  const walletRecord = await db.query.agentServerWallets.findFirst({
    where: eq(agentServerWallets.client_address, clientAddress),
  });
  if (!walletRecord) {
    throw new ServerWalletNotFoundError();
  }

  // Route by provider
  if (walletRecord.wallet_provider === "steward") {
    return executeStewardRpc(walletRecord, payload);
  }
  return executePrivyRpc(walletRecord, payload);
}

// ---------------------------------------------------------------------------
// RPC execution — Steward
// ---------------------------------------------------------------------------

async function executeStewardRpc(wallet: AgentServerWallet, payload: RpcPayload) {
  const steward = getStewardClient();
  const agentId = wallet.steward_agent_id;

  if (!agentId) {
    throw new Error(
      `Wallet ${wallet.id} is marked as steward but has no steward_agent_id`,
    );
  }

  switch (payload.method) {
    case "eth_sendTransaction": {
      const [tx] = payload.params as [
        { to: string; value?: string; data?: string; chainId?: number },
      ];
      return steward.signTransaction(agentId, {
        to: tx.to,
        value: tx.value || "0",
        data: tx.data,
        chainId: tx.chainId || 8453, // Default to Base mainnet
      });
    }

    case "personal_sign":
    case "eth_sign": {
      const [message] = payload.params as [string];
      return steward.signMessage(agentId, message);
    }

    case "eth_signTypedData_v4": {
      const [, typedData] = payload.params as [string, string];
      const parsed = JSON.parse(typedData);
      // EIP-712 uses "message" but SDK expects "value"
      return steward.signTypedData(agentId, {
        domain: parsed.domain,
        types: parsed.types,
        primaryType: parsed.primaryType,
        value: parsed.message ?? parsed.value,
      });
    }

    default:
      throw new Error(
        `RPC method "${payload.method}" is not supported via Steward. ` +
          `Supported: eth_sendTransaction, personal_sign, eth_sign, eth_signTypedData_v4`,
      );
  }
}

// ---------------------------------------------------------------------------
// RPC execution — Privy (legacy)
// ---------------------------------------------------------------------------

async function executePrivyRpc(wallet: AgentServerWallet, payload: RpcPayload) {
  if (!wallet.privy_wallet_id) {
    throw new Error(
      `Wallet ${wallet.id} is marked as privy but has no privy_wallet_id`,
    );
  }

  const privy = getPrivyClient();
  return privy.walletApi.rpc({
    walletId: wallet.privy_wallet_id,
    method: payload.method as any,
    params: payload.params as any,
  });
}
