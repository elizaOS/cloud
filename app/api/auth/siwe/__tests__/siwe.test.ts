
/**
 * Tests for SIWE nonce and verify endpoints.
 *
 * Covers:
 * - Nonce issuance (TTL/single-use, cache unavailability)
 * - Verify success paths (existing user, new user signup)
 * - Key failure modes (invalid nonce, invalid domain, invalid signature, malformed body)
 */

import { NextRequest } from "next/server";

// --- Mocks ---

const mockCache = {
  isAvailable: jest.fn().mockReturnValue(true),
  set: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(true),
  getRedisClient: jest.fn().mockReturnValue({}),
};

jest.mock("@/lib/cache/client", () => ({
  cache: mockCache,
}));

jest.mock("@/lib/cache/keys", () => ({
  CacheTTL: { siwe: { nonce: 300 } },
  CacheKeys: {
    siwe: { nonce: (n: string) => `siwe:nonce:${n}` },
  },
}));

const mockAtomicConsume = jest.fn();
jest.mock("@/lib/cache/consume", () => ({
  atomicConsume: (...args: unknown[]) => mockAtomicConsume(...args),
}));

jest.mock("viem/siwe", () => ({
  generateSiweNonce: jest.fn().mockReturnValue("test-nonce-abc123"),
  parseSiweMessage: jest.fn().mockReturnValue({
    address: "0x1234567890abcdef1234567890abcdef12345678",
    nonce: "test-nonce-abc123",
    domain: "localhost",
    uri: "http://localhost:3000",
    version: "1",
    chainId: 1,
  }),
}));

jest.mock("viem", () => ({
  recoverMessageAddress: jest
    .fn()
    .mockResolvedValue("0x1234567890abcdef1234567890abcdef12345678"),
  getAddress: jest.fn().mockImplementation((addr: string) => addr),
}));

jest.mock("@/lib/utils/app-url", () => ({
  getAppUrl: jest.fn().mockReturnValue("http://localhost:3000"),
}));

const mockUsersService = {
  getByWalletAddressWithOrganization: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockResolvedValue({
    id: "user-1",
    wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
    wallet_verified: true,
    organization_id: "org-1",
    is_active: true,
    name: "0x1234...5678",
  }),
  update: jest.fn().mockResolvedValue(undefined),
};

jest.mock("@/lib/services/users", () => ({
  usersService: mockUsersService,
}));

const mockApiKeysService = {
  listByOrganization: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockResolvedValue({ plainKey: "ak_test_key_123" }),
};

jest.mock("@/lib/services/api-keys", () => ({
  apiKeysService: mockApiKeysService,
}));

const mockOrganizationsService = {
  getBySlug: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockResolvedValue({
    id: "org-1",
    name: "0x1234...5678's Organization",
    slug: "wallet-5678-abc123",
    credit_balance: "0.00",
    is_active: true,
  }),
  delete: jest.fn().mockResolvedValue(undefined),
};

jest.mock("@/lib/services/organizations", () => ({
  organizationsService: mockOrganizationsService,
}));

const mockCreditsService = {
  addCredits: jest.fn().mockResolvedValue(undefined),
};

jest.mock("@/lib/services/credits", () => ({
  creditsService: mockCreditsService,
}));

const mockAbuseDetectionService = {
  checkSignupAbuse: jest.fn().mockResolvedValue({ allowed: true }),
  recordSignupMetadata: jest.fn().mockResolvedValue(undefined),
};

jest.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: mockAbuseDetectionService,
}));

jest.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: jest.fn().mockReturnValue("avatar-url"),
}));

jest.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: jest.fn().mockReturnValue("wallet-5678-abc123"),
  getInitialCredits: jest.fn().mockReturnValue(5.0),
}));

jest.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

// --- Helpers ---

function makeRequest(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"), init);
}

// --- Tests ---

