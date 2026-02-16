
/**
 * Tests for SIWE verify endpoint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/cache/client", () => {
  const mockCache = {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    isAvailable: vi.fn().mockReturnValue(true),
    getRedisClient: vi.fn(),
  };
  return { cache: mockCache };
});

vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: vi.fn().mockResolvedValue(1),
}));

vi.mock("viem/siwe", () => ({
  parseSiweMessage: vi.fn().mockReturnValue({
    address: "0x1234567890abcdef1234567890abcdef12345678",
    nonce: "testnonce123",
    domain: "app.example.com",
    uri: "https://app.example.com",
    version: "1",
    chainId: 1,
  }),
}));

vi.mock("viem", () => ({
  recoverMessageAddress: vi.fn().mockResolvedValue("0x1234567890abcdef1234567890abcdef12345678"),
  getAddress: vi.fn((addr: string) => addr),
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: vi.fn().mockReturnValue("https://app.example.com"),
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

vi.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ plainKey: "test-api-key" }),
  },
}));

vi.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    create: vi.fn().mockResolvedValue({ id: "org-1", name: "Test Org" }),
    getBySlug: vi.fn().mockResolvedValue(null),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/services/credits", () => ({
  creditsService: {
    addCredits: vi.fn(),
  },
}));

vi.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: {
    checkSignupAbuse: vi.fn().mockResolvedValue({ allowed: true }),
    recordSignupMetadata: vi.fn(),
  },
}));

vi.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: vi.fn().mockReturnValue("avatar-url"),
}));

vi.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: vi.fn().mockReturnValue("wallet-abc123"),
  getInitialCredits: vi.fn().mockReturnValue(5.0),
}));

import { cache } from "@/lib/cache/client";
import { atomicConsume } from "@/lib/cache/consume";
import { usersService } from "@/lib/services/users";
import { POST } from "../../verify/route";

function makeVerifyRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/auth/siwe/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

describe("SIWE verify endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cache.isAvailable as any).mockReturnValue(true);
    (atomicConsume as any).mockResolvedValue(1);
  });

  it("rejects missing message field", async () => {
    const res = await POST(makeVerifyRequest({ signature: "0xabc" }));
    expect(res.status).toBe(400);
  });

  it("rejects missing signature field", async () => {
    const res = await POST(makeVerifyRequest({ message: "test" }));
    expect(res.status).toBe(400);
  });

  it("rejects empty body", async () => {
    const req = new Request("http://localhost:3000/api/auth/siwe/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    }) as any;
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 503 when cache is unavailable", async () => {
    (cache.isAvailable as any).mockReturnValue(false);

    const res = await POST(makeVerifyRequest({
      message: "valid siwe message",
      signature: "0xvalidsig",
    }));
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 400 for expired/used nonce", async () => {
    (atomicConsume as any).mockResolvedValue(0);

    const res = await POST(makeVerifyRequest({
      message: "valid siwe message",
      signature: "0xvalidsig",
    }));
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe("INVALID_NONCE");
  });

  it("returns 503 when atomicConsume throws", async () => {
    (atomicConsume as any).mockRejectedValue(new Error("Redis down"));

    const res = await POST(makeVerifyRequest({
      message: "valid siwe message",
      signature: "0xvalidsig",
    }));
    expect(res.status).toBe(503);
  });

  it("returns existing user for sign-in path", async () => {
    const existingUser = {
      id: "user-1",
      name: "0x1234...5678",
      organization_id: "org-1",
      is_active: true,
      wallet_verified: true,
      organization: { id: "org-1", name: "Test", is_active: true, credit_balance: "5.00" },
    };
    (usersService.getByWalletAddressWithOrganization as any).mockResolvedValue(existingUser);

    const res = await POST(makeVerifyRequest({
      message: "valid siwe message",
      signature: "0xvalidsig",
    }));

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.isNewAccount).toBe(false);
    expect(body.apiKey).toBeDefined();
  });

  it("returns 403 for inactive account", async () => {
    const inactiveUser = {
      id: "user-1",
      name: "Test",
      organization_id: "org-1",
      is_active: false,
      wallet_verified: true,
      organization: { id: "org-1", name: "Test", is_active: true },
    };
    (usersService.getByWalletAddressWithOrganization as any).mockResolvedValue(inactiveUser);

    const res = await POST(makeVerifyRequest({
      message: "valid siwe message",
      signature: "0xvalidsig",
    }));
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBe("ACCOUNT_INACTIVE");
  });

  it("creates new account for unknown wallet", async () => {
    (usersService.getByWalletAddressWithOrganization as any).mockResolvedValue(null);
    (usersService.create as any).mockResolvedValue({
      id: "new-user",
      name: "0x1234...5678",
      organization_id: "org-1",
      is_active: true,
      wallet_verified: true,
    });

    const res = await POST(makeVerifyRequest({
      message: "valid siwe message",
      signature: "0xvalidsig",
    }));

    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.isNewAccount).toBe(true);
    expect(body.apiKey).toBeDefined();
  });
});
