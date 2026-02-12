
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies before importing the handler
vi.mock("viem/siwe", () => ({
  parseSiweMessage: vi.fn(),
}));

vi.mock("viem", () => ({
  recoverMessageAddress: vi.fn(),
  getAddress: vi.fn((addr: string) => addr),
}));

vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: vi.fn(() => true),
  },
}));

vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: vi.fn(),
}));

vi.mock("@/lib/cache/keys", () => ({
  CacheKeys: {
    siwe: {
      nonce: (n: string) => `siwe:nonce:${n}`,
    },
  },
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
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
    listByOrganization: vi.fn(() => []),
    create: vi.fn(() => ({ plainKey: "test-key-123" })),
  },
}));

vi.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    create: vi.fn(() => ({ id: "org-1", slug: "test-org" })),
    getBySlug: vi.fn(() => null),
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

vi.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: vi.fn(() => "avatar-url"),
}));

vi.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: vi.fn(() => "wallet-slug"),
  getInitialCredits: vi.fn(() => 100),
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: vi.fn(async (fn: Function) => fn({})),
  },
}));

import { POST } from "./route";
import { parseSiweMessage } from "viem/siwe";
import { recoverMessageAddress, getAddress } from "viem";
import { cache } from "@/lib/cache/client";
import { atomicConsume } from "@/lib/cache/consume";
import { usersService } from "@/lib/services/users";
import { apiKeysService } from "@/lib/services/api-keys";

