
/**
 * Unit/integration tests for SIWE verify endpoint.
 *
 * Covers:
 * - Nonce issuance (TTL, single-use consumption)
 * - Verify success paths (existing user vs new user signup)
 * - Key failure modes (invalid nonce, wrong domain, bad signature, expired message)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks ---

const mockAtomicConsume = vi.fn();
vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: (...args: unknown[]) => mockAtomicConsume(...args),
}));

const mockCacheIsAvailable = vi.fn().mockReturnValue(true);
vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: () => mockCacheIsAvailable(),
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("@/lib/cache/keys", () => ({
  CacheKeys: {
    siwe: {
      nonce: (n: string) => `siwe:nonce:${n}`,
    },
  },
}));

const mockRecoverMessageAddress = vi.fn();
const mockGetAddress = vi.fn((a: string) => a);
vi.mock("viem", () => ({
  recoverMessageAddress: (...args: unknown[]) => mockRecoverMessageAddress(...args),
  getAddress: (a: string) => mockGetAddress(a),
}));

const mockParseSiweMessage = vi.fn();
vi.mock("viem/siwe", () => ({
  parseSiweMessage: (...args: unknown[]) => mockParseSiweMessage(...args),
}));

const mockGetByWalletAddressWithOrganization = vi.fn();
const mockUserUpdate = vi.fn();
const mockUserCreate = vi.fn();
vi.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: (...args: unknown[]) =>
      mockGetByWalletAddressWithOrganization(...args),
    update: (...args: unknown[]) => mockUserUpdate(...args),
    create: (...args: unknown[]) => mockUserCreate(...args),
  },
}));

const mockListByOrganization = vi.fn();
const mockApiKeyCreate = vi.fn();
vi.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: (...args: unknown[]) => mockListByOrganization(...args),
    create: (...args: unknown[]) => mockApiKeyCreate(...args),
  },
}));

const mockOrgCreate = vi.fn();
const mockOrgGetBySlug = vi.fn();
const mockOrgDelete = vi.fn();
vi.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    create: (...args: unknown[]) => mockOrgCreate(...args),
    getBySlug: (...args: unknown[]) => mockOrgGetBySlug(...args),
    delete: (...args: unknown[]) => mockOrgDelete(...args),
  },
}));

const mockAddCredits = vi.fn();
vi.mock("@/lib/services/credits", () => ({
  creditsService: {
    addCredits: (...args: unknown[]) => mockAddCredits(...args),
  },
}));

const mockCheckSignupAbuse = vi.fn().mockResolvedValue({ allowed: true });
const mockRecordSignupMetadata = vi.fn();
vi.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: {
    checkSignupAbuse: (...args: unknown[]) => mockCheckSignupAbuse(...args),
    recordSignupMetadata: (...args: unknown[]) => mockRecordSignupMetadata(...args),
  },
}));

vi.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: () => "avatar.png",
}));

vi.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: (addr: string) => `wallet-${addr.slice(0, 8)}`,
  getInitialCredits: () => 100,
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

const mockDbTransaction = vi.fn(async (fn: Function) => fn({}));
vi.mock("@/lib/db", () => ({
  db: {
    transaction: (fn: Function) => mockDbTransaction(fn),
  },
}));

// --- Helpers ---

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const VALID_NONCE = "abc123nonce";
const VALID_DOMAIN = "localhost";
const VALID_MESSAGE = `localhost wants you to sign in with your Ethereum account:\n${VALID_ADDRESS}\n\nSign in\n\nURI: http://localhost:3000\nVersion: 1\nChain ID: 1\nNonce: ${VALID_NONCE}\nIssued At: 2024-01-01T00:00:00.000Z`;
const VALID_SIGNATURE = "0xdeadbeef";

function setupValidParsedMessage(overrides = {}) {
  mockParseSiweMessage.mockReturnValue({
    address: VALID_ADDRESS,
    nonce: VALID_NONCE,
    domain: VALID_DOMAIN,
    ...overrides,
  });
}

// --- Tests ---

describe("SIWE verify endpoint", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockAtomicConsume.mockResolvedValue(true);
    mockGetAddress.mockImplementation((a: string) => a);
    mockRecoverMessageAddress.mockResolvedValue(VALID_ADDRESS);
    setupValidParsedMessage();

    // Re-import to pick up fresh mocks
    const mod = await import("./route");
    POST = mod.POST as (req: NextRequest) => Promise<Response>;
  });

  // ---- Body validation ----

  describe("request body validation", () => {
    it("rejects missing message field", async () => {
      const res = await POST(makeRequest({ signature: VALID_SIGNATURE }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_BODY");
    });

    it("rejects missing signature field", async () => {
      const res = await POST(makeRequest({ message: VALID_MESSAGE }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_BODY");
    });

    it("rejects empty message", async () => {
      const res = await POST(makeRequest({ message: "  ", signature: VALID_SIGNATURE }));
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

  // ---- Nonce validation ----

  describe("nonce issuance and single-use validation", () => {
    it("rejects when cache is unavailable (Redis down)", async () => {
      mockCacheIsAvailable.mockReturnValue(false);
      const res = await POST(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const json = await res.json();
      expect(res.status).toBe(503);
      expect(json.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("rejects expired or already-used nonce (atomicConsume returns false)", async () => {
      mockAtomicConsume.mockResolvedValue(false);
      const res = await POST(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_NONCE");
    });

    it("consumes nonce exactly once via atomicConsume", async () => {
      mockGetByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-1",
        is_active: true,
        wallet_verified: true,
        organization_id: "org-1",
        organization: { is_active: true, name: "Org", credit_balance: "100" },
      });
      mockListByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "existing-key" },
      ]);

      await POST(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));

      expect(mockAtomicConsume).toHaveBeenCalledTimes(1);
      expect(mockAtomicConsume).toHaveBeenCalledWith(`siwe:nonce:${VALID_NONCE}`);
    });
  });

  // ---- Domain validation ----

  describe("domain validation", () => {
    it("rejects SIWE message with wrong domain", async () => {
      setupValidParsedMessage({ domain: "evil.com" });
      const res = await POST(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_DOMAIN");
    });
  });

  // ---- Signature validation ----

  describe("signature verification", () => {
    it("rejects invalid signature (recoverMessageAddress throws)", async () => {
      mockRecoverMessageAddress.mockRejectedValue(new Error("bad sig"));
      const res = await POST(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_SIGNATURE");
    });

    it("rejects signature that recovers to wrong address", async () => {
      mockRecoverMessageAddress.mockResolvedValue("0xDEAD");
      mockGetAddress.mockImplementation((a: string) => a); // different addresses
      const res = await POST(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_SIGNATURE");
    });
  });

  // ---- Message expiration ----

  describe("message expiration", () => {
    it("rejects expired SIWE message", async () => {
      setupValidParsedMessage({ expirationTime: new Date("2020-01-01") });
      const res = await POST(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("MESSAGE_EXPIRED");
    });
  });

  // ---- Existing user (sign-in) path ----

  describe("existing user sign-in", () => {
    const existingUser = {
      id: "user-1",
      name: "0x1234...5678",
      is_active: true,
      wallet_verified: true,
      privy_user_id: null,
      organization_id: "org-1",
      organization: { is_active: true, name: "Org", credit_balance: "50.00" },
    };

    it("returns existing user with API key and isNewAccount=false", async () => {
      mockGetByWalletAddressWithOrganization.mockResolvedValue(existingUser);
      mockListByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "existing-plain-key" },
      ]);

      const res = await POST(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.isNewAccount).toBe(false);
      expect(json.apiKey).toBe("existing-plain-key");
      expect(json.user.id).toBe("user-1");
    });

    it("marks wallet as verified if not already verified", async () => {
      mockGetByWalletAddressWithOrganization.mockResolvedValue({
        ...existingUser,
        wallet_verified: false,
      });
      mockListByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "key" },
      ]);

      await POST(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));

      expect(mockUserUpdate).toHaveBeenCalledWith("user-1", { wallet_verified: true });
    });

    it("rejects inactive user", async () => {
      mockGetByWalletAddressWithOrganization.mockResolvedValue({
        ...existingUser,
        is_active: false,
      });

      const res = await POST(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const json = await res.json();
      expect(res.status).toBe(403);
      expect(json.error).toBe("ACCOUNT_INACTIVE");
    });

    it("rejects inactive organization", async () => {
      mockGetByWalletAddressWithOrganization.mockResolvedValue({
        ...existingUser,
        organization: { ...existingUser.organization, is_active: false },
      });

      const res = await POST(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const json = await res.json();
      expect(res.status).toBe(403);
      expect(json.error).toBe("ACCOUNT_INACTIVE");
    });

    it("creates new API key if none exists for user", async () => {
      mockGetByWalletAddressWithOrganization.mockResolvedValue(existingUser);
      mockListByOrganization.mockResolvedValue([]); // no existing keys
      mockApiKeyCreate.mockResolvedValue({ plainKey: "new-key-123" });

      const res = await POST(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.apiKey).toBe("new-key-123");
      expect(mockApiKeyCreate).toHaveBeenCalledWith({
        user_id: "user-1",
        organization_id: "org-1",
        name: "Default API Key",
        is_active: true,
      });
    });
  });

  // ---- New user (sign-up) path ----

  describe("new user sign-up", () => {
    beforeEach(() => {
      // No existing user
      mockGetByWalletAddressWithOrganization
        .mockResolvedValueOnce(undefined) // first call: lookup
        .mockResolvedValueOnce({
          // second call: after creation
          id: "new-user-1",
          name: "0x1234...5678",
          is_active: true,
          wallet_verified: true,
          organization_id: "new-org-1",
          organization: { is_active: true, name: "Org", credit_balance: "100.00" },
        });

      mockOrgGetBySlug.mockResolvedValue(null); // slug available
      mockOrgCreate.mockResolvedValue({ id: "new-org-1", slug: "wallet-0x123456" });
      mockUserCreate.mockResolvedValue({ id: "new-user-1" });
      mockApiKeyCreate.mockResolvedValue({ plainKey: "new-plain-key" });
      mockAddCredits.mockResolvedValue(undefined);
      mockCheckSignupAbuse.mockResolvedValue({ allowed: true });
    });

    it("creates org, credits, user, and API key for new wallet", async () => {
      const res = await POST(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.isNewAccount).toBe(true);
      expect(json.apiKey).toBe("new-plain-key");
      expect(mockOrgCreate).toHaveBeenCalled();
      expect(mockAddCredits).toHaveBeenCalled();
      expect(mockUserCreate).toHaveBeenCalled();
      expect(mockApiKeyCreate).toHaveBeenCalled();
    });

    it("blocks signup when abuse detection rejects", async () => {
      mockCheckSignupAbuse.mockResolvedValue({ allowed: false, reason: "Too many signups" });

      const res = await POST(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toBe("SIGNUP_BLOCKED");
    });

    it("runs signup inside a DB transaction", async () => {
      await POST(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));

      expect(mockDbTransaction).toHaveBeenCalledTimes(1);
    });

    it("handles 23505 duplicate wallet race condition gracefully", async () => {
      const duplicateError = Object.assign(new Error("duplicate"), { code: "23505" });
      mockDbTransaction.mockRejectedValueOnce(duplicateError);

      // After race, the winning user is found
      const raceUser = {
        id: "race-user",
        is_active: true,
        wallet_verified: true,
        organization_id: "race-org",
        organization: { is_active: true, name: "Org", credit_balance: "100" },
      };
      mockGetByWalletAddressWithOrganization
        .mockReset()
        .mockResolvedValueOnce(undefined) // initial lookup
        .mockResolvedValueOnce(raceUser); // retry after race

      mockListByOrganization.mockResolvedValue([
        { user_id: "race-user", is_active: true, key: "race-key" },
      ]);

      const res = await POST(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.isNewAccount).toBe(false);
      expect(json.apiKey).toBe("race-key");
    });
  });

  // ---- SIWE message field validation ----

  describe("SIWE message field validation", () => {
    it("rejects message missing address", async () => {
      setupValidParsedMessage({ address: undefined });
      const res = await POST(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_BODY");
    });

    it("rejects message missing nonce", async () => {
      setupValidParsedMessage({ nonce: undefined });
      const res = await POST(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_BODY");
    });

    it("rejects message missing domain", async () => {
      setupValidParsedMessage({ domain: undefined });
      const res = await POST(makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }));
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_BODY");
    });
  });
});
