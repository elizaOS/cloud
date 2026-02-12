
/**
 * Tests for SIWE Verify Endpoint
 *
 * Covers:
 * - Nonce issuance TTL and single-use validation
 * - Verify success paths (existing user vs new user signup)
 * - Key failure modes (invalid nonce, invalid domain, invalid signature, missing fields)
 */

import { NextRequest } from "next/server";

// --- Mocks ---

const mockCacheIsAvailable = jest.fn().mockReturnValue(true);
const mockAtomicConsume = jest.fn();
const mockCacheSet = jest.fn();

jest.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: () => mockCacheIsAvailable(),
    set: (...args: unknown[]) => mockCacheSet(...args),
  },
}));

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
const mockUsersCreate = jest.fn();
const mockUsersUpdate = jest.fn();

jest.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: (...args: unknown[]) =>
      mockGetByWalletAddressWithOrganization(...args),
    create: (...args: unknown[]) => mockUsersCreate(...args),
    update: (...args: unknown[]) => mockUsersUpdate(...args),
  },
}));

const mockApiKeysListByOrganization = jest.fn();
const mockApiKeysCreate = jest.fn();

jest.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: (...args: unknown[]) => mockApiKeysListByOrganization(...args),
    create: (...args: unknown[]) => mockApiKeysCreate(...args),
  },
}));

const mockOrganizationsCreate = jest.fn();
const mockOrganizationsGetBySlug = jest.fn();

jest.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    create: (...args: unknown[]) => mockOrganizationsCreate(...args),
    getBySlug: (...args: unknown[]) => mockOrganizationsGetBySlug(...args),
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

jest.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

const mockDbTransaction = jest.fn();

jest.mock("@/lib/db", () => ({
  db: {
    transaction: (fn: (tx: unknown) => Promise<unknown>) => mockDbTransaction(fn),
  },
}));

jest.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: (req: NextRequest) => Promise<Response>) => handler,
  RateLimitPresets: { STRICT: {} },
}));

// Mock viem functions
const mockRecoverMessageAddress = jest.fn();
const mockGetAddress = jest.fn((addr: string) => addr);

jest.mock("viem", () => ({
  recoverMessageAddress: (...args: unknown[]) => mockRecoverMessageAddress(...args),
  getAddress: (addr: string) => mockGetAddress(addr),
}));

const mockParseSiweMessage = jest.fn();

jest.mock("viem/siwe", () => ({
  parseSiweMessage: (...args: unknown[]) => mockParseSiweMessage(...args),
}));

// --- Import after mocks ---
import { POST } from "../../route";

// --- Helpers ---

const VALID_ADDRESS = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";
const VALID_NONCE = "test-nonce-123";

