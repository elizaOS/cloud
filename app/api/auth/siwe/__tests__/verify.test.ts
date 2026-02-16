
/**
 * Tests for SIWE verify endpoint.
 *
 * Covers nonce validation, domain validation, signature verification,
 * existing-user sign-in, new-user signup, and key failure modes.
 */

import { NextRequest } from "next/server";

// --- Mocks (hoisted) ---

const mockCacheIsAvailable = jest.fn().mockReturnValue(true);
const mockAtomicConsume = jest.fn().mockResolvedValue(1);

jest.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: mockCacheIsAvailable,
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock("@/lib/cache/consume", () => ({
  atomicConsume: mockAtomicConsume,
}));

const mockGetByWalletAddressWithOrganization = jest.fn();
const mockUsersCreate = jest.fn();
const mockUsersUpdate = jest.fn();
jest.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: mockGetByWalletAddressWithOrganization,
    create: mockUsersCreate,
    update: mockUsersUpdate,
  },
}));

const mockApiKeysCreate = jest.fn();
const mockApiKeysListByOrganization = jest.fn().mockResolvedValue([]);
jest.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    create: mockApiKeysCreate,
    listByOrganization: mockApiKeysListByOrganization,
  },
}));

const mockOrgsCreate = jest.fn();
const mockOrgsGetBySlug = jest.fn().mockResolvedValue(null);
const mockOrgsDelete = jest.fn();
jest.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    create: mockOrgsCreate,
    getBySlug: mockOrgsGetBySlug,
    delete: mockOrgsDelete,
  },
}));

const mockAddCredits = jest.fn();
jest.mock("@/lib/services/credits", () => ({
  creditsService: {
    addCredits: mockAddCredits,
  },
}));

