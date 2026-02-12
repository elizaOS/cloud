
/**
 * Tests for SIWE Verify Endpoint
 *
 * Coverage:
 * - Nonce validation (TTL/single-use)
 * - Verify success paths (existing vs new user)
 * - Key failure modes (invalid nonce/domain/signature)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { parseSiweMessage } from "viem/siwe";
import { recoverMessageAddress, getAddress } from "viem";

// Mock dependencies
vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: vi.fn(),
    del: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    create: vi.fn(),
    getBySlug: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/services/credits", () => ({
  creditsService: {
    addCredits: vi.fn(),
  },
}));

vi.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: {
    checkSignupAbuse: vi.fn(),
    recordSignupMetadata: vi.fn(),
  },
}));

vi.mock("viem/siwe", () => ({
  parseSiweMessage: vi.fn(),
}));

vi.mock("viem", () => ({
  recoverMessageAddress: vi.fn(),
  getAddress: vi.fn((addr: string) => addr),
}));

import { cache } from "@/lib/cache/client";
import { usersService } from "@/lib/services/users";
import { apiKeysService } from "@/lib/services/api-keys";
import { organizationsService } from "@/lib/services/organizations";
import { creditsService } from "@/lib/services/credits";
import { abuseDetectionService } from "@/lib/services/abuse-detection";

// Import after mocks
const { POST } = await import("../route");

function createMockRequest(body: object): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("SIWE Verify Endpoint", () => {
  const validAddress = "0x1234567890123456789012345678901234567890";
  const validNonce = "test-nonce-123";
  const validMessage = `localhost wants you to sign in with your Ethereum account:\n${validAddress}\n\nSign in to the app\n\nURI: http://localhost:3000\nVersion: 1\nChain ID: 1\nNonce: ${validNonce}\nIssued At: 2024-01-01T00:00:00.000Z`;
  const validSignature = "0xvalidsignature";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  describe("Input Validation", () => {
    it("should reject missing message field", async () => {
      const request = createMockRequest({ signature: validSignature });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_BODY");
    });

    it("should reject missing signature field", async () => {
      const request = createMockRequest({ message: validMessage });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_BODY");
    });

    it("should reject empty message", async () => {
      const request = createMockRequest({ message: "", signature: validSignature });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_BODY");
    });
  });

  describe("Nonce Validation (TTL/Single-Use)", () => {
    beforeEach(() => {
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: validAddress,
        nonce: validNonce,
        domain: "localhost",
      });
    });

    it("should return 503 when cache is unavailable", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);

      const request = createMockRequest({ message: validMessage, signature: validSignature });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("should reject expired/used nonce (single-use enforcement)", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.del).mockResolvedValue(0); // Nonce not found (expired or already used)

      const request = createMockRequest({ message: validMessage, signature: validSignature });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_NONCE");
      expect(data.message).toContain("expired or was already used");
    });

    it("should consume nonce atomically", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.del).mockResolvedValue(1);
      vi.mocked(recoverMessageAddress).mockResolvedValue(validAddress);
      vi.mocked(getAddress).mockImplementation((addr) => addr as `0x${string}`);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        organization_id: "org-1",
        is_active: true,
        wallet_verified: true,
        organization: { is_active: true },
      } as any);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "existing-key" },
      ] as any);

      const request = createMockRequest({ message: validMessage, signature: validSignature });
      await POST(request);

      // Verify nonce was consumed via atomic delete
      expect(cache.del).toHaveBeenCalledWith(expect.stringContaining(validNonce));
    });
  });

  describe("Domain Validation", () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.del).mockResolvedValue(1);
    });

    it("should reject mismatched domain", async () => {
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: validAddress,
        nonce: validNonce,
        domain: "evil-site.com", // Wrong domain
      });

      const request = createMockRequest({ message: validMessage, signature: validSignature });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_DOMAIN");
    });

    it("should accept matching domain", async () => {
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: validAddress,
        nonce: validNonce,
        domain: "localhost",
      });
      vi.mocked(recoverMessageAddress).mockResolvedValue(validAddress);
      vi.mocked(getAddress).mockImplementation((addr) => addr as `0x${string}`);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        organization_id: "org-1",
        is_active: true,
        wallet_verified: true,
        organization: { is_active: true },
      } as any);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "existing-key" },
      ] as any);

      const request = createMockRequest({ message: validMessage, signature: validSignature });
      const response = await POST(request);

      expect(response.status).toBe(200);
    });
  });

  describe("Signature Validation", () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.del).mockResolvedValue(1);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: validAddress,
        nonce: validNonce,
        domain: "localhost",
      });
    });

    it("should reject invalid signature", async () => {
      vi.mocked(recoverMessageAddress).mockRejectedValue(new Error("Invalid signature"));

      const request = createMockRequest({ message: validMessage, signature: "0xinvalid" });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_SIGNATURE");
    });

    it("should reject signature from wrong address", async () => {
      const wrongAddress = "0x9999999999999999999999999999999999999999";
      vi.mocked(recoverMessageAddress).mockResolvedValue(wrongAddress);
      vi.mocked(getAddress).mockImplementation((addr) => addr as `0x${string}`);

      const request = createMockRequest({ message: validMessage, signature: validSignature });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_SIGNATURE");
    });
  });

  describe("Existing User Flow", () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.del).mockResolvedValue(1);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: validAddress,
        nonce: validNonce,
        domain: "localhost",
      });
      vi.mocked(recoverMessageAddress).mockResolvedValue(validAddress);
      vi.mocked(getAddress).mockImplementation((addr) => addr as `0x${string}`);
    });

    it("should return existing user with isNewAccount=false", async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        name: "Test User",
        organization_id: "org-1",
        is_active: true,
        wallet_verified: true,
        organization: { is_active: true, name: "Test Org", credit_balance: "100.00" },
      } as any);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "existing-api-key" },
      ] as any);

      const request = createMockRequest({ message: validMessage, signature: validSignature });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isNewAccount).toBe(false);
      expect(data.apiKey).toBe("existing-api-key");
    });

    it("should reject inactive user", async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        organization_id: "org-1",
        is_active: false,
        organization: { is_active: true },
      } as any);

      const request = createMockRequest({ message: validMessage, signature: validSignature });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("ACCOUNT_INACTIVE");
    });

    it("should reject inactive organization", async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        organization_id: "org-1",
        is_active: true,
        organization: { is_active: false },
      } as any);

      const request = createMockRequest({ message: validMessage, signature: validSignature });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("ACCOUNT_INACTIVE");
    });
  });

  describe("New User Flow", () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.del).mockResolvedValue(1);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: validAddress,
        nonce: validNonce,
        domain: "localhost",
      });
      vi.mocked(recoverMessageAddress).mockResolvedValue(validAddress);
      vi.mocked(getAddress).mockImplementation((addr) => addr as `0x${string}`);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValueOnce(undefined as any);
      vi.mocked(abuseDetectionService.checkSignupAbuse).mockResolvedValue({ allowed: true });
      vi.mocked(abuseDetectionService.recordSignupMetadata).mockResolvedValue(undefined);
      vi.mocked(organizationsService.getBySlug).mockResolvedValue(undefined as any);
      vi.mocked(organizationsService.create).mockResolvedValue({ id: "new-org-1" } as any);
      vi.mocked(creditsService.addCredits).mockResolvedValue(undefined as any);
      vi.mocked(usersService.create).mockResolvedValue({ id: "new-user-1" } as any);
      vi.mocked(apiKeysService.create).mockResolvedValue({ plainKey: "new-api-key" } as any);
    });

    it("should create new user with isNewAccount=true", async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization)
        .mockResolvedValueOnce(undefined as any)
        .mockResolvedValueOnce({
          id: "new-user-1",
          organization_id: "new-org-1",
          organization: { name: "Test Org" },
        } as any);

      const request = createMockRequest({ message: validMessage, signature: validSignature });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isNewAccount).toBe(true);
      expect(data.apiKey).toBe("new-api-key");
    });

    it("should block signup when abuse detected", async () => {
      vi.mocked(abuseDetectionService.checkSignupAbuse).mockResolvedValue({
        allowed: false,
        reason: "Too many signups from this IP",
      });

      const request = createMockRequest({ message: validMessage, signature: validSignature });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("SIGNUP_BLOCKED");
    });

    it("should propagate credit service errors", async () => {
      vi.mocked(creditsService.addCredits).mockRejectedValue(new Error("Credit service failed"));

      const request = createMockRequest({ message: validMessage, signature: validSignature });
      
      await expect(POST(request)).rejects.toThrow("Credit service failed");
      
      // Verify org was created but should be cleaned up on error
      expect(organizationsService.create).toHaveBeenCalled();
    });
  });

  describe("Message Expiration", () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.del).mockResolvedValue(1);
    });

    it("should reject expired message", async () => {
      const expiredDate = new Date(Date.now() - 3600000); // 1 hour ago
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: validAddress,
        nonce: validNonce,
        domain: "localhost",
        expirationTime: expiredDate,
      });

      const request = createMockRequest({ message: validMessage, signature: validSignature });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("MESSAGE_EXPIRED");
    });
  });
});
