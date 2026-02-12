
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies before importing the module
vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: vi.fn(() => true),
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: vi.fn(),
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
    transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
  },
}));

vi.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: vi.fn(() => "avatar-url"),
}));

vi.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: vi.fn(() => "wallet-slug"),
  getInitialCredits: vi.fn(() => 100),
}));

vi.mock("viem/siwe", () => ({
  parseSiweMessage: vi.fn(),
}));

vi.mock("viem", () => ({
  recoverMessageAddress: vi.fn(),
  getAddress: vi.fn((addr: string) => addr),
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: vi.fn((handler: (req: NextRequest) => Promise<Response>) => handler),
  RateLimitPresets: { STRICT: {} },
}));

import { cache } from "@/lib/cache/client";
import { atomicConsume } from "@/lib/cache/consume";
import { parseSiweMessage } from "viem/siwe";
import { recoverMessageAddress, getAddress } from "viem";
import { usersService } from "@/lib/services/users";
import { apiKeysService } from "@/lib/services/api-keys";
import { organizationsService } from "@/lib/services/organizations";
import { abuseDetectionService } from "@/lib/services/abuse-detection";

const TEST_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const TEST_NONCE = "test-nonce-123";
const TEST_DOMAIN = "localhost";
const TEST_SIGNATURE = "0xdeadbeef";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(parseSiweMessage).mockReturnValue({
      address: TEST_ADDRESS,
      nonce: TEST_NONCE,
      domain: TEST_DOMAIN,
    } as ReturnType<typeof parseSiweMessage>);
    vi.mocked(recoverMessageAddress).mockResolvedValue(TEST_ADDRESS);
    vi.mocked(getAddress).mockImplementation((addr: string) => addr);
    vi.mocked(atomicConsume).mockResolvedValue(true);
  });

  describe("Request body validation", () => {
    it("returns 400 for invalid JSON body", async () => {
      const { POST } = await import("./route");
      const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_BODY");
    });

    it("returns 400 when message is missing", async () => {
      const { POST } = await import("./route");
      const res = await POST(makeRequest({ signature: TEST_SIGNATURE }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_BODY");
    });

    it("returns 400 when signature is missing", async () => {
      const { POST } = await import("./route");
      const res = await POST(makeRequest({ message: "test message" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_BODY");
    });

    it("returns 400 when message is empty string", async () => {
      const { POST } = await import("./route");
      const res = await POST(makeRequest({ message: "  ", signature: TEST_SIGNATURE }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_BODY");
    });
  });

  describe("Cache availability", () => {
    it("returns 503 when cache/Redis is unavailable", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);
      const { POST } = await import("./route");
      const res = await POST(
        makeRequest({ message: "valid siwe message", signature: TEST_SIGNATURE }),
      );
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  describe("Nonce validation (TTL / single-use)", () => {
    it("returns 400 when nonce is expired or already used", async () => {
      vi.mocked(atomicConsume).mockResolvedValue(false);
      const { POST } = await import("./route");
      const res = await POST(
        makeRequest({ message: "valid siwe message", signature: TEST_SIGNATURE }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_NONCE");
    });

    it("consumes nonce atomically (single-use enforcement)", async () => {
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        organization_id: "org-1",
        is_active: true,
        wallet_verified: true,
        organization: { is_active: true, name: "Test Org", credit_balance: "100.00" },
      } as never);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "existing-key" },
      ] as never);

      const { POST } = await import("./route");
      await POST(makeRequest({ message: "valid siwe message", signature: TEST_SIGNATURE }));
      expect(atomicConsume).toHaveBeenCalledTimes(1);
    });
  });

  describe("Domain validation", () => {
    it("returns 400 when SIWE message domain does not match server", async () => {
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: TEST_ADDRESS,
        nonce: TEST_NONCE,
        domain: "evil.com",
      } as ReturnType<typeof parseSiweMessage>);

      const { POST } = await import("./route");
      const res = await POST(
        makeRequest({ message: "valid siwe message", signature: TEST_SIGNATURE }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_DOMAIN");
    });
  });

  describe("Signature verification", () => {
    it("returns 400 when signature recovery fails", async () => {
      vi.mocked(recoverMessageAddress).mockRejectedValue(new Error("bad sig"));

      const { POST } = await import("./route");
      const res = await POST(
        makeRequest({ message: "valid siwe message", signature: TEST_SIGNATURE }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_SIGNATURE");
    });

    it("returns 400 when recovered address does not match claimed address", async () => {
      vi.mocked(recoverMessageAddress).mockResolvedValue("0xDIFFERENTADDRESS");
      vi.mocked(getAddress).mockImplementation((addr: string) => addr);

      const { POST } = await import("./route");
      const res = await POST(
        makeRequest({ message: "valid siwe message", signature: TEST_SIGNATURE }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_SIGNATURE");
    });
  });

  describe("Existing user (sign-in) path", () => {
    it("returns API key for existing active user", async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        name: "Test",
        organization_id: "org-1",
        is_active: true,
        wallet_verified: true,
        privy_user_id: null,
        organization: {
          is_active: true,
          name: "Test Org",
          credit_balance: "50.00",
        },
      } as never);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "sk-existing-key" },
      ] as never);

      const { POST } = await import("./route");
      const res = await POST(
        makeRequest({ message: "valid siwe message", signature: TEST_SIGNATURE }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.isNewAccount).toBe(false);
      expect(data.apiKey).toBe("sk-existing-key");
    });

    it("returns 403 for inactive user", async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        organization_id: "org-1",
        is_active: false,
        wallet_verified: true,
        organization: { is_active: true },
      } as never);

      const { POST } = await import("./route");
      const res = await POST(
        makeRequest({ message: "valid siwe message", signature: TEST_SIGNATURE }),
      );
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("ACCOUNT_INACTIVE");
    });

    it("returns 403 for inactive organization", async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        organization_id: "org-1",
        is_active: true,
        wallet_verified: true,
        organization: { is_active: false },
      } as never);

      const { POST } = await import("./route");
      const res = await POST(
        makeRequest({ message: "valid siwe message", signature: TEST_SIGNATURE }),
      );
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("ACCOUNT_INACTIVE");
    });

    it("marks wallet as verified on first SIWE sign-in for Privy user", async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        name: "Test",
        organization_id: "org-1",
        is_active: true,
        wallet_verified: false,
        privy_user_id: "privy-123",
        organization: {
          is_active: true,
          name: "Test Org",
          credit_balance: "50.00",
        },
      } as never);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "sk-key" },
      ] as never);

      const { POST } = await import("./route");
      await POST(makeRequest({ message: "valid siwe message", signature: TEST_SIGNATURE }));
      expect(usersService.update).toHaveBeenCalledWith("user-1", {
        wallet_verified: true,
      });
    });
  });

  describe("New user (sign-up) path", () => {
    beforeEach(() => {
      // No existing user
      vi.mocked(usersService.getByWalletAddressWithOrganization)
        .mockResolvedValueOnce(undefined as never) // first call: lookup
        .mockResolvedValueOnce({
          id: "new-user",
          name: "0x1234...5678",
          organization_id: "new-org",
          is_active: true,
          wallet_verified: true,
          privy_user_id: null,
          organization: {
            is_active: true,
            name: "0x1234...5678's Organization",
            credit_balance: "100.00",
          },
        } as never); // second call: post-creation fetch
      vi.mocked(organizationsService.getBySlug).mockResolvedValue(null as never);
      vi.mocked(organizationsService.create).mockResolvedValue({
        id: "new-org",
        name: "Test Org",
        slug: "wallet-slug",
      } as never);
      vi.mocked(usersService.create).mockResolvedValue({
        id: "new-user",
        organization_id: "new-org",
      } as never);
      vi.mocked(apiKeysService.create).mockResolvedValue({
        plainKey: "sk-new-key",
      } as never);
      vi.mocked(abuseDetectionService.checkSignupAbuse).mockResolvedValue({
        allowed: true,
      } as never);
    });

    it("creates new account and returns API key with isNewAccount=true", async () => {
      const { POST } = await import("./route");
      const res = await POST(
        makeRequest({ message: "valid siwe message", signature: TEST_SIGNATURE }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.isNewAccount).toBe(true);
      expect(data.apiKey).toBe("sk-new-key");
    });

    it("blocks signup when abuse detection denies it", async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(
        undefined as never,
      );
      vi.mocked(abuseDetectionService.checkSignupAbuse).mockResolvedValue({
        allowed: false,
        reason: "Too many signups from this IP",
      } as never);

      const { POST } = await import("./route");
      const res = await POST(
        makeRequest({ message: "valid siwe message", signature: TEST_SIGNATURE }),
      );
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("SIGNUP_BLOCKED");
    });
  });

  describe("Duplicate wallet race condition (23505)", () => {
    it("handles concurrent signup race by falling back to existing user", async () => {
      const { db } = await import("@/lib/db");

      // First lookup returns no user (new signup path)
      vi.mocked(usersService.getByWalletAddressWithOrganization)
        .mockResolvedValueOnce(undefined as never);

      vi.mocked(abuseDetectionService.checkSignupAbuse).mockResolvedValue({
        allowed: true,
      } as never);

      // Transaction fails with 23505 (duplicate key)
      const duplicateError = new Error("duplicate key") as Error & { code: string };
      duplicateError.code = "23505";
      vi.mocked(db.transaction).mockRejectedValue(duplicateError);

      // Retry lookup finds the user created by the winning request
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "race-winner-user",
        name: "Test",
        organization_id: "race-winner-org",
        is_active: true,
        wallet_verified: true,
        privy_user_id: null,
        organization: {
          is_active: true,
          name: "Test Org",
          credit_balance: "100.00",
        },
      } as never);

      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { user_id: "race-winner-user", is_active: true, key: "sk-race-key" },
      ] as never);

      const { POST } = await import("./route");
      const res = await POST(
        makeRequest({ message: "valid siwe message", signature: TEST_SIGNATURE }),
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.apiKey).toBe("sk-race-key");
      expect(data.isNewAccount).toBe(false);
    });
  });

  describe("Message expiration", () => {
    it("returns 400 when SIWE message has expired", async () => {
      vi.mocked(parseSiweMessage).mockReturnValue({
        address: TEST_ADDRESS,
        nonce: TEST_NONCE,
        domain: TEST_DOMAIN,
        expirationTime: new Date(Date.now() - 60000), // expired 1 minute ago
      } as ReturnType<typeof parseSiweMessage>);

      const { POST } = await import("./route");
      const res = await POST(
        makeRequest({ message: "valid siwe message", signature: TEST_SIGNATURE }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("MESSAGE_EXPIRED");
    });
  });
});
