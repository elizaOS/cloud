
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mock setup ---
const mockAtomicConsume = vi.fn();
const mockCacheIsAvailable = vi.fn();

vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: (...args: unknown[]) => mockAtomicConsume(...args),
}));

vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: () => mockCacheIsAvailable(),
  },
}));

vi.mock("@/lib/cache/keys", () => ({
  CacheKeys: {
    siwe: { nonce: (n: string) => `siwe:nonce:${n}` },
  },
}));

const mockRecoverMessageAddress = vi.fn();
const mockGetAddress = vi.fn((a: string) => a);

vi.mock("viem", () => ({
  recoverMessageAddress: (...args: unknown[]) => mockRecoverMessageAddress(...args),
  getAddress: (a: string) => mockGetAddress(a),
}));

const mockParseSiweMessage = vi.fn();

vi.mock("viem/siwe", () => ({
  parseSiweMessage: (...args: unknown[]) => mockParseSiweMessage(...args),
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

const mockApiKeysListByOrg = vi.fn();
const mockApiKeysCreate = vi.fn();

vi.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: (...args: unknown[]) => mockApiKeysListByOrg(...args),
    create: (...args: unknown[]) => mockApiKeysCreate(...args),
  },
}));

const mockOrgCreate = vi.fn();
const mockOrgGetBySlug = vi.fn();

vi.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    create: (...args: unknown[]) => mockOrgCreate(...args),
    getBySlug: (...args: unknown[]) => mockOrgGetBySlug(...args),
  },
}));

const mockAddCredits = vi.fn();

vi.mock("@/lib/services/credits", () => ({
  creditsService: {
    addCredits: (...args: unknown[]) => mockAddCredits(...args),
  },
}));

const mockCheckAbuse = vi.fn();
const mockRecordMetadata = vi.fn();

vi.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: {
    checkSignupAbuse: (...args: unknown[]) => mockCheckAbuse(...args),
    recordSignupMetadata: (...args: unknown[]) => mockRecordMetadata(...args),
  },
}));

vi.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: () => "avatar.png",
}));

vi.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: () => "wallet-0x1234-slug",
  getInitialCredits: () => 5.0,
}));

const mockDbTransaction = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    transaction: (fn: Function) => mockDbTransaction(fn),
  },
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

import { POST } from "./route";
import { NextRequest } from "next/server";