describe("SIWE Nonce Endpoint", () => {
  let GET: Function;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCache.isAvailable.mockReturnValue(true);
    mockCache.get.mockResolvedValue(true);
    // Re-import to get fresh module
    jest.isolateModules(() => {
      ({ GET } = require("../../nonce/route"));
    });
  });

  it("returns a nonce with SIWE parameters", async () => {
    const req = makeRequest("http://localhost:3000/api/auth/siwe/nonce");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.nonce).toBe("test-nonce-abc123");
    expect(body.domain).toBe("localhost");
    expect(body.uri).toBe("http://localhost:3000");
    expect(body.chainId).toBe(1);
    expect(body.version).toBe("1");
    expect(body.statement).toBe("Sign in to ElizaCloud");
  });

  it("returns 503 when cache is unavailable", async () => {
    mockCache.isAvailable.mockReturnValue(false);
    const req = makeRequest("http://localhost:3000/api/auth/siwe/nonce");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 503 when nonce persistence fails", async () => {
    mockCache.get.mockResolvedValue(null);
    const req = makeRequest("http://localhost:3000/api/auth/siwe/nonce");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("validates chainId parameter", async () => {
    const req = makeRequest(
      "http://localhost:3000/api/auth/siwe/nonce?chainId=-1",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_BODY");
  });

  it("accepts valid custom chainId", async () => {
    const req = makeRequest(
      "http://localhost:3000/api/auth/siwe/nonce?chainId=137",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.chainId).toBe(137);
  });
});

describe("SIWE Verify Endpoint", () => {
  let POST: Function;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCache.isAvailable.mockReturnValue(true);
    mockAtomicConsume.mockResolvedValue(1);
    mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue(null);
    jest.isolateModules(() => {
      ({ POST } = require("../../verify/route"));
    });
  });

  const validBody = {
    message: "localhost wants you to sign in...",
    signature: "0xdeadbeef",
  };

  function makeVerifyRequest(body: unknown) {
    return makeRequest("http://localhost:3000/api/auth/siwe/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("returns 400 for missing message/signature", async () => {
    const req = makeVerifyRequest({});
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_BODY");
  });

  it("returns 400 for empty message", async () => {
    const req = makeVerifyRequest({ message: "", signature: "0xabc" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_BODY");
  });

  it("returns 503 when cache is unavailable", async () => {
    mockCache.isAvailable.mockReturnValue(false);
    const req = makeVerifyRequest(validBody);
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 400 for invalid/expired nonce", async () => {
    mockAtomicConsume.mockResolvedValue(0);
    const req = makeVerifyRequest(validBody);
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_NONCE");
  });

  it("returns 400 for invalid domain", async () => {
    const { parseSiweMessage } = require("viem/siwe");
    parseSiweMessage.mockReturnValueOnce({
      address: "0x1234567890abcdef1234567890abcdef12345678",
      nonce: "test-nonce-abc123",
      domain: "evil.com",
      uri: "http://evil.com",
      version: "1",
      chainId: 1,
    });

    const req = makeVerifyRequest(validBody);
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_DOMAIN");
  });

  it("returns 400 for invalid signature", async () => {
    const { recoverMessageAddress } = require("viem");
    recoverMessageAddress.mockRejectedValueOnce(new Error("bad sig"));

    const req = makeVerifyRequest(validBody);
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_SIGNATURE");
  });

  it("signs in existing user and returns API key", async () => {
    const existingUser = {
      id: "user-existing",
      wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
      wallet_verified: true,
      is_active: true,
      organization_id: "org-existing",
      organization: { id: "org-existing", name: "Existing Org", is_active: true, credit_balance: "10.00" },
      privy_user_id: null,
      name: "Existing",
    };
    mockUsersService.getByWalletAddressWithOrganization.mockResolvedValueOnce(
      existingUser,
    );
    mockApiKeysService.listByOrganization.mockResolvedValueOnce([
      { key: "ak_existing_key", user_id: "user-existing", is_active: true },
    ]);

    const req = makeVerifyRequest(validBody);
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.isNewAccount).toBe(false);
    expect(body.apiKey).toBe("ak_existing_key");
    expect(body.user.id).toBe("user-existing");
  });

  it("signs up new user and returns API key", async () => {
    const req = makeVerifyRequest(validBody);
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.isNewAccount).toBe(true);
    expect(body.apiKey).toBe("ak_test_key_123");
    expect(mockOrganizationsService.create).toHaveBeenCalled();
    expect(mockCreditsService.addCredits).toHaveBeenCalled();
    expect(mockUsersService.create).toHaveBeenCalled();
  });

  it("returns 403 for inactive existing account", async () => {
    const inactiveUser = {
      id: "user-inactive",
      wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
      wallet_verified: true,
      is_active: false,
      organization_id: "org-1",
      organization: { id: "org-1", name: "Org", is_active: true },
    };
    mockUsersService.getByWalletAddressWithOrganization.mockResolvedValueOnce(
      inactiveUser,
    );

    const req = makeVerifyRequest(validBody);
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("ACCOUNT_INACTIVE");
  });

  it("returns 403 when signup is blocked by abuse detection", async () => {
    mockAbuseDetectionService.checkSignupAbuse.mockResolvedValueOnce({
      allowed: false,
      reason: "Suspicious activity",
    });

    const req = makeVerifyRequest(validBody);
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("SIGNUP_BLOCKED");
  });

  it("propagates credit errors instead of swallowing them", async () => {
    mockCreditsService.addCredits.mockRejectedValueOnce(
      new Error("Credit service down"),
    );

    const req = makeVerifyRequest(validBody);

    // Credit error should propagate (org gets cleaned up via compensating delete)
    await expect(POST(req)).rejects.toThrow("Credit service down");
    expect(mockOrganizationsService.delete).toHaveBeenCalled();
  });
});
