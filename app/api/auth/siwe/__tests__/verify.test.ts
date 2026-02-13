
/**
 * Tests for SIWE verify endpoint
 *
 * Covers:
 * - Nonce issuance: TTL enforcement, single-use validation
 * - Verify success paths: existing user login, new user signup
 * - Failure modes: invalid nonce, domain mismatch, invalid signature, expired message
 * - Redis unavailability
 */

import { NextRequest } from "next/server";

// ---- Mocks ----

const mockCacheIsAvailable = jest.fn().mockReturnValue(true);
const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
jest.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: () => mockCacheIsAvailable(),
    get: (...args: unknown[]) => mockCacheGet(...args),
    set: (...args: unknown[]) => mockCacheSet(...args),
  },
}));

const mockAtomicConsume = jest.fn();
jest.mock("@/lib/cache/consume", () => ({
  atomicConsume: (...args: unknown[]) => mockAtomicConsume(...args),
}));

jest.mock("@/lib/cache/keys", () => ({
  CacheKeys: {
    siwe: { nonce: (n: string) => `siwe:nonce:${n}` },
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

const mockListByOrganization = jest.fn();
const mockApiKeyCreate = jest.fn();
jest.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: (...args: unknown[]) => mockListByOrganization(...args),
    create: (...args: unknown[]) => mockApiKeyCreate(...args),
  },
}));

const mockOrgCreate = jest.fn();
const mockOrgGetBySlug = jest.fn();
jest.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    create: (...args: unknown[]) => mockOrgCreate(...args),
    getBySlug: (...args: unknown[]) => mockOrgGetBySlug(...args),
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
  getRandomUserAvatar: () => "avatar-url",
}));

jest.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: (addr: string) => `slug-${addr.slice(0, 8)}`,
  getInitialCredits: () => 100,
}));

const mockGetAppUrl = jest.fn().mockReturnValue("https://app.example.com");
jest.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => mockGetAppUrl(),
}));

const mockDbTransaction = jest.fn();
jest.mock("@/lib/db", () => ({
  db: {
    transaction: (fn: (tx: unknown) => Promise<unknown>) => mockDbTransaction(fn),
  },
}));

// Mock viem functions
const mockRecoverMessageAddress = jest.fn();
jest.mock("viem", () => ({
  recoverMessageAddress: (...args: unknown[]) => mockRecoverMessageAddress(...args),
  getAddress: (addr: string) => addr, // simplified: return as-is
}));

const mockParseSiweMessage = jest.fn();
jest.mock("viem/siwe", () => ({
  parseSiweMessage: (...args: unknown[]) => mockParseSiweMessage(...args),
}));

// Mock rate limit to pass through
jest.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

// ---- Import handler after mocks ----
import { POST } from "../verify/route";

// ---- Helpers ----

const VALID_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const VALID_NONCE = "abc123nonce";
const VALID_DOMAIN = "app.example.com";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("https://app.example.com/api/auth/siwe/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupValidParse() {
  mockParseSiweMessage.mockReturnValue({
    address: VALID_ADDRESS,
    nonce: VALID_NONCE,
    domain: VALID_DOMAIN,
  });
}

function setupValidSignature() {
  mockRecoverMessageAddress.mockResolvedValue(VALID_ADDRESS);
}

function makeExistingUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    name: "0x1234...5678",
    wallet_address: VALID_ADDRESS.toLowerCase(),
    wallet_verified: true,
    is_active: true,
    organization_id: "org-1",
    privy_user_id: null,
    organization: {
      id: "org-1",
      name: "Test Org",
      is_active: true,
      credit_balance: "100.00",
    },
    ...overrides,
  };
}

