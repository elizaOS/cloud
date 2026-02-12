
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { cache } from "@/lib/cache/client";
import { usersService } from "@/lib/services/users";
import { apiKeysService } from "@/lib/services/api-keys";
import { organizationsService } from "@/lib/services/organizations";
import { creditsService } from "@/lib/services/credits";
import { abuseDetectionService } from "@/lib/services/abuse-detection";
import { db } from "@/lib/db";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";

// Mock dependencies
vi.mock("@/lib/cache/client");
vi.mock("@/lib/services/users");
vi.mock("@/lib/services/api-keys");
vi.mock("@/lib/services/organizations");
vi.mock("@/lib/services/credits");
vi.mock("@/lib/services/abuse-detection");
vi.mock("@/lib/db");

const MOCK_APP_URL = "https://example.com";

function createMockRequest(body: unknown): NextRequest {
  return new NextRequest("https://example.com/api/auth/siwe/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": "192.168.1.1",
      "user-agent": "test-agent",
    },
    body: JSON.stringify(body),
  });
}

async function signMessage(account: ReturnType<typeof privateKeyToAccount>, nonce: string) {
  const message = createSiweMessage({
    address: account.address,
    chainId: 1,
    domain: new URL(MOCK_APP_URL).hostname,
    nonce,
    uri: MOCK_APP_URL,
    version: "1",
  });
  const signature = await account.signMessage({ message });
  return { message, signature };
}