const mockCheckSignupAbuse = jest.fn().mockResolvedValue({ allowed: true });
const mockRecordSignupMetadata = jest.fn();
jest.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: {
    checkSignupAbuse: mockCheckSignupAbuse,
    recordSignupMetadata: mockRecordSignupMetadata,
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

// Mock viem
const mockRecoverMessageAddress = jest.fn();
jest.mock("viem", () => ({
  recoverMessageAddress: (...args: unknown[]) => mockRecoverMessageAddress(...args),
  getAddress: (addr: string) => addr, // simplified: return as-is
}));

const mockParseSiweMessage = jest.fn();
jest.mock("viem/siwe", () => ({
  parseSiweMessage: (...args: unknown[]) => mockParseSiweMessage(...args),
}));

// --- Helpers ---

const VALID_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

function makeSiweMessage(overrides: Record<string, unknown> = {}) {
  return {
    address: VALID_ADDRESS,
    nonce: "testnonce123",
    domain: "app.example.com",
    uri: "https://app.example.com",
    version: "1",
    chainId: 1,
    ...overrides,
  };
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("https://app.example.com/api/auth/siwe/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- Tests ---

describe("SIWE verify endpoint", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import("../verify/route");
    POST = mod.POST as unknown as (req: NextRequest) => Promise<Response>;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockAtomicConsume.mockResolvedValue(1);
    mockParseSiweMessage.mockReturnValue(makeSiweMessage());
    mockRecoverMessageAddress.mockResolvedValue(VALID_ADDRESS);
    mockGetByWalletAddressWithOrganization.mockResolvedValue(null);
    mockCheckSignupAbuse.mockResolvedValue({ allowed: true });
    mockOrgsGetBySlug.mockResolvedValue(null);
    mockApiKeysListByOrganization.mockResolvedValue([]);
  });

  // --- Input validation ---

  test("rejects request with missing message", async () => {
    const res = await POST(makeRequest({ signature: "0xabc" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  test("rejects request with missing signature", async () => {
    const res = await POST(makeRequest({ message: "hello" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  test("rejects malformed SIWE message", async () => {
    mockParseSiweMessage.mockImplementation(() => {
      throw new Error("Invalid SIWE message");
    });
    const res = await POST(makeRequest({ message: "garbage", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  test("rejects SIWE message missing required fields", async () => {
    mockParseSiweMessage.mockReturnValue({ address: VALID_ADDRESS }); // missing nonce, domain, etc.
    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  // --- Nonce validation ---

  test("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);
    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  test("returns INVALID_NONCE when nonce was already consumed", async () => {
    mockAtomicConsume.mockResolvedValue(0);
    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_NONCE");
  });

  test("returns 503 when atomicConsume throws", async () => {
    mockAtomicConsume.mockRejectedValue(new Error("Redis connection failed"));
    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(503);
  });

  // --- Domain validation ---

  test("rejects mismatched domain", async () => {
    mockParseSiweMessage.mockReturnValue(makeSiweMessage({ domain: "evil.com" }));
    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_DOMAIN");
  });

  // --- Signature validation ---

  test("rejects invalid signature", async () => {
    mockRecoverMessageAddress.mockRejectedValue(new Error("bad sig"));
    const res = await POST(makeRequest({ message: "msg", signature: "0xbad" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_SIGNATURE");
  });

  test("rejects signature from wrong address", async () => {
    mockRecoverMessageAddress.mockResolvedValue("0xDEAD");
    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_SIGNATURE");
  });

  // --- Existing user path ---

  test("returns existing user with API key (sign-in)", async () => {
    const existingUser = {
      id: "user-1",
      name: "Test",
      privy_user_id: null,
      is_active: true,
      wallet_verified: true,
      organization_id: "org-1",
      organization: { id: "org-1", name: "Org", is_active: true, credit_balance: "5.00" },
    };
    mockGetByWalletAddressWithOrganization.mockResolvedValue(existingUser);
    mockApiKeysListByOrganization.mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "ak_existing" },
    ]);

    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isNewAccount).toBe(false);
    expect(json.apiKey).toBe("ak_existing");
  });

  test("marks wallet as verified for existing unverified user", async () => {
    const existingUser = {
      id: "user-1",
      name: "Test",
      privy_user_id: "privy-123",
      is_active: true,
      wallet_verified: false,
      organization_id: "org-1",
      organization: { id: "org-1", name: "Org", is_active: true, credit_balance: "5.00" },
    };
    mockGetByWalletAddressWithOrganization.mockResolvedValue(existingUser);
    mockApiKeysListByOrganization.mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "ak_existing" },
    ]);

    await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(mockUsersUpdate).toHaveBeenCalledWith("user-1", { wallet_verified: true });
  });

  test("rejects inactive user", async () => {
    const inactiveUser = {
      id: "user-1",
      is_active: false,
      organization_id: "org-1",
      organization: { id: "org-1", is_active: true },
    };
    mockGetByWalletAddressWithOrganization.mockResolvedValue(inactiveUser);
    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("ACCOUNT_INACTIVE");
  });

  test("rejects user in inactive organization", async () => {
    const user = {
      id: "user-1",
      is_active: true,
      organization_id: "org-1",
      organization: { id: "org-1", is_active: false },
    };
    mockGetByWalletAddressWithOrganization.mockResolvedValue(user);
    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(403);
  });

  // --- New user path (sign-up) ---

  test("creates new user, org, credits, and API key (sign-up)", async () => {
    const newOrg = { id: "org-new", name: "Org", slug: "wallet-abc123-test", credit_balance: "0.00" };
    const newUser = {
      id: "user-new",
      name: "0x1234...5678",
      wallet_address: VALID_ADDRESS.toLowerCase(),
      organization_id: "org-new",
    };
    mockOrgsCreate.mockResolvedValue(newOrg);
    mockUsersCreate.mockResolvedValue(newUser);
    mockApiKeysCreate.mockResolvedValue({ plainKey: "ak_new_key" });

    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isNewAccount).toBe(true);
    expect(json.apiKey).toBe("ak_new_key");
    expect(mockOrgsCreate).toHaveBeenCalled();
    expect(mockAddCredits).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-new", amount: 5.0 }),
    );
    expect(mockUsersCreate).toHaveBeenCalled();
  });

  test("cleans up org when user creation fails", async () => {
    const newOrg = { id: "org-cleanup", name: "Org" };
    mockOrgsCreate.mockResolvedValue(newOrg);
    mockUsersCreate.mockRejectedValue(new Error("DB error"));

    await expect(
      POST(makeRequest({ message: "msg", signature: "0xabc" })),
    ).rejects.toThrow("DB error");

    expect(mockOrgsDelete).toHaveBeenCalledWith("org-cleanup");
  });

  test("cleans up org when credits fail", async () => {
    const newOrg = { id: "org-credits-fail", name: "Org" };
    mockOrgsCreate.mockResolvedValue(newOrg);
    mockAddCredits.mockRejectedValue(new Error("Credits service down"));

    await expect(
      POST(makeRequest({ message: "msg", signature: "0xabc" })),
    ).rejects.toThrow("Credits service down");

    expect(mockOrgsDelete).toHaveBeenCalledWith("org-credits-fail");
  });

  test("blocks signup when abuse check fails", async () => {
    mockCheckSignupAbuse.mockResolvedValue({ allowed: false, reason: "Too many signups" });
    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("SIGNUP_BLOCKED");
  });
});
