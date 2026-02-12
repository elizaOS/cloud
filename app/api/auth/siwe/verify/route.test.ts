
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the module
vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: vi.fn(() => true),
  },
}));

vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: vi.fn(() => Promise.resolve(true)),
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
    create: vi.fn(() => Promise.resolve({ plainKey: "ek_test_123" })),
  },
}));

vi.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    getBySlug: vi.fn(() => Promise.resolve(null)),
    create: vi.fn(() => Promise.resolve({ id: "org-123" })),
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

vi.mock("viem/siwe", () => ({
  parseSiweMessage: vi.fn(() => ({
    address: "0xAbC1234567890abcdef1234567890abcdef12345",
    nonce: "test-nonce-123",
    domain: "localhost",
  })),
}));

vi.mock("viem", () => ({
  recoverMessageAddress: vi.fn(() =>
    Promise.resolve("0xAbC1234567890abcdef1234567890abcdef12345")
  ),
  getAddress: vi.fn((addr) => addr),
}));

import { cache } from "@/lib/cache/client";
import { atomicConsume } from "@/lib/cache/consume";
import { usersService } from "@/lib/services/users";

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  describe("Nonce validation", () => {
    it("should return 503 when cache is unavailable", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);

      const { POST } = await import("./route");
      const request = new Request("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: "localhost wants you to sign in...",
          signature: "0x123",
        }),
      });

      const response = await POST(request as any);
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("should return 400 when nonce is expired or already used", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(false);

      const { POST } = await import("./route");
      const request = new Request("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: "localhost wants you to sign in...",
          signature: "0x123",
        }),
      });

      const response = await POST(request as any);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("INVALID_NONCE");
    });

    it("should consume nonce atomically to prevent replay", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-123",
        organization_id: "org-123",
        is_active: true,
        organization: { is_active: true },
      } as any);

      const { POST } = await import("./route");
      const request = new Request("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: "localhost wants you to sign in...",
          signature: "0x123",
        }),
      });

      await POST(request as any);
      expect(atomicConsume).toHaveBeenCalled();
    });
  });

  describe("Request validation", () => {
    it("should return 400 for missing message", async () => {
      const { POST } = await import("./route");
      const request = new Request("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ signature: "0x123" }),
      });

      const response = await POST(request as any);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("INVALID_BODY");
    });

    it("should return 400 for missing signature", async () => {
      const { POST } = await import("./route");
      const request = new Request("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: "test message" }),
      });

      const response = await POST(request as any);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("INVALID_BODY");
    });

    it("should return 400 for invalid JSON body", async () => {
      const { POST } = await import("./route");
      const request = new Request("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: "not valid json",
      });

      const response = await POST(request as any);
      expect(response.status).toBe(400);
    });
  });

  describe("Existing user flow", () => {
    it("should return existing user with API key", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-123",
        name: "Test User",
        organization_id: "org-123",
        is_active: true,
        wallet_verified: true,
        organization: { is_active: true, name: "Test Org", credit_balance: "10.00" },
      } as any);

      const { POST } = await import("./route");
      const request = new Request("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: "localhost wants you to sign in...",
          signature: "0x123",
        }),
      });

      const response = await POST(request as any);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.isNewAccount).toBe(false);
      expect(body.apiKey).toBeDefined();
    });

    it("should return 403 for inactive account", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-123",
        organization_id: "org-123",
        is_active: false,
        organization: { is_active: true },
      } as any);

      const { POST } = await import("./route");
      const request = new Request("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: "localhost wants you to sign in...",
          signature: "0x123",
        }),
      });

      const response = await POST(request as any);
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe("ACCOUNT_INACTIVE");
    });
  });

  describe("New user flow", () => {
    it("should create new user with organization and API key", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(usersService.getByWalletAddressWithOrganization)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          id: "new-user-123",
          name: "0xAbC1...2345",
          organization_id: "new-org-123",
          is_active: true,
          organization: { is_active: true, name: "Test Org", credit_balance: "5.00" },
        } as any);

      const { POST } = await import("./route");
      const request = new Request("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        headers: { "x-real-ip": "127.0.0.1", "user-agent": "test-agent" },
        body: JSON.stringify({
          message: "localhost wants you to sign in...",
          signature: "0x123",
        }),
      });

      const response = await POST(request as any);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.isNewAccount).toBe(true);
    });

    it("should block signup when abuse detected", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(undefined);

      const { abuseDetectionService } = await import("@/lib/services/abuse-detection");
      vi.mocked(abuseDetectionService.checkSignupAbuse).mockResolvedValue({
        allowed: false,
        reason: "Too many signups from this IP",
      });

      const { POST } = await import("./route");
      const request = new Request("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        headers: { "x-real-ip": "127.0.0.1" },
        body: JSON.stringify({
          message: "localhost wants you to sign in...",
          signature: "0x123",
        }),
      });

      const response = await POST(request as any);
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.error).toBe("SIGNUP_BLOCKED");
    });
  });
});
