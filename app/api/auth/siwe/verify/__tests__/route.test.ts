
/**
 * Tests for SIWE verify endpoint
 *
 * Covers:
 * - Nonce TTL / single-use enforcement
 * - Verify success paths (existing user vs new user)
 * - Key failure modes (invalid nonce, invalid domain, invalid signature)
 */

import { NextRequest } from "next/server";
import { handleVerify, truncateAddress, buildSuccessResponse } from "../route";

// ---- Mocks ----

const mockAtomicConsume = jest.fn();
jest.mock("@/lib/cache/consume", () => ({
  atomicConsume: (...args: unknown[]) => mockAtomicConsume(...args),
}));

const mockCacheIsAvailable = jest.fn().mockReturnValue(true);
jest.mock("@/lib/cache/client", () => ({
  cache: { isAvailable: () => mockCacheIsAvailable() },
}));

jest.mock("@/lib/cache/keys", () => ({
  CacheKeys: {
    siwe: { nonce: (n: string) => `siwe:nonce:${n}` },
  },
}));

const mockGetByWalletAddressWithOrganization = jest.fn();
const mockUpdateUser = jest.fn();
const mockCreateUser = jest.fn();
jest.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: (...args: unknown[]) =>
      mockGetByWalletAddressWithOrganization(...args),
    update: (...args: unknown[]) => mockUpdateUser(...args),
    create: (...args: unknown[]) => mockCreateUser(...args),
  },
}));

const mockListByOrganization = jest.fn();
const mockCreateApiKey = jest.fn();
jest.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: (...args: unknown[]) => mockListByOrganization(...args),
    create: (...args: unknown[]) => mockCreateApiKey(...args),
  },
}));

const mockGetBySlug = jest.fn();
const mockCreateOrg = jest.fn();
const mockDeleteOrg = jest.fn();
jest.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    getBySlug: (...args: unknown[]) => mockGetBySlug(...args),
    create: (...args: unknown[]) => mockCreateOrg(...args),
    delete: (...args: unknown[]) => mockDeleteOrg(...args),
  },
}));

const mockAddCredits = jest.fn();
jest.mock("@/lib/services/credits", () => ({
  creditsService: {
    addCredits: (...args: unknown[]) => mockAddCredits(...args),
  },
}));

const mockCheckSignupAbuse = jest.fn().mockResolvedValue({ allowed: true });
const mockRecordSignupMetadata = jest.fn();
jest.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: {
    checkSignupAbuse: (...args: unknown[]) => mockCheckSignupAbuse(...args),
    recordSignupMetadata: (...args: unknown[]) =>
      mockRecordSignupMetadata(...args),
  },
}));

jest.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: () => "https://example.com/avatar.png",
}));

jest.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: (addr: string) => `slug-${addr.slice(0, 8)}`,
  getInitialCredits: () => 100,
}));

jest.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

// Mock viem functions
const VALID_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

const mockParseSiweMessage = jest.fn();
jest.mock("viem/siwe", () => ({
  parseSiweMessage: (...args: unknown[]) => mockParseSiweMessage(...args),
}));

const mockRecoverMessageAddress = jest.fn();
const mockGetAddress = jest.fn((addr: string) => addr);
jest.mock("viem", () => ({
  recoverMessageAddress: (...args: unknown[]) =>
    mockRecoverMessageAddress(...args),
  getAddress: (addr: string) => mockGetAddress(addr),
}));

jest.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: unknown) => handler,
  RateLimitPresets: { STRICT: {} },
}));

// ---- Helpers ----

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("https://app.example.com/api/auth/siwe/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function getResponseJson(response: Response) {
  return response.json();
}

// ---- Tests ----

beforeEach(() => {
  jest.clearAllMocks();
  mockCacheIsAvailable.mockReturnValue(true);
  mockGetAddress.mockImplementation((addr: string) => addr);
});

