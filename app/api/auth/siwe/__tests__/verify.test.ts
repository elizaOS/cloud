
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockCache = {
  isAvailable: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
};
vi.mock("@/lib/cache/client", () => ({ cache: mockCache }));
vi.mock("@/lib/cache/keys", () => ({
  CacheKeys: { siwe: { nonce: (n: string) => `siwe:nonce:${n}` } },
}));

const mockAtomicConsume = vi.fn();
vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: (...args: unknown[]) => mockAtomicConsume(...args),
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));
vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

const mockUsersService = {
  getByWalletAddressWithOrganization: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};
vi.mock("@/lib/services/users", () => ({ usersService: mockUsersService }));

const mockApiKeysService = {
  listByOrganization: vi.fn(),
  create: vi.fn(),
};
vi.mock("@/lib/services/api-keys", () => ({
  apiKeysService: mockApiKeysService,
}));

const mockOrganizationsService = {
  create: vi.fn(),
  getBySlug: vi.fn(),
  delete: vi.fn(),
};
vi.mock("@/lib/services/organizations", () => ({
  organizationsService: mockOrganizationsService,
}));

const mockCreditsService = { addCredits: vi.fn() };
vi.mock("@/lib/services/credits", () => ({
  creditsService: mockCreditsService,
}));

const mockAbuseDetectionService = {
  checkSignupAbuse: vi.fn(),
  recordSignupMetadata: vi.fn(),
};
vi.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: mockAbuseDetectionService,
}));

vi.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: () => "avatar.png",
}));
vi.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: () => "abc123-def456",
  getInitialCredits: () => 5.0,
}));

// Mock viem modules
const TEST_ADDRESS = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
vi.mock("viem/siwe", () => ({
  parseSiweMessage: (msg: string) => {
    if (msg === "invalid") return {};
    return {
      address: TEST_ADDRESS,
      nonce: "test-nonce-123",
      domain: "app.example.com",
    };
  },
}));
vi.mock("viem", () => ({
  recoverMessageAddress: vi.fn().mockResolvedValue(TEST_ADDRESS),
  getAddress: (addr: string) => addr,
}));