function buildSiweMessage(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    address: VALID_ADDRESS,
    nonce: VALID_NONCE,
    domain: "app.example.com",
    ...overrides,
  });
}

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("https://app.example.com/api/auth/siwe/verify", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

async function getResponseBody(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

// --- Tests ---

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockAtomicConsume.mockResolvedValue(1); // nonce exists and consumed
    mockParseSiweMessage.mockReturnValue({
      address: VALID_ADDRESS,
      nonce: VALID_NONCE,
      domain: "app.example.com",
    });
    mockRecoverMessageAddress.mockResolvedValue(VALID_ADDRESS);
    mockGetAddress.mockImplementation((addr: string) => addr);
    mockGetByWalletAddressWithOrganization.mockResolvedValue(null);
    mockCheckSignupAbuse.mockResolvedValue({ allowed: true });
  });

  describe("Request body validation", () => {
    it("returns 400 for missing message field", async () => {
      const req = createRequest({ signature: "0xabc123" });
      const res = await POST(req);
      const body = await getResponseBody(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_BODY");
    });

    it("returns 400 for missing signature field", async () => {
      const req = createRequest({ message: "some message" });
      const res = await POST(req);
      const body = await getResponseBody(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_BODY");
    });

    it("returns 400 for empty message string", async () => {
      const req = createRequest({ message: "  ", signature: "0xabc" });
      const res = await POST(req);
      const body = await getResponseBody(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_BODY");
    });

    it("returns 400 for empty signature string", async () => {
      const req = createRequest({ message: "valid msg", signature: "  " });
      const res = await POST(req);
      const body = await getResponseBody(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_BODY");
    });

    it("returns 400 when SIWE message is missing required fields", async () => {
      mockParseSiweMessage.mockReturnValue({
        address: null,
        nonce: null,
        domain: null,
      });

      const req = createRequest({
        message: buildSiweMessage(),
        signature: "0xdeadbeef",
      });
      const res = await POST(req);
      const body = await getResponseBody(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_BODY");
    });
  });

  describe("Nonce validation", () => {
    it("returns 503 when cache is unavailable", async () => {
      mockCacheIsAvailable.mockReturnValue(false);

      const req = createRequest({
        message: buildSiweMessage(),
        signature: "0xdeadbeef",
      });
      const res = await POST(req);
      const body = await getResponseBody(res);

      expect(res.status).toBe(503);
      expect(body.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("returns 400 for expired/already-used nonce (atomicConsume returns 0)", async () => {
      mockAtomicConsume.mockResolvedValue(0);

      const req = createRequest({
        message: buildSiweMessage(),
        signature: "0xdeadbeef",
      });
      const res = await POST(req);
      const body = await getResponseBody(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_NONCE");
    });

    it("atomically consumes nonce so concurrent requests cannot reuse it", async () => {
      // First call succeeds, second fails
      mockAtomicConsume
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0);

      const req1 = createRequest({
        message: buildSiweMessage(),
        signature: "0xdeadbeef",
      });
      const req2 = createRequest({
        message: buildSiweMessage(),
        signature: "0xdeadbeef",
      });

      // We need existing user for the first request to succeed without signup
      mockGetByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-1",
        is_active: true,
        wallet_verified: true,
        organization_id: "org-1",
        organization: { is_active: true, name: "Test Org", credit_balance: "5.00" },
      });
      mockApiKeysListByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "test-key-123" },
      ]);

      const [res1, res2] = await Promise.all([POST(req1), POST(req2)]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(400);
      const body2 = await getResponseBody(res2);
      expect(body2.error).toBe("INVALID_NONCE");
    });
  });

  describe("Domain validation", () => {
    it("returns 400 when SIWE message domain does not match server", async () => {
      mockParseSiweMessage.mockReturnValue({
        address: VALID_ADDRESS,
        nonce: VALID_NONCE,
        domain: "evil.example.com",
      });

      const req = createRequest({
        message: buildSiweMessage({ domain: "evil.example.com" }),
        signature: "0xdeadbeef",
      });
      const res = await POST(req);
      const body = await getResponseBody(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_DOMAIN");
    });
  });

  describe("Signature verification", () => {
    it("returns 400 when signature recovery throws", async () => {
      mockRecoverMessageAddress.mockRejectedValue(new Error("bad sig"));

      const req = createRequest({
        message: buildSiweMessage(),
        signature: "0xbadsignature",
      });
      const res = await POST(req);
      const body = await getResponseBody(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_SIGNATURE");
    });

    it("returns 400 when recovered address does not match claimed address", async () => {
      mockRecoverMessageAddress.mockResolvedValue("0xDifferentAddress");
      mockGetAddress
        .mockReturnValueOnce("0xDifferentAddress")
        .mockReturnValueOnce(VALID_ADDRESS);

      const req = createRequest({
        message: buildSiweMessage(),
        signature: "0xdeadbeef",
      });
      const res = await POST(req);
      const body = await getResponseBody(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe("INVALID_SIGNATURE");
    });
  });

  describe("Message expiry", () => {
    it("returns 400 when SIWE message has expired", async () => {
      mockParseSiweMessage.mockReturnValue({
        address: VALID_ADDRESS,
        nonce: VALID_NONCE,
        domain: "app.example.com",
        expirationTime: new Date(Date.now() - 60000), // 1 minute ago
      });

      const req = createRequest({
        message: buildSiweMessage(),
        signature: "0xdeadbeef",
      });
      const res = await POST(req);
      const body = await getResponseBody(res);

      expect(res.status).toBe(400);
      expect(body.error).toBe("MESSAGE_EXPIRED");
    });
  });

  describe("Existing user path", () => {
    const existingUser = {
      id: "user-1",
      name: "0xAbCd...Ef01",
      is_active: true,
      wallet_verified: true,
      privy_user_id: null,
      organization_id: "org-1",
      organization: {
        is_active: true,
        name: "Test Org",
        credit_balance: "5.00",
      },
    };

    it("returns existing user with their API key", async () => {
      mockGetByWalletAddressWithOrganization.mockResolvedValue(existingUser);
      mockApiKeysListByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "existing-key-abc" },
      ]);

      const req = createRequest({
        message: buildSiweMessage(),
        signature: "0xdeadbeef",
      });
      const res = await POST(req);
      const body = await getResponseBody(res);

      expect(res.status).toBe(200);
      expect(body.isNewAccount).toBe(false);
      expect(body.apiKey).toBe("existing-key-abc");
    });

    it("marks wallet as verified on first SIWE login for Privy-linked users", async () => {
      const unverifiedUser = { ...existingUser, wallet_verified: false };
      mockGetByWalletAddressWithOrganization.mockResolvedValue(unverifiedUser);
      mockApiKeysListByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "key-123" },
      ]);

      const req = createRequest({
        message: buildSiweMessage(),
        signature: "0xdeadbeef",
      });
      await POST(req);

      expect(mockUsersUpdate).toHaveBeenCalledWith("user-1", {
        wallet_verified: true,
      });
    });

    it("returns 403 for inactive user", async () => {
      mockGetByWalletAddressWithOrganization.mockResolvedValue({
        ...existingUser,
        is_active: false,
      });

      const req = createRequest({
        message: buildSiweMessage(),
        signature: "0xdeadbeef",
      });
      const res = await POST(req);
      const body = await getResponseBody(res);

      expect(res.status).toBe(403);
      expect(body.error).toBe("ACCOUNT_INACTIVE");
    });

    it("returns 403 for inactive organization", async () => {
      mockGetByWalletAddressWithOrganization.mockResolvedValue({
        ...existingUser,
        organization: { ...existingUser.organization, is_active: false },
      });

      const req = createRequest({
        message: buildSiweMessage(),
        signature: "0xdeadbeef",
      });
      const res = await POST(req);
      const body = await getResponseBody(res);

      expect(res.status).toBe(403);
      expect(body.error).toBe("ACCOUNT_INACTIVE");
    });

    it("creates a new API key if user has no active keys", async () => {
      mockGetByWalletAddressWithOrganization.mockResolvedValue(existingUser);
      mockApiKeysListByOrganization.mockResolvedValue([]); // no keys
      mockApiKeysCreate.mockResolvedValue({ plainKey: "new-key-xyz" });

      const req = createRequest({
        message: buildSiweMessage(),
        signature: "0xdeadbeef",
      });
      const res = await POST(req);
      const body = await getResponseBody(res);

      expect(res.status).toBe(200);
      expect(body.apiKey).toBe("new-key-xyz");
      expect(mockApiKeysCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Default API Key" }),
      );
    });
  });

  describe("New user signup path", () => {
    it("returns 403 when abuse detection blocks signup", async () => {
      mockCheckSignupAbuse.mockResolvedValue({
        allowed: false,
        reason: "Too many signups from this IP",
      });

      const req = createRequest({
        message: buildSiweMessage(),
        signature: "0xdeadbeef",
      });
      const res = await POST(req);
      const body = await getResponseBody(res);

      expect(res.status).toBe(403);
      expect(body.error).toBe("SIGNUP_BLOCKED");
    });

    it("creates org, user, and API key for new wallet", async () => {
      const newUser = {
        id: "new-user-1",
        name: "0xAbCd...Ef01",
        wallet_address: VALID_ADDRESS.toLowerCase(),
        organization_id: "new-org-1",
      };
      const newOrg = {
        id: "new-org-1",
        name: "0xAbCd...Ef01's Organization",
        credit_balance: "0.00",
        is_active: true,
      };

      mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {};
        mockOrganizationsGetBySlug.mockResolvedValue(null);
        mockOrganizationsCreate.mockResolvedValue(newOrg);
        mockUsersCreate.mockResolvedValue(newUser);
        mockApiKeysCreate.mockResolvedValue({ plainKey: "fresh-key-123" });
        return fn(tx);
      });

      const req = createRequest({
        message: buildSiweMessage(),
        signature: "0xdeadbeef",
      });
      const res = await POST(req);
      const body = await getResponseBody(res);

      expect(res.status).toBe(200);
      expect(body.isNewAccount).toBe(true);
      expect(body.apiKey).toBe("fresh-key-123");
    });

    it("handles 23505 duplicate key race condition gracefully", async () => {
      const duplicateError = Object.assign(new Error("duplicate"), { code: "23505" });
      mockDbTransaction.mockRejectedValue(duplicateError);

      const raceWinner = {
        id: "race-user-1",
        is_active: true,
        wallet_verified: true,
        organization_id: "org-1",
        organization: { is_active: true, name: "Test Org", credit_balance: "5.00" },
      };
      mockGetByWalletAddressWithOrganization
        .mockResolvedValueOnce(null) // initial check
        .mockResolvedValueOnce(raceWinner); // retry after race

      mockApiKeysListByOrganization.mockResolvedValue([
        { user_id: "race-user-1", is_active: true, key: "race-key" },
      ]);

      const req = createRequest({
        message: buildSiweMessage(),
        signature: "0xdeadbeef",
      });
      const res = await POST(req);
      const body = await getResponseBody(res);

      expect(res.status).toBe(200);
      expect(body.isNewAccount).toBe(false);
      expect(body.apiKey).toBe("race-key");
    });

    it("re-throws non-duplicate errors from signup transaction", async () => {
      const genericError = new Error("DB connection lost");
      mockDbTransaction.mockRejectedValue(genericError);

      const req = createRequest({
        message: buildSiweMessage(),
        signature: "0xdeadbeef",
      });

      await expect(POST(req)).rejects.toThrow("DB connection lost");
    });
  });
});