describe("truncateAddress", () => {
  it("truncates an Ethereum address", () => {
    expect(truncateAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(
      "0xd8dA...6045",
    );
  });
});

describe("handleVerify - input validation", () => {
  it("returns 400 for missing body fields", async () => {
    const res = await handleVerify(makeRequest({}));
    expect(res.status).toBe(400);
    const json = await getResponseJson(res);
    expect(json.error).toBe("INVALID_BODY");
  });

  it("returns 400 for empty message", async () => {
    const res = await handleVerify(makeRequest({ message: "", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const json = await getResponseJson(res);
    expect(json.error).toBe("INVALID_BODY");
  });

  it("returns 400 for empty signature", async () => {
    const res = await handleVerify(
      makeRequest({ message: "some message", signature: "" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when SIWE message missing required fields", async () => {
    mockParseSiweMessage.mockReturnValue({ address: null, nonce: null, domain: null });
    const res = await handleVerify(
      makeRequest({ message: "some message", signature: "0xabc" }),
    );
    expect(res.status).toBe(400);
    const json = await getResponseJson(res);
    expect(json.error).toBe("INVALID_BODY");
  });
});

describe("handleVerify - nonce validation (TTL / single-use)", () => {
  beforeEach(() => {
    mockParseSiweMessage.mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "test-nonce-123",
      domain: "app.example.com",
    });
  });

  it("returns 503 when cache is unavailable", async () => {
    mockCacheIsAvailable.mockReturnValue(false);
    const res = await handleVerify(
      makeRequest({ message: "msg", signature: "0xsig" }),
    );
    expect(res.status).toBe(503);
    const json = await getResponseJson(res);
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 400 when nonce has expired or already been used (single-use enforcement)", async () => {
    mockAtomicConsume.mockResolvedValue(0);
    const res = await handleVerify(
      makeRequest({ message: "msg", signature: "0xsig" }),
    );
    expect(res.status).toBe(400);
    const json = await getResponseJson(res);
    expect(json.error).toBe("INVALID_NONCE");
    expect(mockAtomicConsume).toHaveBeenCalledWith("siwe:nonce:test-nonce-123");
  });

  it("consumes nonce atomically (single-use)", async () => {
    mockAtomicConsume.mockResolvedValue(1);
    // Will fail at domain check, but nonce is consumed
    mockParseSiweMessage.mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "test-nonce-123",
      domain: "evil.com",
    });
    const res = await handleVerify(
      makeRequest({ message: "msg", signature: "0xsig" }),
    );
    expect(mockAtomicConsume).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(400);
    const json = await getResponseJson(res);
    expect(json.error).toBe("INVALID_DOMAIN");
  });
});

describe("handleVerify - domain validation", () => {
  beforeEach(() => {
    mockAtomicConsume.mockResolvedValue(1);
  });

  it("returns 400 when domain does not match server", async () => {
    mockParseSiweMessage.mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "nonce-1",
      domain: "evil.phishing.com",
    });
    const res = await handleVerify(
      makeRequest({ message: "msg", signature: "0xsig" }),
    );
    expect(res.status).toBe(400);
    const json = await getResponseJson(res);
    expect(json.error).toBe("INVALID_DOMAIN");
  });

  it("returns 400 when SIWE message has expired", async () => {
    mockParseSiweMessage.mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "nonce-1",
      domain: "app.example.com",
      expirationTime: new Date("2020-01-01"),
    });
    const res = await handleVerify(
      makeRequest({ message: "msg", signature: "0xsig" }),
    );
    expect(res.status).toBe(400);
    const json = await getResponseJson(res);
    expect(json.error).toBe("MESSAGE_EXPIRED");
  });
});

describe("handleVerify - signature validation", () => {
  beforeEach(() => {
    mockAtomicConsume.mockResolvedValue(1);
    mockParseSiweMessage.mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "nonce-1",
      domain: "app.example.com",
    });
  });

  it("returns 400 when signature recovery throws", async () => {
    mockRecoverMessageAddress.mockRejectedValue(new Error("bad sig"));
    const res = await handleVerify(
      makeRequest({ message: "msg", signature: "0xbadsig" }),
    );
    expect(res.status).toBe(400);
    const json = await getResponseJson(res);
    expect(json.error).toBe("INVALID_SIGNATURE");
  });

  it("returns 400 when recovered address does not match claimed address", async () => {
    mockRecoverMessageAddress.mockResolvedValue(
      "0x0000000000000000000000000000000000000001",
    );
    mockGetAddress.mockImplementation((addr: string) => addr);
    const res = await handleVerify(
      makeRequest({ message: "msg", signature: "0xsig" }),
    );
    expect(res.status).toBe(400);
    const json = await getResponseJson(res);
    expect(json.error).toBe("INVALID_SIGNATURE");
  });
});

