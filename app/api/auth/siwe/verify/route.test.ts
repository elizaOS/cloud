
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies
vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: vi.fn(() => true),
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
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

vi.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    create: vi.fn(),
    getBySlug: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: vi.fn(),
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
    checkSignupAbuse: vi.fn(() => ({ allowed: true })),
    recordSignupMetadata: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: vi.fn((callback) => callback({})),
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
  const mockAddress = "0x1234567890123456789012345678901234567890";
  const mockNonce = "test-nonce-12345";
  const mockMessage = `example.com wants you to sign in with your Ethereum account:\n${mockAddress}\n\nSign in to Example\n\nURI: https://example.com\nVersion: 1\nChain ID: 1\nNonce: ${mockNonce}\nIssued At: 2024-01-01T00:00:00.000Z`;
  const mockSignature = "0xmocksignature";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com";
    
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(parseSiweMessage).mockReturnValue({
      address: mockAddress,
      nonce: mockNonce,
      domain: "example.com",
    });
    vi.mocked(recoverMessageAddress).mockResolvedValue(mockAddress);
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  describe("Nonce validation", () => {
    it("should reject when cache is unavailable", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);
      
      const { POST } = await import("./route");
      const req = new NextRequest("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: mockMessage, signature: mockSignature }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("should reject expired or already-used nonce", async () => {
      vi.mocked(atomicConsume).mockResolvedValue(false);

      const { POST } = await import("./route");
      const req = new NextRequest("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: mockMessage, signature: mockSignature }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_NONCE");
    });

    it("should consume nonce atomically to prevent replay", async () => {
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        organization_id: "org-1",
        is_active: true,
        wallet_verified: true,
        organization: { is_active: true },
      } as any);

      const { POST } = await import("./route");
      const req = new NextRequest("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: mockMessage, signature: mockSignature }),
      });

      await POST(req);

      expect(atomicConsume).toHaveBeenCalledWith(expect.stringContaining(mockNonce));
    });
  });

  describe("Domain validation", () => {
    it("should reject mismatched domain", async () => {
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: mockAddress,
        nonce: mockNonce,
        domain: "malicious.com",
      });

      const { POST } = await import("./route");
      const req = new NextRequest("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: mockMessage, signature: mockSignature }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_DOMAIN");
    });
  });

  describe("Signature verification", () => {
    it("should reject invalid signature", async () => {
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(recoverMessageAddress).mockRejectedValue(new Error("Invalid signature"));

      const { POST } = await import("./route");
      const req = new NextRequest("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: mockMessage, signature: mockSignature }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_SIGNATURE");
    });

    it("should reject signature from different address", async () => {
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(recoverMessageAddress).mockResolvedValue("0xDifferentAddress");

      const { POST } = await import("./route");
      const req = new NextRequest("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: mockMessage, signature: mockSignature }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_SIGNATURE");
    });
  });

  describe("Existing user verification", () => {
    it("should return existing user with isNewAccount=false", async () => {
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        name: "Test User",
        organization_id: "org-1",
        is_active: true,
        wallet_verified: true,
        organization: { id: "org-1", name: "Test Org", is_active: true, credit_balance: "10.00" },
      } as any);

      const { apiKeysService } = await import("@/lib/services/api-keys");
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { key: "existing-key", user_id: "user-1", is_active: true } as any,
      ]);

      const { POST } = await import("./route");
      const req = new NextRequest("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: mockMessage, signature: mockSignature }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isNewAccount).toBe(false);
      expect(data.apiKey).toBe("existing-key");
    });
  });

  describe("New user signup", () => {
    it("should create new user with isNewAccount=true", async () => {
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(usersService.getByWalletAddressWithOrganization)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          id: "new-user-1",
          name: "0x1234...7890",
          organization_id: "new-org-1",
          is_active: true,
          wallet_verified: true,
          organization: { id: "new-org-1", name: "Test Org", is_active: true, credit_balance: "5.00" },
        } as any);

      const { organizationsService } = await import("@/lib/services/organizations");
      vi.mocked(organizationsService.getBySlug).mockResolvedValue(undefined);
      vi.mocked(organizationsService.create).mockResolvedValue({ id: "new-org-1" } as any);

      const { usersService: usersServiceMock } = await import("@/lib/services/users");
      vi.mocked(usersServiceMock.create).mockResolvedValue({ id: "new-user-1" } as any);

      const { apiKeysService } = await import("@/lib/services/api-keys");
      vi.mocked(apiKeysService.create).mockResolvedValue({ plainKey: "new-api-key" } as any);

      const { POST } = await import("./route");
      const req = new NextRequest("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        headers: { "x-real-ip": "127.0.0.1", "user-agent": "test-agent" },
        body: JSON.stringify({ message: mockMessage, signature: mockSignature }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isNewAccount).toBe(true);
    });
  });

  describe("Request validation", () => {
    it("should reject missing message", async () => {
      const { POST } = await import("./route");
      const req = new NextRequest("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ signature: mockSignature }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_BODY");
    });

    it("should reject missing signature", async () => {
      const { POST } = await import("./route");
      const req = new NextRequest("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: mockMessage }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_BODY");
    });

    it("should reject invalid JSON", async () => {
      const { POST } = await import("./route");
      const req = new NextRequest("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        body: "not json",
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_BODY");
    });
  });
});
