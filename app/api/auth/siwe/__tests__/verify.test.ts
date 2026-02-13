
/**
 * Tests for SIWE verify endpoint
 *
 * Covers: existing vs new user paths, invalid nonce, invalid domain,
 * invalid signature, cache unavailability, and race conditions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSiweMessage } from "viem/siwe";
import { privateKeyToAccount } from "viem/accounts";

// --- Test wallet ---
const TEST_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const testAccount = privateKeyToAccount(TEST_PRIVATE_KEY);

// --- Mocks ---
const mockAtomicConsume = vi.fn();
const mockCacheIsAvailable = vi.fn().mockReturnValue(true);

vi.mock("@/lib/cache/client", () => ({
  cache: { isAvailable: mockCacheIsAvailable },
}));

vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: (...args: any[]) => mockAtomicConsume(...args),
}));

const mockGetByWallet = vi.fn();
const mockCreateUser = vi.fn();
const mockUpdateUser = vi.fn();
vi.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: (...args: any[]) => mockGetByWallet(...args),
    create: (...args: any[]) => mockCreateUser(...args),
    update: (...args: any[]) => mockUpdateUser(...args),
  },
}));

const mockListByOrg = vi.fn().mockResolvedValue([]);
const mockCreateApiKey = vi.fn().mockResolvedValue({ plainKey: "test-api-key-123" });
vi.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: (...args: any[]) => mockListByOrg(...args),
    create: (...args: any[]) => mockCreateApiKey(...args),
  },
}));

const mockCreateOrg = vi.fn();
const mockGetBySlug = vi.fn().mockResolvedValue(null);
const mockDeleteOrg = vi.fn();
vi.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    create: (...args: any[]) => mockCreateOrg(...args),
    getBySlug: (...args: any[]) => mockGetBySlug(...args),
    delete: (...args: any[]) => mockDeleteOrg(...args),
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
  generateSlugFromWallet: () => `wallet-${Date.now().toString(36)}`,
  getInitialCredits: () => 100,
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

// --- Helpers ---
async function buildSignedMessage(nonce: string, domain = "app.example.com") {
  const message = createSiweMessage({
    address: testAccount.address,
    chainId: 1,
    domain,
    nonce,
    uri: `https://${domain}`,
    version: "1",
  });
  const signature = await testAccount.signMessage({ message });
  return { message, signature };
}

function makeRequest(body: unknown) {
  return new Request("https://app.example.com/api/auth/siwe/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const importHandler = async () => {
  const mod = await import("../verify/route");
  return mod;
};

// --- Shared fake objects ---
const fakeOrg = {
  id: "org-1",
  name: "Test Org",
  slug: "test-org",
  credit_balance: "100.00",
  is_active: true,
};

const fakeUser = {
  id: "user-1",
  name: "0xf39F...2266",
  wallet_address: testAccount.address.toLowerCase(),
  wallet_verified: true,
  privy_user_id: null,
  is_active: true,
  organization_id: fakeOrg.id,
  organization: fakeOrg,
  role: "owner",
};

describe("SIWE verify endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockAtomicConsume.mockResolvedValue(1); // nonce valid
    mockGetByWallet.mockResolvedValue(null); // no existing user
    mockCreateOrg.mockResolvedValue(fakeOrg);
    mockCreateUser.mockResolvedValue(fakeUser);
  });

  // --- Invalid body ---
  it("returns 400 for missing body fields", async () => {
    const mod = await importHandler();
    const response = await mod.POST(makeRequest({}) as any);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  it("returns 400 for empty message string", async () => {
    const mod = await importHandler();
    const response = await mod.POST(
      makeRequest({ message: "", signature: "0xabc" }) as any,
    );
    expect(response.status).toBe(400);
  });

  // --- Cache unavailability ---
  it("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);
    const { message, signature } = await buildSignedMessage("testnonce123456");
    const mod = await importHandler();
    const response = await mod.POST(makeRequest({ message, signature }) as any);
    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  // --- Invalid / expired nonce ---
  it("returns 400 for invalid or already-used nonce", async () => {
    mockAtomicConsume.mockResolvedValue(0); // nonce not found
    const { message, signature } = await buildSignedMessage("usednonce1234567");
    const mod = await importHandler();
    const response = await mod.POST(makeRequest({ message, signature }) as any);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("INVALID_NONCE");
  });

  // --- Invalid domain ---
  it("returns 400 when SIWE message domain does not match server", async () => {
    const { message, signature } = await buildSignedMessage(
      "testnonce123456",
      "evil.example.com",
    );
    const mod = await importHandler();
    const response = await mod.POST(makeRequest({ message, signature }) as any);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("INVALID_DOMAIN");
  });

  // --- Invalid signature ---
  it("returns 400 for tampered signature", async () => {
    const { message } = await buildSignedMessage("testnonce123456");
    // Use a clearly invalid signature (wrong length/content)
    const badSignature = "0x" + "ab".repeat(65);
    const mod = await importHandler();
    const response = await mod.POST(
      makeRequest({ message, signature: badSignature }) as any,
    );
    // Should be 400 - either INVALID_SIGNATURE parse failure or address mismatch
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("INVALID_SIGNATURE");
  });

  // --- Existing user path ---
  it("returns existing user without creating org", async () => {
    mockGetByWallet.mockResolvedValue(fakeUser);
    mockListByOrg.mockResolvedValue([
      { key: "existing-key", user_id: "user-1", is_active: true },
    ]);

    const { message, signature } = await buildSignedMessage("testnonce123456");
    const mod = await importHandler();
    const response = await mod.POST(makeRequest({ message, signature }) as any);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.isNewAccount).toBe(false);
    expect(json.apiKey).toBe("existing-key");
    expect(mockCreateOrg).not.toHaveBeenCalled();
  });

  it("returns 403 for inactive existing account", async () => {
    mockGetByWallet.mockResolvedValue({
      ...fakeUser,
      is_active: false,
    });

    const { message, signature } = await buildSignedMessage("testnonce123456");
    const mod = await importHandler();
    const response = await mod.POST(makeRequest({ message, signature }) as any);
    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toBe("ACCOUNT_INACTIVE");
  });

  // --- New user path ---
  it("creates org, user, and API key for new wallet", async () => {
    const { message, signature } = await buildSignedMessage("testnonce123456");
    const mod = await importHandler();
    const response = await mod.POST(makeRequest({ message, signature }) as any);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.isNewAccount).toBe(true);
    expect(json.apiKey).toBe("test-api-key-123");
    expect(mockCreateOrg).toHaveBeenCalledTimes(1);
    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    expect(mockCreateApiKey).toHaveBeenCalledTimes(1);
  });

  // --- Race condition (duplicate key 23505) ---
  it("handles duplicate key error by returning existing user", async () => {
    const duplicateError = Object.assign(new Error("duplicate key"), {
      code: "23505",
    });
    mockCreateOrg.mockRejectedValueOnce(duplicateError);
    // After the error, the retry lookup finds the user
    mockGetByWallet.mockResolvedValueOnce(null).mockResolvedValueOnce(fakeUser);
    mockListByOrg.mockResolvedValue([
      { key: "race-key", user_id: "user-1", is_active: true },
    ]);

    const { message, signature } = await buildSignedMessage("testnonce123456");
    const mod = await importHandler();
    const response = await mod.POST(makeRequest({ message, signature }) as any);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.isNewAccount).toBe(false);
  });

  // --- Nonce single-use ---
  it("consumes the nonce atomically (single-use)", async () => {
    const { message, signature } = await buildSignedMessage("singlenonce12345");
    const mod = await importHandler();
    await mod.POST(makeRequest({ message, signature }) as any);

    expect(mockAtomicConsume).toHaveBeenCalledTimes(1);
    // Verify the key contains our nonce
    const calledKey = mockAtomicConsume.mock.calls[0][0];
    expect(calledKey).toContain("singlenonce12345");
  });
});
