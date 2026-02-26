// Review: mocks dependencies up front to ensure isolated and reliable tests for auth functionalities

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies before imports
vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    getRedisClient: vi.fn(),
  },
}));

vi.mock("@/lib/cache/consume", () => ({
  atomicConsume: vi.fn(),
}));

vi.mock("@/lib/utils/app-url", () => ({
  getAppUrl: vi.fn(() => "https://app.example.com"),
}));

vi.mock("viem/siwe", () => ({
  parseSiweMessage: vi.fn(),
}));

vi.mock("viem", () => ({
  recoverMessageAddress: vi.fn(),
  getAddress: vi.fn((addr: string) => addr),
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
    listByOrganization: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@/lib/services/organizations", () => ({
  organizationsService: {
    getBySlug: vi.fn(),
    create: vi.fn(),
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
    checkSignupAbuse: vi.fn(),
    recordSignupMetadata: vi.fn(),
  },
}));

vi.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: vi.fn(() => "avatar.png"),
}));

vi.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: vi.fn(() => "wallet-abc123-ts1234"),
  getInitialCredits: vi.fn(() => 5.0),
}));

import { cache } from "@/lib/cache/client";
import { atomicConsume } from "@/lib/cache/consume";
import { parseSiweMessage } from "viem/siwe";
import { recoverMessageAddress, getAddress } from "viem";
import { usersService } from "@/lib/services/users";
import { apiKeysService } from "@/lib/services/api-keys";
import { POST } from "../verify/route";
import { NextRequest } from "next/server";

const VALID_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const VALID_MESSAGE = `app.example.com wants you to sign in with your Ethereum account:
${VALID_ADDRESS}

Sign in to ElizaCloud

URI: https://app.example.com
Version: 1
Chain ID: 1
Nonce: testnonce123
Issued At: 2024-01-01T00:00:00.000Z`;

const VALID_SIGNATURE = "0xabcdef1234567890";

function makeRequest(body: Record<string, unknown> = {}) {
  return new NextRequest(new URL("http://localhost:3000/api/auth/siwe/verify"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for missing message and signature", async () => {
    const res = await POST(makeRequest({}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_BODY");
  });

  it("returns 400 for empty message", async () => {
    const res = await POST(makeRequest({ message: "", signature: VALID_SIGNATURE }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_BODY");
  });

  it("returns 400 for malformed SIWE message", async () => {
    vi.mocked(parseSiweMessage).mockImplementation(() => {
      throw new Error("Invalid SIWE message");
    });

    const res = await POST(
      makeRequest({ message: "not a siwe message", signature: VALID_SIGNATURE }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_BODY");
    expect(body.message).toContain("EIP-4361");
  });

  it("returns 400 for SIWE message missing required fields", async () => {
    vi.mocked(parseSiweMessage).mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "test",
      // Missing domain, uri, version, chainId
    } as any);

    const res = await POST(
      makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_BODY");
    expect(body.message).toContain("missing required fields");
  });

  it("returns 503 when cache is unavailable", async () => {
    vi.mocked(parseSiweMessage).mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "testnonce123",
      domain: "app.example.com",
      uri: "https://app.example.com",
      version: "1",
      chainId: 1,
    } as any);
    vi.mocked(cache.isAvailable).mockReturnValue(false);

    const res = await POST(
      makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }),
    );
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });

  it("returns 400 for expired/used nonce", async () => {
    vi.mocked(parseSiweMessage).mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "testnonce123",
      domain: "app.example.com",
      uri: "https://app.example.com",
      version: "1",
      chainId: 1,
    } as any);
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(atomicConsume).mockResolvedValue(0);

    const res = await POST(
      makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_NONCE");
  });

  it("returns 400 for domain mismatch", async () => {
    vi.mocked(parseSiweMessage).mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "testnonce123",
      domain: "evil.example.com",
      uri: "https://evil.example.com",
      version: "1",
      chainId: 1,
    } as any);
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(atomicConsume).mockResolvedValue(1);

    const res = await POST(
      makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_DOMAIN");
  });

  it("returns 400 for invalid signature", async () => {
    vi.mocked(parseSiweMessage).mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "testnonce123",
      domain: "app.example.com",
      uri: "https://app.example.com",
      version: "1",
      chainId: 1,
    } as any);
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(atomicConsume).mockResolvedValue(1);
    vi.mocked(recoverMessageAddress).mockRejectedValue(new Error("bad sig"));

    const res = await POST(
      makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_SIGNATURE");
  });

  it("returns 400 for signature/address mismatch", async () => {
    vi.mocked(parseSiweMessage).mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "testnonce123",
      domain: "app.example.com",
      uri: "https://app.example.com",
      version: "1",
      chainId: 1,
    } as any);
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(atomicConsume).mockResolvedValue(1);
    vi.mocked(recoverMessageAddress).mockResolvedValue("0xDEADBEEF" as any);
    vi.mocked(getAddress).mockImplementation((addr: string) => addr as any);

    const res = await POST(
      makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("INVALID_SIGNATURE");
  });

  it("returns existing user with API key on sign-in", async () => {
    const existingUser = {
      id: "user-1",
      name: "0x1234...5678",
      wallet_address: VALID_ADDRESS.toLowerCase(),
      wallet_verified: true,
      is_active: true,
      organization_id: "org-1",
      organization: { id: "org-1", name: "Test Org", is_active: true, credit_balance: "10.00" },
    };

    vi.mocked(parseSiweMessage).mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "testnonce123",
      domain: "app.example.com",
      uri: "https://app.example.com",
      version: "1",
      chainId: 1,
    } as any);
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(atomicConsume).mockResolvedValue(1);
    vi.mocked(recoverMessageAddress).mockResolvedValue(VALID_ADDRESS as any);
    vi.mocked(getAddress).mockImplementation((addr: string) => addr as any);
    vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(existingUser as any);
    vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
      { id: "key-1", key: "existing-api-key", user_id: "user-1", is_active: true } as any,
    ]);

    const res = await POST(
      makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.isNewAccount).toBe(false);
    expect(body.apiKey).toBe("existing-api-key");
    expect(body.address).toBe(VALID_ADDRESS);
  });

  it("returns 403 for inactive existing user", async () => {
    const inactiveUser = {
      id: "user-1",
      is_active: false,
      organization_id: "org-1",
      organization: { id: "org-1", is_active: true },
    };

    vi.mocked(parseSiweMessage).mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "testnonce123",
      domain: "app.example.com",
      uri: "https://app.example.com",
      version: "1",
      chainId: 1,
    } as any);
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(atomicConsume).mockResolvedValue(1);
    vi.mocked(recoverMessageAddress).mockResolvedValue(VALID_ADDRESS as any);
    vi.mocked(getAddress).mockImplementation((addr: string) => addr as any);
    vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(inactiveUser as any);

    const res = await POST(
      makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }),
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("ACCOUNT_INACTIVE");
  });

  it("returns 503 when atomicConsume throws (Redis failure)", async () => {
    vi.mocked(parseSiweMessage).mockReturnValue({
      address: VALID_ADDRESS,
      nonce: "testnonce123",
      domain: "app.example.com",
      uri: "https://app.example.com",
      version: "1",
      chainId: 1,
    } as any);
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(atomicConsume).mockRejectedValue(new Error("Redis unavailable"));

    const res = await POST(
      makeRequest({ message: VALID_MESSAGE, signature: VALID_SIGNATURE }),
    );
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toBe("SERVICE_UNAVAILABLE");
  });
});
