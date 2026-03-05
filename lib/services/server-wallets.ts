import { db } from "@/db/client";
import { agentServerWallets } from "@/db/schemas/agent-server-wallets";
import { eq } from "drizzle-orm";
import { getPrivyClient } from "@/lib/auth/privy-client";
import { verifyMessage } from "viem";
import { cache } from "@/lib/cache/client";

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
    let wallet;

    try {
        // Create a server wallet in Privy Wallet API
        wallet = await privy.walletApi.create({
            chainType: chainType === "evm" ? "ethereum" : "solana",
        });

        // Try to insert into our DB
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
    } catch (error: any) {
        // If this was a unique constraint violation, another request beat us to it
        if (error.code === '23505' || error.message?.includes('unique constraint')) {
            // Clean up the orphaned Privy wallet since we couldn't record it
            if (wallet?.id) {
                await privy.walletApi.delete(wallet.id).catch(() => {
                    // Best effort cleanup - log but continue if this fails
                    console.error(`Failed to clean up orphaned Privy wallet ${wallet.id}`);
                });
            }
            throw new Error('Wallet already exists for this client address');
        }
        throw error; // Re-throw any other errors
    }
}

/** Returns the organization_id that owns the server wallet for this client address, or null if none. */
export async function getOrganizationIdForClientAddress(clientAddress: string): Promise<string | null> {
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
    timestamp: number; // Timestamp when request was initiated
    nonce: string; // Unique nonce for replay protection
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
    // Validate timestamp freshness (5 minute window)
    const now = Date.now();
    if (!payload.timestamp || now - payload.timestamp > 5 * 60 * 1000) {
        throw new Error("RPC request expired: Timestamp must be within the last 5 minutes");
    }

    // 1. Verify the signature from the local agent  
    const isValid = await verifyMessage({
        address: clientAddress as `0x${string}`,
        message: JSON.stringify(payload),
        signature,
    });

    if (!isValid) {
        throw new Error("Invalid RPC signature: The client address does not match the signature for this payload.");
    }

    // Atomically check and consume the nonce
    const nonceKey = `rpc-nonce:${clientAddress}:${payload.nonce}`;
    const nonceSet = await cache.setNX(nonceKey, '1', 24 * 60 * 60); // 24hr TTL
    if (!nonceSet) {
        throw new Error("RPC nonce already used: Request appears to be a replay attack");
    }

    // 2. Look up the server wallet mapped to this client
    const walletRecord = await db.query.agentServerWallets.findFirst({
        where: eq(agentServerWallets.client_address, clientAddress),
    });

    if (!walletRecord) {
        throw new Error("Server wallet not found: No provisioned Privy Server Wallet matches this client address.");
    }

    // 3. Call Privy Wallet API with the proxy RPC
    const privy = getPrivyClient();

    const result = await privy.walletApi.rpc({
        walletId: walletRecord.privy_wallet_id,
        method: payload.method as any,
        params: payload.params as any,
    });

    return result;
}
