
/**
 * Tests for SIWE verify endpoint
 *
 * Covers nonce validation, domain/signature checks, existing vs new user paths,
 * and key failure modes.
 */

import { NextRequest } from "next/server";

// --- Mocks (must be defined before imports) ---

const mockCacheIsAvailable = jest.fn().mockReturnValue(true);
const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
const mockAtomicConsume = jest.fn();

jest.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: mockCacheIsAvailable,
    get: mockCacheGet,
    set: mockCacheSet,
    getRedisClient: jest.fn(),
  },
}));

jest.mock("@/lib/cache/consume", () => ({
  atomicConsume: mockAtomicConsume,
}));

const mockParseSiweMessage = jest.fn();
jest.mock("viem/siwe", () => ({
  parseSiweMessage: (...args: unknown[]) => mockParseSiweMessage(...args),
}));

const mockRecoverMessageAddress = jest.fn();
const mockGetAddress = jest.fn((addr: string) => addr);
jest.mock("viem", () => ({
  recoverMessageAddress: (...args: unknown[]) => mockRecoverMessageAddress(...args),
  getAddress: (addr: string) => mockGetAddress(addr),
}));

jest.mock("@/lib/cache/keys", () => ({
  CacheKeys: { siwe: { nonce: (n: string) => `siwe:nonce:${n}` } },
  CacheTTL: { siwe: { nonce: 300 } },
}));

const mockGetByWallet = jest.fn();
const mockUsersCreate = jest.fn();
const mockUsersUpdate = jest.fn();
jest.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: (...args: unknown[]) => mockGetByWallet(...args),
    create: (...args: unknown[]) => mockUsersCreate(...args),
    update: (...args: unknown[]) => mockUsersUpdate(...args),
  },
}));

const mockApiKeysCreate = jest.fn();
const mockApiKeysList = jest.fn();
jest.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    create: (...args: unknown[]) => mockApiKeysCreate(...args),
    listByOrganization: (...args: unknown[]) => mockApiKeysList(...args),
  },
}));

const mockOrgCreate = jest.fn();
const mockOrgGetBySlug = jest.fn();
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
  generateSlugFromWallet: () => "wallet-abc123-test",
  getInitialCredits: () => 5.0,
}));

jest.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

jest.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

// --- Helpers ---

