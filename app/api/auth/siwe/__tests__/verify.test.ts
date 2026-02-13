
/**
 * Unit/integration tests for SIWE verify endpoint.
 *
 * Covers:
 * - Nonce issuance: TTL and single-use consumption
 * - Verify success paths: existing user vs new user signup
 * - Failure modes: invalid nonce, invalid domain, invalid signature, expired message
 */

import { NextRequest } from "next/server";

// --- Mocks ---

const mockCacheIsAvailable = jest.fn().mockReturnValue(true);
const mockCacheGet = jest.fn();
const mockCacheDel = jest.fn();
const mockCacheSet = jest.fn();

jest.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: () => mockCacheIsAvailable(),
    get: (...args: unknown[]) => mockCacheGet(...args),
    del: (...args: unknown[]) => mockCacheDel(...args),
    set: (...args: unknown[]) => mockCacheSet(...args),
  },
  redis: {
    del: (...args: unknown[]) => mockCacheDel(...args),
  },
}));

const mockAtomicConsume = jest.fn();
jest.mock("@/lib/cache/consume", () => ({
  atomicConsume: (...args: unknown[]) => mockAtomicConsume(...args),
}));

jest.mock("@/lib/cache/keys", () => ({
  CacheKeys: {
    siwe: {
      nonce: (n: string) => `siwe:nonce:${n}`,
    },
  },
}));

const mockGetByWalletAddressWithOrganization = jest.fn();
const mockUserUpdate = jest.fn();
const mockUserCreate = jest.fn();
jest.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: (...args: unknown[]) =>
      mockGetByWalletAddressWithOrganization(...args),
    update: (...args: unknown[]) => mockUserUpdate(...args),
    create: (...args: unknown[]) => mockUserCreate(...args),
  },
}));

const mockListByOrganization = jest.fn().mockResolvedValue([]);
const mockApiKeyCreate = jest.fn().mockResolvedValue({ plainKey: "test-api-key-123" });
jest.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: (...args: unknown[]) => mockListByOrganization(...args),
    create: (...args: unknown[]) => mockApiKeyCreate(...args),
  },
}));

const mockOrgCreate = jest.fn();
const mockOrgGetBySlug = jest.fn().mockResolvedValue(null);
const mockOrgDelete = jest.fn();
jest.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    create: (...args: unknown[]) => mockOrgCreate(...args),
    getBySlug: (...args: unknown[]) => mockOrgGetBySlug(...args),
    delete: (...args: unknown[]) => mockOrgDelete(...args),
  },
}));

const mockAddCredits = jest.fn();
jest.mock("@/lib/services/credits", () => ({
  creditsService: {
    addCredits: (...args: unknown[]) => mockAddCredits(...args),
  },
}));

const mockCheckSignupAbuse = jest.fn().mockResolvedValue({ allowed: true });
const mockRecordSignupMetadata = jest.fn();
jest.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: {
    checkSignupAbuse: (...args: unknown[]) => mockCheckSignupAbuse(...args),
    recordSignupMetadata: (...args: unknown[]) => mockRecordSignupMetadata(...args),
  },
}));

jest.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: () => "https://example.com/avatar.png",
}));

jest.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: (addr: string) => `wallet-${addr.slice(0, 8).toLowerCase()}`,
  getInitialCredits: () => 100,
}));

jest.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

jest.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

// Mock viem functions
const TEST_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const TEST_ADDRESS_LOWER = TEST_ADDRESS.toLowerCase();

jest.mock("viem/siwe", () => ({
  parseSiweMessage: (msg: string) => {
    if (msg.includes("missing-fields")) {
      return {};
    }
    if (msg.includes("bad-domain")) {
      return {
        address: TEST_ADDRESS,
        nonce: "test-nonce-123",
        domain: "evil.example.com",
      };
    }
    if (msg.includes("expired")) {
      return {
        address: TEST_ADDRESS,
        nonce: "test-nonce-123",
        domain: "app.example.com",
        expirationTime: new Date("2020-01-01"),
      };
    }
    return {
      address: TEST_ADDRESS,
      nonce: "test-nonce-123",
      domain: "app.example.com",
    };
  },
}));

jest.mock("viem", () => ({
  recoverMessageAddress: jest.fn().mockResolvedValue(TEST_ADDRESS),
  getAddress: (addr: string) => addr,
}));

// --- Helpers ---

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("https://app.example.com/api/auth/siwe/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- Import handler after mocks ---
let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  const mod = await import("../verify/route");
  POST = mod.POST as unknown as (req: NextRequest) => Promise<Response>;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCacheIsAvailable.mockReturnValue(true);
  mockAtomicConsume.mockResolvedValue(1);
  mockGetByWalletAddressWithOrganization.mockResolvedValue(null);
  mockCheckSignupAbuse.mockResolvedValue({ allowed: true });
  mockOrgGetBySlug.mockResolvedValue(null);
  mockOrgCreate.mockResolvedValue({
    id: "org-1",
    name: "Test Org",
    slug: "test-org",
    credit_balance: "0.00",
    is_active: true,
  });
  mockAddCredits.mockResolvedValue(undefined);
  mockUserCreate.mockResolvedValue({
    id: "user-1",
    wallet_address: TEST_ADDRESS_LOWER,
    wallet_verified: true,
    organization_id: "org-1",
    name: "0xd8dA...6045",
    is_active: true,
    role: "owner",
  });
  mockApiKeyCreate.mockResolvedValue({ plainKey: "test-api-key-123" });
  mockListByOrganization.mockResolvedValue([]);
});

