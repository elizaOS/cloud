
/**
 * Tests for SIWE verify endpoint
 *
 * Covers:
 * - Nonce issuance (TTL/single-use)
 * - Verify success paths (existing vs new user)
 * - Key failure modes (invalid nonce, invalid domain, invalid signature)
 */

import { NextRequest } from "next/server";

// --- Mocks ---

const mockAtomicConsume = jest.fn();
jest.mock("@/lib/cache/consume", () => ({
  atomicConsume: (...args: unknown[]) => mockAtomicConsume(...args),
}));

const mockCacheIsAvailable = jest.fn().mockReturnValue(true);
jest.mock("@/lib/cache/client", () => ({
  cache: { isAvailable: () => mockCacheIsAvailable() },
}));

jest.mock("@/lib/cache/keys", () => ({
  CacheKeys: {
    siwe: { nonce: (n: string) => `siwe:nonce:${n}` },
  },
}));

const mockParseSiweMessage = jest.fn();
jest.mock("viem/siwe", () => ({
  parseSiweMessage: (...args: unknown[]) => mockParseSiweMessage(...args),
}));

const mockRecoverMessageAddress = jest.fn();
const mockGetAddress = jest.fn((a: string) => a);
jest.mock("viem", () => ({
  recoverMessageAddress: (...args: unknown[]) => mockRecoverMessageAddress(...args),
  getAddress: (a: string) => mockGetAddress(a),
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
  getRandomUserAvatar: () => "avatar-url",
}));

jest.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: () => "test-slug",
  getInitialCredits: () => 100,
}));

jest.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

jest.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (fn: unknown) => fn,
  RateLimitPresets: { STRICT: {} },
}));

// --- Import after mocks ---
import { handleVerify } from "../route";

