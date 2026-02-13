
/**
 * Tests for SIWE verify endpoint
 *
 * Covers: nonce single-use, domain validation, signature verification,
 * existing vs new user paths, and key failure modes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks ---

const mockIsAvailable = vi.fn().mockReturnValue(true);
const mockGet = vi.fn().mockResolvedValue("true");

vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: () => mockIsAvailable(),
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

const mockAtomicConsume = vi.fn().mockResolvedValue(1);
vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: (...args: unknown[]) => mockAtomicConsume(...args),
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

const VALID_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const CHECKSUM_ADDRESS = "0x1234567890AbcdEF1234567890aBcdef12345678";

vi.mock("viem/siwe", () => ({
  parseSiweMessage: vi.fn().mockReturnValue({
    address: VALID_ADDRESS,
    nonce: "test-nonce-123",
    domain: "app.example.com",
  }),
}));

vi.mock("viem", () => ({
  recoverMessageAddress: vi.fn().mockResolvedValue(VALID_ADDRESS),
  getAddress: vi.fn().mockImplementation((addr: string) => CHECKSUM_ADDRESS),
}));

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

const mockListByOrg = vi.fn().mockResolvedValue([]);
const mockApiKeyCreate = vi.fn().mockResolvedValue({ plainKey: "test-api-key-123" });
vi.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: (...args: unknown[]) => mockListByOrg(...args),
    create: (...args: unknown[]) => mockApiKeyCreate(...args),
  },
}));

const mockOrgCreate = vi.fn();
const mockOrgGetBySlug = vi.fn().mockResolvedValue(null);
const mockOrgDelete = vi.fn();
vi.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    create: (...args: unknown[]) => mockOrgCreate(...args),
    getBySlug: (...args: unknown[]) => mockOrgGetBySlug(...args),
    delete: (...args: unknown[]) => mockOrgDelete(...args),
  },
}));

const mockAddCredits = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/services/credits", () => ({
  creditsService: {
    addCredits: (...args: unknown[]) => mockAddCredits(...args),
  },
}));

const mockCheckAbuse = vi.fn().mockResolvedValue({ allowed: true });
const mockRecordMetadata = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: {
    checkSignupAbuse: (...args: unknown[]) => mockCheckAbuse(...args),
    recordSignupMetadata: (...args: unknown[]) => mockRecordMetadata(...args),
  },
}));

vi.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: () => "avatar-url",
}));

vi.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: () => "abc123-def456",
  getInitialCredits: () => 5.0,
}));

import { POST } from "../../verify/route";

function makeRequest(body: object): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const VALID_BODY = {
  message: "app.example.com wants you to sign in...",
  signature: "0xabcdef1234567890",
};

const existingUser = {
  id: "user-1",
  name: "Test User",
  is_active: true,
  wallet_verified: true,
  privy_user_id: null,
  organization_id: "org-1",
  organization: { id: "org-1", name: "Test Org", credit_balance: "5.00", is_active: true },
};

const createdUser = {
  id: "user-2",
  name: "0x1234...5678",
  is_active: true,
  wallet_verified: true,
  privy_user_id: null,
  organization_id: "org-2",
  organization: { id: "org-2", name: "0x1234...5678's Organization", credit_balance: "0.00", is_active: true },
};

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAvailable.mockReturnValue(true);
    mockAtomicConsume.mockResolvedValue(1);
    mockGetByWallet.mockResolvedValue(null);
    mockCheckAbuse.mockResolvedValue({ allowed: true });
    mockOrgCreate.mockResolvedValue({ id: "org-2", name: "Test Org", credit_balance: "0.00" });
    mockUserCreate.mockResolvedValue(createdUser);
    mockApiKeyCreate.mockResolvedValue({ plainKey: "new-api-key" });
    mockListByOrg.mockResolvedValue([]);
    mockOrgGetBySlug.mockResolvedValue(null);
  });

  // --- Input validation ---

  it("rejects missing body", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
      method: "POST",
      body: "not json",
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("INVALID_BODY");
  });

  it("rejects empty message", async () => {
    const res = await POST(makeRequest({ message: "", signature: "0xabc" }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("INVALID_BODY");
  });

  it("rejects missing signature", async () => {
    const res = await POST(makeRequest({ message: "hello" }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("INVALID_BODY");
  });

  // --- Cache availability ---

  it("returns 503 when cache is unavailable", async () => {
    mockIsAvailable.mockReturnValue(false);

    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();
    expect(res.status).toBe(503);
    expect(data.error).toBe("SERVICE_UNAVAILABLE");
  });

  // --- Nonce validation (single-use) ---

  it("rejects an already-consumed nonce (atomicConsume returns 0)", async () => {
    mockAtomicConsume.mockResolvedValue(0);

    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("INVALID_NONCE");
  });

  it("consumes nonce atomically via DEL", async () => {
    mockGetByWallet.mockResolvedValue(existingUser);

    await POST(makeRequest(VALID_BODY));

    expect(mockAtomicConsume).toHaveBeenCalledWith("siwe:nonce:test-nonce-123");
    expect(mockAtomicConsume).toHaveBeenCalledTimes(1);
  });

  // --- Domain validation ---

  it("rejects mismatched domain", async () => {
    const { parseSiweMessage } = await import("viem/siwe");
    (parseSiweMessage as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      address: VALID_ADDRESS,
      nonce: "test-nonce-123",
      domain: "evil.com",
    });

    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("INVALID_DOMAIN");
  });

  // --- Signature validation ---

  it("rejects invalid signature", async () => {
    const { recoverMessageAddress } = await import("viem");
    (recoverMessageAddress as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("invalid signature"),
    );

    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("INVALID_SIGNATURE");
  });

  it("rejects signature from wrong address", async () => {
    const viem = await import("viem");
    // First call for recovered, second for parsed — make them differ
    let callCount = 0;
    (viem.getAddress as ReturnType<typeof vi.fn>).mockImplementation(() => {
      callCount++;
      return callCount === 1 ? "0xAAAA" : "0xBBBB";
    });

    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("INVALID_SIGNATURE");
  });

  // --- Existing user path ---

  it("returns existing user with API key", async () => {
    mockGetByWallet.mockResolvedValue(existingUser);
    mockListByOrg.mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "existing-key" },
    ]);

    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.isNewAccount).toBe(false);
    expect(data.apiKey).toBe("existing-key");
  });

  it("rejects inactive account", async () => {
    mockGetByWallet.mockResolvedValue({
      ...existingUser,
      is_active: false,
    });

    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error).toBe("ACCOUNT_INACTIVE");
  });

  it("marks wallet as verified on re-auth if not already", async () => {
    mockGetByWallet.mockResolvedValue({
      ...existingUser,
      wallet_verified: false,
    });
    mockListByOrg.mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "existing-key" },
    ]);

    await POST(makeRequest(VALID_BODY));

    expect(mockUserUpdate).toHaveBeenCalledWith("user-1", { wallet_verified: true });
  });

  // --- New user path ---

  it("creates org, user, and API key for new wallet", async () => {
    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.isNewAccount).toBe(true);
    expect(mockOrgCreate).toHaveBeenCalled();
    expect(mockUserCreate).toHaveBeenCalled();
    expect(mockApiKeyCreate).toHaveBeenCalled();
  });

  it("blocks signup when abuse detection denies", async () => {
    mockCheckAbuse.mockResolvedValue({ allowed: false, reason: "Too many signups" });

    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error).toBe("SIGNUP_BLOCKED");
  });

  it("continues signup when credits fail (logs but doesn't abort)", async () => {
    mockAddCredits.mockRejectedValue(new Error("credits service down"));

    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();

    // Should still succeed — credits failure is non-fatal
    expect(res.status).toBe(200);
    expect(data.isNewAccount).toBe(true);
  });

  it("cleans up orphaned org on user creation failure", async () => {
    mockUserCreate.mockRejectedValue(new Error("DB error"));

    await expect(POST(makeRequest(VALID_BODY))).rejects.toThrow();

    expect(mockOrgDelete).toHaveBeenCalledWith("org-2");
  });

  // --- Race condition (duplicate wallet 23505) ---

  it("handles 23505 duplicate key by returning existing user", async () => {
    const duplicateError = Object.assign(new Error("duplicate key"), { code: "23505" });
    mockUserCreate.mockRejectedValue(duplicateError);
    mockGetByWallet
      .mockResolvedValueOnce(null) // first call in main flow
      .mockResolvedValueOnce(existingUser); // retry in race handler

    const res = await POST(makeRequest(VALID_BODY));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.isNewAccount).toBe(false);
    expect(mockOrgDelete).toHaveBeenCalled(); // orphan cleaned up
  });
});
