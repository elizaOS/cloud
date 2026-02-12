
/**
 * SIWE Verify Endpoint Tests
 *
 * Covers nonce issuance, verification success paths (new vs existing user),
 * and key failure modes (invalid nonce/domain/signature).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST } from "./route";
import { cache } from "@/lib/cache/client";
import { CacheKeys } from "@/lib/cache/keys";
import { usersService } from "@/lib/services/users";
import { organizationsService } from "@/lib/services/organizations";
import { apiKeysService } from "@/lib/services/api-keys";
import { generateSiweNonce } from "viem/siwe";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Nonce validation", () => {
    it("should reject expired/missing nonces", async () => {
      const account = privateKeyToAccount(generatePrivateKey());
      const nonce = generateSiweNonce();
      const message = `localhost:3000 wants you to sign in with your Ethereum account:\n${account.address}\n\nSign in to ElizaCloud\n\nURI: http://localhost:3000\nVersion: 1\nChain ID: 1\nNonce: ${nonce}`;
      const signature = await account.signMessage({ message });

      // Nonce not in cache (expired or never existed)
      vi.spyOn(cache, "isAvailable").mockReturnValue(true);
      vi.spyOn(cache, "delete").mockResolvedValue(0); // atomicConsume returns false

      const request = new Request("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message, signature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_NONCE");
    });

    it("should reject when cache is unavailable", async () => {
      vi.spyOn(cache, "isAvailable").mockReturnValue(false);

      const request = new Request("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: "test", signature: "0xtest" }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("should consume nonce atomically on success", async () => {
      const account = privateKeyToAccount(generatePrivateKey());
      const nonce = generateSiweNonce();
      const message = `localhost wants you to sign in with your Ethereum account:\n${account.address}\n\nSign in to ElizaCloud\n\nURI: http://localhost:3000\nVersion: 1\nChain ID: 1\nNonce: ${nonce}`;
      const signature = await account.signMessage({ message });

      vi.spyOn(cache, "isAvailable").mockReturnValue(true);
      vi.spyOn(cache, "delete").mockResolvedValue(1); // atomicConsume returns true
      vi.spyOn(usersService, "getByWalletAddressWithOrganization").mockResolvedValue(null);

      const request = new Request("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message, signature }),
      });

      // Should not throw INVALID_NONCE (will fail later in signup flow without full mocks)
      const response = await POST(request);
      expect(cache.delete).toHaveBeenCalledWith(CacheKeys.siwe.nonce(nonce));
    });
  });

  describe("Signature verification", () => {
    it("should reject invalid signatures", async () => {
      const nonce = generateSiweNonce();
      const message = `localhost wants you to sign in with your Ethereum account:\n0x1234567890123456789012345678901234567890\n\nSign in to ElizaCloud\n\nURI: http://localhost:3000\nVersion: 1\nChain ID: 1\nNonce: ${nonce}`;

      vi.spyOn(cache, "isAvailable").mockReturnValue(true);
      vi.spyOn(cache, "delete").mockResolvedValue(1);

      const request = new Request("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message, signature: "0xinvalid" }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_SIGNATURE");
    });

    it("should reject signature from wrong wallet", async () => {
      const account1 = privateKeyToAccount(generatePrivateKey());
      const account2 = privateKeyToAccount(generatePrivateKey());
      const nonce = generateSiweNonce();
      const message = `localhost wants you to sign in with your Ethereum account:\n${account1.address}\n\nSign in to ElizaCloud\n\nURI: http://localhost:3000\nVersion: 1\nChain ID: 1\nNonce: ${nonce}`;
      const signature = await account2.signMessage({ message }); // Wrong signer

      vi.spyOn(cache, "isAvailable").mockReturnValue(true);
      vi.spyOn(cache, "delete").mockResolvedValue(1);

      const request = new Request("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message, signature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_SIGNATURE");
    });
  });

  describe("Domain validation", () => {
    it("should reject mismatched domain", async () => {
      const account = privateKeyToAccount(generatePrivateKey());
      const nonce = generateSiweNonce();
      const message = `evil.com wants you to sign in with your Ethereum account:\n${account.address}\n\nSign in to ElizaCloud\n\nURI: http://evil.com\nVersion: 1\nChain ID: 1\nNonce: ${nonce}`;
      const signature = await account.signMessage({ message });

      vi.spyOn(cache, "isAvailable").mockReturnValue(true);
      vi.spyOn(cache, "delete").mockResolvedValue(1);

      const request = new Request("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message, signature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_DOMAIN");
    });
  });

  describe("User flows", () => {
    it("should return existing user with isNewAccount=false", async () => {
      const account = privateKeyToAccount(generatePrivateKey());
      const nonce = generateSiweNonce();
      const message = `localhost wants you to sign in with your Ethereum account:\n${account.address}\n\nSign in to ElizaCloud\n\nURI: http://localhost:3000\nVersion: 1\nChain ID: 1\nNonce: ${nonce}`;
      const signature = await account.signMessage({ message });

      const mockUser = {
        id: "user-123",
        wallet_address: account.address.toLowerCase(),
        organization_id: "org-123",
        is_active: true,
        wallet_verified: true,
        organization: { is_active: true, credit_balance: "100.00" },
      };

      vi.spyOn(cache, "isAvailable").mockReturnValue(true);
      vi.spyOn(cache, "delete").mockResolvedValue(1);
      vi.spyOn(usersService, "getByWalletAddressWithOrganization").mockResolvedValue(mockUser as any);
      vi.spyOn(apiKeysService, "listByOrganization").mockResolvedValue([
        { user_id: mockUser.id, is_active: true, key: "test-key" } as any,
      ]);

      const request = new Request("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message, signature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isNewAccount).toBe(false);
      expect(data.apiKey).toBe("test-key");
    });

    it("should create new user with isNewAccount=true", async () => {
      const account = privateKeyToAccount(generatePrivateKey());
      const nonce = generateSiweNonce();
      const message = `localhost wants you to sign in with your Ethereum account:\n${account.address}\n\nSign in to ElizaCloud\n\nURI: http://localhost:3000\nVersion: 1\nChain ID: 1\nNonce: ${nonce}`;
      const signature = await account.signMessage({ message });

      vi.spyOn(cache, "isAvailable").mockReturnValue(true);
      vi.spyOn(cache, "delete").mockResolvedValue(1);
      vi.spyOn(usersService, "getByWalletAddressWithOrganization")
        .mockResolvedValueOnce(null) // Initial check
        .mockResolvedValueOnce({
          id: "user-456",
          organization_id: "org-456",
          organization: { credit_balance: "10.00" },
        } as any); // After creation

      // Mock DB transaction and services
      const mockTx = {} as any;
      vi.mock("@/lib/db", () => ({
        db: {
          transaction: vi.fn(async (fn) => fn(mockTx)),
        },
      }));
      vi.spyOn(organizationsService, "create").mockResolvedValue({ id: "org-456" } as any);
      vi.spyOn(organizationsService, "getBySlug").mockResolvedValue(null);

      const request = new Request("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message, signature }),
        headers: { "x-real-ip": "127.0.0.1" },
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.isNewAccount).toBe(true);
    });
  });
});
