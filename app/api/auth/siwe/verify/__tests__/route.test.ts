
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies
vi.mock("viem/siwe", () => ({
  parseSiweMessage: vi.fn(),
}));

vi.mock("viem", () => ({
  recoverMessageAddress: vi.fn(),
  getAddress: vi.fn((addr: string) => addr),
}));

vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: vi.fn(() => true),
  },
}));

vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: vi.fn(() => true),
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

vi.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: vi.fn(() => []),
    create: vi.fn(() => ({ plainKey: "test-api-key-123" })),
  },
}));

vi.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    create: vi.fn(() => ({ id: "org-1", name: "Test Org" })),
    getBySlug: vi.fn(() => null),
  },
}));

vi.mock("@/lib/services/credits", () => ({
  creditsService: {
    addCredits: vi.fn(),
  },
}));

vi.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: {
    checkSignupAbuse: vi.fn(() => ({ allowed: true })),
    recordSignupMetadata: vi.fn(),
  },
}));

vi.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: vi.fn(() => "avatar.png"),
}));

vi.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: vi.fn(() => "wallet-slug"),
  getInitialCredits: vi.fn(() => 100),
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: vi.fn(() => "https://example.com"),
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: vi.fn(async (fn: Function) => fn({})),
  },
}));

import { cache } from "@/lib/cache/client";
import { atomicConsume } from "@/lib/cache/consume";
import { parseSiweMessage } from "viem/siwe";
import { recoverMessageAddress, getAddress } from "viem";
import { usersService } from "@/lib/services/users";
import { apiKeysService } from "@/lib/services/api-keys";
import { abuseDetectionService } from "@/lib/services/abuse-detection";

const VALID_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