const VALID_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const VALID_NONCE = "abc123nonce";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("https://app.example.com/api/auth/siwe/verify", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function setupValidSiweMessage() {
  mockParseSiweMessage.mockReturnValue({
    address: VALID_ADDRESS,
    nonce: VALID_NONCE,
    domain: "app.example.com",
    uri: "https://app.example.com",
    version: "1",
    chainId: 1,
  });
  mockRecoverMessageAddress.mockResolvedValue(VALID_ADDRESS);
  mockGetAddress.mockImplementation((addr: string) => addr);
  mockAtomicConsume.mockResolvedValue(1);
}

// --- Tests ---

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
  });

  describe("input validation", () => {
    it("returns 400 for missing message field", async () => {
      const { POST } = await import("../verify/route");
      const req = makeRequest({ signature: "0xabc" });
      const res = await POST(req);
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_BODY");
    });

    it("returns 400 for missing signature field", async () => {
      const { POST } = await import("../verify/route");
      const req = makeRequest({ message: "some message" });
      const res = await POST(req);
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_BODY");
    });

    it("returns 400 for empty message", async () => {
      const { POST } = await import("../verify/route");
      const req = makeRequest({ message: "  ", signature: "0xabc" });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 for malformed SIWE message", async () => {
      mockParseSiweMessage.mockImplementation(() => {
        throw new Error("Invalid SIWE message");
      });
      const { POST } = await import("../verify/route");
      const req = makeRequest({ message: "not-siwe", signature: "0xabc" });
      const res = await POST(req);
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_BODY");
    });
  });

  describe("nonce validation", () => {
    it("returns 503 when cache is unavailable", async () => {
      mockCacheIsAvailable.mockReturnValue(false);
      mockParseSiweMessage.mockReturnValue({
        address: VALID_ADDRESS,
        nonce: VALID_NONCE,
        domain: "app.example.com",
        uri: "https://app.example.com",
        version: "1",
        chainId: 1,
      });

      const { POST } = await import("../verify/route");
      const req = makeRequest({ message: "valid", signature: "0xabc" });
      const res = await POST(req);
      const json = await res.json();
      expect(res.status).toBe(503);
      expect(json.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("returns 400 when nonce was already consumed (deleteCount=0)", async () => {
      setupValidSiweMessage();
      mockAtomicConsume.mockResolvedValue(0);

      const { POST } = await import("../verify/route");
      const req = makeRequest({ message: "valid", signature: "0xabc" });
      const res = await POST(req);
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_NONCE");
    });

    it("returns 503 when atomicConsume throws", async () => {
      mockParseSiweMessage.mockReturnValue({
        address: VALID_ADDRESS,
        nonce: VALID_NONCE,
        domain: "app.example.com",
        uri: "https://app.example.com",
        version: "1",
        chainId: 1,
      });
      mockAtomicConsume.mockRejectedValue(new Error("Redis connection failed"));

      const { POST } = await import("../verify/route");
      const req = makeRequest({ message: "valid", signature: "0xabc" });
      const res = await POST(req);
      const json = await res.json();
      expect(res.status).toBe(503);
      expect(json.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  describe("domain validation", () => {
    it("returns 400 when domain does not match", async () => {
      mockParseSiweMessage.mockReturnValue({
        address: VALID_ADDRESS,
        nonce: VALID_NONCE,
        domain: "evil.example.com",
        uri: "https://evil.example.com",
        version: "1",
        chainId: 1,
      });
      mockAtomicConsume.mockResolvedValue(1);

      const { POST } = await import("../verify/route");
      const req = makeRequest({ message: "valid", signature: "0xabc" });
      const res = await POST(req);
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_DOMAIN");
    });
  });

  describe("signature validation", () => {
    it("returns 400 when signature recovery fails", async () => {
      setupValidSiweMessage();
      mockRecoverMessageAddress.mockRejectedValue(new Error("bad sig"));

      const { POST } = await import("../verify/route");
      const req = makeRequest({ message: "valid", signature: "0xbad" });
      const res = await POST(req);
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_SIGNATURE");
    });

    it("returns 400 when recovered address does not match claimed address", async () => {
      setupValidSiweMessage();
      mockRecoverMessageAddress.mockResolvedValue("0xDIFFERENTADDRESS");
      mockGetAddress.mockImplementation((addr: string) => addr.toUpperCase());

      const { POST } = await import("../verify/route");
      const req = makeRequest({ message: "valid", signature: "0xabc" });
      const res = await POST(req);
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_SIGNATURE");
    });
  });

  describe("existing user path", () => {
    it("returns existing user with API key and isNewAccount=false", async () => {
      setupValidSiweMessage();

      const existingUser = {
        id: "user-1",
        name: "Test",
        is_active: true,
        wallet_verified: true,
        privy_user_id: null,
        organization_id: "org-1",
        organization: { id: "org-1", name: "Test Org", is_active: true, credit_balance: "5.00" },
      };
      mockGetByWallet.mockResolvedValue(existingUser);
      mockApiKeysList.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "existing-key-123" },
      ]);

      const { POST } = await import("../verify/route");
      const req = makeRequest({ message: "valid", signature: "0xabc" });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.isNewAccount).toBe(false);
      expect(json.apiKey).toBe("existing-key-123");
      expect(json.user.id).toBe("user-1");
    });

    it("returns 403 for inactive user", async () => {
      setupValidSiweMessage();

      mockGetByWallet.mockResolvedValue({
        id: "user-1",
        is_active: false,
        organization_id: "org-1",
        organization: { id: "org-1", is_active: true },
      });

      const { POST } = await import("../verify/route");
      const req = makeRequest({ message: "valid", signature: "0xabc" });
      const res = await POST(req);
      const json = await res.json();
      expect(res.status).toBe(403);
      expect(json.error).toBe("ACCOUNT_INACTIVE");
    });

    it("returns 403 for inactive organization", async () => {
      setupValidSiweMessage();

      mockGetByWallet.mockResolvedValue({
        id: "user-1",
        is_active: true,
        organization_id: "org-1",
        organization: { id: "org-1", is_active: false },
      });

      const { POST } = await import("../verify/route");
      const req = makeRequest({ message: "valid", signature: "0xabc" });
      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("marks wallet as verified for unverified existing user", async () => {
      setupValidSiweMessage();

      const existingUser = {
        id: "user-1",
        is_active: true,
        wallet_verified: false,
        privy_user_id: "privy-123",
        organization_id: "org-1",
        organization: { id: "org-1", name: "Org", is_active: true, credit_balance: "5.00" },
      };
      mockGetByWallet.mockResolvedValue(existingUser);
      mockApiKeysList.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "key-123" },
      ]);

      const { POST } = await import("../verify/route");
      const req = makeRequest({ message: "valid", signature: "0xabc" });
      await POST(req);

      expect(mockUsersUpdate).toHaveBeenCalledWith("user-1", { wallet_verified: true });
    });
  });

  describe("new user signup path", () => {
    it("creates org, credits, user, API key and returns isNewAccount=true", async () => {
      setupValidSiweMessage();
      mockGetByWallet.mockResolvedValue(undefined);
      mockOrgGetBySlug.mockResolvedValue(undefined);

      const createdOrg = { id: "org-new", name: "Test Org", slug: "wallet-abc123-test", credit_balance: "0.00", is_active: true };
      mockOrgCreate.mockResolvedValue(createdOrg);

      const createdUser = {
        id: "user-new",
        name: "0x1234...5678",
        wallet_address: VALID_ADDRESS.toLowerCase(),
        organization_id: "org-new",
        is_active: true,
      };
      mockUsersCreate.mockResolvedValue(createdUser);
      mockApiKeysCreate.mockResolvedValue({ plainKey: "new-api-key-456" });

      const { POST } = await import("../verify/route");
      const req = makeRequest({ message: "valid", signature: "0xabc" });
      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.isNewAccount).toBe(true);
      expect(json.apiKey).toBe("new-api-key-456");
      expect(mockOrgCreate).toHaveBeenCalled();
      expect(mockAddCredits).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org-new",
          amount: 5.0,
        }),
      );
      expect(mockUsersCreate).toHaveBeenCalled();
    });

    it("returns 403 when abuse detection blocks signup", async () => {
      setupValidSiweMessage();
      mockGetByWallet.mockResolvedValue(undefined);
      mockCheckSignupAbuse.mockResolvedValue({ allowed: false, reason: "Too many signups" });

      const { POST } = await import("../verify/route");
      const req = makeRequest({ message: "valid", signature: "0xabc" });
      const res = await POST(req);
      const json = await res.json();
      expect(res.status).toBe(403);
      expect(json.error).toBe("SIGNUP_BLOCKED");
    });

    it("cleans up org on user creation failure", async () => {
      setupValidSiweMessage();
      mockGetByWallet.mockResolvedValue(undefined);
      mockOrgGetBySlug.mockResolvedValue(undefined);
      mockCheckSignupAbuse.mockResolvedValue({ allowed: true });

      const createdOrg = { id: "org-cleanup", name: "Test", slug: "test" };
      mockOrgCreate.mockResolvedValue(createdOrg);
      mockUsersCreate.mockRejectedValue(new Error("DB error"));

      const { POST } = await import("../verify/route");
      const req = makeRequest({ message: "valid", signature: "0xabc" });

      await expect(POST(req)).rejects.toThrow("DB error");
      expect(mockOrgDelete).toHaveBeenCalledWith("org-cleanup");
    });

    it("continues user creation when credits fail", async () => {
      setupValidSiweMessage();
      mockGetByWallet.mockResolvedValue(undefined);
      mockOrgGetBySlug.mockResolvedValue(undefined);
      mockCheckSignupAbuse.mockResolvedValue({ allowed: true });

      const createdOrg = { id: "org-credits-fail", name: "Test", slug: "test", credit_balance: "0.00", is_active: true };
      mockOrgCreate.mockResolvedValue(createdOrg);
      mockAddCredits.mockRejectedValue(new Error("Credits service down"));

      const createdUser = { id: "user-new", name: "Test", organization_id: "org-credits-fail", is_active: true };
      mockUsersCreate.mockResolvedValue(createdUser);
      mockApiKeysCreate.mockResolvedValue({ plainKey: "key-123" });

      const { POST } = await import("../verify/route");
      const req = makeRequest({ message: "valid", signature: "0xabc" });
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(mockUsersCreate).toHaveBeenCalled();
    });
  });
});