import { POST } from "../../verify/route";
import { NextRequest } from "next/server";

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest(new URL("http://localhost/api/auth/siwe/verify"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("SIWE verify endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCache.isAvailable.mockReturnValue(true);
  });

  // --- Invalid body ---
  it("returns 400 for missing message", async () => {
    const res = await POST(makeRequest({ signature: "0xabc" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_BODY");
  });

  it("returns 400 for missing signature", async () => {
    const res = await POST(makeRequest({ message: "hello" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_BODY");
  });

  it("returns 400 for empty message", async () => {
    const res = await POST(makeRequest({ message: "  ", signature: "0xabc" }));
    expect(res.status).toBe(400);
  });

  // --- Cache unavailable ---
  it("returns 503 when cache is unavailable", async () => {
    mockCache.isAvailable.mockReturnValue(false);
    const res = await POST(
      makeRequest({ message: "valid-siwe", signature: "0xabc" }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  // --- Invalid nonce ---
  it("returns 400 for expired/used nonce (atomicConsume returns 0)", async () => {
    mockAtomicConsume.mockResolvedValue(0);
    const res = await POST(
      makeRequest({ message: "valid-siwe", signature: "0xabc" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_NONCE");
  });

  // --- Invalid domain ---
  it("returns 400 for mismatched domain", async () => {
    mockAtomicConsume.mockResolvedValue(1);
    // Override parseSiweMessage for this test
    const viemSiwe = await import("viem/siwe");
    const origParse = viemSiwe.parseSiweMessage;
    vi.mocked(viemSiwe.parseSiweMessage as any).mockReturnValueOnce({
      address: TEST_ADDRESS,
      nonce: "test-nonce-123",
      domain: "evil.example.com",
    });
    const res = await POST(
      makeRequest({ message: "valid-siwe", signature: "0xabc" }),
    );
    // Domain validation returns 400
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_DOMAIN");
  });

  // --- Invalid signature ---
  it("returns 400 for invalid signature", async () => {
    mockAtomicConsume.mockResolvedValue(1);
    const viem = await import("viem");
    vi.mocked(viem.recoverMessageAddress).mockRejectedValueOnce(
      new Error("invalid sig"),
    );
    const res = await POST(
      makeRequest({ message: "valid-siwe", signature: "0xbad" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_SIGNATURE");
  });

  // --- Existing user sign-in ---
  it("returns existing user and API key for known wallet", async () => {
    mockAtomicConsume.mockResolvedValue(1);
    const existingUser = {
      id: "user-1",
      name: "Test",
      wallet_verified: true,
      is_active: true,
      organization_id: "org-1",
      organization: { is_active: true, name: "Org", credit_balance: "5.00" },
      privy_user_id: null,
    };
    mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue(
      existingUser,
    );
    mockApiKeysService.listByOrganization.mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "existing-key-123" },
    ]);

    const res = await POST(
      makeRequest({ message: "valid-siwe", signature: "0xabc" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isNewAccount).toBe(false);
    expect(body.apiKey).toBe("existing-key-123");
  });

  it("returns 403 for inactive account", async () => {
    mockAtomicConsume.mockResolvedValue(1);
    mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue({
      id: "user-1",
      is_active: false,
      organization_id: "org-1",
      organization: { is_active: true },
    });

    const res = await POST(
      makeRequest({ message: "valid-siwe", signature: "0xabc" }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("ACCOUNT_INACTIVE");
  });

  // --- New user sign-up ---
  it("creates new user with org, credits, and API key", async () => {
    mockAtomicConsume.mockResolvedValue(1);
    mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue(null);
    mockAbuseDetectionService.checkSignupAbuse.mockResolvedValue({
      allowed: true,
    });
    mockOrganizationsService.getBySlug.mockResolvedValue(null);
    mockOrganizationsService.create.mockResolvedValue({
      id: "org-new",
      name: "Test Org",
      credit_balance: "0.00",
    });
    mockAbuseDetectionService.recordSignupMetadata.mockResolvedValue(undefined);
    mockCreditsService.addCredits.mockResolvedValue(undefined);
    mockUsersService.create.mockResolvedValue({
      id: "user-new",
      name: "0xd8dA...6045",
      organization_id: "org-new",
      wallet_verified: true,
      is_active: true,
    });
    mockApiKeysService.create.mockResolvedValue({
      plainKey: "new-api-key-456",
    });

    const res = await POST(
      makeRequest({ message: "valid-siwe", signature: "0xabc" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isNewAccount).toBe(true);
    expect(body.apiKey).toBe("new-api-key-456");
    expect(mockOrganizationsService.create).toHaveBeenCalled();
    expect(mockCreditsService.addCredits).toHaveBeenCalled();
    expect(mockUsersService.create).toHaveBeenCalled();
  });

  it("cleans up org on user creation failure", async () => {
    mockAtomicConsume.mockResolvedValue(1);
    mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue(null);
    mockAbuseDetectionService.checkSignupAbuse.mockResolvedValue({
      allowed: true,
    });
    mockOrganizationsService.getBySlug.mockResolvedValue(null);
    mockOrganizationsService.create.mockResolvedValue({
      id: "org-orphan",
      name: "Test Org",
    });
    mockAbuseDetectionService.recordSignupMetadata.mockResolvedValue(undefined);
    mockCreditsService.addCredits.mockResolvedValue(undefined);
    mockUsersService.create.mockRejectedValue(new Error("DB error"));
    mockOrganizationsService.delete.mockResolvedValue(undefined);

    await expect(
      POST(makeRequest({ message: "valid-siwe", signature: "0xabc" })),
    ).rejects.toThrow("DB error");

    // Verify compensating cleanup was called
    expect(mockOrganizationsService.delete).toHaveBeenCalledWith("org-orphan");
  });

  it("returns 403 when abuse detection blocks signup", async () => {
    mockAtomicConsume.mockResolvedValue(1);
    mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue(null);
    mockAbuseDetectionService.checkSignupAbuse.mockResolvedValue({
      allowed: false,
      reason: "Too many signups",
    });

    const res = await POST(
      makeRequest({ message: "valid-siwe", signature: "0xabc" }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("SIGNUP_BLOCKED");
  });

  // --- Nonce single-use enforcement ---
  it("atomicConsume is called with correct key", async () => {
    mockAtomicConsume.mockResolvedValue(1);
    mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue({
      id: "user-1",
      is_active: true,
      wallet_verified: true,
      organization_id: "org-1",
      organization: { is_active: true, name: "Org", credit_balance: "5.00" },
      privy_user_id: null,
    });
    mockApiKeysService.listByOrganization.mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "key" },
    ]);

    await POST(makeRequest({ message: "valid-siwe", signature: "0xabc" }));
    expect(mockAtomicConsume).toHaveBeenCalledWith(
      "siwe:nonce:test-nonce-123",
    );
  });
});
