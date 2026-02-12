
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing route handlers
vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: vi.fn(() => true),
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  },
}));

vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: vi.fn(),
}));

vi.mock("@/lib/services/users", () => ({
  usersService: {
    getByWalletAddressWithOrganization: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    getBySlug: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    listByOrganization: vi.fn(),
    create: vi.fn(),
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

vi.mock("@/lib/db", () => ({
  db: {
    transaction: vi.fn((fn) => fn({})),
  },
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

import { cache } from "@/lib/cache/client";
import { atomicConsume } from "@/lib/cache/consume";

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 when cache is unavailable", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(false);
    
    const { GET } = await import("../nonce/route");
    const request = new Request("http://localhost/api/auth/siwe/nonce");
    const response = await GET(request as any);
    
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns nonce with required SIWE parameters when cache available", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(cache.set).mockResolvedValue(undefined);
    
    const { GET } = await import("../nonce/route");
    const request = new Request("http://localhost/api/auth/siwe/nonce");
    const response = await GET(request as any);
    
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("nonce");
    expect(body).toHaveProperty("domain");
    expect(body).toHaveProperty("uri");
    expect(body).toHaveProperty("chainId");
    expect(body).toHaveProperty("version");
  });

  it("returns 503 when cache.set throws", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(cache.set).mockRejectedValue(new Error("Redis error"));
    
    const { GET } = await import("../nonce/route");
    const request = new Request("http://localhost/api/auth/siwe/nonce");
    const response = await GET(request as any);
    
    expect(response.status).toBe(503);
  });
});

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for missing message/signature", async () => {
    const { POST } = await import("../verify/route");
    const request = new Request("http://localhost/api/auth/siwe/verify", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request as any);
    
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("INVALID_BODY");
  });

  it("returns 503 when cache is unavailable during verify", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(false);
    
    const { POST } = await import("../verify/route");
    const request = new Request("http://localhost/api/auth/siwe/verify", {
      method: "POST",
      body: JSON.stringify({
        message: "localhost wants you to sign in with your Ethereum account:\n0x1234567890123456789012345678901234567890\n\nSign in to ElizaCloud\n\nURI: http://localhost\nVersion: 1\nChain ID: 1\nNonce: abc123\nIssued At: 2024-01-01T00:00:00.000Z",
        signature: "0x1234",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request as any);
    
    expect(response.status).toBe(503);
  });

  it("returns 400 for invalid/expired nonce", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(atomicConsume).mockResolvedValue(false);
    
    const { POST } = await import("../verify/route");
    const request = new Request("http://localhost/api/auth/siwe/verify", {
      method: "POST",
      body: JSON.stringify({
        message: "localhost wants you to sign in with your Ethereum account:\n0x1234567890123456789012345678901234567890\n\nSign in to ElizaCloud\n\nURI: http://localhost\nVersion: 1\nChain ID: 1\nNonce: abc123\nIssued At: 2024-01-01T00:00:00.000Z",
        signature: "0x1234",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request as any);
    
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("INVALID_NONCE");
  });

  it("atomicConsume is called with correct nonce key", async () => {
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(atomicConsume).mockResolvedValue(false);
    
    const { POST } = await import("../verify/route");
    const request = new Request("http://localhost/api/auth/siwe/verify", {
      method: "POST",
      body: JSON.stringify({
        message: "localhost wants you to sign in with your Ethereum account:\n0x1234567890123456789012345678901234567890\n\nSign in to ElizaCloud\n\nURI: http://localhost\nVersion: 1\nChain ID: 1\nNonce: testnonce123\nIssued At: 2024-01-01T00:00:00.000Z",
        signature: "0x1234",
      }),
      headers: { "Content-Type": "application/json" },
    });
    await POST(request as any);
    
    expect(atomicConsume).toHaveBeenCalledWith(expect.stringContaining("testnonce123"));
  });
});
