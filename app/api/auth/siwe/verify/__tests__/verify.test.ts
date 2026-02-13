
/**
 * Tests for SIWE verify endpoint covering:
 * - Nonce issuance (TTL / single-use)
 * - Verify success paths (existing user vs new user)
 * - Key failure modes (invalid nonce, domain mismatch, bad signature, missing fields)
 */

import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks – keep above the import of the module under test
// ---------------------------------------------------------------------------

// Cache / nonce mocks
const mockIsAvailable = jest.fn().mockReturnValue(true);
const mockAtomicConsume = jest.fn().mockResolvedValue(1);

jest.mock("@/lib/cache/client", () => ({
  cache: { isAvailable: () => mockIsAvailable() },
}));

jest.mock("@/lib/cache/consume", () => ({
  atomicConsume: (...args: unknown[]) => mockAtomicConsume(...args),
}));

jest.mock("@/lib/cache/keys", () => ({
  CacheKeys: { siwe: { nonce: (n: string) => `siwe:nonce:${n}` } },
}));

// viem mocks
const VALID_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const mockRecoverMessageAddress = jest.fn().mockResolvedValue(VALID_ADDRESS);

jest.mock("viem", () => ({
  recoverMessageAddress: (...args: unknown[]) => mockRecoverMessageAddress(...args),
  getAddress: (a: string) => a.toLowerCase(),
}));

jest.mock("viem/siwe", () => ({
  parseSiweMessage: (msg: string) => {
    // Allow tests to inject parse results via a JSON prefix
    if (msg.startsWith("{")) {
      return JSON.parse(msg);
    }
    return {
      address: VALID_ADDRESS,
      nonce: "test-nonce-123",
      domain: "localhost",
    };
  },
}));

// Service mocks
const mockGetByWallet = jest.fn();
const mockUserCreate = jest.fn();
const mockUserUpdate = jest.fn();

jest.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: (...args: unknown[]) => mockGetByWallet(...args),
    create: (...args: unknown[]) => mockUserCreate(...args),
    update: (...args: unknown[]) => mockUserUpdate(...args),
  },
}));

const mockListByOrg = jest.fn().mockResolvedValue([]);
const mockApiKeyCreate = jest.fn().mockResolvedValue({ plainKey: "ak_test_key" });

jest.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: (...args: unknown[]) => mockListByOrg(...args),
    create: (...args: unknown[]) => mockApiKeyCreate(...args),
  },
}));

const mockOrgCreate = jest.fn().mockResolvedValue({
  id: "org-1",
  name: "Test Org",
  slug: "test-org",
  credit_balance: "0.00",
  is_active: true,
});
const mockOrgGetBySlug = jest.fn().mockResolvedValue(null);
const mockOrgDelete = jest.fn();

jest.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    create: (...args: unknown[]) => mockOrgCreate(...args),
    getBySlug: (...args: unknown[]) => mockOrgGetBySlug(...args),
    delete: (...args: unknown[]) => mockOrgDelete(...args),
  },
}));

jest.mock("@/lib/services/credits", () => ({
  creditsService: {
    addCredits: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockCheckAbuse = jest.fn().mockResolvedValue({ allowed: true });
const mockRecordSignup = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: {
    checkSignupAbuse: (...args: unknown[]) => mockCheckAbuse(...args),
    recordSignupMetadata: (...args: unknown[]) => mockRecordSignup(...args),
  },
}));

jest.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: () => "avatar-url",
}));

jest.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: () => "wallet-slug",
  getInitialCredits: () => 5,
}));

jest.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "http://localhost:3000",
}));

jest.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

// ---------------------------------------------------------------------------
// Import the handler under test (after all mocks are registered)
// ---------------------------------------------------------------------------
import { _handleVerifyForTests as handleVerify } from "../route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function parseResponse(res: Response) {
  return { status: res.status, body: await res.json() };
}

