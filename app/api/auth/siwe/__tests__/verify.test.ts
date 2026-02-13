
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks ---

const mockAtomicConsume = vi.fn();
const mockCacheIsAvailable = vi.fn().mockReturnValue(true);

vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: mockCacheIsAvailable,
  },
}));

vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: (...args: unknown[]) => mockAtomicConsume(...args),
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

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

const VALID_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const VALID_ADDRESS_LOWER = VALID_ADDRESS.toLowerCase();

const mockGetByWallet = vi.fn();
const mockUserCreate = vi.fn();
const mockUserUpdate = vi.fn();

vi.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: (...args: unknown[]) => mockGetByWallet(...args),
    create: (...args: unknown[]) => mockUserCreate(...args),
    update: (...args: unknown[]) => mockUserUpdate(...args),
  },
}));

const mockApiKeysCreate = vi.fn();
const mockApiKeysList = vi.fn();

vi.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    create: (...args: unknown[]) => mockApiKeysCreate(...args),
    listByOrganization: (...args: unknown[]) => mockApiKeysList(...args),
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

vi.mock("@/lib/services/credits", () => ({
  creditsService: {
    addCredits: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: {
    checkSignupAbuse: vi.fn().mockResolvedValue({ allowed: true }),
    recordSignupMetadata: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: () => "https://example.com/avatar.png",
}));

vi.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: () => "test-slug-abc123",
  getInitialCredits: () => 100,
}));

// Mock viem functions
const mockRecoverMessageAddress = vi.fn();
const mockGetAddress = vi.fn((addr: string) => addr);
vi.mock("viem", () => ({
  recoverMessageAddress: (...args: unknown[]) => mockRecoverMessageAddress(...args),
  getAddress: (addr: string) => addr,
}));

vi.mock("viem/siwe", () => ({
  parseSiweMessage: (msg: string) => {
    // Simple mock parser
    if (msg.includes("INVALID")) return {};
    return {
      address: VALID_ADDRESS,
      nonce: "test-nonce-123",
      domain: "app.example.com",
    };
  },
}));

// Import after all mocks
let handleVerify: (req: NextRequest) => Promise<Response>;

