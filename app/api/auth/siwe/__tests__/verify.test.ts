
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
  atomicConsume: (...args: any[]) => mockAtomicConsume(...args),
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

const mockGetByWallet = vi.fn();
const mockUserCreate = vi.fn();
const mockUserUpdate = vi.fn();

vi.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: (...args: any[]) => mockGetByWallet(...args),
    create: (...args: any[]) => mockUserCreate(...args),
    update: (...args: any[]) => mockUserUpdate(...args),
  },
}));

const mockOrgCreate = vi.fn();
const mockOrgGetBySlug = vi.fn().mockResolvedValue(null);
const mockOrgDelete = vi.fn();

vi.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    create: (...args: any[]) => mockOrgCreate(...args),
    getBySlug: (...args: any[]) => mockOrgGetBySlug(...args),
    delete: (...args: any[]) => mockOrgDelete(...args),
  },
}));

const mockApiKeysCreate = vi.fn();
const mockApiKeysList = vi.fn();

vi.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    create: (...args: any[]) => mockApiKeysCreate(...args),
    listByOrganization: (...args: any[]) => mockApiKeysList(...args),
  },
}));

const mockAddCredits = vi.fn();

vi.mock("@/lib/services/credits", () => ({
  creditsService: {
    addCredits: (...args: any[]) => mockAddCredits(...args),
  },
}));

const mockCheckAbuse = vi.fn().mockResolvedValue({ allowed: true });
const mockRecordMetadata = vi.fn();

vi.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: {
    checkSignupAbuse: (...args: any[]) => mockCheckAbuse(...args),
    recordSignupMetadata: (...args: any[]) => mockRecordMetadata(...args),
  },
}));

vi.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: () => "https://example.com/avatar.png",
}));

vi.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: (addr: string) => `org-${addr.substring(0, 8)}`,
  getInitialCredits: () => 100,
}));

// We need to mock viem functions
const VALID_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

vi.mock("viem/siwe", () => ({
  parseSiweMessage: (message: string) => {
    // Parse our test messages
    if (message.includes("BAD_NONCE")) {
      return { address: VALID_ADDRESS, nonce: "bad-nonce", domain: "app.example.com" };
    }
    if (message.includes("WRONG_DOMAIN")) {
      return { address: VALID_ADDRESS, nonce: "good-nonce", domain: "evil.com" };
    }
    if (message.includes("MISSING_FIELDS")) {
      return {};
    }
    if (message.includes("EXPIRED")) {
      return {
        address: VALID_ADDRESS,
        nonce: "good-nonce",
        domain: "app.example.com",
        expirationTime: new Date("2000-01-01"),
      };
    }
    return { address: VALID_ADDRESS, nonce: "good-nonce", domain: "app.example.com" };
  },
}));

vi.mock("viem", () => ({
  recoverMessageAddress: vi.fn().mockResolvedValue(VALID_ADDRESS),
  getAddress: (addr: string) => addr,
}));

// Import after all mocks
import { POST } from "../../verify/route";

function makeVerifyRequest(body: Record<string, any> = {}) {
  const defaultBody = {
    message: "valid-siwe-message",
    signature: "0xdeadbeef",
    ...body,
  };
  return new NextRequest("https://app.example.com/api/auth/siwe/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(defaultBody),
  });
}