const VALID_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupValidSiweMessage() {
  (parseSiweMessage as ReturnType<typeof vi.fn>).mockReturnValue({
    address: VALID_ADDRESS,
    nonce: "test-nonce-123",
    domain: "localhost",
  });
  (recoverMessageAddress as ReturnType<typeof vi.fn>).mockResolvedValue(VALID_ADDRESS);
  (getAddress as ReturnType<typeof vi.fn>).mockImplementation((addr: string) => addr);
  (atomicConsume as ReturnType<typeof vi.fn>).mockResolvedValue(true);
  (cache.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
}

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  describe("Request body validation", () => {
    it("rejects missing message field", async () => {
      const res = await POST(makeRequest({ signature: "0xabc" }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_BODY");
    });

    it("rejects missing signature field", async () => {
      const res = await POST(makeRequest({ message: "test" }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_BODY");
    });

    it("rejects empty message", async () => {
      const res = await POST(makeRequest({ message: "  ", signature: "0xabc" }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_BODY");
    });

    it("rejects non-JSON body", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "not json",
      });
      const res = await POST(req);
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_BODY");
    });
  });

  describe("Nonce validation", () => {
    it("returns 503 when cache is unavailable", async () => {
      (parseSiweMessage as ReturnType<typeof vi.fn>).mockReturnValue({
        address: VALID_ADDRESS,
        nonce: "test-nonce",
        domain: "localhost",
      });
      (cache.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const res = await POST(makeRequest({ message: "test-msg", signature: "0xabc" }));
      const json = await res.json();
      expect(res.status).toBe(503);
      expect(json.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("rejects expired or already-used nonce", async () => {
      (parseSiweMessage as ReturnType<typeof vi.fn>).mockReturnValue({
        address: VALID_ADDRESS,
        nonce: "used-nonce",
        domain: "localhost",
      });
      (cache.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (atomicConsume as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const res = await POST(makeRequest({ message: "test-msg", signature: "0xabc" }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_NONCE");
    });

    it("consumes nonce atomically (single-use)", async () => {
      setupValidSiweMessage();
      (usersService.getByWalletAddressWithOrganization as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "user-1",
        organization_id: "org-1",
        is_active: true,
        organization: { is_active: true },
        wallet_verified: true,
      });
      (apiKeysService.listByOrganization as ReturnType<typeof vi.fn>).mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "existing-key" },
      ]);

      await POST(makeRequest({ message: "test-msg", signature: "0xabc" }));
      expect(atomicConsume).toHaveBeenCalledTimes(1);
    });
  });

  describe("Domain validation", () => {
    it("rejects mismatched domain", async () => {
      (parseSiweMessage as ReturnType<typeof vi.fn>).mockReturnValue({
        address: VALID_ADDRESS,
        nonce: "test-nonce",
        domain: "evil.com",
      });
      (cache.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (atomicConsume as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (getAddress as ReturnType<typeof vi.fn>).mockImplementation((a: string) => a);

      const res = await POST(makeRequest({ message: "test-msg", signature: "0xabc" }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_DOMAIN");
    });
  });

  describe("Signature verification", () => {
    it("rejects invalid signature", async () => {
      (parseSiweMessage as ReturnType<typeof vi.fn>).mockReturnValue({
        address: VALID_ADDRESS,
        nonce: "test-nonce",
        domain: "localhost",
      });
      (cache.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (atomicConsume as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (recoverMessageAddress as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("bad sig"),
      );

      const res = await POST(makeRequest({ message: "test-msg", signature: "0xbad" }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_SIGNATURE");
    });

    it("rejects address mismatch", async () => {
      (parseSiweMessage as ReturnType<typeof vi.fn>).mockReturnValue({
        address: VALID_ADDRESS,
        nonce: "test-nonce",
        domain: "localhost",
      });
      (cache.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (atomicConsume as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (recoverMessageAddress as ReturnType<typeof vi.fn>).mockResolvedValue("0xDIFFERENT");
      (getAddress as ReturnType<typeof vi.fn>).mockImplementation((a: string) => a);

      const res = await POST(makeRequest({ message: "test-msg", signature: "0xabc" }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_SIGNATURE");
    });
  });

  describe("Existing user (sign-in) path", () => {
    it("returns API key for active existing user", async () => {
      setupValidSiweMessage();
      const existingUser = {
        id: "user-1",
        name: "0x1234...5678",
        organization_id: "org-1",
        is_active: true,
        wallet_verified: true,
        organization: { is_active: true, name: "Test Org", credit_balance: "100.00" },
      };
      (usersService.getByWalletAddressWithOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(existingUser);
      (apiKeysService.listByOrganization as ReturnType<typeof vi.fn>).mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "existing-plain-key" },
      ]);

      const res = await POST(makeRequest({ message: "test-msg", signature: "0xabc" }));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.isNewAccount).toBe(false);
      expect(json.apiKey).toBe("existing-plain-key");
    });

    it("rejects inactive user", async () => {
      setupValidSiweMessage();
      (usersService.getByWalletAddressWithOrganization as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "user-1",
        organization_id: "org-1",
        is_active: false,
        organization: { is_active: true },
      });

      const res = await POST(makeRequest({ message: "test-msg", signature: "0xabc" }));
      const json = await res.json();
      expect(res.status).toBe(403);
      expect(json.error).toBe("ACCOUNT_INACTIVE");
    });

    it("rejects inactive organization", async () => {
      setupValidSiweMessage();
      (usersService.getByWalletAddressWithOrganization as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "user-1",
        organization_id: "org-1",
        is_active: true,
        organization: { is_active: false },
      });

      const res = await POST(makeRequest({ message: "test-msg", signature: "0xabc" }));
      const json = await res.json();
      expect(res.status).toBe(403);
      expect(json.error).toBe("ACCOUNT_INACTIVE");
    });

    it("marks wallet as verified on first SIWE auth", async () => {
      setupValidSiweMessage();
      const existingUser = {
        id: "user-1",
        organization_id: "org-1",
        is_active: true,
        wallet_verified: false,
        organization: { is_active: true, name: "Test Org", credit_balance: "50.00" },
      };
      (usersService.getByWalletAddressWithOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(existingUser);
      (apiKeysService.listByOrganization as ReturnType<typeof vi.fn>).mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "key-123" },
      ]);

      await POST(makeRequest({ message: "test-msg", signature: "0xabc" }));
      expect(usersService.update).toHaveBeenCalledWith("user-1", { wallet_verified: true });
    });
  });

  describe("New user (sign-up) path", () => {
    it("creates org, credits, user, and API key for new wallet", async () => {
      setupValidSiweMessage();
      (usersService.getByWalletAddressWithOrganization as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null) // first call: lookup existing
        .mockResolvedValueOnce({     // second call: after creation
          id: "new-user-1",
          name: "0x1234...5678",
          organization_id: "org-1",
          is_active: true,
          wallet_verified: true,
          organization: { is_active: true, name: "Test Org", credit_balance: "100.00" },
        });
      (usersService.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "new-user-1",
      });

      const res = await POST(makeRequest({ message: "test-msg", signature: "0xabc" }));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.isNewAccount).toBe(true);
      expect(json.apiKey).toBe("test-key-123");
    });

    it("blocks signup when abuse detected", async () => {
      setupValidSiweMessage();
      (usersService.getByWalletAddressWithOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const { abuseDetectionService } = await import("@/lib/services/abuse-detection");
      (abuseDetectionService.checkSignupAbuse as ReturnType<typeof vi.fn>).mockResolvedValue({
        allowed: false,
        reason: "Too many signups from this IP",
      });

      const res = await POST(makeRequest({ message: "test-msg", signature: "0xabc" }));
      const json = await res.json();
      expect(res.status).toBe(403);
      expect(json.error).toBe("SIGNUP_BLOCKED");
    });

    it("handles duplicate wallet race condition (23505)", async () => {
      setupValidSiweMessage();
      (usersService.getByWalletAddressWithOrganization as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null) // initial lookup
        .mockResolvedValueOnce({     // retry after race
          id: "race-user",
          organization_id: "org-race",
          is_active: true,
          wallet_verified: true,
          organization: { is_active: true, name: "Race Org", credit_balance: "100.00" },
        });
      (apiKeysService.listByOrganization as ReturnType<typeof vi.fn>).mockResolvedValue([
        { user_id: "race-user", is_active: true, key: "race-key" },
      ]);

      const { db } = await import("@/lib/db");
      (db.transaction as ReturnType<typeof vi.fn>).mockRejectedValue(
        Object.assign(new Error("duplicate key"), { code: "23505" }),
      );

      const res = await POST(makeRequest({ message: "test-msg", signature: "0xabc" }));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.isNewAccount).toBe(false);
      expect(json.apiKey).toBe("race-key");
    });
  });

  describe("Expired SIWE message", () => {
    it("rejects expired message", async () => {
      (parseSiweMessage as ReturnType<typeof vi.fn>).mockReturnValue({
        address: VALID_ADDRESS,
        nonce: "test-nonce",
        domain: "localhost",
        expirationTime: new Date(Date.now() - 60000), // expired 1 min ago
      });
      (cache.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (atomicConsume as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (getAddress as ReturnType<typeof vi.fn>).mockImplementation((a: string) => a);

      const res = await POST(makeRequest({ message: "test-msg", signature: "0xabc" }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("MESSAGE_EXPIRED");
    });
  });
});
