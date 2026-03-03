import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { verifyWalletSignature } from "@/lib/auth/wallet-auth";
import { usersService } from "@/lib/services/users";
import * as viem from "viem";

// Mock dependencies
mock.module("@/lib/services/users", () => ({
    usersService: {
        getByWalletAddressWithOrganization: mock(),
    },
}));

mock.module("viem", () => ({
    verifyMessage: mock(),
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

        (usersService.getByWalletAddressWithOrganization as any).mockResolvedValue({
            id: "user-1",
            wallet_address: mockWallet,
            is_active: true,
            organization: { is_active: true }
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
            if (name === "X-Timestamp") return (Date.now() - 10 * 60 * 1000).toString(); // 10 mins ago
            if (name === "X-Wallet-Signature") return "0xmocksignature";
            return null;
        });

        await expect(verifyWalletSignature(mockRequest)).rejects.toThrow("Signature timestamp expired");
    });

    it("should reject an invalid signature", async () => {
        (viem.verifyMessage as any).mockResolvedValue(false);

        await expect(verifyWalletSignature(mockRequest)).rejects.toThrow("Signature verification failed");
    });

    it("should return null if headers are missing", async () => {
        mockRequest.headers.get = mock(() => null);

        const result = await verifyWalletSignature(mockRequest);
        expect(result).toBeNull();
    });

    it("should throw if user is not found", async () => {
        (usersService.getByWalletAddressWithOrganization as any).mockResolvedValue(null);

        await expect(verifyWalletSignature(mockRequest)).rejects.toThrow("User associated with wallet address not found");
    });

    it("should throw if user or org is inactive", async () => {
        (usersService.getByWalletAddressWithOrganization as any).mockResolvedValue({
            id: "user-1",
            wallet_address: mockWallet,
            is_active: false,
            organization: { is_active: true }
        });

        await expect(verifyWalletSignature(mockRequest)).rejects.toThrow("User account is inactive");

        (usersService.getByWalletAddressWithOrganization as any).mockResolvedValue({
            id: "user-1",
            wallet_address: mockWallet,
            is_active: true,
            organization: { is_active: false }
        });

        await expect(verifyWalletSignature(mockRequest)).rejects.toThrow("Organization is inactive");
    });
});