describe("SIWE verify endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockAtomicConsume.mockResolvedValue(1); // nonce exists and was consumed
    mockCheckAbuse.mockResolvedValue({ allowed: true });
  });

  // --- Validation failures ---

  it("returns 400 for missing message field", async () => {
    const req = new NextRequest("https://app.example.com/api/auth/siwe/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signature: "0xabc" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  it("returns 400 for missing signature field", async () => {
    const req = new NextRequest("https://app.example.com/api/auth/siwe/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  it("returns 400 for empty body", async () => {
    const req = new NextRequest("https://app.example.com/api/auth/siwe/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when SIWE message is missing required fields", async () => {
    const res = await POST(makeVerifyRequest({ message: "MISSING_FIELDS" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  // --- Cache / nonce failures ---

  it("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);
    const res = await POST(makeVerifyRequest());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 400 for invalid (already consumed or expired) nonce", async () => {
    mockAtomicConsume.mockResolvedValue(0); // nonce not found
    const res = await POST(makeVerifyRequest({ message: "BAD_NONCE" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_NONCE");
  });

  it("nonce is single-use (atomicConsume called exactly once)", async () => {
    mockGetByWallet.mockResolvedValue({
      id: "user-1",
      is_active: true,
      organization_id: "org-1",
      organization: { is_active: true },
      wallet_verified: true,
    });
    mockApiKeysList.mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "sk-existing" },
    ]);

    await POST(makeVerifyRequest());
    expect(mockAtomicConsume).toHaveBeenCalledTimes(1);
  });

  // --- Domain validation ---

  it("returns 400 when SIWE domain does not match server", async () => {
    const res = await POST(makeVerifyRequest({ message: "WRONG_DOMAIN" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_DOMAIN");
  });

  // --- Message expiration ---

  it("returns 400 when SIWE message has expired", async () => {
    const res = await POST(makeVerifyRequest({ message: "EXPIRED" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("MESSAGE_EXPIRED");
  });

  // --- Existing user path ---

  it("returns existing user with isNewAccount=false", async () => {
    const existingUser = {
      id: "user-1",
      name: "Alice",
      privy_user_id: null,
      is_active: true,
      organization_id: "org-1",
      organization: { id: "org-1", name: "Org", is_active: true, credit_balance: "100.00" },
      wallet_verified: true,
    };
    mockGetByWallet.mockResolvedValue(existingUser);
    mockApiKeysList.mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "sk-existing-key" },
    ]);

    const res = await POST(makeVerifyRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isNewAccount).toBe(false);
    expect(json.apiKey).toBe("sk-existing-key");
  });

  it("marks wallet as verified for existing unverified user", async () => {
    const existingUser = {
      id: "user-1",
      name: "Alice",
      privy_user_id: null,
      is_active: true,
      organization_id: "org-1",
      organization: { id: "org-1", name: "Org", is_active: true },
      wallet_verified: false,
    };
    mockGetByWallet.mockResolvedValue(existingUser);
    mockApiKeysList.mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "sk-key" },
    ]);

    await POST(makeVerifyRequest());
    expect(mockUserUpdate).toHaveBeenCalledWith("user-1", { wallet_verified: true });
  });

  it("returns 403 for inactive account", async () => {
    mockGetByWallet.mockResolvedValue({
      id: "user-1",
      is_active: false,
      organization_id: "org-1",
      organization: { is_active: true },
    });

    const res = await POST(makeVerifyRequest());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("ACCOUNT_INACTIVE");
  });

  it("returns 403 for inactive organization", async () => {
    mockGetByWallet.mockResolvedValue({
      id: "user-1",
      is_active: true,
      organization_id: "org-1",
      organization: { is_active: false },
    });

    const res = await POST(makeVerifyRequest());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("ACCOUNT_INACTIVE");
  });

  // --- New user path ---

  it("creates new user, org, and API key for unknown wallet", async () => {
    mockGetByWallet.mockResolvedValue(null); // no existing user
    mockOrgCreate.mockResolvedValue({ id: "new-org", name: "Test Org" });
    mockUserCreate.mockResolvedValue({
      id: "new-user",
      name: "0x1234...5678",
      organization_id: "new-org",
    });
    mockApiKeysCreate.mockResolvedValue({ plainKey: "sk-new-key" });

    const res = await POST(makeVerifyRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isNewAccount).toBe(true);
    expect(json.apiKey).toBe("sk-new-key");

    expect(mockOrgCreate).toHaveBeenCalledTimes(1);
    expect(mockUserCreate).toHaveBeenCalledTimes(1);
    expect(mockApiKeysCreate).toHaveBeenCalledTimes(1);
    expect(mockAddCredits).toHaveBeenCalledTimes(1);
  });

  it("runs abuse check before creating resources for new user", async () => {
    mockGetByWallet.mockResolvedValue(null);
    mockCheckAbuse.mockResolvedValue({ allowed: false, reason: "Rate limited" });

    const res = await POST(makeVerifyRequest());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("SIGNUP_BLOCKED");

    // Should not have created any resources
    expect(mockOrgCreate).not.toHaveBeenCalled();
    expect(mockUserCreate).not.toHaveBeenCalled();
  });

  it("cleans up org on user creation failure (non-duplicate)", async () => {
    mockGetByWallet.mockResolvedValue(null);
    mockOrgCreate.mockResolvedValue({ id: "orphan-org" });
    mockUserCreate.mockRejectedValue(new Error("DB connection lost"));

    await expect(POST(makeVerifyRequest())).rejects.toThrow("DB connection lost");
    expect(mockOrgDelete).toHaveBeenCalledWith("orphan-org");
  });

  it("does not delete org on duplicate key error (race condition)", async () => {
    mockGetByWallet
      .mockResolvedValueOnce(null) // first check: no user
      .mockResolvedValueOnce({
        // retry after 23505: user exists now
        id: "race-user",
        name: "Winner",
        is_active: true,
        organization_id: "race-org",
        organization: { id: "race-org", name: "Org", is_active: true },
        wallet_verified: true,
      });
    mockOrgCreate.mockResolvedValue({ id: "loser-org" });
    const duplicateError = Object.assign(new Error("duplicate"), { code: "23505" });
    mockUserCreate.mockRejectedValue(duplicateError);
    mockApiKeysList.mockResolvedValue([
      { user_id: "race-user", is_active: true, key: "sk-race-key" },
    ]);

    const res = await POST(makeVerifyRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isNewAccount).toBe(false);

    // Org should NOT have been deleted since it was a duplicate key error
    expect(mockOrgDelete).not.toHaveBeenCalled();
  });
});
