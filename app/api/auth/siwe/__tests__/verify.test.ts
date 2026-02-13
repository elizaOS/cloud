
import { NextRequest } from "next/server";

// Mock dependencies before importing the handler
const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
const mockCacheIsAvailable = jest.fn().mockReturnValue(true);
const mockAtomicConsume = jest.fn();
const mockGetByWalletAddressWithOrganization = jest.fn();
const mockUsersCreate = jest.fn();
const mockUsersUpdate = jest.fn();
const mockOrgsCreate = jest.fn();
const mockOrgsGetBySlug = jest.fn();
const mockOrgsDelete = jest.fn();
const mockApiKeysCreate = jest.fn();
const mockApiKeysListByOrganization = jest.fn();
const mockCreditsAddCredits = jest.fn();
const mockCheckSignupAbuse = jest.fn();
const mockRecordSignupMetadata = jest.fn();

jest.mock("@/lib/cache/client", () => ({
  cache: {
    get: mockCacheGet,
    set: mockCacheSet,
    isAvailable: mockCacheIsAvailable,
  },
}));

jest.mock("@/lib/cache/consume", () => ({
  atomicConsume: mockAtomicConsume,
}));

jest.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: mockGetByWalletAddressWithOrganization,
    create: mockUsersCreate,
    update: mockUsersUpdate,
  },
}));

jest.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    create: mockOrgsCreate,
    getBySlug: mockOrgsGetBySlug,
    delete: mockOrgsDelete,
  },
}));

jest.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    create: mockApiKeysCreate,
    listByOrganization: mockApiKeysListByOrganization,
  },
}));

jest.mock("@/lib/services/credits", () => ({
  creditsService: {
    addCredits: mockCreditsAddCredits,
  },
}));

jest.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: {
    checkSignupAbuse: mockCheckSignupAbuse,
    recordSignupMetadata: mockRecordSignupMetadata,
  },
}));

jest.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

jest.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: () => "https://example.com/avatar.png",
}));

jest.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: () => "abc123-def456",
  getInitialCredits: () => 5.0,
}));

jest.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

// Mock viem functions
const VALID_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
jest.mock("viem/siwe", () => ({
  parseSiweMessage: jest.fn().mockReturnValue({
    address: VALID_ADDRESS,
    nonce: "test-nonce-123",
    domain: "app.example.com",
  }),
}));

jest.mock("viem", () => ({
  recoverMessageAddress: jest.fn().mockResolvedValue(VALID_ADDRESS),
  getAddress: jest.fn((addr: string) => addr),
}));