const VALID_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("SIWE verify endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheIsAvailable.mockReturnValue(true);
    mockAtomicConsume.mockResolvedValue(true);
    mockParseSiweMessage.mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "test-nonce",
      domain: "localhost",
    });
    mockRecoverMessageAddress.mockResolvedValue(VALID_ADDRESS);
    mockGetAddress.mockImplementation((a: string) => a);
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  // --- Input validation ---
  it("returns 400 for missing body fields", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_BODY");
  });

  it("returns 400 for empty message", async () => {
    const res = await POST(makeRequest({ message: "", signature: "0xabc" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty signature", async () => {
    const res = await POST(makeRequest({ message: "msg", signature: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when SIWE message missing required fields", async () => {
    mockParseSiweMessage.mockReturnValue({});
    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_BODY");
  });

  // --- Cache / nonce ---
  it("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);
    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 400 for invalid/expired nonce", async () => {
    mockAtomicConsume.mockResolvedValue(false);
    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_NONCE");
  });

  it("nonce is consumed atomically (single-use)", async () => {
    mockAtomicConsume.mockResolvedValue(false);
    await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(mockAtomicConsume).toHaveBeenCalledWith("siwe:nonce:test-nonce");
  });

  // --- Domain validation ---
  it("returns 400 for domain mismatch", async () => {
    mockParseSiweMessage.mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "test-nonce",
      domain: "evil.com",
    });
    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_DOMAIN");
  });

  // --- Signature validation ---
  it("returns 400 for invalid signature (recoverMessageAddress throws)", async () => {
    mockRecoverMessageAddress.mockRejectedValue(new Error("bad sig"));
    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_SIGNATURE");
  });

  it("returns 400 when recovered address doesn't match claimed address", async () => {
    mockRecoverMessageAddress.mockResolvedValue("0xDEAD");
    mockGetAddress.mockImplementation((a: string) => a); // different addresses
    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_SIGNATURE");
  });

  // --- Existing user path ---
  it("returns existing user with API key (sign-in)", async () => {
    const existingUser = {
      id: "user-1",
      name: "Test",
      privy_user_id: null,
      organization_id: "org-1",
      is_active: true,
      wallet_verified: true,
      organization: { name: "Org", credit_balance: "5.00", is_active: true },
    };
    mockGetByWallet.mockResolvedValue(existingUser);
    mockApiKeysListByOrg.mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "existing-key" },
    ]);

    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isNewAccount).toBe(false);
    expect(body.apiKey).toBe("existing-key");
  });

  it("returns 403 for inactive account", async () => {
    mockGetByWallet.mockResolvedValue({
      id: "user-1",
      is_active: false,
      organization_id: "org-1",
      organization: { is_active: true },
    });

    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("ACCOUNT_INACTIVE");
  });

  it("marks wallet as verified on existing user sign-in", async () => {
    const existingUser = {
      id: "user-1",
      name: "Test",
      privy_user_id: "privy-1",
      organization_id: "org-1",
      is_active: true,
      wallet_verified: false,
      organization: { name: "Org", credit_balance: "5.00", is_active: true },
    };
    mockGetByWallet.mockResolvedValue(existingUser);
    mockApiKeysListByOrg.mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "key" },
    ]);

    await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(mockUsersUpdate).toHaveBeenCalledWith("user-1", { wallet_verified: true });
  });

  // --- New user path (signup) ---
  it("returns 403 when abuse detection blocks signup", async () => {
    mockGetByWallet.mockResolvedValue(null);
    mockCheckAbuse.mockResolvedValue({ allowed: false, reason: "Too many signups" });

    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("SIGNUP_BLOCKED");
  });

  it("creates new account via transaction on signup", async () => {
    mockGetByWallet
      .mockResolvedValueOnce(null) // first call: no existing user
      .mockResolvedValueOnce({     // second call: after creation
        id: "new-user",
        name: "0x1234...5678",
        privy_user_id: null,
        organization_id: "new-org",
        is_active: true,
        wallet_verified: true,
        organization: { name: "Org", credit_balance: "5.00", is_active: true },
      });

    mockCheckAbuse.mockResolvedValue({ allowed: true });
    mockDbTransaction.mockImplementation(async (fn: Function) => {
      const txMock = {};
      return fn(txMock);
    });
    mockOrgGetBySlug.mockResolvedValue(null);
    mockOrgCreate.mockResolvedValue({ id: "new-org" });
    mockRecordMetadata.mockResolvedValue(undefined);
    mockAddCredits.mockResolvedValue(undefined);
    mockUsersCreate.mockResolvedValue({ id: "new-user" });
    mockApiKeysCreate.mockResolvedValue({ plainKey: "new-api-key" });

    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isNewAccount).toBe(true);
    expect(body.apiKey).toBe("new-api-key");
  });

  // --- Race condition (duplicate wallet) ---
  it("handles 23505 duplicate key error gracefully", async () => {
    mockGetByWallet
      .mockResolvedValueOnce(null) // first call: no existing user
      .mockResolvedValueOnce({     // retry after race condition
        id: "race-user",
        name: "Test",
        privy_user_id: null,
        organization_id: "race-org",
        is_active: true,
        wallet_verified: true,
        organization: { name: "Org", credit_balance: "5.00", is_active: true },
      });

    mockCheckAbuse.mockResolvedValue({ allowed: true });

    const duplicateError = new Error("duplicate key") as Error & { code: string };
    duplicateError.code = "23505";
    mockDbTransaction.mockRejectedValue(duplicateError);

    mockApiKeysListByOrg.mockResolvedValue([
      { user_id: "race-user", is_active: true, key: "race-key" },
    ]);

    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isNewAccount).toBe(false);
  });

  // --- Message expiration ---
  it("returns 400 for expired SIWE message", async () => {
    mockParseSiweMessage.mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "test-nonce",
      domain: "localhost",
      expirationTime: new Date(Date.now() - 60000), // 1 minute ago
    });

    const res = await POST(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("MESSAGE_EXPIRED");
  });

  // --- Hex prefix normalization ---
  it("adds 0x prefix to signature if missing", async () => {
    const existingUser = {
      id: "user-1",
      name: "Test",
      privy_user_id: null,
      organization_id: "org-1",
      is_active: true,
      wallet_verified: true,
      organization: { name: "Org", credit_balance: "5.00", is_active: true },
    };
    mockGetByWallet.mockResolvedValue(existingUser);
    mockApiKeysListByOrg.mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "key" },
    ]);

    await POST(makeRequest({ message: "msg", signature: "abc123" }));
    expect(mockRecoverMessageAddress).toHaveBeenCalledWith({
      message: "msg",
      signature: "0xabc123",
    });
  });
});
