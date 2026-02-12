
/**
 * SIWE Verify Endpoint Tests
 *
 * Covers nonce issuance (TTL/single-use), verify success paths (existing vs new user),
 * and key failure modes (invalid nonce/domain/signature).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies before imports
vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: vi.fn(() => true),
    del: vi.fn(() => Promise.resolve(1)),
    set: vi.fn(() => Promise.resolve()),
    get: vi.fn(() => Promise.resolve("1")),
  },
}));

vi.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: vi.fn(() => Promise.resolve([])),
    create: vi.fn(() => Promise.resolve({ plainKey: "test-api-key" })),
  },
}));

vi.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    getBySlug: vi.fn(() => Promise.resolve(null)),
    create: vi.fn(() => Promise.resolve({ id: "org-123", slug: "test-org" })),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/services/credits", () => ({
  creditsService: {
    addCredits: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: {
    checkSignupAbuse: vi.fn(() => Promise.resolve({ allowed: true })),
    recordSignupMetadata: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: vi.fn((fn) => fn({})),
  },
}));

vi.mock("viem", () => ({
  recoverMessageAddress: vi.fn(),
  getAddress: vi.fn((addr: string) => addr),
}));

vi.mock("viem/siwe", () => ({
  parseSiweMessage: vi.fn(),
}));

import { cache } from "@/lib/cache/client";
import { usersService } from "@/lib/services/users";
import { parseSiweMessage } from "viem/siwe";
import { recoverMessageAddress } from "viem";

const TEST_ADDRESS = "0x1234567890123456789012345678901234567890";
const TEST_NONCE = "test-nonce-123";
const TEST_DOMAIN = "localhost";

function createMockRequest(body: object): NextRequest {
  return new NextRequest("http://localhost/api/auth/siwe/verify", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("Nonce validation (TTL/single-use)", () => {
    it("should reject when cache is unavailable", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: TEST_ADDRESS,
        nonce: TEST_NONCE,
        domain: TEST_DOMAIN,
      });

      const { POST } = await import("@/app/api/auth/siwe/verify/route");
      const req = createMockRequest({
        message: "test message",
        signature: "0x123",
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("should reject expired/used nonce (single-use enforcement)", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.del).mockResolvedValue(0); // Nonce not found/already used
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: TEST_ADDRESS,
        nonce: TEST_NONCE,
        domain: TEST_DOMAIN,
      });

      const { POST } = await import("@/app/api/auth/siwe/verify/route");
      const req = createMockRequest({
        message: "test message",
        signature: "0x123",
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_NONCE");
      expect(data.message).toContain("expired or was already used");
    });

    it("should consume nonce atomically on valid request", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.del).mockResolvedValue(1);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: TEST_ADDRESS,
        nonce: TEST_NONCE,
        domain: TEST_DOMAIN,
      });
      vi.mocked(recoverMessageAddress).mockResolvedValue(TEST_ADDRESS);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-123",
        organization_id: "org-123",
        is_active: true,
        organization: { is_active: true },
        wallet_verified: true,
      } as any);

      const { POST } = await import("@/app/api/auth/siwe/verify/route");
      const req = createMockRequest({
        message: "test message",
        signature: "0x123",
      });

      await POST(req);

      expect(cache.del).toHaveBeenCalledWith(expect.stringContaining(TEST_NONCE));
    });
  });

  describe("Verify success paths", () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.del).mockResolvedValue(1);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: TEST_ADDRESS,
        nonce: TEST_NONCE,
        domain: TEST_DOMAIN,
      });
      vi.mocked(recoverMessageAddress).mockResolvedValue(TEST_ADDRESS);
    });

    it("should return existing user with isNewAccount=false", async () => {
      const existingUser = {
        id: "user-123",
        name: "Test User",
        organization_id: "org-123",
        is_active: true,
        wallet_verified: true,
        organization: { is_active: true, name: "Test Org", credit_balance: "100.00" },
      };
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(existingUser as any);

      const { POST } = await import("@/app/api/auth/siwe/verify/route");
      const req = createMockRequest({
        message: "test message",
        signature: "0x123",
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isNewAccount).toBe(false);
      expect(data.user.id).toBe("user-123");
    });

    it("should create new user with isNewAccount=true", async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization)
        .mockResolvedValueOnce(undefined) // First call: no existing user
        .mockResolvedValueOnce({
          id: "new-user-123",
          organization_id: "org-123",
          is_active: true,
          organization: { is_active: true },
        } as any); // Second call: after creation

      const { POST } = await import("@/app/api/auth/siwe/verify/route");
      const req = createMockRequest({
        message: "test message",
        signature: "0x123",
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isNewAccount).toBe(true);
    });

    it("should mark wallet as verified for existing unverified user", async () => {
      const unverifiedUser = {
        id: "user-123",
        organization_id: "org-123",
        is_active: true,
        wallet_verified: false,
        organization: { is_active: true },
      };
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(unverifiedUser as any);

      const { POST } = await import("@/app/api/auth/siwe/verify/route");
      const req = createMockRequest({
        message: "test message",
        signature: "0x123",
      });

      await POST(req);

      expect(usersService.update).toHaveBeenCalledWith("user-123", { wallet_verified: true });
    });
  });

  describe("Failure modes", () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.del).mockResolvedValue(1);
    });

    it("should reject invalid domain", async () => {
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: TEST_ADDRESS,
        nonce: TEST_NONCE,
        domain: "malicious-site.com",
      });

      const { POST } = await import("@/app/api/auth/siwe/verify/route");
      const req = createMockRequest({
        message: "test message",
        signature: "0x123",
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_DOMAIN");
    });

    it("should reject invalid signature (recovery fails)", async () => {
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: TEST_ADDRESS,
        nonce: TEST_NONCE,
        domain: TEST_DOMAIN,
      });
      vi.mocked(recoverMessageAddress).mockRejectedValue(new Error("Invalid signature"));

      const { POST } = await import("@/app/api/auth/siwe/verify/route");
      const req = createMockRequest({
        message: "test message",
        signature: "0xbadsig",
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_SIGNATURE");
    });

    it("should reject signature from wrong address", async () => {
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: TEST_ADDRESS,
        nonce: TEST_NONCE,
        domain: TEST_DOMAIN,
      });
      vi.mocked(recoverMessageAddress).mockResolvedValue("0xDifferentAddress");

      const { POST } = await import("@/app/api/auth/siwe/verify/route");
      const req = createMockRequest({
        message: "test message",
        signature: "0x123",
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_SIGNATURE");
    });

    it("should reject missing message/signature fields", async () => {
      const { POST } = await import("@/app/api/auth/siwe/verify/route");
      const req = createMockRequest({ message: "test" }); // Missing signature

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_BODY");
    });

    it("should reject inactive account", async () => {
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: TEST_ADDRESS,
        nonce: TEST_NONCE,
        domain: TEST_DOMAIN,
      });
      vi.mocked(recoverMessageAddress).mockResolvedValue(TEST_ADDRESS);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-123",
        organization_id: "org-123",
        is_active: false,
        organization: { is_active: true },
      } as any);

      const { POST } = await import("@/app/api/auth/siwe/verify/route");
      const req = createMockRequest({
        message: "test message",
        signature: "0x123",
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("ACCOUNT_INACTIVE");
    });

    it("should reject expired SIWE message", async () => {
      const pastDate = new Date(Date.now() - 3600000); // 1 hour ago
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: TEST_ADDRESS,
        nonce: TEST_NONCE,
        domain: TEST_DOMAIN,
        expirationTime: pastDate,
      });

      const { POST } = await import("@/app/api/auth/siwe/verify/route");
      const req = createMockRequest({
        message: "test message",
        signature: "0x123",
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("MESSAGE_EXPIRED");
    });
  });
});
