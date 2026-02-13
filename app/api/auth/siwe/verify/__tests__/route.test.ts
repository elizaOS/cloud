
/**
 * Tests for SIWE verify endpoint.
 *
 * Covers:
 * - Nonce issuance (TTL / single-use)
 * - Verify success paths (existing user vs new user)
 * - Key failure modes (invalid nonce, domain mismatch, bad signature, missing fields)
 */

import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks – declared before imports so jest.mock hoisting works correctly
// ---------------------------------------------------------------------------

const mockAtomicConsume = jest.fn();
const mockCacheIsAvailable = jest.fn().mockReturnValue(true);

jest.mock("@/lib/cache/client", () => ({
  cache: { isAvailable: () => mockCacheIsAvailable() },
}));

jest.mock("@/lib/cache/consume", () => ({
  atomicConsume: (...args: unknown[]) => mockAtomicConsume(...args),
}));

jest.mock("@/lib/cache/keys", () => ({
  CacheKeys: {
    siwe: { nonce: (n: string) => `siwe:nonce:${n}` },
  },
}));

const mockGetAppUrl = jest.fn().mockReturnValue("https://app.example.com");
jest.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => mockGetAppUrl(),
}));

// viem helpers – we control recoverMessageAddress & parseSiweMessage
const mockRecoverMessageAddress = jest.fn();
jest.mock("viem", () => ({
  recoverMessageAddress: (...args: unknown[]) => mockRecoverMessageAddress(...args),
  getAddress: (addr: string) => addr, // pass-through for tests
}));

const mockParseSiweMessage = jest.fn();
jest.mock("viem/siwe", () => ({
  parseSiweMessage: (msg: string) => mockParseSiweMessage(msg),
}));

// Service mocks
const mockGetByWallet = jest.fn();
const mockUserUpdate = jest.fn();
const mockUserCreate = jest.fn();
jest.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: (...args: unknown[]) => mockGetByWallet(...args),
    update: (...args: unknown[]) => mockUserUpdate(...args),
    create: (...args: unknown[]) => mockUserCreate(...args),
  },
}));

const mockListByOrganization = jest.fn().mockResolvedValue([]);
const mockApiKeyCreate = jest.fn();
jest.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: (...args: unknown[]) => mockListByOrganization(...args),
    create: (...args: unknown[]) => mockApiKeyCreate(...args),
  },
}));

const mockOrgCreate = jest.fn();
const mockOrgGetBySlug = jest.fn().mockResolvedValue(null);
const mockOrgDelete = jest.fn();
jest.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    create: (...args: unknown[]) => mockOrgCreate(...args),
    getBySlug: (...args: unknown[]) => mockOrgGetBySlug(...args),
    delete: (...args: unknown[]) => mockOrgDelete(...args),
  },
}));

const mockCheckSignupAbuse = jest.fn().mockResolvedValue({ allowed: true });
const mockRecordSignupMetadata = jest.fn();
jest.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: {
    checkSignupAbuse: (...args: unknown[]) => mockCheckSignupAbuse(...args),
    recordSignupMetadata: (...args: unknown[]) => mockRecordSignupMetadata(...args),
  },
}));

jest.mock("@/lib/services/credits", () => ({
  creditsService: {
    addCredits: jest.fn(),
  },
}));

jest.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: () => "https://avatar.test/1.png",
}));

jest.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: (addr: string) => `wallet-${addr.slice(0, 8)}`,
  getInitialCredits: () => 0,
}));

jest.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

// ---------------------------------------------------------------------------
// Import the handler under test
// ---------------------------------------------------------------------------

import { _handleVerifyForTests as handleVerify } from "../route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_ADDRESS = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";
const VALID_NONCE = "abc123nonce";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("https://app.example.com/api/auth/siwe/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupValidParse() {
  mockParseSiweMessage.mockReturnValue({
    address: VALID_ADDRESS,
    nonce: VALID_NONCE,
    domain: "app.example.com",
  });
}

function setupValidSignature() {
  mockRecoverMessageAddress.mockResolvedValue(VALID_ADDRESS);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockCacheIsAvailable.mockReturnValue(true);
  mockAtomicConsume.mockResolvedValue(1); // nonce exists by default
  mockGetAppUrl.mockReturnValue("https://app.example.com");
});

