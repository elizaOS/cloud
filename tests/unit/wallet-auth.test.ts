import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { verifyWalletSignature } from "@/lib/auth/wallet-auth";
import { findOrCreateUserByWalletAddress } from "@/lib/services/wallet-signup";
import * as viem from "viem";

const mockFindOrCreate = mock();
const mockCacheGet = mock();
const mockCacheSet = mock();

mock.module("@/lib/services/wallet-signup", () => ({
    findOrCreateUserByWalletAddress: mockFindOrCreate,
}));

const mockCacheSetIfNotExists = mock(() => true);
const mockCacheIsAvailable = mock(() => true);

mock.module("@/lib/cache/client", () => ({
    cache: {
        get: mockCacheGet,
        set: mockCacheSet,
        setIfNotExists: mockCacheSetIfNotExists,
        isAvailable: mockCacheIsAvailable,
    },
}));

mock.module("viem", () => ({
    verifyMessage: mock(),
    getAddress: (addr: string) => addr,
}));

describe("Wallet Authentication", () => {
    let mockRequest: any;
    const mockWallet = "0x1234567890abcdef1234567890abcdef12345678";

    beforeEach(() => {
        mockRequest = {
            method: "POST",
            nextUrl: { pathname: "/api/test" },
            headers: {
                get: mock((name: string) => {
                    if (name === "X-Wallet-Address") return mockWallet;
                    if (name === "X-Timestamp") return Date.now().toString();
                    if (name === "X-Wallet-Signature") return "0xmocksignature";
                    return null;
                }),
            },
        };

        mockCacheGet.mockResolvedValue(null);
        mockCacheSet.mockResolvedValue(undefined as never);
        mockCacheSetIfNotExists.mockResolvedValue(true);
        mockFindOrCreate.mockResolvedValue({
            user: {
                id: "user-1",
                wallet_address: mockWallet,
                is_active: true,
                organization: { is_active: true },
            },
        });

        (viem.verifyMessage as any).mockResolvedValue(true);
    });

    afterEach(() => {
        mock.restore();
    });

    it("should successfully verify a valid wallet signature", async () => {
        const user = await verifyWalletSignature(mockRequest);
        expect(user).toBeDefined();
        expect(user?.id).toBe("user-1");
        expect(viem.verifyMessage).toHaveBeenCalled();
    });

    it("should reject an expired timestamp", async () => {
        mockRequest.headers.get = mock((name: string) => {
            if (name === "X-Wallet-Address") return mockWallet;
            if (name === "X-Timestamp") return (Date.now() - 10 * 60 * 1000).toString();
            if (name === "X-Wallet-Signature") return "0xmocksignature";
            return null;
        });

        await expect(verifyWalletSignature(mockRequest)).rejects.toThrow("Signature timestamp expired");
    });

    it("should reject an invalid signature", async () => {
        (viem.verifyMessage as any).mockResolvedValue(false);

        await expect(verifyWalletSignature(mockRequest)).rejects.toThrow("Invalid wallet signature");
    });

    it("should return null if headers are missing", async () => {
        mockRequest.headers.get = mock(() => null);

        const result = await verifyWalletSignature(mockRequest);
        expect(result).toBeNull();
    });

    it("should throw when findOrCreateUserByWalletAddress throws", async () => {
        mockFindOrCreate.mockRejectedValueOnce(new Error("User associated with wallet address not found"));

        await expect(verifyWalletSignature(mockRequest)).rejects.toThrow("User associated with wallet address not found");
    });

    it("should throw if user or org is inactive", async () => {
        mockFindOrCreate.mockResolvedValueOnce({
            user: {
                id: "user-1",
                wallet_address: mockWallet,
                is_active: false,
                organization: { is_active: true },
            },
        });

        await expect(verifyWalletSignature(mockRequest)).rejects.toThrow("User account is inactive");

        mockFindOrCreate.mockResolvedValueOnce({
            user: {
                id: "user-1",
                wallet_address: mockWallet,
                is_active: true,
                organization: { is_active: false },
            },
        });

        await expect(verifyWalletSignature(mockRequest)).rejects.toThrow("Organization is inactive");
    });
});