function createRequest(body: Record<string, unknown> = {}) {
  return {
    json: () => Promise.resolve(body),
    headers: new Headers({
      "x-real-ip": "1.2.3.4",
      "user-agent": "test-agent",
    }),
  } as any;
}

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cache.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (atomicConsume as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (parseSiweMessage as ReturnType<typeof vi.fn>).mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "test-nonce",
      domain: "example.com",
    });
    (recoverMessageAddress as ReturnType<typeof vi.fn>).mockResolvedValue(VALID_ADDRESS);
    (getAddress as ReturnType<typeof vi.fn>).mockImplementation((addr: string) => addr);
  });

  // --- Body validation ---
  it("returns 400 for non-JSON body", async () => {
    const req = { json: () => Promise.reject(new Error("bad json")), headers: new Headers() } as any;
    const { POST } = await import("../../verify/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  it("returns 400 when message is missing", async () => {
    const { POST } = await import("../../verify/route");
    const res = await POST(createRequest({ signature: "0xabc" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when signature is missing", async () => {
    const { POST } = await import("../../verify/route");
    const res = await POST(createRequest({ message: "hello" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when message is empty string", async () => {
    const { POST } = await import("../../verify/route");
    const res = await POST(createRequest({ message: "  ", signature: "0xabc" }));
    expect(res.status).toBe(400);
  });

  // --- SIWE message parsing ---
  it("returns 400 when SIWE message is missing required fields", async () => {
    (parseSiweMessage as ReturnType<typeof vi.fn>).mockReturnValue({});
    const { POST } = await import("../../verify/route");
    const res = await POST(createRequest({ message: "bad msg", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  // --- Cache availability ---
  it("returns 503 when cache is unavailable", async () => {
    (cache.isAvailable as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const { POST } = await import("../../verify/route");
    const res = await POST(createRequest({ message: "test", signature: "0xabc" }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  // --- Nonce validation ---
  it("returns 400 when nonce is expired or already used", async () => {
    (atomicConsume as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const { POST } = await import("../../verify/route");
    const res = await POST(createRequest({ message: "test", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_NONCE");
  });

  it("consumes nonce atomically to prevent replay", async () => {
    (usersService.getByWalletAddressWithOrganization as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1",
      is_active: true,
      organization_id: "org-1",
      organization: { is_active: true },
    });
    (apiKeysService.listByOrganization as ReturnType<typeof vi.fn>).mockResolvedValue([
      { user_id: "u1", is_active: true, key: "existing-key" },
    ]);
    const { POST } = await import("../../verify/route");
    await POST(createRequest({ message: "test", signature: "0xabc" }));
    expect(atomicConsume).toHaveBeenCalledTimes(1);
  });

  // --- Domain validation ---
  it("returns 400 when domain does not match", async () => {
    (parseSiweMessage as ReturnType<typeof vi.fn>).mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "test-nonce",
      domain: "evil.com",
    });
    const { POST } = await import("../../verify/route");
    const res = await POST(createRequest({ message: "test", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_DOMAIN");
  });

  // --- Signature validation ---
  it("returns 400 when signature recovery fails", async () => {
    (recoverMessageAddress as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("bad sig"));
    const { POST } = await import("../../verify/route");
    const res = await POST(createRequest({ message: "test", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_SIGNATURE");
  });

  it("returns 400 when recovered address does not match claimed address", async () => {
    (recoverMessageAddress as ReturnType<typeof vi.fn>).mockResolvedValue("0xDEAD");
    (getAddress as ReturnType<typeof vi.fn>).mockImplementation((a: string) => a);
    const { POST } = await import("../../verify/route");
    const res = await POST(createRequest({ message: "test", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_SIGNATURE");
  });

  // --- Existing user path ---
  it("returns existing user with API key (sign-in)", async () => {
    (usersService.getByWalletAddressWithOrganization as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1",
      name: "Test",
      is_active: true,
      organization_id: "org-1",
      organization: { is_active: true, name: "Org", credit_balance: "100" },
    });
    (apiKeysService.listByOrganization as ReturnType<typeof vi.fn>).mockResolvedValue([
      { user_id: "u1", is_active: true, key: "existing-key" },
    ]);
    const { POST } = await import("../../verify/route");
    const res = await POST(createRequest({ message: "test", signature: "0xabc" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isNewAccount).toBe(false);
    expect(json.apiKey).toBe("existing-key");
  });

  it("returns 403 for inactive user", async () => {
    (usersService.getByWalletAddressWithOrganization as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1",
      is_active: false,
      organization_id: "org-1",
      organization: { is_active: true },
    });
    const { POST } = await import("../../verify/route");
    const res = await POST(createRequest({ message: "test", signature: "0xabc" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("ACCOUNT_INACTIVE");
  });

  it("returns 403 for inactive organization", async () => {
    (usersService.getByWalletAddressWithOrganization as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1",
      is_active: true,
      organization_id: "org-1",
      organization: { is_active: false },
    });
    const { POST } = await import("../../verify/route");
    const res = await POST(createRequest({ message: "test", signature: "0xabc" }));
    expect(res.status).toBe(403);
  });

  // --- New user path ---
  it("creates new account and returns API key (sign-up)", async () => {
    (usersService.getByWalletAddressWithOrganization as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null) // first call: no existing user
      .mockResolvedValueOnce({
        id: "u-new",
        name: "0x1234...5678",
        is_active: true,
        organization_id: "org-1",
        organization: { is_active: true, name: "Org", credit_balance: "100" },
      });
    (usersService.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "u-new" });
    const { POST } = await import("../../verify/route");
    const res = await POST(createRequest({ message: "test", signature: "0xabc" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isNewAccount).toBe(true);
    expect(json.apiKey).toBe("test-api-key-123");
  });

  it("returns 403 when abuse detection blocks signup", async () => {
    (usersService.getByWalletAddressWithOrganization as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (abuseDetectionService.checkSignupAbuse as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
      reason: "Too many signups",
    });
    const { POST } = await import("../../verify/route");
    const res = await POST(createRequest({ message: "test", signature: "0xabc" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("SIGNUP_BLOCKED");
  });

  // --- Message expiration ---
  it("returns 400 when SIWE message has expired", async () => {
    (parseSiweMessage as ReturnType<typeof vi.fn>).mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "test-nonce",
      domain: "example.com",
      expirationTime: new Date(Date.now() - 60000), // 1 minute ago
    });
    const { POST } = await import("../../verify/route");
    const res = await POST(createRequest({ message: "test", signature: "0xabc" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("MESSAGE_EXPIRED");
  });

  // --- Signature prefix normalization ---
  it("adds 0x prefix to signature if missing", async () => {
    (usersService.getByWalletAddressWithOrganization as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "u1",
      is_active: true,
      organization_id: "org-1",
      organization: { is_active: true },
    });
    (apiKeysService.listByOrganization as ReturnType<typeof vi.fn>).mockResolvedValue([
      { user_id: "u1", is_active: true, key: "k" },
    ]);
    const { POST } = await import("../../verify/route");
    await POST(createRequest({ message: "test", signature: "abc123" }));
    expect(recoverMessageAddress).toHaveBeenCalledWith(
      expect.objectContaining({ signature: "0xabc123" }),
    );
  });

  // --- Transaction atomicity (duplicate wallet race) ---
  it("handles duplicate wallet race condition (23505)", async () => {
    const { db } = await import("@/lib/db");
    (usersService.getByWalletAddressWithOrganization as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null) // initial lookup
      .mockResolvedValueOnce({ // retry after duplicate
        id: "u-race",
        is_active: true,
        organization_id: "org-1",
        organization: { is_active: true, name: "Org", credit_balance: "0" },
      });
    (db.transaction as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error("duplicate"), { code: "23505" }),
    );
    (apiKeysService.listByOrganization as ReturnType<typeof vi.fn>).mockResolvedValue([
      { user_id: "u-race", is_active: true, key: "race-key" },
    ]);
    const { POST } = await import("../../verify/route");
    const res = await POST(createRequest({ message: "test", signature: "0xabc" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.apiKey).toBe("race-key");
    expect(json.isNewAccount).toBe(false);
  });
});
