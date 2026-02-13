
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
const mockAtomicConsume = vi.fn();
const mockCacheIsAvailable = vi.fn(() => true);

vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: (...args: unknown[]) => mockAtomicConsume(...args),
}));

vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: () => mockCacheIsAvailable(),
  },
}));

vi.mock("@/lib/cache/keys", () => ({
  CacheKeys: { siwe: { nonce: (n: string) => `siwe:nonce:${n}` } },
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

const mockGetByWallet = vi.fn();
const mockUsersCreate = vi.fn();
const mockUsersUpdate = vi.fn();
vi.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: (...args: unknown[]) => mockGetByWallet(...args),
    create: (...args: unknown[]) => mockUsersCreate(...args),
    update: (...args: unknown[]) => mockUsersUpdate(...args),
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
  generateSlugFromWallet: () => "abc123-def456",
  getInitialCredits: () => 5.0,
}));

// Test constants
const VALID_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"; // vitalik.eth
const VALID_MESSAGE = `app.example.com wants you to sign in with your Ethereum account:
${VALID_ADDRESS}

Sign in to ElizaCloud

URI: https://app.example.com
Version: 1
Chain ID: 1
Nonce: abcdef123456
Issued At: 2024-01-01T00:00:00.000Z`;

vi.mock("viem/siwe", () => ({
  parseSiweMessage: () => ({
    address: VALID_ADDRESS,
    nonce: "abcdef123456",
    domain: "app.example.com",
  }),
}));

vi.mock("viem", () => ({
  recoverMessageAddress: () => Promise.resolve(VALID_ADDRESS),
  getAddress: (addr: string) => addr,
}));

describe("SIWE verify endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockAtomicConsume.mockResolvedValue(1);
    mockGetByWallet.mockResolvedValue(undefined);
    mockOrgGetBySlug.mockResolvedValue(undefined);
  });

  function makeRequest(body: Record<string, unknown>) {
    return new Request("http://localhost/api/auth/siwe/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 400 for missing message", async () => {
    const { POST } = await import("../../verify/route");
    const res = await (POST as Function)(
      makeRequest({ signature: "0xabc" }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  it("returns 400 for missing signature", async () => {
    const { POST } = await import("../../verify/route");
    const res = await (POST as Function)(
      makeRequest({ message: VALID_MESSAGE }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  it("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);
    const { POST } = await import("../../verify/route");
    const res = await (POST as Function)(
      makeRequest({ message: VALID_MESSAGE, signature: "0xabc" }),
    );
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 400 for expired/used nonce (deleteCount=0)", async () => {
    mockAtomicConsume.mockResolvedValue(0);
    const { POST } = await import("../../verify/route");
    const res = await (POST as Function)(
      makeRequest({ message: VALID_MESSAGE, signature: "0xabc" }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_NONCE");
  });

  it("returns existing user for known wallet", async () => {
    const existingUser = {
      id: "user-1",
      name: "Test User",
      is_active: true,
      wallet_verified: true,
      organization_id: "org-1",
      privy_user_id: null,
      organization: { id: "org-1", name: "Test Org", is_active: true, credit_balance: "5.00" },
    };
    mockGetByWallet.mockResolvedValue(existingUser);
    mockApiKeysList.mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "existing-key" },
    ]);

    const { POST } = await import("../../verify/route");
    const res = await (POST as Function)(
      makeRequest({ message: VALID_MESSAGE, signature: "0xabc" }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isNewAccount).toBe(false);
    expect(json.apiKey).toBe("existing-key");
  });

  it("creates new user for unknown wallet", async () => {
    const newOrg = { id: "org-new", name: "New Org", slug: "abc123-def456", credit_balance: "0.00", is_active: true };
    const newUser = {
      id: "user-new",
      name: "0xd8dA...6045",
      is_active: true,
      wallet_verified: true,
      organization_id: "org-new",
      privy_user_id: null,
      role: "owner",
    };
    mockOrgCreate.mockResolvedValue(newOrg);
    mockUsersCreate.mockResolvedValue(newUser);
    mockApiKeysCreate.mockResolvedValue({ plainKey: "new-api-key" });

    const { POST } = await import("../../verify/route");
    const res = await (POST as Function)(
      makeRequest({ message: VALID_MESSAGE, signature: "0xabc" }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isNewAccount).toBe(true);
    expect(json.apiKey).toBe("new-api-key");
  });

  it("returns 403 for inactive account", async () => {
    mockGetByWallet.mockResolvedValue({
      id: "user-1",
      is_active: false,
      organization_id: "org-1",
      organization: { is_active: true },
    });

    const { POST } = await import("../../verify/route");
    const res = await (POST as Function)(
      makeRequest({ message: VALID_MESSAGE, signature: "0xabc" }),
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("ACCOUNT_INACTIVE");
  });

  it("cleans up org on user creation failure", async () => {
    const newOrg = { id: "org-orphan", name: "Orphan Org", slug: "abc123-def456", credit_balance: "0.00" };
    mockOrgCreate.mockResolvedValue(newOrg);
    mockUsersCreate.mockRejectedValue(new Error("DB connection lost"));

    const { POST } = await import("../../verify/route");
    await expect(
      (POST as Function)(makeRequest({ message: VALID_MESSAGE, signature: "0xabc" })),
    ).rejects.toThrow("DB connection lost");

    expect(mockOrgDelete).toHaveBeenCalledWith("org-orphan");
  });
});
