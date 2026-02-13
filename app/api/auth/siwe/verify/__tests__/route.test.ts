
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockCacheIsAvailable = vi.fn().mockReturnValue(true);
vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: mockCacheIsAvailable,
  },
  CacheKeys: {
    siwe: { nonce: (n: string) => `siwe:nonce:${n}` },
  },
}));

const mockAtomicConsume = vi.fn();
vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: mockAtomicConsume,
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

const mockGetByWallet = vi.fn();
const mockUpdateUser = vi.fn();
vi.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: (...args: any[]) => mockGetByWallet(...args),
    update: (...args: any[]) => mockUpdateUser(...args),
    create: vi.fn(),
  },
}));

vi.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ plainKey: "test-key" }),
  },
}));

vi.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    create: vi.fn().mockResolvedValue({ id: "org-1", name: "Test Org" }),
    getBySlug: vi.fn().mockResolvedValue(null),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/services/credits", () => ({
  creditsService: {
    addCredits: vi.fn(),
  },
}));

vi.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: {
    checkSignupAbuse: vi.fn().mockResolvedValue({ allowed: true }),
    recordSignupMetadata: vi.fn(),
  },
}));

vi.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: () => "avatar.png",
}));

vi.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: () => "wallet-slug",
  getInitialCredits: () => 0,
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://example.com",
}));

// Mock viem functions
const MOCK_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
vi.mock("viem/siwe", () => ({
  parseSiweMessage: vi.fn().mockReturnValue({
    address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    nonce: "test-nonce-123",
    domain: "example.com",
  }),
}));

vi.mock("viem", () => ({
  recoverMessageAddress: vi.fn().mockResolvedValue(
    "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  ),
  getAddress: (addr: string) => addr,
}));

import { POST } from "../../route";

function makeRequest(body: Record<string, unknown> = {}) {
  return new Request("https://example.com/api/auth/siwe/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": "127.0.0.1",
      "user-agent": "test-agent",
    },
    body: JSON.stringify(body),
  });
}

const validBody = {
  message: "example.com wants you to sign in...",
  signature: "0xdeadbeef",
};

describe("SIWE verify endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockAtomicConsume.mockResolvedValue(1);
    mockGetByWallet.mockResolvedValue(undefined);
  });

  // --- Failure modes ---

  it("returns 400 for missing message", async () => {
    const res = await POST(makeRequest({ signature: "0xabc" }) as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  it("returns 400 for missing signature", async () => {
    const res = await POST(makeRequest({ message: "hello" }) as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  it("returns 400 for empty body", async () => {
    const res = await POST(makeRequest({}) as any);
    expect(res.status).toBe(400);
  });

  it("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);

    const res = await POST(makeRequest(validBody) as any);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 400 for expired/used nonce (atomicConsume returns 0)", async () => {
    mockAtomicConsume.mockResolvedValue(0);

    const res = await POST(makeRequest(validBody) as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_NONCE");
  });

  it("nonce is single-use: atomicConsume is called exactly once", async () => {
    mockAtomicConsume.mockResolvedValue(1);
    mockGetByWallet.mockResolvedValue({
      id: "user-1",
      is_active: true,
      wallet_verified: true,
      organization_id: "org-1",
      organization: { is_active: true, name: "Test" },
    });

    await POST(makeRequest(validBody) as any);
    expect(mockAtomicConsume).toHaveBeenCalledTimes(1);
  });

  // --- Existing user (sign-in) ---

  it("returns existing user without creating new org", async () => {
    const existingUser = {
      id: "user-1",
      name: "Test",
      is_active: true,
      wallet_verified: true,
      organization_id: "org-1",
      organization: { is_active: true, name: "Test Org", credit_balance: "10.00" },
    };
    mockGetByWallet.mockResolvedValue(existingUser);

    const { apiKeysService } = await import("@/lib/services/api-keys");
    (apiKeysService.listByOrganization as any).mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "existing-key-123" },
    ]);

    const res = await POST(makeRequest(validBody) as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.isNewAccount).toBe(false);
    expect(json.apiKey).toBe("existing-key-123");
  });

  it("returns 403 for inactive existing user", async () => {
    mockGetByWallet.mockResolvedValue({
      id: "user-1",
      is_active: false,
      wallet_verified: true,
      organization_id: "org-1",
      organization: { is_active: true },
    });

    const res = await POST(makeRequest(validBody) as any);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("ACCOUNT_INACTIVE");
  });

  it("returns 403 for inactive organization", async () => {
    mockGetByWallet.mockResolvedValue({
      id: "user-1",
      is_active: true,
      wallet_verified: true,
      organization_id: "org-1",
      organization: { is_active: false },
    });

    const res = await POST(makeRequest(validBody) as any);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("ACCOUNT_INACTIVE");
  });

  it("marks wallet_verified on existing unverified user", async () => {
    mockGetByWallet.mockResolvedValue({
      id: "user-1",
      is_active: true,
      wallet_verified: false,
      organization_id: "org-1",
      organization: { is_active: true, name: "Org" },
    });

    const { apiKeysService } = await import("@/lib/services/api-keys");
    (apiKeysService.listByOrganization as any).mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "key" },
    ]);

    await POST(makeRequest(validBody) as any);
    expect(mockUpdateUser).toHaveBeenCalledWith("user-1", { wallet_verified: true });
  });

  // --- New user (sign-up) ---

  it("creates new user and returns isNewAccount=true", async () => {
    mockGetByWallet.mockResolvedValue(undefined);

    const { usersService } = await import("@/lib/services/users");
    (usersService.create as any).mockResolvedValue({
      id: "new-user",
      name: "0xd8dA...6045",
      wallet_address: MOCK_ADDRESS.toLowerCase(),
      organization_id: "org-1",
      is_active: true,
      wallet_verified: true,
    });

    const { apiKeysService } = await import("@/lib/services/api-keys");
    (apiKeysService.create as any).mockResolvedValue({ plainKey: "new-api-key" });
    (apiKeysService.listByOrganization as any).mockResolvedValue([]);

    const res = await POST(makeRequest(validBody) as any);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.isNewAccount).toBe(true);
    expect(json.apiKey).toBe("new-api-key");
  });

  it("returns 403 when abuse detection blocks signup", async () => {
    mockGetByWallet.mockResolvedValue(undefined);

    const { abuseDetectionService } = await import("@/lib/services/abuse-detection");
    (abuseDetectionService.checkSignupAbuse as any).mockResolvedValue({
      allowed: false,
      reason: "Too many signups",
    });

    const res = await POST(makeRequest(validBody) as any);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("SIGNUP_BLOCKED");
  });
});