describe("SIWE verify – input validation", () => {
  it("rejects missing message field", async () => {
    const res = await handleVerify(makeRequest({ signature: "0xabc" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  it("rejects empty signature", async () => {
    const res = await handleVerify(makeRequest({ message: "hello", signature: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects SIWE message missing required fields", async () => {
    mockParseSiweMessage.mockReturnValue({ address: null, nonce: null, domain: null });
    const res = await handleVerify(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });
});

describe("SIWE verify – nonce validation", () => {
  it("returns 503 when cache is unavailable", async () => {
    setupValidParse();
    mockCacheIsAvailable.mockReturnValue(false);
    const res = await handleVerify(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("rejects expired / already-used nonce (single-use enforcement)", async () => {
    setupValidParse();
    mockAtomicConsume.mockResolvedValue(0); // nonce already consumed
    const res = await handleVerify(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_NONCE");
  });

  it("atomically consumes nonce exactly once", async () => {
    setupValidParse();
    setupValidSignature();
    mockGetByWallet.mockResolvedValue({
      id: "u1",
      is_active: true,
      organization_id: "org1",
      organization: { is_active: true, name: "Org" },
      wallet_verified: true,
    });
    mockListByOrganization.mockResolvedValue([
      { user_id: "u1", is_active: true, key: "sk_existing" },
    ]);

    await handleVerify(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(mockAtomicConsume).toHaveBeenCalledTimes(1);
    expect(mockAtomicConsume).toHaveBeenCalledWith(`siwe:nonce:${VALID_NONCE}`);
  });
});

describe("SIWE verify – domain validation", () => {
  it("rejects domain mismatch", async () => {
    mockParseSiweMessage.mockReturnValue({
      address: VALID_ADDRESS,
      nonce: VALID_NONCE,
      domain: "evil.com",
    });
    const res = await handleVerify(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_DOMAIN");
  });
});

describe("SIWE verify – signature validation", () => {
  it("rejects when recoverMessageAddress throws", async () => {
    setupValidParse();
    mockRecoverMessageAddress.mockRejectedValue(new Error("bad sig"));
    const res = await handleVerify(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_SIGNATURE");
  });

  it("rejects when recovered address does not match claimed address", async () => {
    setupValidParse();
    mockRecoverMessageAddress.mockResolvedValue("0xDifferentAddress000000000000000000000000");
    const res = await handleVerify(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_SIGNATURE");
  });
});

describe("SIWE verify – existing user (sign-in)", () => {
  it("returns existing user with isNewAccount=false", async () => {
    setupValidParse();
    setupValidSignature();
    const existingUser = {
      id: "u1",
      name: "0xAbCd...Ef01",
      is_active: true,
      organization_id: "org1",
      organization: { is_active: true, name: "Org", credit_balance: "5.00" },
      wallet_verified: true,
      privy_user_id: null,
    };
    mockGetByWallet.mockResolvedValue(existingUser);
    mockListByOrganization.mockResolvedValue([
      { user_id: "u1", is_active: true, key: "sk_existing_key" },
    ]);

    const res = await handleVerify(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isNewAccount).toBe(false);
    expect(json.apiKey).toBe("sk_existing_key");
    expect(json.user.id).toBe("u1");
  });

  it("marks wallet_verified if not already verified", async () => {
    setupValidParse();
    setupValidSignature();
    const existingUser = {
      id: "u1",
      is_active: true,
      organization_id: "org1",
      organization: { is_active: true, name: "Org" },
      wallet_verified: false,
      privy_user_id: "privy_123",
    };
    mockGetByWallet.mockResolvedValue(existingUser);
    mockListByOrganization.mockResolvedValue([
      { user_id: "u1", is_active: true, key: "sk_key" },
    ]);

    await handleVerify(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(mockUserUpdate).toHaveBeenCalledWith("u1", { wallet_verified: true });
  });

  it("rejects inactive account", async () => {
    setupValidParse();
    setupValidSignature();
    mockGetByWallet.mockResolvedValue({
      id: "u1",
      is_active: false,
      organization_id: "org1",
      organization: { is_active: true },
      wallet_verified: true,
    });

    const res = await handleVerify(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("ACCOUNT_INACTIVE");
  });
});

describe("SIWE verify – new user (sign-up)", () => {
  it("creates org, user, API key and returns isNewAccount=true", async () => {
    setupValidParse();
    setupValidSignature();
    mockGetByWallet.mockResolvedValue(null); // no existing user

    const org = { id: "org_new", name: "New Org", credit_balance: "0.00", is_active: true };
    mockOrgCreate.mockResolvedValue(org);

    const user = { id: "u_new", name: "0xAbCd...Ef01", organization_id: "org_new" };
    mockUserCreate.mockResolvedValue(user);
    mockApiKeyCreate.mockResolvedValue({ plainKey: "sk_brand_new" });

    const res = await handleVerify(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isNewAccount).toBe(true);
    expect(json.apiKey).toBe("sk_brand_new");
    expect(mockOrgCreate).toHaveBeenCalledTimes(1);
    expect(mockUserCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects signup when abuse detection blocks it", async () => {
    setupValidParse();
    setupValidSignature();
    mockGetByWallet.mockResolvedValue(null);
    mockCheckSignupAbuse.mockResolvedValue({ allowed: false, reason: "Too many signups" });

    const res = await handleVerify(makeRequest({ message: "msg", signature: "0xabc" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("SIGNUP_BLOCKED");
  });

  it("cleans up org on user creation failure", async () => {
    setupValidParse();
    setupValidSignature();
    mockGetByWallet.mockResolvedValue(null);
    mockCheckSignupAbuse.mockResolvedValue({ allowed: true });

    const org = { id: "org_orphan" };
    mockOrgCreate.mockResolvedValue(org);
    mockUserCreate.mockRejectedValue(new Error("DB error"));

    await expect(
      handleVerify(makeRequest({ message: "msg", signature: "0xabc" })),
    ).rejects.toThrow("DB error");

    expect(mockOrgDelete).toHaveBeenCalledWith("org_orphan");
  });
});
