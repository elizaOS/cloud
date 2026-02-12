
/**
 * SIWE Verify Endpoint Tests
 * 
 * Coverage for nonce issuance (TTL/single-use), verify success paths
 * (existing vs new user), and key failure modes (invalid nonce/domain/signature).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies before importing the route handler
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
    checkSignupAbuse: vi.fn(() => ({ allowed: true })),
    recordSignupMetadata: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: vi.fn((fn) => fn({})),
  },
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: vi.fn((handler) => handler),
  RateLimitPresets: { STRICT: {} },
}));

vi.mock("viem", () => ({
  recoverMessageAddress: vi.fn(),
  getAddress: vi.fn((addr) => addr),
}));

vi.mock("viem/siwe", () => ({
  parseSiweMessage: vi.fn(),
}));

import { POST } from "./route";
import { cache } from "@/lib/cache/client";
import { atomicConsume } from "@/lib/cache/consume";
import { usersService } from "@/lib/services/users";
import { apiKeysService } from "@/lib/services/api-keys";
import { parseSiweMessage } from "viem/siwe";
import { recoverMessageAddress } from "viem";

const VALID_ADDRESS = "0x1234567890123456789012345678901234567890";
const VALID_NONCE = "abc123nonce";
const VALID_DOMAIN = "localhost";
const VALID_SIGNATURE = "0x" + "ab".repeat(65);

function createRequest(body: object): NextRequest {
  return new NextRequest("http://localhost/api/auth/siwe/verify", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost";
    
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(parseSiweMessage).mockReturnValue({
      address: VALID_ADDRESS,
      nonce: VALID_NONCE,
      domain: VALID_DOMAIN,
    } as ReturnType<typeof parseSiweMessage>);
    vi.mocked(recoverMessageAddress).mockResolvedValue(VALID_ADDRESS);
    vi.mocked(atomicConsume).mockResolvedValue(true);
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  describe("Input Validation", () => {
    it("rejects request with missing message", async () => {
      const req = createRequest({ signature: VALID_SIGNATURE });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_BODY");
    });

    it("rejects request with missing signature", async () => {
      const req = createRequest({ message: "valid message" });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_BODY");
    });

    it("rejects request with empty message", async () => {
      const req = createRequest({ message: "  ", signature: VALID_SIGNATURE });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_BODY");
    });
  });

  describe("Cache Availability", () => {
    it("returns 503 when cache is unavailable", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);

      const req = createRequest({
        message: "valid siwe message",
        signature: VALID_SIGNATURE,
      });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  describe("Nonce Validation", () => {
    it("rejects expired or already-used nonce", async () => {
      vi.mocked(atomicConsume).mockResolvedValue(false);

      const req = createRequest({
        message: "valid siwe message",
        signature: VALID_SIGNATURE,
      });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_NONCE");
    });

    it("consumes nonce atomically (single-use)", async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        organization_id: "org-1",
        is_active: true,
        organization: { is_active: true },
      } as any);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "sk_test_123" },
      ] as any);

      const req = createRequest({
        message: "valid siwe message",
        signature: VALID_SIGNATURE,
      });
      await POST(req);

      expect(atomicConsume).toHaveBeenCalledTimes(1);
    });
  });

  describe("Domain Validation", () => {
    it("rejects mismatched domain", async () => {
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: VALID_ADDRESS,
        nonce: VALID_NONCE,
        domain: "evil.com",
      } as ReturnType<typeof parseSiweMessage>);

      const req = createRequest({
        message: "valid siwe message",
        signature: VALID_SIGNATURE,
      });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_DOMAIN");
    });
  });

  describe("Signature Validation", () => {
    it("rejects invalid signature", async () => {
      vi.mocked(recoverMessageAddress).mockRejectedValue(new Error("Invalid signature"));

      const req = createRequest({
        message: "valid siwe message",
        signature: VALID_SIGNATURE,
      });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_SIGNATURE");
    });

    it("rejects signature from wrong address", async () => {
      vi.mocked(recoverMessageAddress).mockResolvedValue("0xdifferentaddress");

      const req = createRequest({
        message: "valid siwe message",
        signature: VALID_SIGNATURE,
      });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_SIGNATURE");
    });
  });

  describe("Existing User Path", () => {
    it("returns existing user with API key", async () => {
      const existingUser = {
        id: "user-1",
        name: "Test User",
        organization_id: "org-1",
        is_active: true,
        wallet_verified: true,
        organization: { 
          is_active: true, 
          name: "Test Org",
          credit_balance: "10.00",
        },
      };
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(existingUser as any);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "sk_test_existing" },
      ] as any);

      const req = createRequest({
        message: "valid siwe message",
        signature: VALID_SIGNATURE,
      });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.isNewAccount).toBe(false);
      expect(body.apiKey).toBe("sk_test_existing");
    });

    it("rejects inactive user", async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        organization_id: "org-1",
        is_active: false,
        organization: { is_active: true },
      } as any);

      const req = createRequest({
        message: "valid siwe message",
        signature: VALID_SIGNATURE,
      });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error).toBe("ACCOUNT_INACTIVE");
    });

    it("rejects inactive organization", async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        organization_id: "org-1",
        is_active: true,
        organization: { is_active: false },
      } as any);

      const req = createRequest({
        message: "valid siwe message",
        signature: VALID_SIGNATURE,
      });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error).toBe("ACCOUNT_INACTIVE");
    });
  });

  describe("New User Path", () => {
    it("creates new user with organization and API key", async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization)
        .mockResolvedValueOnce(undefined as any)
        .mockResolvedValueOnce({
          id: "new-user-1",
          name: "0x1234...7890",
          organization_id: "new-org-1",
          is_active: true,
          wallet_verified: true,
          organization: {
            is_active: true,
            name: "0x1234...7890's Organization",
            credit_balance: "5.00",
          },
        } as any);

      const req = createRequest({
        message: "valid siwe message",
        signature: VALID_SIGNATURE,
      });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.isNewAccount).toBe(true);
    });
  });
});
