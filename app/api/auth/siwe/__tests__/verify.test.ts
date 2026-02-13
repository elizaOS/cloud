
/**
 * Tests for SIWE verify endpoint
 *
 * Covers: verify success paths (existing/new user), failure modes
 * (invalid nonce, invalid domain, invalid signature), race conditions,
 * cache availability.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockAtomicConsume = vi.fn();
const mockCacheIsAvailable = vi.fn();

vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: () => mockCacheIsAvailable(),
  },
}));

vi.mock("@/lib/cache/keys", () => ({
  CacheKeys: { siwe: { nonce: (n: string) => `siwe:nonce:${n}` } },
}));

vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: (...args: unknown[]) => mockAtomicConsume(...args),
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://elizacloud.ai",
}));

const mockGetByWallet = vi.fn();
const mockUserUpdate = vi.fn();
const mockUserCreate = vi.fn();

vi.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: (...args: unknown[]) => mockGetByWallet(...args),
    update: (...args: unknown[]) => mockUserUpdate(...args),
    create: (...args: unknown[]) => mockUserCreate(...args),
  },
}));

const mockListByOrg = vi.fn();
const mockApiKeyCreate = vi.fn();

vi.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: (...args: unknown[]) => mockListByOrg(...args),
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

const VALID_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const VALID_NONCE = "testnonce456";

// Construct a valid SIWE message
function buildSiweMessage(overrides: Record<string, string> = {}) {
  const domain = overrides.domain || "elizacloud.ai";
  const address = overrides.address || VALID_ADDRESS;
  const nonce = overrides.nonce || VALID_NONCE;
  const uri = overrides.uri || "https://elizacloud.ai";
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    "",
    "Sign in to ElizaCloud",
    "",
    `URI: ${uri}`,
    `Version: 1`,
    `Chain ID: 1`,
    `Nonce: ${nonce}`,
    `Issued At: 2024-01-01T00:00:00.000Z`,
  ].join("\n");
}

// Mock viem functions
vi.mock("viem/siwe", () => ({
  parseSiweMessage: (msg: string) => {
    const lines = msg.split("\n");
    const addressLine = lines[1];
    const nonceLine = lines.find((l: string) => l.startsWith("Nonce: "));
    const domainLine = lines[0];
    return {
      address: addressLine,
      nonce: nonceLine ? nonceLine.replace("Nonce: ", "") : undefined,
      domain: domainLine ? domainLine.split(" wants")[0] : undefined,
    };
  },
}));

vi.mock("viem", () => ({
  recoverMessageAddress: vi.fn().mockResolvedValue(VALID_ADDRESS),
  getAddress: (addr: string) => addr,
}));

// Import handler after mocks
const { POST } = await import("../../verify/route");

function createVerifyRequest(body: Record<string, unknown>) {
  const req = new Request("http://localhost:3000/api/auth/siwe/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": "127.0.0.1",
      "user-agent": "test-agent",
    },
    body: JSON.stringify(body),
  });
  (req as any).nextUrl = new URL("http://localhost:3000/api/auth/siwe/verify");
  return req as any;
}

describe("SIWE verify endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockAtomicConsume.mockResolvedValue(1); // nonce exists and consumed
    mockGetByWallet.mockResolvedValue(undefined); // no existing user by default
    mockOrgGetBySlug.mockResolvedValue(undefined); // slug available
    mockListByOrg.mockResolvedValue([]); // no existing keys
  });

  // --- Invalid body ---

  it("rejects empty body", async () => {
    const req = createVerifyRequest({});
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("INVALID_BODY");
  });

  it("rejects missing signature", async () => {
    const req = createVerifyRequest({ message: buildSiweMessage() });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("rejects missing message", async () => {
    const req = createVerifyRequest({ signature: "0xabc" });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  // --- Cache unavailable ---

  it("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);
    const req = createVerifyRequest({
      message: buildSiweMessage(),
      signature: "0xabc123",
    });
    const res = await POST(req);

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe("SERVICE_UNAVAILABLE");
  });

  // --- Invalid nonce ---

  it("rejects expired or already-used nonce", async () => {
    mockAtomicConsume.mockResolvedValue(0); // nonce not found
    const req = createVerifyRequest({
      message: buildSiweMessage(),
      signature: "0xabc123",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("INVALID_NONCE");
  });

  // --- Invalid domain ---

  it("rejects SIWE message with wrong domain", async () => {
    const msg = buildSiweMessage({ domain: "evil.com" });
    const req = createVerifyRequest({
      message: msg,
      signature: "0xabc123",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("INVALID_DOMAIN");
  });

  // --- Existing user sign-in ---

  it("returns existing user with API key", async () => {
    const existingUser = {
      id: "user-1",
      name: "Test User",
      privy_user_id: null,
      wallet_address: VALID_ADDRESS.toLowerCase(),
      wallet_verified: true,
      is_active: true,
      organization_id: "org-1",
      organization: { id: "org-1", name: "Test Org", credit_balance: "5.00", is_active: true },
    };
    mockGetByWallet.mockResolvedValue(existingUser);
    mockListByOrg.mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "ek_live_existing" },
    ]);

    const req = createVerifyRequest({
      message: buildSiweMessage(),
      signature: "0xabc123",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isNewAccount).toBe(false);
    expect(data.apiKey).toBe("ek_live_existing");
  });

  it("marks wallet as verified on existing user if not already", async () => {
    const existingUser = {
      id: "user-1",
      name: "Test User",
      privy_user_id: "privy-123",
      wallet_address: VALID_ADDRESS.toLowerCase(),
      wallet_verified: false,
      is_active: true,
      organization_id: "org-1",
      organization: { id: "org-1", name: "Test Org", credit_balance: "5.00", is_active: true },
    };
    mockGetByWallet.mockResolvedValue(existingUser);
    mockListByOrg.mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "ek_live_existing" },
    ]);

    const req = createVerifyRequest({
      message: buildSiweMessage(),
      signature: "0xabc123",
    });
    await POST(req);

    expect(mockUserUpdate).toHaveBeenCalledWith("user-1", { wallet_verified: true });
  });

  it("rejects inactive user", async () => {
    const inactiveUser = {
      id: "user-1",
      is_active: false,
      organization_id: "org-1",
      organization: { id: "org-1", is_active: true },
    };
    mockGetByWallet.mockResolvedValue(inactiveUser);

    const req = createVerifyRequest({
      message: buildSiweMessage(),
      signature: "0xabc123",
    });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("ACCOUNT_INACTIVE");
  });

  // --- New user sign-up ---

  it("creates new user and returns API key", async () => {
    const newOrg = { id: "org-new", name: "Test Org", slug: "abc123-def456", credit_balance: "0.00" };
    const newUser = {
      id: "user-new",
      name: "0xd8dA...6045",
      wallet_address: VALID_ADDRESS.toLowerCase(),
      organization_id: "org-new",
    };

    mockOrgCreate.mockResolvedValue(newOrg);
    mockUserCreate.mockResolvedValue(newUser);
    mockApiKeyCreate.mockResolvedValue({ plainKey: "ek_live_newkey" });

    const req = createVerifyRequest({
      message: buildSiweMessage(),
      signature: "0xabc123",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isNewAccount).toBe(true);
    expect(data.apiKey).toBe("ek_live_newkey");
    expect(mockOrgCreate).toHaveBeenCalled();
    expect(mockUserCreate).toHaveBeenCalled();
    expect(mockApiKeyCreate).toHaveBeenCalled();
  });

  // --- Nonce single-use ---

  it("consumes nonce atomically via atomicConsume", async () => {
    mockGetByWallet.mockResolvedValue({
      id: "user-1",
      is_active: true,
      wallet_verified: true,
      organization_id: "org-1",
      organization: { id: "org-1", is_active: true, credit_balance: "5.00" },
    });
    mockListByOrg.mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "ek_live_key" },
    ]);

    const req = createVerifyRequest({
      message: buildSiweMessage(),
      signature: "0xabc123",
    });
    await POST(req);

    expect(mockAtomicConsume).toHaveBeenCalledWith(`siwe:nonce:${VALID_NONCE}`);
    expect(mockAtomicConsume).toHaveBeenCalledTimes(1);
  });

  // --- Compensating cleanup on failure ---

  it("deletes orphaned org when user creation fails (non-duplicate error)", async () => {
    const newOrg = { id: "org-orphan", name: "Test Org" };
    mockOrgCreate.mockResolvedValue(newOrg);
    mockUserCreate.mockRejectedValue(new Error("DB connection lost"));

    const req = createVerifyRequest({
      message: buildSiweMessage(),
      signature: "0xabc123",
    });

    await expect(POST(req)).rejects.toThrow("DB connection lost");
    expect(mockOrgDelete).toHaveBeenCalledWith("org-orphan");
  });

  it("does NOT delete org on 23505 duplicate key error (race condition)", async () => {
    const newOrg = { id: "org-race", name: "Test Org" };
    mockOrgCreate.mockResolvedValue(newOrg);

    const duplicateError = Object.assign(new Error("duplicate key"), { code: "23505" });
    mockUserCreate.mockRejectedValue(duplicateError);

    // The race condition handler will look up the winning user
    const raceWinner = {
      id: "user-winner",
      wallet_verified: true,
      organization_id: "org-winner",
      organization: { id: "org-winner", is_active: true, credit_balance: "5.00" },
    };
    mockGetByWallet.mockResolvedValueOnce(undefined).mockResolvedValue(raceWinner);
    mockListByOrg.mockResolvedValue([
      { user_id: "user-winner", is_active: true, key: "ek_live_winner" },
    ]);

    const req = createVerifyRequest({
      message: buildSiweMessage(),
      signature: "0xabc123",
    });
    const res = await POST(req);

    expect(mockOrgDelete).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