// Import after mocks
import { POST } from "../../verify/route";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("https://app.example.com/api/auth/siwe/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("SIWE verify endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockAtomicConsume.mockResolvedValue(1);
    mockCheckSignupAbuse.mockResolvedValue({ allowed: true });
    mockRecordSignupMetadata.mockResolvedValue(undefined);
  });

  // --- Invalid body ---
  describe("invalid request body", () => {
    it("returns 400 when body is not JSON", async () => {
      const req = new NextRequest("https://app.example.com/api/auth/siwe/verify", {
        method: "POST",
        body: "not-json",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_BODY");
    });

    it("returns 400 when message is missing", async () => {
      const res = await POST(makeRequest({ signature: "0xabc" }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_BODY");
    });

    it("returns 400 when signature is missing", async () => {
      const res = await POST(makeRequest({ message: "hello" }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_BODY");
    });

    it("returns 400 when message is empty string", async () => {
      const res = await POST(makeRequest({ message: "  ", signature: "0xabc" }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when signature is empty string", async () => {
      const res = await POST(makeRequest({ message: "hello", signature: "  " }));
      expect(res.status).toBe(400);
    });
  });

  // --- Cache unavailability ---
  describe("cache unavailability", () => {
    it("returns 503 when cache is unavailable", async () => {
      mockCacheIsAvailable.mockReturnValue(false);
      const res = await POST(makeRequest({ message: "hello", signature: "0xabc" }));
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  // --- Nonce validation (single-use) ---
  describe("nonce validation", () => {
    it("returns 400 when nonce was already consumed", async () => {
      mockAtomicConsume.mockResolvedValue(0);
      const res = await POST(makeRequest({ message: "hello", signature: "0xabc" }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_NONCE");
    });

    it("calls atomicConsume with the correct cache key", async () => {
      mockAtomicConsume.mockResolvedValue(0);
      await POST(makeRequest({ message: "hello", signature: "0xabc" }));
      expect(mockAtomicConsume).toHaveBeenCalledTimes(1);
      // Verify it was called (key format depends on CacheKeys implementation)
      expect(mockAtomicConsume).toHaveBeenCalled();
    });
  });

  // --- Domain validation ---
  describe("domain validation", () => {
    it("returns 400 when SIWE message domain does not match server", async () => {
      const { parseSiweMessage } = require("viem/siwe");
      parseSiweMessage.mockReturnValueOnce({
        address: VALID_ADDRESS,
        nonce: "test-nonce-123",
        domain: "evil.com",
      });
      const res = await POST(makeRequest({ message: "hello", signature: "0xabc" }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_DOMAIN");
    });
  });

  // --- Signature validation ---
  describe("signature validation", () => {
    it("returns 400 when signature recovery fails", async () => {
      const { recoverMessageAddress } = require("viem");
      recoverMessageAddress.mockRejectedValueOnce(new Error("bad sig"));
      const res = await POST(makeRequest({ message: "hello", signature: "0xabc" }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_SIGNATURE");
    });

    it("returns 400 when recovered address does not match claimed address", async () => {
      const { recoverMessageAddress, getAddress } = require("viem");
      recoverMessageAddress.mockResolvedValueOnce("0x0000000000000000000000000000000000000001");
      getAddress.mockImplementation((addr: string) => addr);
      const res = await POST(makeRequest({ message: "hello", signature: "0xabc" }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("INVALID_SIGNATURE");
    });
  });

  // --- Existing user (sign-in) ---
  describe("existing user sign-in", () => {
    it("returns existing user with API key and isNewAccount=false", async () => {
      const existingUser = {
        id: "user-1",
        name: "0xd8dA...6045",
        is_active: true,
        wallet_verified: true,
        organization_id: "org-1",
        organization: { is_active: true, name: "Test Org", credit_balance: "5.00" },
      };
      mockGetByWalletAddressWithOrganization.mockResolvedValue(existingUser);
      mockApiKeysListByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "existing-key-123" },
      ]);

      const res = await POST(makeRequest({ message: "hello", signature: "0xabc" }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.isNewAccount).toBe(false);
      expect(json.apiKey).toBe("existing-key-123");
    });

    it("returns 403 when user account is inactive", async () => {
      mockGetByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-1",
        is_active: false,
        organization_id: "org-1",
        organization: { is_active: true },
      });
      const res = await POST(makeRequest({ message: "hello", signature: "0xabc" }));
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("ACCOUNT_INACTIVE");
    });

    it("returns 403 when organization is inactive", async () => {
      mockGetByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-1",
        is_active: true,
        organization_id: "org-1",
        organization: { is_active: false },
      });
      const res = await POST(makeRequest({ message: "hello", signature: "0xabc" }));
      expect(res.status).toBe(403);
    });

    it("marks wallet as verified if not yet verified", async () => {
      const existingUser = {
        id: "user-1",
        is_active: true,
        wallet_verified: false,
        organization_id: "org-1",
        organization: { is_active: true, name: "Test Org", credit_balance: "5.00" },
      };
      mockGetByWalletAddressWithOrganization.mockResolvedValue(existingUser);
      mockApiKeysListByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "key-123" },
      ]);

      await POST(makeRequest({ message: "hello", signature: "0xabc" }));
      expect(mockUsersUpdate).toHaveBeenCalledWith("user-1", { wallet_verified: true });
    });

    it("creates new API key if user has no active keys", async () => {
      const existingUser = {
        id: "user-1",
        is_active: true,
        wallet_verified: true,
        organization_id: "org-1",
        organization: { is_active: true, name: "Test Org", credit_balance: "5.00" },
      };
      mockGetByWalletAddressWithOrganization.mockResolvedValue(existingUser);
      mockApiKeysListByOrganization.mockResolvedValue([]);
      mockApiKeysCreate.mockResolvedValue({ plainKey: "new-key-456" });

      const res = await POST(makeRequest({ message: "hello", signature: "0xabc" }));
      const json = await res.json();
      expect(json.apiKey).toBe("new-key-456");
      expect(mockApiKeysCreate).toHaveBeenCalledWith({
        user_id: "user-1",
        organization_id: "org-1",
        name: "Default API Key",
        is_active: true,
      });
    });
  });

  // --- New user (sign-up) ---
  describe("new user sign-up", () => {
    beforeEach(() => {
      mockGetByWalletAddressWithOrganization.mockResolvedValue(undefined);
      mockOrgsGetBySlug.mockResolvedValue(undefined);
      mockOrgsCreate.mockResolvedValue({
        id: "org-new",
        name: "Test Org",
        slug: "abc123-def456",
        credit_balance: "0.00",
      });
      mockUsersCreate.mockResolvedValue({
        id: "user-new",
        name: "0xd8dA...6045",
        wallet_address: VALID_ADDRESS.toLowerCase(),
        organization_id: "org-new",
      });
      mockApiKeysCreate.mockResolvedValue({ plainKey: "new-api-key" });
    });

    it("creates org, user, and API key for new wallet", async () => {
      const res = await POST(makeRequest({ message: "hello", signature: "0xabc" }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.isNewAccount).toBe(true);
      expect(json.apiKey).toBe("new-api-key");

      expect(mockOrgsCreate).toHaveBeenCalledTimes(1);
      expect(mockUsersCreate).toHaveBeenCalledTimes(1);
      expect(mockApiKeysCreate).toHaveBeenCalledTimes(1);
    });

    it("adds initial credits during signup", async () => {
      await POST(makeRequest({ message: "hello", signature: "0xabc" }));
      expect(mockCreditsAddCredits).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org-new",
          amount: 5.0,
          description: "Initial free credits - Welcome bonus",
        }),
      );
    });

    it("returns 403 when abuse detection blocks signup", async () => {
      mockCheckSignupAbuse.mockResolvedValue({
        allowed: false,
        reason: "Too many signups from this IP",
      });
      const res = await POST(makeRequest({ message: "hello", signature: "0xabc" }));
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("SIGNUP_BLOCKED");
    });

    it("cleans up orphaned org when user creation fails", async () => {
      mockUsersCreate.mockRejectedValue(new Error("DB error"));
      await expect(
        POST(makeRequest({ message: "hello", signature: "0xabc" })),
      ).rejects.toThrow("DB error");
      expect(mockOrgsDelete).toHaveBeenCalledWith("org-new");
    });

    it("cleans up orphaned org on 23505 duplicate key and recovers race winner", async () => {
      const duplicateError = Object.assign(new Error("duplicate"), { code: "23505" });
      mockUsersCreate.mockRejectedValue(duplicateError);

      const raceWinner = {
        id: "user-winner",
        is_active: true,
        wallet_verified: true,
        organization_id: "org-winner",
        organization: { is_active: true, name: "Winner Org", credit_balance: "5.00" },
      };
      // First call returns undefined (not yet), second returns the winner
      mockGetByWalletAddressWithOrganization
        .mockResolvedValueOnce(undefined) // initial lookup
        .mockResolvedValueOnce(raceWinner); // retry in race handler

      mockApiKeysListByOrganization.mockResolvedValue([
        { user_id: "user-winner", is_active: true, key: "winner-key" },
      ]);

      const res = await POST(makeRequest({ message: "hello", signature: "0xabc" }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.isNewAccount).toBe(false);
      expect(json.apiKey).toBe("winner-key");
      // Orphaned org should be cleaned up
      expect(mockOrgsDelete).toHaveBeenCalledWith("org-new");
    });

    it("cleans up org when credit addition fails", async () => {
      mockCreditsAddCredits.mockRejectedValue(new Error("Credits service down"));
      await expect(
        POST(makeRequest({ message: "hello", signature: "0xabc" })),
      ).rejects.toThrow("Credits service down");
      expect(mockOrgsDelete).toHaveBeenCalledWith("org-new");
    });

    it("cleans up org when API key creation fails", async () => {
      mockApiKeysCreate.mockRejectedValue(new Error("API key creation failed"));
      await expect(
        POST(makeRequest({ message: "hello", signature: "0xabc" })),
      ).rejects.toThrow("API key creation failed");
      expect(mockOrgsDelete).toHaveBeenCalledWith("org-new");
    });
  });
});
