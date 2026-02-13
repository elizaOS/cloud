
/**
 * Tests for SIWE verify endpoint: POST /api/auth/siwe/verify
 *
 * Covers:
 * - Verify success paths (existing user, new user)
 * - Invalid nonce / expired nonce
 * - Invalid domain
 * - Invalid signature
 * - Cache unavailability (503)
 * - Missing/malformed request body
 * - Race condition handling (23505 duplicate key)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// --- Mocks ---

const mockCacheIsAvailable = vi.fn().mockReturnValue(true);
const mockAtomicConsume = vi.fn().mockResolvedValue(1);

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

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://elizacloud.ai",
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

const TEST_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const TEST_ADDRESS_LOWER = TEST_ADDRESS.toLowerCase();

vi.mock("viem/siwe", () => ({
  parseSiweMessage: vi.fn().mockReturnValue({
    address: TEST_ADDRESS,
    nonce: "test-nonce-123",
    domain: "elizacloud.ai",
  }),
}));

vi.mock("viem", () => ({
  recoverMessageAddress: vi.fn().mockResolvedValue(TEST_ADDRESS),
  getAddress: (addr: string) => addr,
  // Hex type stub
}));

const mockGetByWallet = vi.fn().mockResolvedValue(null);
const mockUserUpdate = vi.fn().mockResolvedValue(undefined);
const mockUserCreate = vi.fn().mockResolvedValue({
  id: "user-1",
  name: "0xd8dA...6045",
  wallet_address: TEST_ADDRESS_LOWER,
  organization_id: "org-1",
  role: "owner",
  is_active: true,
});

vi.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: (...args: unknown[]) => mockGetByWallet(...args),
    update: (...args: unknown[]) => mockUserUpdate(...args),
    create: (...args: unknown[]) => mockUserCreate(...args),
  },
}));

const mockApiKeysListByOrg = vi.fn().mockResolvedValue([]);
const mockApiKeysCreate = vi.fn().mockResolvedValue({
  plainKey: "ek_live_test123",
});

vi.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: (...args: unknown[]) => mockApiKeysListByOrg(...args),
    create: (...args: unknown[]) => mockApiKeysCreate(...args),
  },
}));

const mockOrgCreate = vi.fn().mockResolvedValue({
  id: "org-1",
  name: "0xd8dA...6045's Organization",
  slug: "d8da6b-abc123",
  credit_balance: "0.00",
});
const mockOrgGetBySlug = vi.fn().mockResolvedValue(null);
const mockOrgDelete = vi.fn().mockResolvedValue(undefined);

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

const mockCheckSignupAbuse = vi.fn().mockResolvedValue({ allowed: true });
const mockRecordSignupMetadata = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: {
    checkSignupAbuse: (...args: unknown[]) => mockCheckSignupAbuse(...args),
    recordSignupMetadata: (...args: unknown[]) => mockRecordSignupMetadata(...args),
  },
}));

vi.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: () => "https://example.com/avatar.png",
}));

vi.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: () => "d8da6b-abc123",
  getInitialCredits: () => 5.0,
}));

import { POST } from "../../verify/route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(
    new URL("http://localhost:3000/api/auth/siwe/verify"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/auth/siwe/verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockAtomicConsume.mockResolvedValue(1);
    mockGetByWallet.mockResolvedValue(null);
    mockCheckSignupAbuse.mockResolvedValue({ allowed: true });
    mockOrgGetBySlug.mockResolvedValue(null);
  });

  // --- Request body validation ---

  it("rejects request with missing body fields", async () => {
    const res = await POST(makeRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("INVALID_BODY");
  });

  it("rejects request with empty message", async () => {
    const res = await POST(makeRequest({ message: "", signature: "0xabc" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("INVALID_BODY");
  });

  it("rejects request with empty signature", async () => {
    const res = await POST(makeRequest({ message: "hello", signature: "" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("INVALID_BODY");
  });

  // --- Cache availability ---

  it("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);

    const res = await POST(
      makeRequest({ message: "valid-siwe-message", signature: "0xabc123" }),
    );
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  // --- Nonce validation ---

  it("rejects expired/used nonce (atomicConsume returns 0)", async () => {
    mockAtomicConsume.mockResolvedValue(0);

    const res = await POST(
      makeRequest({ message: "valid-siwe-message", signature: "0xabc123" }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("INVALID_NONCE");
  });

  // --- Domain validation ---

  it("rejects mismatched domain", async () => {
    const { parseSiweMessage } = await import("viem/siwe");
    (parseSiweMessage as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      address: TEST_ADDRESS,
      nonce: "test-nonce-123",
      domain: "evil-site.com",
    });

    const res = await POST(
      makeRequest({ message: "valid-siwe-message", signature: "0xabc123" }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("INVALID_DOMAIN");
  });

  // --- Signature validation ---

  it("rejects invalid signature (recoverMessageAddress throws)", async () => {
    const viem = await import("viem");
    (viem.recoverMessageAddress as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("invalid signature"),
    );

    const res = await POST(
      makeRequest({ message: "valid-siwe-message", signature: "0xbad" }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("INVALID_SIGNATURE");
  });

  it("rejects signature when recovered address doesn't match", async () => {
    const viem = await import("viem");
    (viem.recoverMessageAddress as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      "0x0000000000000000000000000000000000000001",
    );
    // getAddress returns whatever is passed, so addresses won't match
    (viem.getAddress as ReturnType<typeof vi.fn>).mockImplementation((a: string) => a);

    const res = await POST(
      makeRequest({ message: "valid-siwe-message", signature: "0xabc123" }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("INVALID_SIGNATURE");
  });

  // --- Existing user path ---

  it("returns existing user with API key (sign-in)", async () => {
    const existingUser = {
      id: "user-existing",
      name: "0xd8dA...6045",
      wallet_address: TEST_ADDRESS_LOWER,
      wallet_verified: true,
      is_active: true,
      organization_id: "org-existing",
      privy_user_id: null,
      organization: {
        id: "org-existing",
        name: "Test Org",
        credit_balance: "10.00",
        is_active: true,
      },
    };
    mockGetByWallet.mockResolvedValueOnce(existingUser);
    mockApiKeysListByOrg.mockResolvedValueOnce([
      { user_id: "user-existing", is_active: true, key: "ek_live_existing" },
    ]);

    const res = await POST(
      makeRequest({ message: "valid-siwe-message", signature: "0xabc123" }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.isNewAccount).toBe(false);
    expect(json.apiKey).toBe("ek_live_existing");
  });

  it("marks wallet as verified for existing unverified user", async () => {
    const existingUser = {
      id: "user-unverified",
      name: "0xd8dA...6045",
      wallet_address: TEST_ADDRESS_LOWER,
      wallet_verified: false,
      is_active: true,
      organization_id: "org-1",
      privy_user_id: "privy-123",
      organization: {
        id: "org-1",
        name: "Test Org",
        credit_balance: "5.00",
        is_active: true,
      },
    };
    mockGetByWallet.mockResolvedValueOnce(existingUser);
    mockApiKeysListByOrg.mockResolvedValueOnce([
      { user_id: "user-unverified", is_active: true, key: "ek_live_key" },
    ]);

    await POST(
      makeRequest({ message: "valid-siwe-message", signature: "0xabc123" }),
    );

    expect(mockUserUpdate).toHaveBeenCalledWith("user-unverified", {
      wallet_verified: true,
    });
  });

  it("returns 403 for inactive user", async () => {
    mockGetByWallet.mockResolvedValueOnce({
      id: "user-inactive",
      is_active: false,
      organization_id: "org-1",
      organization: { id: "org-1", is_active: true },
    });

    const res = await POST(
      makeRequest({ message: "valid-siwe-message", signature: "0xabc123" }),
    );
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe("ACCOUNT_INACTIVE");
  });

  // --- New user path ---

  it("creates new account for unknown wallet (sign-up)", async () => {
    mockGetByWallet.mockResolvedValue(null);

    const res = await POST(
      makeRequest({ message: "valid-siwe-message", signature: "0xabc123" }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.isNewAccount).toBe(true);
    expect(json.apiKey).toBe("ek_live_test123");
    expect(mockOrgCreate).toHaveBeenCalled();
    expect(mockUserCreate).toHaveBeenCalled();
    expect(mockApiKeysCreate).toHaveBeenCalled();
  });

  it("blocks signup when abuse detection rejects", async () => {
    mockGetByWallet.mockResolvedValue(null);
    mockCheckSignupAbuse.mockResolvedValueOnce({
      allowed: false,
      reason: "Too many signups from this IP",
    });

    const res = await POST(
      makeRequest({ message: "valid-siwe-message", signature: "0xabc123" }),
    );
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe("SIGNUP_BLOCKED");
  });

  // --- Race condition (23505 duplicate key) ---

  it("handles 23505 race condition by finding existing user", async () => {
    mockGetByWallet.mockResolvedValueOnce(null); // First check returns null

    const duplicateError = new Error("duplicate key") as Error & { code: string };
    duplicateError.code = "23505";
    mockUserCreate.mockRejectedValueOnce(duplicateError);

    // After race, the user exists
    const raceWinner = {
      id: "user-winner",
      name: "0xd8dA...6045",
      wallet_address: TEST_ADDRESS_LOWER,
      wallet_verified: true,
      is_active: true,
      organization_id: "org-winner",
      privy_user_id: null,
      organization: {
        id: "org-winner",
        name: "Winner Org",
        credit_balance: "5.00",
        is_active: true,
      },
    };
    mockGetByWallet.mockResolvedValue(raceWinner);
    mockApiKeysListByOrg.mockResolvedValueOnce([
      { user_id: "user-winner", is_active: true, key: "ek_live_winner" },
    ]);

    const res = await POST(
      makeRequest({ message: "valid-siwe-message", signature: "0xabc123" }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.isNewAccount).toBe(false);
    expect(json.apiKey).toBe("ek_live_winner");
  });

  it("cleans up orphaned org on non-duplicate error", async () => {
    mockGetByWallet.mockResolvedValue(null);

    const genericError = new Error("some DB error");
    mockUserCreate.mockRejectedValueOnce(genericError);

    await expect(
      POST(makeRequest({ message: "valid-siwe-message", signature: "0xabc123" })),
    ).rejects.toThrow("some DB error");

    expect(mockOrgDelete).toHaveBeenCalledWith("org-1");
  });
});
