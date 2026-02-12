
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/cache/client", () => ({
  cache: {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    isAvailable: vi.fn(),
  },
}));

vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: vi.fn(),
}));

vi.mock("@/lib/cache/keys", () => ({
  CacheTTL: { siwe: { nonce: 300 } },
  CacheKeys: { siwe: { nonce: (n: string) => `siwe:nonce:${n}` } },
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "http://localhost:3000",
}));

vi.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: () => "https://example.com/avatar.png",
}));

vi.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: () => "abcdef-123456",
  getInitialCredits: () => 5.0,
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
    transaction: vi.fn((fn: Function) => fn({})),
  },
}));

vi.mock("viem/siwe", () => ({
  parseSiweMessage: vi.fn(),
}));

vi.mock("viem", () => ({
  recoverMessageAddress: vi.fn(),
  getAddress: (addr: string) => addr,
}));

import { cache } from "@/lib/cache/client";
import { atomicConsume } from "@/lib/cache/consume";
import { usersService } from "@/lib/services/users";
import { apiKeysService } from "@/lib/services/api-keys";
import { organizationsService } from "@/lib/services/organizations";
import { abuseDetectionService } from "@/lib/services/abuse-detection";
import { parseSiweMessage } from "viem/siwe";
import { recoverMessageAddress } from "viem";
import { NextRequest } from "next/server";

const mockedCache = vi.mocked(cache);
const mockedAtomicConsume = vi.mocked(atomicConsume);
const mockedParseSiweMessage = vi.mocked(parseSiweMessage);
const mockedRecoverMessageAddress = vi.mocked(recoverMessageAddress);
const mockedUsersService = vi.mocked(usersService);
const mockedApiKeysService = vi.mocked(apiKeysService);
const mockedOrganizationsService = vi.mocked(organizationsService);
const mockedAbuseDetectionService = vi.mocked(abuseDetectionService);

async function importHandler() {
  const mod = await import("../../verify/route");
  return mod.POST;
}

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const VALID_MESSAGE = "localhost wants you to sign in...";
const VALID_SIGNATURE = "0xdeadbeef";

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCache.isAvailable.mockReturnValue(true);
    mockedAtomicConsume.mockResolvedValue(1);
    mockedParseSiweMessage.mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "test-nonce",
      domain: "localhost",
    } as any);
    mockedRecoverMessageAddress.mockResolvedValue(VALID_ADDRESS as any);
  });

  describe("request validation", () => {
    it("rejects missing body", async () => {
      const handler = await importHandler();
      const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      });
      const res = await handler(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_BODY");
    });

    it("rejects empty message", async () => {
      const handler = await importHandler();
      const res = await handler(makeRequest({ message: "", signature: VALID_SIGNATURE }));
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_BODY");
    });

    it("rejects empty signature", async () => {
      const handler = await importHandler();
      const res = await handler(makeRequest({ message: VALID_MESSAGE, signature: "" }));
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_BODY");
    });

    it("rejects missing required SIWE fields", async () => {
      mockedParseSiweMessage.mockReturnValue({} as any);
      const handler = await importHandler();
      const res = await handler(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_BODY");
    });
  });

  describe("nonce validation", () => {
    it("returns 503 when cache is unavailable", async () => {
      mockedCache.isAvailable.mockReturnValue(false);
      const handler = await importHandler();
      const res = await handler(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("rejects expired or already-used nonce (atomicConsume returns 0)", async () => {
      mockedAtomicConsume.mockResolvedValue(0);
      const handler = await importHandler();
      const res = await handler(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_NONCE");
    });

    it("consumes nonce atomically via atomicConsume", async () => {
      mockedUsersService.getByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-1",
        is_active: true,
        wallet_verified: true,
        organization_id: "org-1",
        organization: { is_active: true, name: "Test Org", credit_balance: "5.00" },
      } as any);
      mockedApiKeysService.listByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "existing-key" },
      ] as any);

      const handler = await importHandler();
      await handler(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));

      expect(mockedAtomicConsume).toHaveBeenCalledWith("siwe:nonce:test-nonce");
    });
  });

  describe("domain validation", () => {
    it("rejects mismatched domain", async () => {
      mockedParseSiweMessage.mockReturnValue({
        address: VALID_ADDRESS,
        nonce: "test-nonce",
        domain: "evil.com",
      } as any);
      const handler = await importHandler();
      const res = await handler(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_DOMAIN");
    });
  });

  describe("signature validation", () => {
    it("rejects invalid signature", async () => {
      mockedRecoverMessageAddress.mockRejectedValue(new Error("bad sig"));
      const handler = await importHandler();
      const res = await handler(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_SIGNATURE");
    });

    it("rejects signature from wrong address", async () => {
      mockedRecoverMessageAddress.mockResolvedValue("0xdifferentAddress" as any);
      const handler = await importHandler();
      const res = await handler(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_SIGNATURE");
    });
  });

  describe("existing user path", () => {
    it("returns existing user with API key", async () => {
      const existingUser = {
        id: "user-1",
        name: "0x1234...5678",
        is_active: true,
        wallet_verified: true,
        privy_user_id: null,
        organization_id: "org-1",
        organization: { is_active: true, name: "Test Org", credit_balance: "5.00" },
      };
      mockedUsersService.getByWalletAddressWithOrganization.mockResolvedValue(existingUser as any);
      mockedApiKeysService.listByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "existing-api-key" },
      ] as any);

      const handler = await importHandler();
      const res = await handler(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.isNewAccount).toBe(false);
      expect(body.apiKey).toBe("existing-api-key");
    });

    it("rejects inactive account", async () => {
      mockedUsersService.getByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-1",
        is_active: false,
        organization_id: "org-1",
        organization: { is_active: true },
      } as any);

      const handler = await importHandler();
      const res = await handler(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error).toBe("ACCOUNT_INACTIVE");
    });

    it("marks wallet as verified on existing unverified user", async () => {
      mockedUsersService.getByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-1",
        is_active: true,
        wallet_verified: false,
        organization_id: "org-1",
        organization: { is_active: true, name: "Test", credit_balance: "0" },
      } as any);
      mockedApiKeysService.listByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "key" },
      ] as any);

      const handler = await importHandler();
      await handler(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));

      expect(mockedUsersService.update).toHaveBeenCalledWith("user-1", { wallet_verified: true });
    });
  });

  describe("new user (signup) path", () => {
    beforeEach(() => {
      mockedUsersService.getByWalletAddressWithOrganization.mockResolvedValue(undefined as any);
      mockedAbuseDetectionService.checkSignupAbuse.mockResolvedValue({ allowed: true } as any);
      mockedOrganizationsService.getBySlug.mockResolvedValue(undefined as any);
      mockedOrganizationsService.create.mockResolvedValue({
        id: "org-new",
        name: "Test Org",
        credit_balance: "0.00",
      } as any);
      mockedUsersService.create.mockResolvedValue({
        id: "user-new",
        name: "0x1234...5678",
        organization_id: "org-new",
      } as any);
      mockedApiKeysService.create.mockResolvedValue({
        plainKey: "new-api-key",
      } as any);
    });

    it("creates new account and returns isNewAccount true", async () => {
      const handler = await importHandler();
      const res = await handler(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.isNewAccount).toBe(true);
      expect(body.apiKey).toBe("new-api-key");
    });

    it("blocks signup when abuse detected", async () => {
      mockedAbuseDetectionService.checkSignupAbuse.mockResolvedValue({
        allowed: false,
        reason: "Too many signups",
      } as any);

      const handler = await importHandler();
      const res = await handler(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error).toBe("SIGNUP_BLOCKED");
    });
  });
});