// ---- Tests ----

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockGetAppUrl.mockReturnValue("https://app.example.com");
  });

  // --- Input validation ---

  describe("input validation", () => {
    it("returns 400 for missing message", async () => {
      const req = makeRequest({ signature: "0xabc" });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_BODY");
    });

    it("returns 400 for missing signature", async () => {
      const req = makeRequest({ message: "some message" });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_BODY");
    });

    it("returns 400 for empty message string", async () => {
      const req = makeRequest({ message: "  ", signature: "0xabc" });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 when SIWE message is missing required fields", async () => {
      mockParseSiweMessage.mockReturnValue({ address: null, nonce: null, domain: null });
      const req = makeRequest({ message: "bad message", signature: "0xabc" });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_BODY");
    });
  });

  // --- Nonce validation ---

  describe("nonce validation", () => {
    it("returns 503 when cache/Redis is unavailable", async () => {
      setupValidParse();
      mockCacheIsAvailable.mockReturnValue(false);

      const req = makeRequest({ message: "msg", signature: "0xsig" });
      const res = await POST(req);
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("returns 400 for expired/already-used nonce (single-use enforcement)", async () => {
      setupValidParse();
      // atomicConsume returns 0 => nonce was already consumed or expired
      mockAtomicConsume.mockResolvedValue(0);

      const req = makeRequest({ message: "msg", signature: "0xsig" });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_NONCE");
    });

    it("consumes nonce atomically to prevent replay", async () => {
      setupValidParse();
      setupValidSignature();
      mockAtomicConsume.mockResolvedValue(1);

      const user = makeExistingUser();
      mockGetByWalletAddressWithOrganization.mockResolvedValue(user);
      mockListByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "ak_test123" },
      ]);

      const req = makeRequest({ message: "msg", signature: "0xsig" });
      await POST(req);

      expect(mockAtomicConsume).toHaveBeenCalledWith(`siwe:nonce:${VALID_NONCE}`);
      expect(mockAtomicConsume).toHaveBeenCalledTimes(1);
    });
  });

  // --- Domain validation ---

  describe("domain validation", () => {
    it("returns 400 when SIWE message domain does not match server", async () => {
      mockParseSiweMessage.mockReturnValue({
        address: VALID_ADDRESS,
        nonce: VALID_NONCE,
        domain: "evil.example.com",
      });
      mockAtomicConsume.mockResolvedValue(1);

      const req = makeRequest({ message: "msg", signature: "0xsig" });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_DOMAIN");
    });
  });

  // --- Signature validation ---

  describe("signature validation", () => {
    it("returns 400 when signature recovery throws", async () => {
      setupValidParse();
      mockAtomicConsume.mockResolvedValue(1);
      mockRecoverMessageAddress.mockRejectedValue(new Error("bad sig"));

      const req = makeRequest({ message: "msg", signature: "0xbadsig" });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_SIGNATURE");
    });

    it("returns 400 when recovered address does not match claimed address", async () => {
      setupValidParse();
      mockAtomicConsume.mockResolvedValue(1);
      mockRecoverMessageAddress.mockResolvedValue("0xDIFFERENTADDRESS000000000000000000000000");

      const req = makeRequest({ message: "msg", signature: "0xsig" });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_SIGNATURE");
    });
  });

  // --- Message expiration ---

  describe("message expiration", () => {
    it("returns 400 when SIWE message has expired", async () => {
      const pastDate = new Date(Date.now() - 60_000);
      mockParseSiweMessage.mockReturnValue({
        address: VALID_ADDRESS,
        nonce: VALID_NONCE,
        domain: VALID_DOMAIN,
        expirationTime: pastDate,
      });
      mockAtomicConsume.mockResolvedValue(1);

      const req = makeRequest({ message: "msg", signature: "0xsig" });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("MESSAGE_EXPIRED");
    });
  });

  // --- Existing user (sign-in) path ---

  describe("existing user sign-in", () => {
    beforeEach(() => {
      setupValidParse();
      setupValidSignature();
      mockAtomicConsume.mockResolvedValue(1);
    });

    it("returns existing user with isNewAccount=false", async () => {
      const user = makeExistingUser();
      mockGetByWalletAddressWithOrganization.mockResolvedValue(user);
      mockListByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "ak_existing" },
      ]);

      const req = makeRequest({ message: "msg", signature: "0xsig" });
      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.isNewAccount).toBe(false);
      expect(json.apiKey).toBe("ak_existing");
      expect(json.user.id).toBe("user-1");
    });

    it("marks wallet as verified if not already verified", async () => {
      const user = makeExistingUser({ wallet_verified: false });
      mockGetByWalletAddressWithOrganization.mockResolvedValue(user);
      mockListByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "ak_existing" },
      ]);

      const req = makeRequest({ message: "msg", signature: "0xsig" });
      await POST(req);

      expect(mockUserUpdate).toHaveBeenCalledWith("user-1", { wallet_verified: true });
    });

    it("does not re-verify if wallet already verified", async () => {
      const user = makeExistingUser({ wallet_verified: true });
      mockGetByWalletAddressWithOrganization.mockResolvedValue(user);
      mockListByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "ak_existing" },
      ]);

      const req = makeRequest({ message: "msg", signature: "0xsig" });
      await POST(req);

      expect(mockUserUpdate).not.toHaveBeenCalled();
    });

    it("returns 403 for inactive account", async () => {
      const user = makeExistingUser({ is_active: false });
      mockGetByWalletAddressWithOrganization.mockResolvedValue(user);

      const req = makeRequest({ message: "msg", signature: "0xsig" });
      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("ACCOUNT_INACTIVE");
    });

    it("returns 403 for inactive organization", async () => {
      const user = makeExistingUser({
        organization: { id: "org-1", name: "Org", is_active: false, credit_balance: "0" },
      });
      mockGetByWalletAddressWithOrganization.mockResolvedValue(user);

      const req = makeRequest({ message: "msg", signature: "0xsig" });
      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("ACCOUNT_INACTIVE");
    });

    it("creates a new API key if no active key exists", async () => {
      const user = makeExistingUser();
      mockGetByWalletAddressWithOrganization.mockResolvedValue(user);
      mockListByOrganization.mockResolvedValue([]); // no existing keys
      mockApiKeyCreate.mockResolvedValue({ plainKey: "ak_newkey" });

      const req = makeRequest({ message: "msg", signature: "0xsig" });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.apiKey).toBe("ak_newkey");
    });
  });

  // --- New user (sign-up) path ---

  describe("new user sign-up", () => {
    beforeEach(() => {
      setupValidParse();
      setupValidSignature();
      mockAtomicConsume.mockResolvedValue(1);
      mockGetByWalletAddressWithOrganization.mockResolvedValue(undefined);
      mockCheckSignupAbuse.mockResolvedValue({ allowed: true });
    });

    it("creates new user and returns isNewAccount=true", async () => {
      const newOrg = { id: "org-new", name: "New Org", is_active: true, credit_balance: "100.00" };
      const newUser = {
        id: "user-new",
        name: "0x1234...5678",
        wallet_address: VALID_ADDRESS.toLowerCase(),
        wallet_verified: true,
        is_active: true,
        organization_id: "org-new",
        organization: newOrg,
      };

      mockDbTransaction.mockImplementation(async (fn: Function) => {
        const tx = {};
        mockOrgGetBySlug.mockResolvedValue(null);
        mockOrgCreate.mockResolvedValue(newOrg);
        mockUserCreate.mockResolvedValue(newUser);
        mockApiKeyCreate.mockResolvedValue({ plainKey: "ak_brand_new" });
        return fn(tx);
      });

      const req = makeRequest({ message: "msg", signature: "0xsig" });
      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.isNewAccount).toBe(true);
      expect(json.apiKey).toBe("ak_brand_new");
    });

    it("returns 403 when abuse detection blocks signup", async () => {
      mockCheckSignupAbuse.mockResolvedValue({
        allowed: false,
        reason: "Too many signups from this IP.",
      });

      const req = makeRequest({ message: "msg", signature: "0xsig" });
      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("SIGNUP_BLOCKED");
    });

    it("handles duplicate key race condition (23505) gracefully", async () => {
      const dupError = new Error("duplicate key") as Error & { code: string };
      dupError.code = "23505";
      mockDbTransaction.mockRejectedValue(dupError);

      // After race, the winning user is found on retry
      const raceUser = makeExistingUser();
      mockGetByWalletAddressWithOrganization
        .mockResolvedValueOnce(undefined) // initial lookup
        .mockResolvedValueOnce(raceUser); // retry after race

      mockListByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "ak_race_winner" },
      ]);

      const req = makeRequest({ message: "msg", signature: "0xsig" });
      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.isNewAccount).toBe(false);
      expect(json.apiKey).toBe("ak_race_winner");
    });
  });

  // --- Signature prefix handling ---

  describe("signature prefix handling", () => {
    it("adds 0x prefix to signature if missing", async () => {
      setupValidParse();
      mockAtomicConsume.mockResolvedValue(1);
      setupValidSignature();

      const user = makeExistingUser();
      mockGetByWalletAddressWithOrganization.mockResolvedValue(user);
      mockListByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "ak_test" },
      ]);

      const req = makeRequest({ message: "msg", signature: "abcdef" }); // no 0x
      await POST(req);

      expect(mockRecoverMessageAddress).toHaveBeenCalledWith(
        expect.objectContaining({ signature: "0xabcdef" }),
      );
    });
  });
});
