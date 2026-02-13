
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockCache = {
  isAvailable: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
};
vi.mock("@/lib/cache/client", () => ({ cache: mockCache }));
vi.mock("@/lib/cache/keys", () => ({
  CacheKeys: { siwe: { nonce: (n: string) => `siwe:nonce:${n}` } },
}));

const mockAtomicConsume = vi.fn();
vi.mock("@/lib/cache/consume", () => ({ atomicConsume: mockAtomicConsume }));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

const mockParseSiweMessage = vi.fn();
vi.mock("viem/siwe", () => ({ parseSiweMessage: mockParseSiweMessage }));

const mockRecoverMessageAddress = vi.fn();
const mockGetAddress = vi.fn((addr: string) => addr);
vi.mock("viem", () => ({
  recoverMessageAddress: (...args: unknown[]) => mockRecoverMessageAddress(...args),
  getAddress: (addr: string) => mockGetAddress(addr),
}));

const mockUsersService = {
  getByWalletAddressWithOrganization: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
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
  getBySlug: vi.fn(),
  create: vi.fn(),
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

vi.mock("@/lib/types", () => ({}));

import { POST } from "../../verify/route";
import { NextRequest } from "next/server";

const VALID_ADDRESS = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";

function makeRequest(body: Record<string, unknown> = {}) {
  return new NextRequest(new URL("http://localhost/api/auth/siwe/verify"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function setupValidSignature() {
  mockParseSiweMessage.mockReturnValue({
    address: VALID_ADDRESS,
    nonce: "testnonce123",
    domain: "app.example.com",
  });
  mockRecoverMessageAddress.mockResolvedValue(VALID_ADDRESS);
  mockGetAddress.mockImplementation((addr: string) => addr);
  mockCache.isAvailable.mockReturnValue(true);
  mockAtomicConsume.mockResolvedValue(1);
}

describe("SIWE verify endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Validation failures ---
  it("returns 400 for missing message/signature", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_BODY");
  });

  it("returns 400 for empty message string", async () => {
    const res = await POST(makeRequest({ message: "", signature: "0xabc" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty signature string", async () => {
    const res = await POST(makeRequest({ message: "hello", signature: "" }));
    expect(res.status).toBe(400);
  });

  // --- Cache unavailability ---
  it("returns 503 when cache is unavailable", async () => {
    mockParseSiweMessage.mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "testnonce",
      domain: "app.example.com",
    });
    mockCache.isAvailable.mockReturnValue(false);

    const res = await POST(
      makeRequest({ message: "valid-siwe-message", signature: "0xabc" }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  // --- Invalid nonce ---
  it("returns 400 when nonce was already consumed", async () => {
    mockParseSiweMessage.mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "usednonce",
      domain: "app.example.com",
    });
    mockCache.isAvailable.mockReturnValue(true);
    mockAtomicConsume.mockResolvedValue(0); // already consumed

    const res = await POST(
      makeRequest({ message: "siwe-message", signature: "0xabc" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_NONCE");
  });

  // --- Domain mismatch ---
  it("returns 400 when domain does not match", async () => {
    mockParseSiweMessage.mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "testnonce",
      domain: "evil.example.com",
    });
    mockCache.isAvailable.mockReturnValue(true);
    mockAtomicConsume.mockResolvedValue(1);

    const res = await POST(
      makeRequest({ message: "siwe-message", signature: "0xabc" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_DOMAIN");
  });

  // --- Invalid signature ---
  it("returns 400 when signature recovery throws", async () => {
    mockParseSiweMessage.mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "testnonce",
      domain: "app.example.com",
    });
    mockCache.isAvailable.mockReturnValue(true);
    mockAtomicConsume.mockResolvedValue(1);
    mockRecoverMessageAddress.mockRejectedValue(new Error("bad sig"));

    const res = await POST(
      makeRequest({ message: "siwe-message", signature: "0xbadsig" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_SIGNATURE");
  });

  it("returns 400 when recovered address does not match claimed address", async () => {
    mockParseSiweMessage.mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "testnonce",
      domain: "app.example.com",
    });
    mockCache.isAvailable.mockReturnValue(true);
    mockAtomicConsume.mockResolvedValue(1);
    mockRecoverMessageAddress.mockResolvedValue("0xDifferentAddress");
    mockGetAddress.mockImplementation((addr: string) => addr);

    const res = await POST(
      makeRequest({ message: "siwe-message", signature: "0xabc" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("INVALID_SIGNATURE");
  });

  // --- Existing user (sign-in) ---
  it("returns existing user with API key on sign-in", async () => {
    setupValidSignature();
    const existingUser = {
      id: "user-1",
      name: "Test",
      privy_user_id: null,
      wallet_verified: true,
      is_active: true,
      organization_id: "org-1",
      organization: { id: "org-1", name: "Org", is_active: true, credit_balance: "5.00" },
    };
    mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue(
      existingUser,
    );
    mockApiKeysService.listByOrganization.mockResolvedValue([
      { user_id: "user-1", is_active: true, key: "existing-key" },
    ]);

    const res = await POST(
      makeRequest({ message: "siwe-msg", signature: "0xsig" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isNewAccount).toBe(false);
    expect(body.apiKey).toBe("existing-key");
  });

  it("returns 403 for inactive existing user", async () => {
    setupValidSignature();
    mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue({
      id: "user-1",
      is_active: false,
      organization_id: "org-1",
      organization: { is_active: true },
    });

    const res = await POST(
      makeRequest({ message: "siwe-msg", signature: "0xsig" }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("ACCOUNT_INACTIVE");
  });

  // --- New user (sign-up) ---
  it("creates new user and returns isNewAccount=true", async () => {
    setupValidSignature();
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
      name: "0xAbCd...Ef01",
      wallet_address: VALID_ADDRESS.toLowerCase(),
      organization_id: "org-new",
    });
    mockApiKeysService.create.mockResolvedValue({
      plainKey: "new-api-key",
    });

    const res = await POST(
      makeRequest({ message: "siwe-msg", signature: "0xsig" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isNewAccount).toBe(true);
    expect(body.apiKey).toBe("new-api-key");
  });

  it("signup continues when credits fail (consistent with Privy)", async () => {
    setupValidSignature();
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
    mockCreditsService.addCredits.mockRejectedValue(
      new Error("credits service down"),
    );
    mockUsersService.create.mockResolvedValue({
      id: "user-new",
      name: "0xAbCd...Ef01",
      wallet_address: VALID_ADDRESS.toLowerCase(),
      organization_id: "org-new",
    });
    mockApiKeysService.create.mockResolvedValue({
      plainKey: "new-api-key",
    });

    const res = await POST(
      makeRequest({ message: "siwe-msg", signature: "0xsig" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isNewAccount).toBe(true);
  });

  it("returns 403 when abuse detection blocks signup", async () => {
    setupValidSignature();
    mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue(null);
    mockAbuseDetectionService.checkSignupAbuse.mockResolvedValue({
      allowed: false,
      reason: "Too many signups",
    });

    const res = await POST(
      makeRequest({ message: "siwe-msg", signature: "0xsig" }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("SIGNUP_BLOCKED");
  });
});