describe("handleVerify - existing user success path", () => {
  const existingUser = {
    id: "user-1",
    name: "0xd8dA...6045",
    wallet_address: VALID_ADDRESS.toLowerCase(),
    wallet_verified: true,
    is_active: true,
    privy_user_id: null,
    organization_id: "org-1",
    organization: { id: "org-1", name: "Test Org", is_active: true, credit_balance: "50.00" },
  };

  beforeEach(() => {
    mockAtomicConsume.mockResolvedValue(1);
    mockParseSiweMessage.mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "nonce-1",
      domain: "app.example.com",
    });
    mockRecoverMessageAddress.mockResolvedValue(VALID_ADDRESS);
    mockGetAddress.mockImplementation((addr: string) => addr);
    mockGetByWalletAddressWithOrganization.mockResolvedValue(existingUser);
    mockListByOrganization.mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "sk-existing-key" },
    ]);
  });

  it("returns 200 with isNewAccount=false for existing user", async () => {
    const res = await handleVerify(
      makeRequest({ message: "msg", signature: "0xsig" }),
    );
    expect(res.status).toBe(200);
    const json = await getResponseJson(res);
    expect(json.isNewAccount).toBe(false);
    expect(json.apiKey).toBe("sk-existing-key");
    expect(json.address).toBe(VALID_ADDRESS);
  });

  it("returns 403 when existing user is inactive", async () => {
    mockGetByWalletAddressWithOrganization.mockResolvedValue({
      ...existingUser,
      is_active: false,
    });
    const res = await handleVerify(
      makeRequest({ message: "msg", signature: "0xsig" }),
    );
    expect(res.status).toBe(403);
    const json = await getResponseJson(res);
    expect(json.error).toBe("ACCOUNT_INACTIVE");
  });

  it("returns 403 when existing user org is inactive", async () => {
    mockGetByWalletAddressWithOrganization.mockResolvedValue({
      ...existingUser,
      organization: { ...existingUser.organization, is_active: false },
    });
    const res = await handleVerify(
      makeRequest({ message: "msg", signature: "0xsig" }),
    );
    expect(res.status).toBe(403);
  });

  it("marks wallet as verified if not already verified", async () => {
    mockGetByWalletAddressWithOrganization.mockResolvedValue({
      ...existingUser,
      wallet_verified: false,
    });
    await handleVerify(makeRequest({ message: "msg", signature: "0xsig" }));
    expect(mockUpdateUser).toHaveBeenCalledWith("user-1", {
      wallet_verified: true,
    });
  });

  it("creates a new API key if none exists for existing user", async () => {
    mockListByOrganization.mockResolvedValue([]);
    mockCreateApiKey.mockResolvedValue({ plainKey: "sk-new-key" });
    const res = await handleVerify(
      makeRequest({ message: "msg", signature: "0xsig" }),
    );
    expect(res.status).toBe(200);
    const json = await getResponseJson(res);
    expect(json.apiKey).toBe("sk-new-key");
  });
});

describe("handleVerify - new user (signup) success path", () => {
  beforeEach(() => {
    mockAtomicConsume.mockResolvedValue(1);
    mockParseSiweMessage.mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "nonce-1",
      domain: "app.example.com",
    });
    mockRecoverMessageAddress.mockResolvedValue(VALID_ADDRESS);
    mockGetAddress.mockImplementation((addr: string) => addr);
    mockGetByWalletAddressWithOrganization.mockResolvedValue(undefined);
    mockCheckSignupAbuse.mockResolvedValue({ allowed: true });
    mockGetBySlug.mockResolvedValue(undefined);
    mockCreateOrg.mockResolvedValue({
      id: "org-new",
      name: "0xd8dA...6045's Organization",
      slug: "slug-test",
      credit_balance: "0.00",
    });
    mockCreateUser.mockResolvedValue({
      id: "user-new",
      name: "0xd8dA...6045",
      wallet_address: VALID_ADDRESS.toLowerCase(),
      wallet_verified: true,
      is_active: true,
      organization_id: "org-new",
    });
    mockCreateApiKey.mockResolvedValue({ plainKey: "sk-fresh-key" });
  });

  it("returns 200 with isNewAccount=true for new user", async () => {
    const res = await handleVerify(
      makeRequest({ message: "msg", signature: "0xsig" }),
    );
    expect(res.status).toBe(200);
    const json = await getResponseJson(res);
    expect(json.isNewAccount).toBe(true);
    expect(json.apiKey).toBe("sk-fresh-key");
  });

  it("creates org, user, and API key in sequence", async () => {
    await handleVerify(makeRequest({ message: "msg", signature: "0xsig" }));
    expect(mockCreateOrg).toHaveBeenCalledTimes(1);
    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    expect(mockCreateApiKey).toHaveBeenCalledTimes(1);
    expect(mockAddCredits).toHaveBeenCalledTimes(1);
  });

  it("returns 403 when abuse detection blocks signup", async () => {
    mockCheckSignupAbuse.mockResolvedValue({
      allowed: false,
      reason: "Too many signups",
    });
    const res = await handleVerify(
      makeRequest({ message: "msg", signature: "0xsig" }),
    );
    expect(res.status).toBe(403);
    const json = await getResponseJson(res);
    expect(json.error).toBe("SIGNUP_BLOCKED");
  });

  it("cleans up org on user creation failure", async () => {
    mockCreateUser.mockRejectedValue(new Error("db error"));
    await expect(
      handleVerify(makeRequest({ message: "msg", signature: "0xsig" })),
    ).rejects.toThrow("db error");
    expect(mockDeleteOrg).toHaveBeenCalledWith("org-new");
  });
});

describe("buildSuccessResponse", () => {
  it("includes all expected fields", async () => {
    const user = {
      id: "u1",
      name: "Test",
      privy_user_id: "privy-1",
      organization_id: "o1",
      organization: { id: "o1", name: "Org", credit_balance: "10.00" },
    } as any;
    const res = buildSuccessResponse(user, "sk-key", "0xABC", true);
    const json = await res.json();
    expect(json.apiKey).toBe("sk-key");
    expect(json.isNewAccount).toBe(true);
    expect(json.user.privyLinked).toBe(true);
    expect(json.organization.id).toBe("o1");
  });
});
