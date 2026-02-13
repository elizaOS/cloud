
/**
 * Tests for SIWE verify endpoint
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockAtomicConsume = vi.fn();
const mockCacheIsAvailable = vi.fn().mockReturnValue(true);

vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: () => mockCacheIsAvailable(),
  },
}));

vi.mock("@/lib/cache/keys", () => ({
  CacheKeys: {
    siwe: {
      nonce: (n: string) => `siwe:nonce:${n}`,
    },
  },
}));

vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: (...args: unknown[]) => mockAtomicConsume(...args),
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

// Mock viem
vi.mock("viem/siwe", () => ({
  parseSiweMessage: vi.fn().mockReturnValue({
    address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    nonce: "testnonce",
    domain: "app.example.com",
  }),
}));

vi.mock("viem", () => ({
  recoverMessageAddress: vi.fn().mockResolvedValue(
    "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  ),
  getAddress: (addr: string) => addr,
}));

// Mock services
const mockGetByWallet = vi.fn();
const mockUserUpdate = vi.fn();
const mockUserCreate = vi.fn();
const mockApiKeysList = vi.fn();
const mockApiKeysCreate = vi.fn();
const mockOrgCreate = vi.fn();
const mockOrgGetBySlug = vi.fn();
const mockOrgDelete = vi.fn();
const mockAddCredits = vi.fn();
const mockCheckAbuse = vi.fn();
const mockRecordSignup = vi.fn();

vi.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: (...args: unknown[]) => mockGetByWallet(...args),
    update: (...args: unknown[]) => mockUserUpdate(...args),
    create: (...args: unknown[]) => mockUserCreate(...args),
  },
}));

vi.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: (...args: unknown[]) => mockApiKeysList(...args),
    create: (...args: unknown[]) => mockApiKeysCreate(...args),
  },
}));

vi.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    create: (...args: unknown[]) => mockOrgCreate(...args),
    getBySlug: (...args: unknown[]) => mockOrgGetBySlug(...args),
    delete: (...args: unknown[]) => mockOrgDelete(...args),
  },
}));

vi.mock("@/lib/services/credits", () => ({
  creditsService: {
    addCredits: (...args: unknown[]) => mockAddCredits(...args),
  },
}));

vi.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: {
    checkSignupAbuse: (...args: unknown[]) => mockCheckAbuse(...args),
    recordSignupMetadata: (...args: unknown[]) => mockRecordSignup(...args),
  },
}));

vi.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: () => "avatar.png",
}));

vi.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: () => "abc123-def456",
  getInitialCredits: () => 5.0,
}));

const { POST } = await import("../../verify/route");

function makeVerifyRequest(body: Record<string, unknown> = {}) {
  return new Request("https://app.example.com/api/auth/siwe/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

const VALID_BODY = {
  message: "app.example.com wants you to sign in...",
  signature: "0xabc123",
};

describe("SIWE verify endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockAtomicConsume.mockResolvedValue(1);
    mockGetByWallet.mockResolvedValue(undefined);
    mockCheckAbuse.mockResolvedValue({ allowed: true });
    mockRecordSignup.mockResolvedValue(undefined);
    mockOrgGetBySlug.mockResolvedValue(null);
    mockOrgCreate.mockResolvedValue({
      id: "org-1",
      name: "Test Org",
      slug: "abc123-def456",
      credit_balance: "0.00",
    });
    mockAddCredits.mockResolvedValue(undefined);
    mockUserCreate.mockResolvedValue({
      id: "user-1",
      name: "0xd8dA...6045",
      organization_id: "org-1",
      wallet_address: VALID_ADDRESS_LOWER,
      wallet_verified: true,
    });
    mockApiKeysCreate.mockResolvedValue({ plainKey: "ek_test_key123" });
    mockApiKeysList.mockResolvedValue([]);
  });

  // --- Invalid input ---
  it("returns 400 for missing body fields", async () => {
    const res = await POST(makeVerifyRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty message", async () => {
    const res = await POST(makeVerifyRequest({ message: "", signature: "0xabc" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty signature", async () => {
    const res = await POST(makeVerifyRequest({ message: "hello", signature: "" }));
    expect(res.status).toBe(400);
  });

  // --- Cache unavailable ---
  it("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);
    const res = await POST(makeVerifyRequest(VALID_BODY));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  // --- Invalid nonce ---
  it("returns 400 for already-used nonce (atomicConsume returns 0)", async () => {
    mockAtomicConsume.mockResolvedValue(0);
    const res = await POST(makeVerifyRequest(VALID_BODY));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_NONCE");
  });

  it("nonce is consumed exactly once (single-use)", async () => {
    mockAtomicConsume.mockResolvedValue(1);
    await POST(makeVerifyRequest(VALID_BODY));
    expect(mockAtomicConsume).toHaveBeenCalledTimes(1);
    expect(mockAtomicConsume).toHaveBeenCalledWith("siwe:nonce:testnonce");
  });

  // --- Existing user path ---
  it("returns existing user with API key", async () => {
    const existingUser = {
      id: "user-1",
      name: "Test",
      organization_id: "org-1",
      organization: { id: "org-1", name: "Org", credit_balance: "5.00", is_active: true },
      is_active: true,
      wallet_verified: true,
      privy_user_id: null,
    };
    mockGetByWallet.mockResolvedValue(existingUser);
    mockApiKeysList.mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "ek_existing" },
    ]);

    const res = await POST(makeVerifyRequest(VALID_BODY));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.isNewAccount).toBe(false);
    expect(json.apiKey).toBe("ek_existing");
  });

  it("marks wallet as verified for existing unverified user", async () => {
    const existingUser = {
      id: "user-1",
      name: "Test",
      organization_id: "org-1",
      organization: { id: "org-1", name: "Org", credit_balance: "5.00", is_active: true },
      is_active: true,
      wallet_verified: false,
      privy_user_id: null,
    };
    mockGetByWallet.mockResolvedValue(existingUser);
    mockApiKeysList.mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "ek_existing" },
    ]);

    await POST(makeVerifyRequest(VALID_BODY));
    expect(mockUserUpdate).toHaveBeenCalledWith("user-1", { wallet_verified: true });
  });

  it("returns 403 for inactive user", async () => {
    mockGetByWallet.mockResolvedValue({
      id: "user-1",
      is_active: false,
      organization_id: "org-1",
      organization: { is_active: true },
    });
    const res = await POST(makeVerifyRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  // --- New user signup path ---
  it("creates org, user, and API key for new wallet", async () => {
    const res = await POST(makeVerifyRequest(VALID_BODY));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.isNewAccount).toBe(true);
    expect(json.apiKey).toBe("ek_test_key123");
    expect(mockOrgCreate).toHaveBeenCalled();
    expect(mockUserCreate).toHaveBeenCalled();
    expect(mockApiKeysCreate).toHaveBeenCalled();
    expect(mockAddCredits).toHaveBeenCalled();
  });

  it("cleans up org on non-duplicate user creation failure", async () => {
    mockUserCreate.mockRejectedValue(new Error("DB error"));
    await expect(POST(makeVerifyRequest(VALID_BODY))).rejects.toThrow("DB error");
    expect(mockOrgDelete).toHaveBeenCalledWith("org-1");
  });

  it("cleans up org on duplicate-key (23505) user creation failure", async () => {
    const dupError = Object.assign(new Error("duplicate"), { code: "23505" });
    mockUserCreate.mockRejectedValue(dupError);
    // Race winner found on retry
    mockGetByWallet
      .mockResolvedValueOnce(undefined) // initial check
      .mockResolvedValueOnce({
        id: "user-race",
        organization_id: "org-race",
        organization: { id: "org-race", name: "Race Org", credit_balance: "5.00" },
        wallet_verified: true,
      });
    mockApiKeysList.mockResolvedValue([
      { user_id: "user-race", is_active: true, key: "ek_race" },
    ]);

    const res = await POST(makeVerifyRequest(VALID_BODY));
    // Org created by losing request should still be cleaned up
    expect(mockOrgDelete).toHaveBeenCalledWith("org-1");
  });

  // --- Abuse detection ---
  it("returns 403 when abuse detection blocks signup", async () => {
    mockCheckAbuse.mockResolvedValue({ allowed: false, reason: "Too many signups" });
    const res = await POST(makeVerifyRequest(VALID_BODY));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("SIGNUP_BLOCKED");
  });

  // --- Invalid domain ---
  it("returns 400 for domain mismatch", async () => {
    const { parseSiweMessage } = await import("viem/siwe");
    (parseSiweMessage as any).mockReturnValueOnce({
      address: VALID_ADDRESS,
      nonce: "testnonce",
      domain: "evil.com",
    });
    const res = await POST(makeVerifyRequest(VALID_BODY));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_DOMAIN");
  });

  // --- Invalid signature ---
  it("returns 400 for invalid signature", async () => {
    const { recoverMessageAddress } = await import("viem");
    (recoverMessageAddress as any).mockRejectedValueOnce(new Error("bad sig"));
    const res = await POST(makeVerifyRequest(VALID_BODY));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_SIGNATURE");
  });
});
