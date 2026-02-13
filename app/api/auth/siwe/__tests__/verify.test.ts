
/**
 * Tests for SIWE verify endpoint
 *
 * Covers nonce issuance (TTL/single-use), verify success paths
 * (existing vs new user), and key failure modes (invalid nonce/domain/signature).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the route
const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
const mockCacheIsAvailable = vi.fn().mockReturnValue(true);
const mockAtomicConsume = vi.fn();
const mockGetByWalletAddressWithOrganization = vi.fn();
const mockUsersCreate = vi.fn();
const mockUsersUpdate = vi.fn();
const mockApiKeysCreate = vi.fn();
const mockApiKeysListByOrganization = vi.fn();
const mockOrgsCreate = vi.fn();
const mockOrgsGetBySlug = vi.fn();
const mockOrgsDelete = vi.fn();
const mockCreditsAddCredits = vi.fn();
const mockCheckSignupAbuse = vi.fn().mockResolvedValue({ allowed: true });
const mockRecordSignupMetadata = vi.fn();
const mockRecoverMessageAddress = vi.fn();
const mockParseSiweMessage = vi.fn();
const mockGetAddress = vi.fn((addr: string) => addr);
const mockGetAppUrl = vi.fn().mockReturnValue("https://app.example.com");
const mockGenerateSlugFromWallet = vi.fn().mockReturnValue("abc123-def456");
const mockGetInitialCredits = vi.fn().mockReturnValue(5.0);

vi.mock("@/lib/cache/client", () => ({
  cache: {
    get: mockCacheGet,
    set: mockCacheSet,
    isAvailable: mockCacheIsAvailable,
  },
}));

vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: mockAtomicConsume,
}));

vi.mock("@/lib/cache/keys", () => ({
  CacheKeys: {
    siwe: { nonce: (n: string) => `siwe:nonce:${n}` },
  },
}));

vi.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: mockGetByWalletAddressWithOrganization,
    create: mockUsersCreate,
    update: mockUsersUpdate,
  },
}));

vi.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    create: mockApiKeysCreate,
    listByOrganization: mockApiKeysListByOrganization,
  },
}));

vi.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    create: mockOrgsCreate,
    getBySlug: mockOrgsGetBySlug,
    delete: mockOrgsDelete,
  },
}));

vi.mock("@/lib/services/credits", () => ({
  creditsService: {
    addCredits: mockCreditsAddCredits,
  },
}));

vi.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: {
    checkSignupAbuse: mockCheckSignupAbuse,
    recordSignupMetadata: mockRecordSignupMetadata,
  },
}));

vi.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: vi.fn().mockReturnValue("avatar.png"),
}));

vi.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: mockGenerateSlugFromWallet,
  getInitialCredits: mockGetInitialCredits,
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: mockGetAppUrl,
}));

vi.mock("viem/siwe", () => ({
  parseSiweMessage: mockParseSiweMessage,
}));

vi.mock("viem", () => ({
  recoverMessageAddress: mockRecoverMessageAddress,
  getAddress: mockGetAddress,
  type: {} as any,
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

// Helper to build a NextRequest
function buildRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/auth/siwe/verify", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": "127.0.0.1",
      "user-agent": "test-agent",
    },
    body: JSON.stringify(body),
  });
}

const VALID_ADDRESS = "0xAbC1230000000000000000000000000000004567";
const VALID_NONCE = "abc123nonce";
const VALID_DOMAIN = "app.example.com";

function setupValidMessage() {
  mockParseSiweMessage.mockReturnValue({
    address: VALID_ADDRESS,
    nonce: VALID_NONCE,
    domain: VALID_DOMAIN,
  });
  mockRecoverMessageAddress.mockResolvedValue(VALID_ADDRESS);
  mockGetAddress.mockImplementation((addr: string) => addr);
}

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockAtomicConsume.mockResolvedValue(1);
    mockGetAppUrl.mockReturnValue("https://app.example.com");
    mockCheckSignupAbuse.mockResolvedValue({ allowed: true });
    mockOrgsGetBySlug.mockResolvedValue(null);
    mockGetInitialCredits.mockReturnValue(5.0);
  });

  describe("Invalid body", () => {
    it("returns 400 when message is missing", async () => {
      const { POST } = await import("../../verify/route");
      const req = buildRequest({ signature: "0xabc" });
      const res = await POST(req as any);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_BODY");
    });

    it("returns 400 when signature is missing", async () => {
      const { POST } = await import("../../verify/route");
      const req = buildRequest({ message: "hello" });
      const res = await POST(req as any);
      expect(res.status).toBe(400);
    });

    it("returns 400 when message is empty string", async () => {
      const { POST } = await import("../../verify/route");
      const req = buildRequest({ message: "  ", signature: "0xabc" });
      const res = await POST(req as any);
      expect(res.status).toBe(400);
    });
  });

  describe("Nonce validation (single-use)", () => {
    it("returns 503 when cache is unavailable", async () => {
      mockCacheIsAvailable.mockReturnValue(false);
      setupValidMessage();

      const { POST } = await import("../../verify/route");
      const req = buildRequest({ message: "valid-siwe-msg", signature: "0xsig" });
      const res = await POST(req as any);
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("returns 400 when nonce was already consumed (atomicConsume returns 0)", async () => {
      setupValidMessage();
      mockAtomicConsume.mockResolvedValue(0);

      const { POST } = await import("../../verify/route");
      const req = buildRequest({ message: "valid-siwe-msg", signature: "0xsig" });
      const res = await POST(req as any);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_NONCE");
    });

    it("consumes nonce exactly once via atomicConsume", async () => {
      setupValidMessage();
      mockAtomicConsume.mockResolvedValue(1);
      mockGetByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-1",
        is_active: true,
        organization_id: "org-1",
        organization: { is_active: true, name: "Test Org", credit_balance: "5.00" },
        wallet_verified: true,
        name: "Test",
      });
      mockApiKeysListByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "existing-key" },
      ]);

      const { POST } = await import("../../verify/route");
      const req = buildRequest({ message: "valid-siwe-msg", signature: "0xsig" });
      await POST(req as any);

      expect(mockAtomicConsume).toHaveBeenCalledTimes(1);
      expect(mockAtomicConsume).toHaveBeenCalledWith(`siwe:nonce:${VALID_NONCE}`);
    });
  });

  describe("Domain validation", () => {
    it("returns 400 when domain does not match", async () => {
      mockParseSiweMessage.mockReturnValue({
        address: VALID_ADDRESS,
        nonce: VALID_NONCE,
        domain: "evil.com",
      });
      mockRecoverMessageAddress.mockResolvedValue(VALID_ADDRESS);
      mockGetAddress.mockImplementation((addr: string) => addr);
      mockAtomicConsume.mockResolvedValue(1);

      const { POST } = await import("../../verify/route");
      const req = buildRequest({ message: "valid-siwe-msg", signature: "0xsig" });
      const res = await POST(req as any);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_DOMAIN");
    });
  });

  describe("Signature validation", () => {
    it("returns 400 when signature recovery fails", async () => {
      setupValidMessage();
      mockRecoverMessageAddress.mockRejectedValue(new Error("bad sig"));
      mockAtomicConsume.mockResolvedValue(1);

      const { POST } = await import("../../verify/route");
      const req = buildRequest({ message: "valid-siwe-msg", signature: "0xbadsig" });
      const res = await POST(req as any);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_SIGNATURE");
    });

    it("returns 400 when recovered address does not match claimed address", async () => {
      mockParseSiweMessage.mockReturnValue({
        address: VALID_ADDRESS,
        nonce: VALID_NONCE,
        domain: VALID_DOMAIN,
      });
      mockRecoverMessageAddress.mockResolvedValue("0xDifferentAddress");
      mockGetAddress.mockImplementation((addr: string) => addr);
      mockAtomicConsume.mockResolvedValue(1);

      const { POST } = await import("../../verify/route");
      const req = buildRequest({ message: "valid-siwe-msg", signature: "0xsig" });
      const res = await POST(req as any);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_SIGNATURE");
    });
  });

  describe("Existing user path", () => {
    it("returns existing user with API key and isNewAccount=false", async () => {
      setupValidMessage();
      mockAtomicConsume.mockResolvedValue(1);
      const existingUser = {
        id: "user-1",
        is_active: true,
        organization_id: "org-1",
        organization: { id: "org-1", is_active: true, name: "Test Org", credit_balance: "10.00" },
        wallet_verified: true,
        name: "0xAbC1...4567",
        privy_user_id: null,
      };
      mockGetByWalletAddressWithOrganization.mockResolvedValue(existingUser);
      mockApiKeysListByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "existing-api-key" },
      ]);

      const { POST } = await import("../../verify/route");
      const req = buildRequest({ message: "valid-siwe-msg", signature: "0xsig" });
      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.isNewAccount).toBe(false);
      expect(json.apiKey).toBe("existing-api-key");
    });

    it("returns 403 when existing user is inactive", async () => {
      setupValidMessage();
      mockAtomicConsume.mockResolvedValue(1);
      mockGetByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-1",
        is_active: false,
        organization_id: "org-1",
        organization: { is_active: true },
        wallet_verified: true,
      });

      const { POST } = await import("../../verify/route");
      const req = buildRequest({ message: "valid-siwe-msg", signature: "0xsig" });
      const res = await POST(req as any);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("ACCOUNT_INACTIVE");
    });

    it("returns 403 when existing user organization is inactive", async () => {
      setupValidMessage();
      mockAtomicConsume.mockResolvedValue(1);
      mockGetByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-1",
        is_active: true,
        organization_id: "org-1",
        organization: { is_active: false },
        wallet_verified: true,
      });

      const { POST } = await import("../../verify/route");
      const req = buildRequest({ message: "valid-siwe-msg", signature: "0xsig" });
      const res = await POST(req as any);
      expect(res.status).toBe(403);
    });

    it("marks wallet as verified for unverified existing user", async () => {
      setupValidMessage();
      mockAtomicConsume.mockResolvedValue(1);
      mockGetByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-1",
        is_active: true,
        organization_id: "org-1",
        organization: { id: "org-1", is_active: true, name: "Org", credit_balance: "0" },
        wallet_verified: false,
        name: "Test",
        privy_user_id: null,
      });
      mockApiKeysListByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "key-1" },
      ]);

      const { POST } = await import("../../verify/route");
      const req = buildRequest({ message: "valid-siwe-msg", signature: "0xsig" });
      await POST(req as any);

      expect(mockUsersUpdate).toHaveBeenCalledWith("user-1", { wallet_verified: true });
    });
  });

  describe("New user signup path", () => {
    it("creates org, user, and API key for new wallet", async () => {
      setupValidMessage();
      mockAtomicConsume.mockResolvedValue(1);
      mockGetByWalletAddressWithOrganization.mockResolvedValue(null);
      const mockOrg = { id: "org-new", name: "Test Org", credit_balance: "0.00", is_active: true };
      mockOrgsCreate.mockResolvedValue(mockOrg);
      mockUsersCreate.mockResolvedValue({
        id: "user-new",
        organization_id: "org-new",
        name: "0xAbC1...4567",
        is_active: true,
        wallet_verified: true,
      });
      mockApiKeysCreate.mockResolvedValue({ plainKey: "new-api-key" });

      const { POST } = await import("../../verify/route");
      const req = buildRequest({ message: "valid-siwe-msg", signature: "0xsig" });
      const res = await POST(req as any);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.isNewAccount).toBe(true);
      expect(json.apiKey).toBe("new-api-key");
      expect(mockOrgsCreate).toHaveBeenCalledTimes(1);
      expect(mockUsersCreate).toHaveBeenCalledTimes(1);
      expect(mockApiKeysCreate).toHaveBeenCalledTimes(1);
    });

    it("returns 403 when abuse detection blocks signup", async () => {
      setupValidMessage();
      mockAtomicConsume.mockResolvedValue(1);
      mockGetByWalletAddressWithOrganization.mockResolvedValue(null);
      mockCheckSignupAbuse.mockResolvedValue({ allowed: false, reason: "Too many signups" });

      const { POST } = await import("../../verify/route");
      const req = buildRequest({ message: "valid-siwe-msg", signature: "0xsig" });
      const res = await POST(req as any);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("SIGNUP_BLOCKED");
    });

    it("cleans up org on user creation failure", async () => {
      setupValidMessage();
      mockAtomicConsume.mockResolvedValue(1);
      mockGetByWalletAddressWithOrganization.mockResolvedValue(null);
      const mockOrg = { id: "org-orphan", name: "Org", credit_balance: "0.00" };
      mockOrgsCreate.mockResolvedValue(mockOrg);
      mockUsersCreate.mockRejectedValue(new Error("DB error"));

      const { POST } = await import("../../verify/route");
      const req = buildRequest({ message: "valid-siwe-msg", signature: "0xsig" });

      await expect(POST(req as any)).rejects.toThrow("DB error");
      expect(mockOrgsDelete).toHaveBeenCalledWith("org-orphan");
    });
  });
});