describe("SIWE Verify Route", () => {
  const testAccount = privateKeyToAccount(generatePrivateKey());
  const mockNonce = "test-nonce-123";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = MOCK_APP_URL;

    // Default mock implementations
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(abuseDetectionService.checkSignupAbuse).mockResolvedValue({
      allowed: true,
      reason: null,
    });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  describe("Nonce validation", () => {
    it("should reject request when cache is unavailable", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);

      const { message, signature } = await signMessage(testAccount, mockNonce);
      const request = createMockRequest({ message, signature });
      const response = await POST(request);

      expect(response.status).toBe(503);
      const json = await response.json();
      expect(json.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("should reject invalid (expired/used) nonce", async () => {
      vi.mocked(cache.del).mockResolvedValue(0); // Nonce not found

      const { message, signature } = await signMessage(testAccount, mockNonce);
      const request = createMockRequest({ message, signature });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe("INVALID_NONCE");
      expect(vi.mocked(cache.del)).toHaveBeenCalledWith(
        expect.stringContaining(mockNonce),
      );
    });

    it("should consume nonce exactly once (single-use)", async () => {
      vi.mocked(cache.del).mockResolvedValue(1); // First call succeeds
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        wallet_address: testAccount.address.toLowerCase(),
        organization_id: "org-1",
        is_active: true,
        wallet_verified: true,
        organization: {
          id: "org-1",
          name: "Test Org",
          is_active: true,
          credit_balance: "10.00",
        },
      } as any);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { id: "key-1", user_id: "user-1", is_active: true, key: "test-key" } as any,
      ]);

      const { message, signature } = await signMessage(testAccount, mockNonce);
      const request = createMockRequest({ message, signature });
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(vi.mocked(cache.del)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(cache.del)).toHaveBeenCalledWith(
        expect.stringContaining(mockNonce),
      );
    });
  });

  describe("Domain validation", () => {
    it("should reject message with wrong domain", async () => {
      vi.mocked(cache.del).mockResolvedValue(1);

      const wrongMessage = createSiweMessage({
        address: testAccount.address,
        chainId: 1,
        domain: "attacker.com",
        nonce: mockNonce,
        uri: MOCK_APP_URL,
        version: "1",
      });
      const signature = await testAccount.signMessage({ message: wrongMessage });

      const request = createMockRequest({ message: wrongMessage, signature });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe("INVALID_DOMAIN");
    });
  });

  describe("Signature verification", () => {
    it("should reject invalid signature", async () => {
      vi.mocked(cache.del).mockResolvedValue(1);

      const { message } = await signMessage(testAccount, mockNonce);
      const request = createMockRequest({
        message,
        signature: "0xinvalidsignature1234567890",
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe("INVALID_SIGNATURE");
    });

    it("should reject signature from different wallet", async () => {
      vi.mocked(cache.del).mockResolvedValue(1);

      const differentAccount = privateKeyToAccount(generatePrivateKey());
      const message = createSiweMessage({
        address: testAccount.address, // Claims to be testAccount
        chainId: 1,
        domain: new URL(MOCK_APP_URL).hostname,
        nonce: mockNonce,
        uri: MOCK_APP_URL,
        version: "1",
      });
      // But signed by differentAccount
      const signature = await differentAccount.signMessage({ message });

      const request = createMockRequest({ message, signature });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe("INVALID_SIGNATURE");
    });
  });

  describe("Existing user path", () => {
    it("should authenticate existing active user", async () => {
      vi.mocked(cache.del).mockResolvedValue(1);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        wallet_address: testAccount.address.toLowerCase(),
        organization_id: "org-1",
        is_active: true,
        wallet_verified: true,
        organization: {
          id: "org-1",
          name: "Test Org",
          is_active: true,
          credit_balance: "10.00",
        },
      } as any);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { id: "key-1", user_id: "user-1", is_active: true, key: "existing-key" } as any,
      ]);

      const { message, signature } = await signMessage(testAccount, mockNonce);
      const request = createMockRequest({ message, signature });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.apiKey).toBe("existing-key");
      expect(json.isNewAccount).toBe(false);
      expect(json.address).toBe(testAccount.address);
    });

    it("should reject inactive user", async () => {
      vi.mocked(cache.del).mockResolvedValue(1);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        wallet_address: testAccount.address.toLowerCase(),
        organization_id: "org-1",
        is_active: false, // Inactive
        organization: {
          id: "org-1",
          name: "Test Org",
          is_active: true,
        },
      } as any);

      const { message, signature } = await signMessage(testAccount, mockNonce);
      const request = createMockRequest({ message, signature });
      const response = await POST(request);

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toBe("ACCOUNT_INACTIVE");
    });

    it("should mark wallet as verified for Privy users", async () => {
      vi.mocked(cache.del).mockResolvedValue(1);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        wallet_address: testAccount.address.toLowerCase(),
        organization_id: "org-1",
        is_active: true,
        wallet_verified: false, // Not yet verified
        privy_user_id: "privy-123",
        organization: {
          id: "org-1",
          name: "Test Org",
          is_active: true,
          credit_balance: "10.00",
        },
      } as any);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([]);
      vi.mocked(apiKeysService.create).mockResolvedValue({
        plainKey: "new-key",
      } as any);

      const { message, signature } = await signMessage(testAccount, mockNonce);
      const request = createMockRequest({ message, signature });
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(vi.mocked(usersService.update)).toHaveBeenCalledWith("user-1", {
        wallet_verified: true,
      });
    });
  });

  describe("New user signup path", () => {
    beforeEach(() => {
      vi.mocked(cache.del).mockResolvedValue(1);
      vi.mocked(usersService.getByWalletAddressWithOrganization)
        .mockResolvedValueOnce(undefined) // First call: no existing user
        .mockResolvedValueOnce({
          id: "new-user",
          wallet_address: testAccount.address.toLowerCase(),
          organization_id: "new-org",
          is_active: true,
          wallet_verified: true,
          organization: {
            id: "new-org",
            name: "Test Org",
            is_active: true,
            credit_balance: "100.00",
          },
        } as any); // Second call: newly created user
      vi.mocked(organizationsService.getBySlug).mockResolvedValue(undefined);
      vi.mocked(apiKeysService.create).mockResolvedValue({
        plainKey: "new-api-key",
      } as any);

      // Mock transaction to execute callback immediately
      vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
        const mockOrg = {
          id: "new-org",
          name: "Test Org",
          slug: "test-slug",
          credit_balance: "100.00",
        };
        vi.mocked(organizationsService.create).mockResolvedValue(mockOrg as any);
        vi.mocked(abuseDetectionService.recordSignupMetadata).mockResolvedValue(
          undefined,
        );
        vi.mocked(creditsService.addCredits).mockResolvedValue(undefined);
        vi.mocked(usersService.create).mockResolvedValue({
          id: "new-user",
          wallet_address: testAccount.address.toLowerCase(),
          organization_id: "new-org",
        } as any);
        return callback({});
      });
    });

    it("should create new user with organization and credits", async () => {
      const { message, signature } = await signMessage(testAccount, mockNonce);
      const request = createMockRequest({ message, signature });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.isNewAccount).toBe(true);
      expect(json.apiKey).toBe("new-api-key");
      expect(vi.mocked(organizationsService.create)).toHaveBeenCalled();
      expect(vi.mocked(usersService.create)).toHaveBeenCalled();
      expect(vi.mocked(creditsService.addCredits)).toHaveBeenCalled();
    });

    it("should reject signup when abuse detection fails", async () => {
      vi.mocked(abuseDetectionService.checkSignupAbuse).mockResolvedValue({
        allowed: false,
        reason: "Too many signups from this IP",
      });

      const { message, signature } = await signMessage(testAccount, mockNonce);
      const request = createMockRequest({ message, signature });
      const response = await POST(request);

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error).toBe("SIGNUP_BLOCKED");
      expect(vi.mocked(organizationsService.create)).not.toHaveBeenCalled();
    });

    it("should rollback transaction on failure", async () => {
      vi.mocked(db.transaction).mockRejectedValue(new Error("Database error"));

      const { message, signature } = await signMessage(testAccount, mockNonce);
      const request = createMockRequest({ message, signature });

      await expect(POST(request)).rejects.toThrow("Database error");
    });

    it("should handle duplicate wallet race condition", async () => {
      // Simulate 23505 duplicate key error
      const duplicateError = new Error("Duplicate key");
      (duplicateError as any).code = "23505";

      vi.mocked(db.transaction).mockRejectedValue(duplicateError);
      vi.mocked(organizationsService.delete).mockResolvedValue(undefined);
      vi.mocked(usersService.getByWalletAddressWithOrganization)
        .mockResolvedValueOnce(undefined) // Initial check
        .mockResolvedValueOnce({
          // After race condition
          id: "race-user",
          wallet_address: testAccount.address.toLowerCase(),
          organization_id: "race-org",
          is_active: true,
          wallet_verified: false,
          organization: {
            id: "race-org",
            name: "Test Org",
            is_active: true,
            credit_balance: "10.00",
          },
        } as any);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { id: "key-1", user_id: "race-user", is_active: true, key: "race-key" } as any,
      ]);

      const { message, signature } = await signMessage(testAccount, mockNonce);
      const request = createMockRequest({ message, signature });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.apiKey).toBe("race-key");
      expect(json.isNewAccount).toBe(false);
      expect(vi.mocked(usersService.update)).toHaveBeenCalledWith("race-user", {
        wallet_verified: true,
      });
    });
  });

  describe("Input validation", () => {
    it("should reject missing message field", async () => {
      const request = createMockRequest({ signature: "0x123" });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe("INVALID_BODY");
    });

    it("should reject missing signature field", async () => {
      const request = createMockRequest({ message: "test" });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe("INVALID_BODY");
    });

    it("should reject malformed JSON", async () => {
      const request = new NextRequest("https://example.com/api/auth/siwe/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error).toBe("INVALID_BODY");
    });
  });
});