// --- Helpers ---

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("https://app.example.com/api/auth/siwe/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const VALID_NONCE = "abc123nonce";
const VALID_DOMAIN = "app.example.com";
const VALID_MESSAGE = "app.example.com wants you to sign in...";
const VALID_SIGNATURE = "0xdeadbeef";

function setupValidParse(overrides: Record<string, unknown> = {}) {
  mockParseSiweMessage.mockReturnValue({
    address: VALID_ADDRESS,
    nonce: VALID_NONCE,
    domain: VALID_DOMAIN,
    ...overrides,
  });
}

function setupValidSignature() {
  mockRecoverMessageAddress.mockResolvedValue(VALID_ADDRESS);
  mockGetAddress.mockImplementation((a: string) => a);
}

// --- Tests ---

describe("SIWE verify endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockAtomicConsume.mockResolvedValue(1);
    mockCheckSignupAbuse.mockResolvedValue({ allowed: true });
  });

  describe("Nonce validation (TTL / single-use)", () => {
    it("rejects when cache/Redis is unavailable (nonce cannot be validated)", async () => {
      mockCacheIsAvailable.mockReturnValue(false);
      setupValidParse();

      const req = makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE });
      const res = await handleVerify(req);
      const json = await res.json();

      expect(res.status).toBe(503);
      expect(json.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("rejects an expired or already-used nonce (atomicConsume returns 0)", async () => {
      setupValidParse();
      mockAtomicConsume.mockResolvedValue(0);

      const req = makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE });
      const res = await handleVerify(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_NONCE");
    });

    it("consumes the nonce exactly once (single-use guarantee)", async () => {
      setupValidParse();
      setupValidSignature();
      mockAtomicConsume.mockResolvedValue(1);
      mockGetByWalletAddressWithOrganization.mockResolvedValue({
        id: "u1",
        is_active: true,
        organization_id: "org1",
        organization: { is_active: true, name: "Test", credit_balance: "10" },
        wallet_verified: true,
        name: "Test",
      });
      mockListByOrganization.mockResolvedValue([
        { user_id: "u1", is_active: true, key: "sk-existing" },
      ]);

      const req = makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE });
      await handleVerify(req);

      expect(mockAtomicConsume).toHaveBeenCalledTimes(1);
      expect(mockAtomicConsume).toHaveBeenCalledWith(`siwe:nonce:${VALID_NONCE}`);
    });
  });

  describe("Domain validation", () => {
    it("rejects when SIWE message domain does not match server domain", async () => {
      setupValidParse({ domain: "evil.com" });
      mockAtomicConsume.mockResolvedValue(1);

      const req = makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE });
      const res = await handleVerify(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_DOMAIN");
    });
  });

  describe("Signature validation", () => {
    it("rejects when ecrecover throws (malformed signature)", async () => {
      setupValidParse();
      mockAtomicConsume.mockResolvedValue(1);
      mockRecoverMessageAddress.mockRejectedValue(new Error("bad sig"));

      const req = makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE });
      const res = await handleVerify(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_SIGNATURE");
    });

    it("rejects when recovered address does not match claimed address", async () => {
      setupValidParse();
      mockAtomicConsume.mockResolvedValue(1);
      mockRecoverMessageAddress.mockResolvedValue("0xDIFFERENTADDRESS");
      mockGetAddress.mockImplementation((a: string) => a); // identity — addresses differ

      const req = makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE });
      const res = await handleVerify(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_SIGNATURE");
    });
  });

  describe("Verify success – existing user", () => {
    it("returns existing user with isNewAccount=false and their API key", async () => {
      setupValidParse();
      setupValidSignature();
      mockAtomicConsume.mockResolvedValue(1);

      const existingUser = {
        id: "u1",
        is_active: true,
        organization_id: "org1",
        organization: { is_active: true, name: "Org", credit_balance: "50.00" },
        wallet_verified: true,
        name: "0xd8dA...6045",
        privy_user_id: null,
      };
      mockGetByWalletAddressWithOrganization.mockResolvedValue(existingUser);
      mockListByOrganization.mockResolvedValue([
        { user_id: "u1", is_active: true, key: "sk-existing-key" },
      ]);

      const req = makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE });
      const res = await handleVerify(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.isNewAccount).toBe(false);
      expect(json.apiKey).toBe("sk-existing-key");
      expect(json.user.id).toBe("u1");
    });

    it("marks wallet_verified=true if not already verified", async () => {
      setupValidParse();
      setupValidSignature();
      mockAtomicConsume.mockResolvedValue(1);

      const existingUser = {
        id: "u2",
        is_active: true,
        organization_id: "org2",
        organization: { is_active: true, name: "Org", credit_balance: "0" },
        wallet_verified: false,
        name: "Test",
      };
      mockGetByWalletAddressWithOrganization.mockResolvedValue(existingUser);
      mockListByOrganization.mockResolvedValue([
        { user_id: "u2", is_active: true, key: "sk-key" },
      ]);

      const req = makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE });
      await handleVerify(req);

      expect(mockUserUpdate).toHaveBeenCalledWith("u2", { wallet_verified: true });
    });

    it("rejects inactive account", async () => {
      setupValidParse();
      setupValidSignature();
      mockAtomicConsume.mockResolvedValue(1);

      mockGetByWalletAddressWithOrganization.mockResolvedValue({
        id: "u3",
        is_active: false,
        organization_id: "org3",
        organization: { is_active: true },
        wallet_verified: true,
      });

      const req = makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE });
      const res = await handleVerify(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toBe("ACCOUNT_INACTIVE");
    });
  });

  describe("Verify success – new user (signup)", () => {
    beforeEach(() => {
      setupValidParse();
      setupValidSignature();
      mockAtomicConsume.mockResolvedValue(1);
      mockGetByWalletAddressWithOrganization.mockResolvedValue(undefined);
      mockOrgGetBySlug.mockResolvedValue(undefined);
      mockOrgCreate.mockResolvedValue({
        id: "new-org",
        name: "New Org",
        credit_balance: "0",
        is_active: true,
      });
      mockUserCreate.mockResolvedValue({
        id: "new-user",
        wallet_address: VALID_ADDRESS.toLowerCase(),
        organization_id: "new-org",
        name: "0xd8dA...6045",
        is_active: true,
        wallet_verified: true,
      });
      mockApiKeyCreate.mockResolvedValue({ plainKey: "sk-new-key" });
    });

    it("creates org, user, API key and returns isNewAccount=true", async () => {
      const req = makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE });
      const res = await handleVerify(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.isNewAccount).toBe(true);
      expect(json.apiKey).toBe("sk-new-key");
      expect(mockOrgCreate).toHaveBeenCalledTimes(1);
      expect(mockUserCreate).toHaveBeenCalledTimes(1);
      expect(mockApiKeyCreate).toHaveBeenCalledTimes(1);
    });

    it("runs abuse detection before creating resources", async () => {
      mockCheckSignupAbuse.mockResolvedValue({ allowed: false, reason: "Too many signups" });

      const req = makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE });
      const res = await handleVerify(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toBe("SIGNUP_BLOCKED");
      expect(mockOrgCreate).not.toHaveBeenCalled();
      expect(mockUserCreate).not.toHaveBeenCalled();
    });

    it("grants initial free credits on new signup", async () => {
      const req = makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE });
      await handleVerify(req);

      expect(mockAddCredits).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "new-org",
          amount: 100,
        }),
      );
    });
  });

  describe("Input validation", () => {
    it("rejects missing message field", async () => {
      const req = makeRequest({ signature: VALID_SIGNATURE });
      const res = await handleVerify(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_BODY");
    });

    it("rejects missing signature field", async () => {
      const req = makeRequest({ message: VALID_MESSAGE });
      const res = await handleVerify(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_BODY");
    });

    it("rejects SIWE message missing required fields", async () => {
      mockParseSiweMessage.mockReturnValue({ address: VALID_ADDRESS }); // missing nonce+domain

      const req = makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE });
      const res = await handleVerify(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_BODY");
    });

    it("rejects expired SIWE message", async () => {
      setupValidParse({ expirationTime: new Date("2020-01-01") });
      mockAtomicConsume.mockResolvedValue(1);

      const req = makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE });
      const res = await handleVerify(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBe("MESSAGE_EXPIRED");
    });
  });
});
