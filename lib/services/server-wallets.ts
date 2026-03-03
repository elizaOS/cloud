import { db } from "@/db/client";
import { agentServerWallets } from "@/db/schemas/agent-server-wallets";
import { eq } from "drizzle-orm";
import { getPrivyClient } from "@/lib/auth/privy-client";
import { verifyMessage } from "viem";

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

    // Create a server wallet in Privy Wallet API
    const wallet = await privy.walletApi.create({
        chainType: chainType === "evm" ? "ethereum" : "solana",
    });

    // Insert into our DB
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
}

export interface RpcPayload {
    method: string;
    params: any[];
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
    // 1. Verify the signature from the local agent
    const isValid = await verifyMessage({
        address: clientAddress as `0x${string}`,
        message: JSON.stringify(payload),
        signature,
    });

    if (!isValid) {
        throw new Error("Invalid RPC signature: The client address does not match the signature for this payload.");
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