// --- Tests ---

describe("SIWE Verify Endpoint", () => {
  describe("Request validation", () => {
    it("returns 400 for missing message field", async () => {
      const res = await POST(makeRequest({ signature: "0xabc" }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_BODY");
    });

    it("returns 400 for missing signature field", async () => {
      const res = await POST(makeRequest({ message: "valid message" }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_BODY");
    });

    it("returns 400 for empty message string", async () => {
      const res = await POST(makeRequest({ message: "  ", signature: "0xabc" }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_BODY");
    });

    it("returns 400 when SIWE message missing required fields", async () => {
      const res = await POST(
        makeRequest({ message: "missing-fields", signature: "0xabc" }),
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_BODY");
    });
  });

  describe("Nonce validation", () => {
    it("returns 503 when cache is unavailable", async () => {
      mockCacheIsAvailable.mockReturnValue(false);
      const res = await POST(
        makeRequest({ message: "valid SIWE message", signature: "0xabc" }),
      );
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("returns 400 for expired or already-used nonce (atomicConsume returns 0)", async () => {
      mockAtomicConsume.mockResolvedValue(0);
      const res = await POST(
        makeRequest({ message: "valid SIWE message", signature: "0xabc" }),
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_NONCE");
    });

    it("consumes nonce atomically via single DEL (single-use enforcement)", async () => {
      mockAtomicConsume.mockResolvedValue(1);
      mockGetByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-1",
        wallet_address: TEST_ADDRESS_LOWER,
        is_active: true,
        organization_id: "org-1",
        wallet_verified: true,
        organization: { is_active: true, name: "Test", credit_balance: "100" },
      });
      mockListByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "existing-key" },
      ]);

      const res = await POST(
        makeRequest({ message: "valid SIWE message", signature: "0xabc" }),
      );
      expect(res.status).toBe(200);
      expect(mockAtomicConsume).toHaveBeenCalledWith("siwe:nonce:test-nonce-123");
      expect(mockAtomicConsume).toHaveBeenCalledTimes(1);
    });
  });

  describe("Domain validation", () => {
    it("returns 400 when SIWE message domain does not match server", async () => {
      const res = await POST(
        makeRequest({ message: "bad-domain SIWE message", signature: "0xabc" }),
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_DOMAIN");
    });
  });

  describe("Message expiration", () => {
    it("returns 400 when SIWE message is expired", async () => {
      const res = await POST(
        makeRequest({ message: "expired SIWE message", signature: "0xabc" }),
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("MESSAGE_EXPIRED");
    });
  });

  describe("Signature verification", () => {
    it("returns 400 when signature recovery fails", async () => {
      const { recoverMessageAddress } = require("viem");
      recoverMessageAddress.mockRejectedValueOnce(new Error("invalid sig"));
      const res = await POST(
        makeRequest({ message: "valid SIWE message", signature: "0xbad" }),
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_SIGNATURE");
    });

    it("returns 400 when recovered address does not match claimed address", async () => {
      const { recoverMessageAddress, getAddress } = require("viem");
      recoverMessageAddress.mockResolvedValueOnce("0xDEADBEEF");
      getAddress.mockImplementation((a: string) => a.toLowerCase());
      const res = await POST(
        makeRequest({ message: "valid SIWE message", signature: "0xabc" }),
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_SIGNATURE");
      // Restore getAddress
      getAddress.mockImplementation((a: string) => a);
    });
  });

  describe("Existing user sign-in", () => {
    it("returns existing user with API key and isNewAccount=false", async () => {
      mockGetByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-1",
        wallet_address: TEST_ADDRESS_LOWER,
        is_active: true,
        organization_id: "org-1",
        wallet_verified: true,
        organization: {
          is_active: true,
          name: "Test Org",
          credit_balance: "500",
        },
      });
      mockListByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "existing-key-456" },
      ]);

      const res = await POST(
        makeRequest({ message: "valid SIWE message", signature: "0xabc" }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.isNewAccount).toBe(false);
      expect(json.apiKey).toBe("existing-key-456");
    });

    it("returns 403 for inactive account", async () => {
      mockGetByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-1",
        wallet_address: TEST_ADDRESS_LOWER,
        is_active: false,
        organization_id: "org-1",
        organization: { is_active: true },
      });

      const res = await POST(
        makeRequest({ message: "valid SIWE message", signature: "0xabc" }),
      );
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("ACCOUNT_INACTIVE");
    });

    it("returns 403 for inactive organization", async () => {
      mockGetByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-1",
        wallet_address: TEST_ADDRESS_LOWER,
        is_active: true,
        organization_id: "org-1",
        organization: { is_active: false },
      });

      const res = await POST(
        makeRequest({ message: "valid SIWE message", signature: "0xabc" }),
      );
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("ACCOUNT_INACTIVE");
    });

    it("marks wallet as verified on first SIWE auth for Privy users", async () => {
      mockGetByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-1",
        wallet_address: TEST_ADDRESS_LOWER,
        is_active: true,
        organization_id: "org-1",
        wallet_verified: false,
        organization: { is_active: true, name: "Test", credit_balance: "0" },
      });
      mockListByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "key-1" },
      ]);

      const res = await POST(
        makeRequest({ message: "valid SIWE message", signature: "0xabc" }),
      );
      expect(res.status).toBe(200);
      expect(mockUserUpdate).toHaveBeenCalledWith("user-1", {
        wallet_verified: true,
      });
    });
  });

  describe("New user sign-up", () => {
    it("creates org, credits, user, API key and returns isNewAccount=true", async () => {
      const res = await POST(
        makeRequest({ message: "valid SIWE message", signature: "0xabc" }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.isNewAccount).toBe(true);
      expect(json.apiKey).toBe("test-api-key-123");
      expect(mockOrgCreate).toHaveBeenCalledTimes(1);
      expect(mockAddCredits).toHaveBeenCalledTimes(1);
      expect(mockUserCreate).toHaveBeenCalledTimes(1);
      expect(mockApiKeyCreate).toHaveBeenCalledTimes(1);
    });

    it("returns 403 when abuse detection blocks signup", async () => {
      mockCheckSignupAbuse.mockResolvedValue({
        allowed: false,
        reason: "Too many signups",
      });
      const res = await POST(
        makeRequest({ message: "valid SIWE message", signature: "0xabc" }),
      );
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("SIGNUP_BLOCKED");
    });

    it("cleans up org when credit granting fails", async () => {
      mockAddCredits.mockRejectedValue(new Error("credits service down"));

      await expect(
        POST(makeRequest({ message: "valid SIWE message", signature: "0xabc" })),
      ).rejects.toThrow("credits service down");

      expect(mockOrgDelete).toHaveBeenCalledWith("org-1");
      expect(mockUserCreate).not.toHaveBeenCalled();
    });

    it("cleans up org when user creation fails (non-duplicate)", async () => {
      mockUserCreate.mockRejectedValue(new Error("DB connection lost"));

      await expect(
        POST(makeRequest({ message: "valid SIWE message", signature: "0xabc" })),
      ).rejects.toThrow("DB connection lost");

      expect(mockOrgDelete).toHaveBeenCalledWith("org-1");
    });

    it("cleans up org when API key creation fails", async () => {
      mockApiKeyCreate.mockRejectedValue(new Error("API key service error"));

      await expect(
        POST(makeRequest({ message: "valid SIWE message", signature: "0xabc" })),
      ).rejects.toThrow("API key service error");

      expect(mockOrgDelete).toHaveBeenCalledWith("org-1");
    });
  });

  describe("Race condition handling (23505 duplicate key)", () => {
    it("recovers race-winning user on duplicate wallet_address", async () => {
      const duplicateError = Object.assign(new Error("duplicate"), {
        code: "23505",
      });
      mockUserCreate.mockRejectedValue(duplicateError);
      mockGetByWalletAddressWithOrganization
        .mockResolvedValueOnce(null) // first call (existing user check)
        .mockResolvedValueOnce({
          // retry after 23505
          id: "user-winner",
          wallet_address: TEST_ADDRESS_LOWER,
          is_active: true,
          organization_id: "org-winner",
          wallet_verified: true,
          organization: {
            is_active: true,
            name: "Winner Org",
            credit_balance: "100",
          },
        });
      mockListByOrganization.mockResolvedValue([
        { user_id: "user-winner", is_active: true, key: "winner-key" },
      ]);

      const res = await POST(
        makeRequest({ message: "valid SIWE message", signature: "0xabc" }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.isNewAccount).toBe(false);
      expect(json.apiKey).toBe("winner-key");
      // Orphaned org should have been cleaned up
      expect(mockOrgDelete).toHaveBeenCalledWith("org-1");
    });

    it("returns 403 when race-winning user is inactive", async () => {
      const duplicateError = Object.assign(new Error("duplicate"), {
        code: "23505",
      });
      mockUserCreate.mockRejectedValue(duplicateError);
      mockGetByWalletAddressWithOrganization
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: "user-winner",
          wallet_address: TEST_ADDRESS_LOWER,
          is_active: false,
          organization_id: "org-winner",
          organization: { is_active: true },
        });

      const res = await POST(
        makeRequest({ message: "valid SIWE message", signature: "0xabc" }),
      );
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("ACCOUNT_INACTIVE");
    });
  });
});
