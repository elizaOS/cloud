import { describe, expect, it, vi, beforeEach } from "bun:test";
import { provisionServerWallet, executeServerWalletRpc } from "@/lib/services/server-wallets";

vi.mock("@/lib/auth/privy-client", () => ({
    getPrivyClient: vi.fn(),
}));

const mockSelectChain = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
        }),
    }),
});

vi.mock("@/db/client", () => ({
    db: {
        select: mockSelectChain,
        insert: vi.fn(),
        query: {
            agentServerWallets: {
                findFirst: vi.fn(),
            },
        },
    },
}));

vi.mock("viem", () => ({
    verifyMessage: vi.fn(),
}));

vi.mock("@/lib/cache/client", () => ({
    cache: {
        setIfNotExists: vi.fn().mockResolvedValue(true),
    },
}));

import { getPrivyClient } from "@/lib/auth/privy-client";
import { db } from "@/db/client";
import { verifyMessage } from "viem";

describe("server-wallets service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("provisionServerWallet", () => {
        it("should call privy to create wallet and insert to db", async () => {
            const mockCreate = vi.fn().mockResolvedValue({ id: "pw_123", address: "0xabc" });
            const mockInsertValues = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 1, address: "0xabc" }]) });

            (getPrivyClient as any).mockReturnValue({
                walletApi: { create: mockCreate }
            });

            (db.insert as any).mockReturnValue({ values: mockInsertValues });

            const result = await provisionServerWallet({
                organizationId: "org1",
                userId: "user1",
                characterId: "char1",
                clientAddress: "0xClient",
                chainType: "evm",
            });

            expect(mockCreate).toHaveBeenCalledWith({ chainType: "ethereum" });
            expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({
                organization_id: "org1",
                privy_wallet_id: "pw_123",
                address: "0xabc",
                chain_type: "evm",
                client_address: "0xClient",
            }));
            expect(result).toEqual({ id: 1, address: "0xabc" });
        });
    });

    describe("executeServerWalletRpc", () => {
        it("should verify signature, lookup wallet, and proxy rpc", async () => {
            (verifyMessage as any).mockResolvedValue(true);
            (db.query.agentServerWallets.findFirst as any).mockResolvedValue({
                privy_wallet_id: "pw_123"
            });

            const mockRpc = vi.fn().mockResolvedValue({ method: "eth_sendTransaction", data: "0xres" });
            (getPrivyClient as any).mockReturnValue({
                walletApi: { rpc: mockRpc }
            });

            const payload = {
                method: "eth_sendTransaction",
                params: [{ to: "0xBeef" }],
                timestamp: Date.now(),
                nonce: "test-nonce-1",
            };
            const result = await executeServerWalletRpc({
                clientAddress: "0xClient" as `0x${string}`,
                payload,
                signature: "0xSig" as `0x${string}`,
            });

            expect(verifyMessage).toHaveBeenCalledWith({
                address: "0xClient",
                message: JSON.stringify(payload),
                signature: "0xSig",
            });
            expect(db.query.agentServerWallets.findFirst).toHaveBeenCalled();

            expect(mockRpc).toHaveBeenCalledWith(expect.objectContaining({
                walletId: "pw_123",
                method: "eth_sendTransaction",
            }));

            expect(result).toEqual({ method: "eth_sendTransaction", data: "0xres" });
        });

        it("should throw if signature invalid", async () => {
            (verifyMessage as any).mockResolvedValue(false);

            await expect(executeServerWalletRpc({
                clientAddress: "0xClient",
                payload: { method: "eth_sendTransaction", params: [], timestamp: Date.now(), nonce: "n1" },
                signature: "0xSig" as `0x${string}`,
            })).rejects.toThrow("Invalid RPC signature");
        });

        it("should throw if wallet not found", async () => {
            (verifyMessage as any).mockResolvedValue(true);
            (db.query.agentServerWallets.findFirst as any).mockResolvedValue(null);

            await expect(executeServerWalletRpc({
                clientAddress: "0xClient",
                payload: { method: "eth_sendTransaction", params: [], timestamp: Date.now(), nonce: "n2" },
                signature: "0xSig" as `0x${string}`,
            })).rejects.toThrow("Server wallet not found");
        });
    });
});