beforeEach(async () => {
  vi.clearAllMocks();
  mockCacheIsAvailable.mockReturnValue(true);
  mockAtomicConsume.mockResolvedValue(1); // nonce exists
  mockRecoverMessageAddress.mockResolvedValue(VALID_ADDRESS);
  mockGetAddress.mockImplementation((addr: string) => addr);

  const mod = await import("../verify/route");
  handleVerify = mod.POST as (req: NextRequest) => Promise<Response>;
});

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("https://app.example.com/api/auth/siwe/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("SIWE Verify Endpoint", () => {
  describe("request validation", () => {
    it("returns 400 for missing message", async () => {
      const res = await handleVerify(makeRequest({ signature: "0xabc" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_BODY");
    });

    it("returns 400 for missing signature", async () => {
      const res = await handleVerify(makeRequest({ message: "hello" }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_BODY");
    });

    it("returns 400 for empty message", async () => {
      const res = await handleVerify(makeRequest({ message: "  ", signature: "0xabc" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 for non-JSON body", async () => {
      const req = new NextRequest("https://app.example.com/api/auth/siwe/verify", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "not json",
      });
      const res = await handleVerify(req);
      expect(res.status).toBe(400);
    });
  });

  describe("nonce validation", () => {
    it("returns 503 when cache is unavailable", async () => {
      mockCacheIsAvailable.mockReturnValue(false);
      const res = await handleVerify(
        makeRequest({ message: "valid siwe message", signature: "0xabc123" }),
      );
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("returns 400 for expired/used nonce", async () => {
      mockAtomicConsume.mockResolvedValue(0); // nonce doesn't exist
      const res = await handleVerify(
        makeRequest({ message: "valid siwe message", signature: "0xabc123" }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_NONCE");
    });

    it("consumes nonce atomically (single-use)", async () => {
      mockAtomicConsume.mockResolvedValue(1);
      mockGetByWallet.mockResolvedValue({
        id: "user-1",
        is_active: true,
        wallet_verified: true,
        organization_id: "org-1",
        organization: { id: "org-1", is_active: true, name: "Test Org" },
      });
      mockApiKeysList.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "sk-test" },
      ]);

      await handleVerify(
        makeRequest({ message: "valid siwe message", signature: "0xabc123" }),
      );

      expect(mockAtomicConsume).toHaveBeenCalledTimes(1);
      expect(mockAtomicConsume).toHaveBeenCalledWith("siwe:nonce:test-nonce-123");
    });
  });

  describe("signature verification", () => {
    it("returns 400 for invalid signature", async () => {
      mockRecoverMessageAddress.mockRejectedValue(new Error("bad sig"));
      const res = await handleVerify(
        makeRequest({ message: "valid siwe message", signature: "0xbad" }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_SIGNATURE");
    });

    it("returns 400 when recovered address doesn't match claimed address", async () => {
      mockRecoverMessageAddress.mockResolvedValue("0xDEADBEEF00000000000000000000000000000000");
      const res = await handleVerify(
        makeRequest({ message: "valid siwe message", signature: "0xabc123" }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_SIGNATURE");
    });
  });

  describe("existing user path", () => {
    it("returns existing user with API key and isNewAccount=false", async () => {
      const existingUser = {
        id: "user-1",
        name: "Test",
        is_active: true,
        wallet_verified: true,
        privy_user_id: null,
        organization_id: "org-1",
        organization: { id: "org-1", is_active: true, name: "Test Org", credit_balance: "100.00" },
      };
      mockGetByWallet.mockResolvedValue(existingUser);
      mockApiKeysList.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "sk-existing" },
      ]);

      const res = await handleVerify(
        makeRequest({ message: "valid siwe message", signature: "0xabc123" }),
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.isNewAccount).toBe(false);
      expect(data.apiKey).toBe("sk-existing");
    });

    it("returns 403 for inactive account", async () => {
      mockGetByWallet.mockResolvedValue({
        id: "user-1",
        is_active: false,
        organization_id: "org-1",
        organization: { id: "org-1", is_active: true },
      });

      const res = await handleVerify(
        makeRequest({ message: "valid siwe message", signature: "0xabc123" }),
      );
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe("ACCOUNT_INACTIVE");
    });

    it("marks wallet as verified for unverified existing user", async () => {
      mockGetByWallet.mockResolvedValue({
        id: "user-1",
        is_active: true,
        wallet_verified: false,
        privy_user_id: "privy-123",
        organization_id: "org-1",
        organization: { id: "org-1", is_active: true, name: "Org" },
      });
      mockApiKeysList.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "sk-key" },
      ]);

      await handleVerify(
        makeRequest({ message: "valid siwe message", signature: "0xabc123" }),
      );

      expect(mockUserUpdate).toHaveBeenCalledWith("user-1", { wallet_verified: true });
    });
  });

  describe("new user signup path", () => {
    beforeEach(() => {
      mockGetByWallet.mockResolvedValue(undefined); // no existing user
      mockOrgGetBySlug.mockResolvedValue(undefined); // slug available
      mockOrgCreate.mockResolvedValue({
        id: "org-new",
        name: "Test Org",
        slug: "test-slug-abc123",
        credit_balance: "0.00",
      });
      mockUserCreate.mockResolvedValue({
        id: "user-new",
        name: "0xd8dA...6045",
        organization_id: "org-new",
        wallet_address: VALID_ADDRESS_LOWER,
      });
      mockApiKeysCreate.mockResolvedValue({ plainKey: "sk-new-key" });
    });

    it("creates org, user, and API key for new wallet", async () => {
      const res = await handleVerify(
        makeRequest({ message: "valid siwe message", signature: "0xabc123" }),
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.isNewAccount).toBe(true);
      expect(data.apiKey).toBe("sk-new-key");
      expect(mockOrgCreate).toHaveBeenCalledTimes(1);
      expect(mockUserCreate).toHaveBeenCalledTimes(1);
      expect(mockApiKeysCreate).toHaveBeenCalledTimes(1);
    });

    it("cleans up org on user creation failure (non-duplicate)", async () => {
      mockUserCreate.mockRejectedValue(new Error("DB connection lost"));

      await expect(
        handleVerify(
          makeRequest({ message: "valid siwe message", signature: "0xabc123" }),
        ),
      ).rejects.toThrow("DB connection lost");

      expect(mockOrgDelete).toHaveBeenCalledWith("org-new");
    });

    it("does not delete org on 23505 duplicate key error", async () => {
      const dupError = Object.assign(new Error("duplicate key"), { code: "23505" });
      mockUserCreate.mockRejectedValue(dupError);
      mockGetByWallet.mockResolvedValueOnce(undefined).mockResolvedValue({
        id: "user-race",
        is_active: true,
        wallet_verified: true,
        organization_id: "org-race",
        organization: { id: "org-race", is_active: true, name: "Race Org" },
      });
      mockApiKeysList.mockResolvedValue([
        { user_id: "user-race", is_active: true, key: "sk-race" },
      ]);

      const res = await handleVerify(
        makeRequest({ message: "valid siwe message", signature: "0xabc123" }),
      );

      expect(mockOrgDelete).not.toHaveBeenCalled();
      expect(res.status).toBe(200);
    });
  });

  describe("SIWE message fields", () => {
    it("returns 400 when SIWE message is missing required fields", async () => {
      const res = await handleVerify(
        makeRequest({ message: "INVALID message", signature: "0xabc123" }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("INVALID_BODY");
    });
  });
});
