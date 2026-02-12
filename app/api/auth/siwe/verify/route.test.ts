
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies
vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: vi.fn(),
  },
}));

vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: vi.fn(),
}));

vi.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: vi.fn(),
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
    getBySlug: vi.fn(),
    create: vi.fn(),
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

vi.mock("@/lib/db", () => ({
  db: {
    transaction: vi.fn((fn) => fn({})),
  },
}));

vi.mock("viem/siwe", () => ({
  parseSiweMessage: vi.fn(),
}));

vi.mock("viem", () => ({
  recoverMessageAddress: vi.fn(),
  getAddress: vi.fn((addr) => addr),
}));

import { cache } from "@/lib/cache/client";
import { atomicConsume } from "@/lib/cache/consume";
import { usersService } from "@/lib/services/users";
import { parseSiweMessage } from "viem/siwe";
import { recoverMessageAddress } from "viem";

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com";
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  describe("Nonce validation", () => {
    it("returns 503 when cache is unavailable", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: "0x1234567890123456789012345678901234567890",
        nonce: "test-nonce",
        domain: "example.com",
      });

      const { POST } = await import("./route");
      const request = new NextRequest("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: "example.com wants you to sign in...",
          signature: "0xabc123",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("returns 400 for expired/used nonce", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(false);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: "0x1234567890123456789012345678901234567890",
        nonce: "expired-nonce",
        domain: "example.com",
      });

      const { POST } = await import("./route");
      const request = new NextRequest("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: "example.com wants you to sign in...",
          signature: "0xabc123",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_NONCE");
    });

    it("consumes nonce atomically to prevent reuse", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: "0x1234567890123456789012345678901234567890",
        nonce: "valid-nonce",
        domain: "example.com",
      });
      vi.mocked(recoverMessageAddress).mockResolvedValue(
        "0x1234567890123456789012345678901234567890"
      );
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        organization_id: "org-1",
        is_active: true,
        organization: { is_active: true },
      } as any);

      const { POST } = await import("./route");
      const request = new NextRequest("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: "example.com wants you to sign in...",
          signature: "0xabc123",
        }),
      });

      await POST(request);

      expect(atomicConsume).toHaveBeenCalledWith(expect.stringContaining("valid-nonce"));
    });
  });

  describe("Signature verification", () => {
    it("returns 400 for invalid signature", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: "0x1234567890123456789012345678901234567890",
        nonce: "valid-nonce",
        domain: "example.com",
      });
      vi.mocked(recoverMessageAddress).mockRejectedValue(new Error("Invalid signature"));

      const { POST } = await import("./route");
      const request = new NextRequest("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: "example.com wants you to sign in...",
          signature: "0xinvalid",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_SIGNATURE");
    });

    it("returns 400 for mismatched recovered address", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: "0x1234567890123456789012345678901234567890",
        nonce: "valid-nonce",
        domain: "example.com",
      });
      vi.mocked(recoverMessageAddress).mockResolvedValue(
        "0xDIFFERENT_ADDRESS_HERE_DIFFERENT"
      );

      const { POST } = await import("./route");
      const request = new NextRequest("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: "example.com wants you to sign in...",
          signature: "0xabc123",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_SIGNATURE");
    });
  });

  describe("Domain validation", () => {
    it("returns 400 for mismatched domain", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: "0x1234567890123456789012345678901234567890",
        nonce: "valid-nonce",
        domain: "malicious.com",
      });

      const { POST } = await import("./route");
      const request = new NextRequest("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: "malicious.com wants you to sign in...",
          signature: "0xabc123",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_DOMAIN");
    });
  });

  describe("User flows", () => {
    it("returns existing user without creating new account", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: "0x1234567890123456789012345678901234567890",
        nonce: "valid-nonce",
        domain: "example.com",
      });
      vi.mocked(recoverMessageAddress).mockResolvedValue(
        "0x1234567890123456789012345678901234567890"
      );

      const existingUser = {
        id: "user-123",
        organization_id: "org-123",
        is_active: true,
        wallet_verified: true,
        organization: { is_active: true, name: "Test Org", credit_balance: "10.00" },
      };
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(
        existingUser as any
      );

      const { apiKeysService } = await import("@/lib/services/api-keys");
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { user_id: "user-123", is_active: true, key: "existing-key" } as any,
      ]);

      const { POST } = await import("./route");
      const request = new NextRequest("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: "example.com wants you to sign in...",
          signature: "0xabc123",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isNewAccount).toBe(false);
      expect(data.apiKey).toBe("existing-key");
    });
  });
});
