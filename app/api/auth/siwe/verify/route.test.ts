
/**
 * Tests for SIWE Verify Endpoint
 *
 * Covers nonce validation, domain validation, signature verification,
 * existing user sign-in, and new user sign-up paths.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the route
vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: vi.fn().mockReturnValue(true),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    getRedisClient: vi.fn(),
  },
}));

vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: vi.fn(),
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
    listByOrganization: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ plainKey: "test-api-key-123" }),
  },
}));

vi.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    getBySlug: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({
      id: "org-1",
      name: "Test Org",
      slug: "test-org",
      credit_balance: "0.00",
      is_active: true,
    }),
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
    checkSignupAbuse: vi.fn().mockResolvedValue({ allowed: true }),
    recordSignupMetadata: vi.fn(),
  },
}));

vi.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: vi.fn().mockReturnValue("avatar-url"),
}));

vi.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: vi.fn().mockReturnValue("wallet-abc123-test"),
  getInitialCredits: vi.fn().mockReturnValue(5.0),
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: vi.fn().mockReturnValue("https://app.example.com"),
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: vi.fn((handler: Function) => handler),
  RateLimitPresets: { STRICT: {} },
}));

vi.mock("viem/siwe", () => ({
  parseSiweMessage: vi.fn(),
}));

vi.mock("viem", () => ({
  recoverMessageAddress: vi.fn(),
  getAddress: vi.fn((addr: string) => addr),
}));

import { cache } from "@/lib/cache/client";
import { atomicConsume } from "@/lib/cache/consume";
import { usersService } from "@/lib/services/users";
import { parseSiweMessage } from "viem/siwe";
import { recoverMessageAddress, getAddress } from "viem";

// Helper to create a NextRequest
function createRequest(body: Record<string, unknown>): Request {
  return new Request("https://app.example.com/api/auth/siwe/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(getAddress).mockImplementation((addr: string) => addr);
  });

  describe("Input validation", () => {
    it("returns 400 for missing message", async () => {
      const { POST } = await import("./route");
      const req = createRequest({ signature: "0xabc" });
      const res = await POST(req as any);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_BODY");
    });

    it("returns 400 for missing signature", async () => {
      const { POST } = await import("./route");
      const req = createRequest({ message: "test message" });
      const res = await POST(req as any);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_BODY");
    });

    it("returns 400 for empty message", async () => {
      const { POST } = await import("./route");
      const req = createRequest({ message: "  ", signature: "0xabc" });
      const res = await POST(req as any);
      expect(res.status).toBe(400);
    });
  });

  describe("Nonce validation", () => {
    it("returns 503 when cache is unavailable", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        nonce: "testnonce123",
        domain: "app.example.com",
        uri: "https://app.example.com",
        version: "1",
        chainId: 1,
      } as any);

      const { POST } = await import("./route");
      const req = createRequest({
        message: "valid siwe message",
        signature: "0xvalidsig",
      });
      const res = await POST(req as any);
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("returns 400 for invalid/expired nonce", async () => {
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        nonce: "expired-nonce",
        domain: "app.example.com",
        uri: "https://app.example.com",
        version: "1",
        chainId: 1,
      } as any);
      vi.mocked(atomicConsume).mockResolvedValue(0);

      const { POST } = await import("./route");
      const req = createRequest({
        message: "valid siwe message",
        signature: "0xvalidsig",
      });
      const res = await POST(req as any);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_NONCE");
    });

    it("returns 503 when Redis fails during nonce consumption", async () => {
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        nonce: "testnonce123",
        domain: "app.example.com",
        uri: "https://app.example.com",
        version: "1",
        chainId: 1,
      } as any);
      vi.mocked(atomicConsume).mockRejectedValue(new Error("Redis unavailable"));

      const { POST } = await import("./route");
      const req = createRequest({
        message: "valid siwe message",
        signature: "0xvalidsig",
      });
      const res = await POST(req as any);
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  describe("Domain validation", () => {
    it("returns 400 for domain mismatch", async () => {
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        nonce: "testnonce123",
        domain: "evil.example.com",
        uri: "https://evil.example.com",
        version: "1",
        chainId: 1,
      } as any);
      vi.mocked(atomicConsume).mockResolvedValue(1);

      const { POST } = await import("./route");
      const req = createRequest({
        message: "valid siwe message",
        signature: "0xvalidsig",
      });
      const res = await POST(req as any);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_DOMAIN");
    });
  });

  describe("Signature verification", () => {
    it("returns 400 for invalid signature", async () => {
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        nonce: "testnonce123",
        domain: "app.example.com",
        uri: "https://app.example.com",
        version: "1",
        chainId: 1,
      } as any);
      vi.mocked(atomicConsume).mockResolvedValue(1);
      vi.mocked(recoverMessageAddress).mockRejectedValue(
        new Error("Invalid signature"),
      );

      const { POST } = await import("./route");
      const req = createRequest({
        message: "valid siwe message",
        signature: "0xinvalidsig",
      });
      const res = await POST(req as any);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_SIGNATURE");
    });

    it("returns 400 when recovered address does not match claimed address", async () => {
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        nonce: "testnonce123",
        domain: "app.example.com",
        uri: "https://app.example.com",
        version: "1",
        chainId: 1,
      } as any);
      vi.mocked(atomicConsume).mockResolvedValue(1);
      vi.mocked(recoverMessageAddress).mockResolvedValue(
        "0xDEADBEEF00000000000000000000000000000000" as any,
      );
      vi.mocked(getAddress).mockImplementation((addr: string) => addr);

      const { POST } = await import("./route");
      const req = createRequest({
        message: "valid siwe message",
        signature: "0xvalidsig",
      });
      const res = await POST(req as any);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_SIGNATURE");
    });
  });

  describe("Existing user sign-in", () => {
    it("returns success with isNewAccount=false for existing user", async () => {
      const existingUser = {
        id: "user-1",
        name: "0x1234...5678",
        privy_user_id: null,
        wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
        wallet_verified: true,
        is_active: true,
        organization_id: "org-1",
        organization: { id: "org-1", name: "Test Org", is_active: true, credit_balance: "5.00" },
      };

      vi.mocked(parseSiweMessage).mockReturnValue({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        nonce: "testnonce123",
        domain: "app.example.com",
        uri: "https://app.example.com",
        version: "1",
        chainId: 1,
      } as any);
      vi.mocked(atomicConsume).mockResolvedValue(1);
      vi.mocked(recoverMessageAddress).mockResolvedValue(
        "0x1234567890abcdef1234567890abcdef12345678" as any,
      );
      vi.mocked(
        usersService.getByWalletAddressWithOrganization,
      ).mockResolvedValue(existingUser as any);

      const { apiKeysService } = await import("@/lib/services/api-keys");
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { id: "key-1", key: "existing-key-123", user_id: "user-1", is_active: true } as any,
      ]);

      const { POST } = await import("./route");
      const req = createRequest({
        message: "valid siwe message",
        signature: "0xvalidsig",
      });
      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.isNewAccount).toBe(false);
      expect(json.apiKey).toBe("existing-key-123");
    });

    it("returns 403 for inactive account", async () => {
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        nonce: "testnonce123",
        domain: "app.example.com",
        uri: "https://app.example.com",
        version: "1",
        chainId: 1,
      } as any);
      vi.mocked(atomicConsume).mockResolvedValue(1);
      vi.mocked(recoverMessageAddress).mockResolvedValue(
        "0x1234567890abcdef1234567890abcdef12345678" as any,
      );
      vi.mocked(
        usersService.getByWalletAddressWithOrganization,
      ).mockResolvedValue({
        id: "user-1",
        is_active: false,
        organization_id: "org-1",
        organization: { is_active: true },
      } as any);

      const { POST } = await import("./route");
      const req = createRequest({
        message: "valid siwe message",
        signature: "0xvalidsig",
      });
      const res = await POST(req as any);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("ACCOUNT_INACTIVE");
    });
  });

  describe("New user sign-up", () => {
    it("returns success with isNewAccount=true for new wallet", async () => {
      const address = "0x1234567890abcdef1234567890abcdef12345678";
      const newUser = {
        id: "user-new",
        name: "0x1234...5678",
        privy_user_id: null,
        wallet_address: address.toLowerCase(),
        wallet_verified: true,
        is_active: true,
        organization_id: "org-1",
        role: "owner",
      };
      const org = {
        id: "org-1",
        name: "0x1234...5678's Organization",
        slug: "wallet-abc123-test",
        credit_balance: "0.00",
        is_active: true,
      };

      vi.mocked(parseSiweMessage).mockReturnValue({
        address,
        nonce: "testnonce123",
        domain: "app.example.com",
        uri: "https://app.example.com",
        version: "1",
        chainId: 1,
      } as any);
      vi.mocked(atomicConsume).mockResolvedValue(1);
      vi.mocked(recoverMessageAddress).mockResolvedValue(address as any);
      vi.mocked(
        usersService.getByWalletAddressWithOrganization,
      ).mockResolvedValue(undefined as any);
      vi.mocked(usersService.create).mockResolvedValue(newUser as any);

      const { organizationsService } = await import(
        "@/lib/services/organizations"
      );
      vi.mocked(organizationsService.create).mockResolvedValue(org as any);

      const { apiKeysService } = await import("@/lib/services/api-keys");
      vi.mocked(apiKeysService.create).mockResolvedValue({
        plainKey: "new-api-key-456",
      } as any);

      const { POST } = await import("./route");
      const req = createRequest({
        message: "valid siwe message",
        signature: "0xvalidsig",
      });
      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.isNewAccount).toBe(true);
      expect(json.apiKey).toBe("new-api-key-456");
    });
  });
});
