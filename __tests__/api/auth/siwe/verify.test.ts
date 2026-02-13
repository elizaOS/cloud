
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before imports
vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: vi.fn(() => true),
  },
}));

vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: vi.fn(() => Promise.resolve(1)),
}));

vi.mock("@/lib/cache/keys", () => ({
  CacheKeys: {
    siwe: {
      nonce: (n: string) => `siwe:nonce:${n}`,
    },
  },
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
    listByOrganization: vi.fn(() => Promise.resolve([])),
    create: vi.fn(() => Promise.resolve({ plainKey: "test-key" })),
  },
}));

vi.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    getBySlug: vi.fn(() => Promise.resolve(null)),
    create: vi.fn(() => Promise.resolve({ id: "org-1", name: "Test Org", credit_balance: "0.00" })),
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
    checkSignupAbuse: vi.fn(() => Promise.resolve({ allowed: true })),
    recordSignupMetadata: vi.fn(),
  },
}));

vi.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: () => "https://example.com/avatar.png",
}));

vi.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: () => "abc123-def456",
  getInitialCredits: () => 5.0,
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

vi.mock("viem/siwe", () => ({
  parseSiweMessage: vi.fn(),
}));

vi.mock("viem", () => ({
  recoverMessageAddress: vi.fn(),
  getAddress: (addr: string) => addr,
}));

import { NextRequest } from "next/server";
import { cache } from "@/lib/cache/client";
import { atomicConsume } from "@/lib/cache/consume";
import { parseSiweMessage } from "viem/siwe";
import { recoverMessageAddress } from "viem";
import { usersService } from "@/lib/services/users";

function createRequest(body: unknown): NextRequest {
  return new NextRequest("https://app.example.com/api/auth/siwe/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(atomicConsume).mockResolvedValue(1);
  });

  it("returns 400 for missing message field", async () => {
    const { POST } = await import("@/app/api/auth/siwe/verify/route");
    const req = createRequest({ signature: "0xabc" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  it("returns 400 for missing signature field", async () => {
    const { POST } = await import("@/app/api/auth/siwe/verify/route");
    const req = createRequest({ message: "some message" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  it("returns 400 for empty body", async () => {
    const { POST } = await import("@/app/api/auth/siwe/verify/route");
    const req = createRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  it("returns 400 when SIWE message is missing required fields", async () => {
    vi.mocked(parseSiweMessage).mockReturnValue({} as ReturnType<typeof parseSiweMessage>);

    const { POST } = await import("@/app/api/auth/siwe/verify/route");
    const req = createRequest({ message: "valid msg", signature: "0xabc123" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_BODY");
  });

  it("returns 503 when cache is unavailable", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(false);
    vi.mocked(parseSiweMessage).mockReturnValue({
      address: "0x1234567890abcdef1234567890abcdef12345678",
      nonce: "testnonce123",
      domain: "app.example.com",
    } as ReturnType<typeof parseSiweMessage>);

    const { POST } = await import("@/app/api/auth/siwe/verify/route");
    const req = createRequest({ message: "valid msg", signature: "0xabc123" });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 400 for expired/used nonce (atomicConsume returns 0)", async () => {
    vi.mocked(atomicConsume).mockResolvedValue(0);
    vi.mocked(parseSiweMessage).mockReturnValue({
      address: "0x1234567890abcdef1234567890abcdef12345678",
      nonce: "testnonce123",
      domain: "app.example.com",
    } as ReturnType<typeof parseSiweMessage>);

    const { POST } = await import("@/app/api/auth/siwe/verify/route");
    const req = createRequest({ message: "valid msg", signature: "0xabc123" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_NONCE");
  });

  it("returns 400 for domain mismatch", async () => {
    vi.mocked(parseSiweMessage).mockReturnValue({
      address: "0x1234567890abcdef1234567890abcdef12345678",
      nonce: "testnonce123",
      domain: "evil.example.com",
    } as ReturnType<typeof parseSiweMessage>);

    const { POST } = await import("@/app/api/auth/siwe/verify/route");
    const req = createRequest({ message: "valid msg", signature: "0xabc123" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_DOMAIN");
  });

  it("returns 400 for invalid signature", async () => {
    vi.mocked(parseSiweMessage).mockReturnValue({
      address: "0x1234567890abcdef1234567890abcdef12345678",
      nonce: "testnonce123",
      domain: "app.example.com",
    } as ReturnType<typeof parseSiweMessage>);
    vi.mocked(recoverMessageAddress).mockRejectedValue(new Error("Invalid signature"));

    const { POST } = await import("@/app/api/auth/siwe/verify/route");
    const req = createRequest({ message: "valid msg", signature: "0xbadsig" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("INVALID_SIGNATURE");
  });

  it("returns success for existing user with valid signature", async () => {
    const mockAddress = "0x1234567890abcdef1234567890abcdef12345678";
    vi.mocked(parseSiweMessage).mockReturnValue({
      address: mockAddress,
      nonce: "testnonce123",
      domain: "app.example.com",
    } as ReturnType<typeof parseSiweMessage>);
    vi.mocked(recoverMessageAddress).mockResolvedValue(mockAddress);

    const mockUser = {
      id: "user-1",
      name: "Test User",
      is_active: true,
      wallet_verified: true,
      organization_id: "org-1",
      organization: { id: "org-1", name: "Test Org", is_active: true, credit_balance: "5.00" },
    };
    vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(mockUser as any);

    const { POST } = await import("@/app/api/auth/siwe/verify/route");
    const req = createRequest({ message: "valid msg", signature: "0xvalidsig" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.isNewAccount).toBe(false);
    expect(json.apiKey).toBeDefined();
  });

  it("returns 403 for inactive existing user", async () => {
    const mockAddress = "0x1234567890abcdef1234567890abcdef12345678";
    vi.mocked(parseSiweMessage).mockReturnValue({
      address: mockAddress,
      nonce: "testnonce123",
      domain: "app.example.com",
    } as ReturnType<typeof parseSiweMessage>);
    vi.mocked(recoverMessageAddress).mockResolvedValue(mockAddress);

    const mockUser = {
      id: "user-1",
      name: "Test User",
      is_active: false,
      wallet_verified: true,
      organization_id: "org-1",
      organization: { id: "org-1", name: "Test Org", is_active: true, credit_balance: "5.00" },
    };
    vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(mockUser as any);

    const { POST } = await import("@/app/api/auth/siwe/verify/route");
    const req = createRequest({ message: "valid msg", signature: "0xvalidsig" });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("ACCOUNT_INACTIVE");
  });
});