const validMessage = "valid-siwe-message";
const validSignature = "0xdeadbeef";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockIsAvailable.mockReturnValue(true);
  mockAtomicConsume.mockResolvedValue(1);
  mockRecoverMessageAddress.mockResolvedValue(VALID_ADDRESS);
  mockGetByWallet.mockResolvedValue(null);
  mockListByOrg.mockResolvedValue([]);
  mockApiKeyCreate.mockResolvedValue({ plainKey: "ak_new_key" });
  mockCheckAbuse.mockResolvedValue({ allowed: true });
  mockOrgGetBySlug.mockResolvedValue(null);
  mockOrgCreate.mockResolvedValue({
    id: "org-1",
    name: "Test Org",
    slug: "test-org",
    credit_balance: "0.00",
    is_active: true,
  });
  mockUserCreate.mockResolvedValue({
    id: "user-1",
    name: "0x1234...5678",
    wallet_address: VALID_ADDRESS.toLowerCase(),
    organization_id: "org-1",
    is_active: true,
  });

  // Ensure env vars are set for domain validation
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
});

describe("SIWE verify – input validation", () => {
  it("rejects requests with missing message", async () => {
    const res = await handleVerify(makeRequest({ signature: validSignature }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toBe("INVALID_BODY");
  });

  it("rejects requests with missing signature", async () => {
    const res = await handleVerify(makeRequest({ message: validMessage }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toBe("INVALID_BODY");
  });

  it("rejects empty string message", async () => {
    const res = await handleVerify(makeRequest({ message: "  ", signature: validSignature }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toBe("INVALID_BODY");
  });

  it("rejects when SIWE message is missing required fields", async () => {
    // parseSiweMessage mock parses JSON prefixed strings
    const incompleteMsg = JSON.stringify({ address: VALID_ADDRESS });
    const res = await handleVerify(makeRequest({ message: incompleteMsg, signature: validSignature }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toBe("INVALID_BODY");
  });
});

describe("SIWE verify – nonce validation (TTL / single-use)", () => {
  it("returns 503 when cache is unavailable", async () => {
    mockIsAvailable.mockReturnValue(false);
    const res = await handleVerify(makeRequest({ message: validMessage, signature: validSignature }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(503);
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("rejects expired / already-used nonce (atomicConsume returns 0)", async () => {
    mockAtomicConsume.mockResolvedValue(0);
    const res = await handleVerify(makeRequest({ message: validMessage, signature: validSignature }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toBe("INVALID_NONCE");
  });

  it("consumes nonce atomically (called with correct cache key)", async () => {
    mockAtomicConsume.mockResolvedValue(1);
    await handleVerify(makeRequest({ message: validMessage, signature: validSignature }));
    expect(mockAtomicConsume).toHaveBeenCalledWith("siwe:nonce:test-nonce-123");
  });
});

describe("SIWE verify – domain validation", () => {
  it("rejects SIWE message with mismatched domain", async () => {
    // The parseSiweMessage mock returns domain "localhost", so set env to something else
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    const res = await handleVerify(makeRequest({ message: validMessage, signature: validSignature }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toBe("INVALID_DOMAIN");
  });
});

describe("SIWE verify – signature validation", () => {
  it("rejects when recoverMessageAddress throws", async () => {
    mockRecoverMessageAddress.mockRejectedValue(new Error("bad sig"));
    const res = await handleVerify(makeRequest({ message: validMessage, signature: validSignature }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toBe("INVALID_SIGNATURE");
  });

  it("rejects when recovered address does not match claimed address", async () => {
    mockRecoverMessageAddress.mockResolvedValue("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const res = await handleVerify(makeRequest({ message: validMessage, signature: validSignature }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.error).toBe("INVALID_SIGNATURE");
  });
});

describe("SIWE verify – existing user (sign-in)", () => {
  const existingUser = {
    id: "user-existing",
    name: "Existing",
    wallet_address: VALID_ADDRESS.toLowerCase(),
    wallet_verified: true,
    is_active: true,
    privy_user_id: null,
    organization_id: "org-existing",
    organization: { id: "org-existing", name: "Org", is_active: true, credit_balance: "10.00" },
  };

  it("returns existing user with isNewAccount=false", async () => {
    mockGetByWallet.mockResolvedValue(existingUser);
    mockListByOrg.mockResolvedValue([
      { user_id: "user-existing", is_active: true, key: "ak_existing" },
    ]);

    const res = await handleVerify(makeRequest({ message: validMessage, signature: validSignature }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(200);
    expect(body.isNewAccount).toBe(false);
    expect(body.apiKey).toBe("ak_existing");
  });

  it("marks wallet_verified if not already verified", async () => {
    mockGetByWallet.mockResolvedValue({ ...existingUser, wallet_verified: false });
    mockListByOrg.mockResolvedValue([
      { user_id: "user-existing", is_active: true, key: "ak_existing" },
    ]);

    await handleVerify(makeRequest({ message: validMessage, signature: validSignature }));
    expect(mockUserUpdate).toHaveBeenCalledWith("user-existing", { wallet_verified: true });
  });

  it("rejects inactive account", async () => {
    mockGetByWallet.mockResolvedValue({ ...existingUser, is_active: false });
    const res = await handleVerify(makeRequest({ message: validMessage, signature: validSignature }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(403);
    expect(body.error).toBe("ACCOUNT_INACTIVE");
  });

  it("rejects inactive organization", async () => {
    mockGetByWallet.mockResolvedValue({
      ...existingUser,
      organization: { ...existingUser.organization, is_active: false },
    });
    const res = await handleVerify(makeRequest({ message: validMessage, signature: validSignature }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(403);
    expect(body.error).toBe("ACCOUNT_INACTIVE");
  });
});

describe("SIWE verify – new user (sign-up)", () => {
  it("creates org, user, API key and returns isNewAccount=true", async () => {
    mockGetByWallet.mockResolvedValue(null);

    const res = await handleVerify(makeRequest({ message: validMessage, signature: validSignature }));
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.isNewAccount).toBe(true);
    expect(body.apiKey).toBe("ak_new_key");
    expect(mockOrgCreate).toHaveBeenCalled();
    expect(mockUserCreate).toHaveBeenCalled();
    expect(mockApiKeyCreate).toHaveBeenCalled();
  });

  it("blocks signup when abuse detection denies", async () => {
    mockGetByWallet.mockResolvedValue(null);
    mockCheckAbuse.mockResolvedValue({ allowed: false, reason: "Too many signups" });

    const res = await handleVerify(makeRequest({ message: validMessage, signature: validSignature }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(403);
    expect(body.error).toBe("SIGNUP_BLOCKED");
  });

  it("cleans up org on user creation failure", async () => {
    mockGetByWallet.mockResolvedValue(null);
    mockUserCreate.mockRejectedValue(new Error("DB error"));

    await expect(
      handleVerify(makeRequest({ message: validMessage, signature: validSignature })),
    ).rejects.toThrow("DB error");

    expect(mockOrgDelete).toHaveBeenCalledWith("org-1");
  });

  it("handles duplicate wallet race condition (23505) by fetching winning user", async () => {
    mockGetByWallet
      .mockResolvedValueOnce(null) // first lookup – no user yet
      .mockResolvedValueOnce({
        // retry after 23505
        id: "user-winner",
        name: "Winner",
        wallet_address: VALID_ADDRESS.toLowerCase(),
        wallet_verified: true,
        is_active: true,
        organization_id: "org-winner",
        organization: { id: "org-winner", name: "Org", is_active: true, credit_balance: "5.00" },
      });

    const dupError = new Error("duplicate") as Error & { code: string };
    dupError.code = "23505";
    mockUserCreate.mockRejectedValue(dupError);
    mockListByOrg.mockResolvedValue([
      { user_id: "user-winner", is_active: true, key: "ak_winner" },
    ]);

    const res = await handleVerify(makeRequest({ message: validMessage, signature: validSignature }));
    const { status, body } = await parseResponse(res);
    expect(status).toBe(200);
    expect(body.isNewAccount).toBe(false);
    expect(body.apiKey).toBe("ak_winner");
    // Orphaned org should have been cleaned up
    expect(mockOrgDelete).toHaveBeenCalledWith("org-1");
  });
});
