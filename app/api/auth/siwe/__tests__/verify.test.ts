
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
const mockCache = {
  isAvailable: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
};

const mockAtomicConsume = vi.fn();

vi.mock("@/lib/cache/client", () => ({
  cache: mockCache,
}));

vi.mock("@/lib/cache/keys", () => ({
  CacheKeys: { siwe: { nonce: (n: string) => `siwe:nonce:${n}` } },
}));

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
  update: vi.fn(),
  create: vi.fn(),
};

const mockApiKeysService = {
  listByOrganization: vi.fn(),
  create: vi.fn(),
};

const mockOrganizationsService = {
  getBySlug: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
};

const mockCreditsService = {
  addCredits: vi.fn(),
};

const mockAbuseDetectionService = {
  checkSignupAbuse: vi.fn(),
  recordSignupMetadata: vi.fn(),
};

vi.mock("@/lib/services/users", () => ({
  usersService: mockUsersService,
}));

vi.mock("@/lib/services/api-keys", () => ({
  apiKeysService: mockApiKeysService,
}));

vi.mock("@/lib/services/organizations", () => ({
  organizationsService: mockOrganizationsService,
}));

vi.mock("@/lib/services/credits", () => ({
  creditsService: mockCreditsService,
}));

vi.mock("@/lib/services/abuse-detection", () => ({
  abuseDetectionService: mockAbuseDetectionService,
}));

vi.mock("@/lib/utils/default-user-avatar", () => ({
  getRandomUserAvatar: () => "avatar.png",
}));

vi.mock("@/lib/utils/signup-helpers", () => ({
  generateSlugFromWallet: () => "wallet-slug-abc",
  getInitialCredits: () => 10,
}));

// Mock viem functions
const VALID_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const VALID_CHECKSUM_ADDRESS = "0x1234567890AbcdEF1234567890aBcdef12345678";

vi.mock("viem/siwe", () => ({
  parseSiweMessage: vi.fn((msg: string) => {
    if (msg === "invalid") return {};
    return {
      address: VALID_ADDRESS,
      nonce: "test-nonce",
      domain: "app.example.com",
    };
  }),
}));

vi.mock("viem", () => ({
  recoverMessageAddress: vi.fn(async () => VALID_ADDRESS),
  getAddress: vi.fn((addr: string) => VALID_CHECKSUM_ADDRESS),
}));

import { NextRequest } from "next/server";

async function getHandler() {
  const mod = await import("../../verify/route");
  return mod.POST;
}

function makeRequest(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest("http://localhost/api/auth/siwe/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  message: "app.example.com wants you to sign in...",
  signature: "0xabc123",
};

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCache.isAvailable.mockReturnValue(true);
    mockAtomicConsume.mockResolvedValue(1);
  });

  describe("request validation", () => {
    it("rejects requests with invalid JSON", async () => {
      const handler = await getHandler();
      const req = new NextRequest("http://localhost/api/auth/siwe/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      const response = await handler(req);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("INVALID_BODY");
    });

    it("rejects requests without message", async () => {
      const handler = await getHandler();
      const response = await handler(makeRequest({ signature: "0xabc" }));

      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("INVALID_BODY");
    });

    it("rejects requests without signature", async () => {
      const handler = await getHandler();
      const response = await handler(makeRequest({ message: "hello" }));

      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("INVALID_BODY");
    });

    it("rejects empty message string", async () => {
      const handler = await getHandler();
      const response = await handler(
        makeRequest({ message: "  ", signature: "0xabc" }),
      );

      expect(response.status).toBe(400);
    });

    it("rejects empty signature string", async () => {
      const handler = await getHandler();
      const response = await handler(
        makeRequest({ message: "hello", signature: "  " }),
      );

      expect(response.status).toBe(400);
    });
  });

  describe("nonce validation", () => {
    it("returns 503 when cache is unavailable", async () => {
      mockCache.isAvailable.mockReturnValue(false);

      const handler = await getHandler();
      const response = await handler(makeRequest(VALID_BODY));
      const json = await response.json();

      expect(response.status).toBe(503);
      expect(json.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("rejects expired/used nonce (atomicConsume returns 0)", async () => {
      mockAtomicConsume.mockResolvedValue(0);

      const handler = await getHandler();
      const response = await handler(makeRequest(VALID_BODY));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("INVALID_NONCE");
    });

    it("consumes nonce atomically via single DEL", async () => {
      mockAtomicConsume.mockResolvedValue(1);
      // Set up existing user to avoid signup path
      mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-1",
        is_active: true,
        organization_id: "org-1",
        organization: { is_active: true },
        wallet_verified: true,
      });
      mockApiKeysService.listByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "key-123" },
      ]);

      const handler = await getHandler();
      await handler(makeRequest(VALID_BODY));

      expect(mockAtomicConsume).toHaveBeenCalledWith("siwe:nonce:test-nonce");
      expect(mockAtomicConsume).toHaveBeenCalledTimes(1);
    });
  });

  describe("domain validation", () => {
    it("rejects SIWE message with wrong domain", async () => {
      const { parseSiweMessage } = await import("viem/siwe");
      vi.mocked(parseSiweMessage).mockReturnValueOnce({
        address: VALID_ADDRESS,
        nonce: "test-nonce",
        domain: "evil.com",
      } as ReturnType<typeof parseSiweMessage>);

      const handler = await getHandler();
      const response = await handler(makeRequest(VALID_BODY));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("INVALID_DOMAIN");
    });
  });

  describe("signature validation", () => {
    it("rejects invalid signature", async () => {
      const { recoverMessageAddress } = await import("viem");
      vi.mocked(recoverMessageAddress).mockRejectedValueOnce(
        new Error("bad sig"),
      );

      const handler = await getHandler();
      const response = await handler(makeRequest(VALID_BODY));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("INVALID_SIGNATURE");
    });

    it("rejects mismatched recovered address", async () => {
      const viem = await import("viem");
      vi.mocked(viem.recoverMessageAddress).mockResolvedValueOnce(
        "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      );
      // Make getAddress return different values for the two addresses
      vi.mocked(viem.getAddress)
        .mockReturnValueOnce("0xDEAD" as `0x${string}`)
        .mockReturnValueOnce("0xBEEF" as `0x${string}`);

      const handler = await getHandler();
      const response = await handler(makeRequest(VALID_BODY));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("INVALID_SIGNATURE");
    });
  });

  describe("existing user sign-in", () => {
    it("returns existing user with API key", async () => {
      const existingUser = {
        id: "user-1",
        name: "Test",
        is_active: true,
        organization_id: "org-1",
        organization: { is_active: true, name: "Org", credit_balance: "100" },
        wallet_verified: true,
        privy_user_id: null,
      };
      mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue(
        existingUser,
      );
      mockApiKeysService.listByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "existing-key" },
      ]);

      const handler = await getHandler();
      const response = await handler(makeRequest(VALID_BODY));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.isNewAccount).toBe(false);
      expect(json.apiKey).toBe("existing-key");
    });

    it("rejects inactive account", async () => {
      mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-1",
        is_active: false,
        organization_id: "org-1",
        organization: { is_active: true },
      });

      const handler = await getHandler();
      const response = await handler(makeRequest(VALID_BODY));
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error).toBe("ACCOUNT_INACTIVE");
    });

    it("rejects inactive organization", async () => {
      mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-1",
        is_active: true,
        organization_id: "org-1",
        organization: { is_active: false },
      });

      const handler = await getHandler();
      const response = await handler(makeRequest(VALID_BODY));

      expect(response.status).toBe(403);
    });

    it("marks wallet as verified on sign-in if not already", async () => {
      mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-1",
        is_active: true,
        organization_id: "org-1",
        organization: { is_active: true },
        wallet_verified: false,
      });
      mockApiKeysService.listByOrganization.mockResolvedValue([
        { user_id: "user-1", is_active: true, key: "key" },
      ]);

      const handler = await getHandler();
      await handler(makeRequest(VALID_BODY));

      expect(mockUsersService.update).toHaveBeenCalledWith("user-1", {
        wallet_verified: true,
      });
    });
  });

  describe("new user sign-up", () => {
    beforeEach(() => {
      mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue(
        null,
      );
      mockAbuseDetectionService.checkSignupAbuse.mockResolvedValue({
        allowed: true,
      });
      mockOrganizationsService.getBySlug.mockResolvedValue(null);
      mockOrganizationsService.create.mockResolvedValue({
        id: "org-new",
        name: "New Org",
        credit_balance: "0.00",
      });
      mockCreditsService.addCredits.mockResolvedValue(undefined);
      mockAbuseDetectionService.recordSignupMetadata.mockResolvedValue(
        undefined,
      );
      mockUsersService.create.mockResolvedValue({
        id: "user-new",
        name: "0x1234...5678",
        organization_id: "org-new",
        wallet_verified: true,
      });
      mockApiKeysService.create.mockResolvedValue({
        plainKey: "new-api-key",
      });
    });

    it("creates org, credits, user, and API key for new wallet", async () => {
      const handler = await getHandler();
      const response = await handler(makeRequest(VALID_BODY));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.isNewAccount).toBe(true);
      expect(json.apiKey).toBe("new-api-key");
      expect(mockOrganizationsService.create).toHaveBeenCalled();
      expect(mockCreditsService.addCredits).toHaveBeenCalled();
      expect(mockUsersService.create).toHaveBeenCalled();
      expect(mockApiKeysService.create).toHaveBeenCalled();
    });

    it("blocks signup when abuse detected", async () => {
      mockAbuseDetectionService.checkSignupAbuse.mockResolvedValue({
        allowed: false,
        reason: "Too many signups",
      });

      const handler = await getHandler();
      const response = await handler(makeRequest(VALID_BODY));
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.error).toBe("SIGNUP_BLOCKED");
    });

    it("cleans up org on user creation failure", async () => {
      mockUsersService.create.mockRejectedValue(new Error("DB error"));

      const handler = await getHandler();
      await expect(handler(makeRequest(VALID_BODY))).rejects.toThrow();

      expect(mockOrganizationsService.delete).toHaveBeenCalledWith("org-new");
    });

    it("continues signup if credits fail (logs error)", async () => {
      mockCreditsService.addCredits.mockRejectedValue(
        new Error("Credits failed"),
      );
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const handler = await getHandler();
      const response = await handler(makeRequest(VALID_BODY));

      expect(response.status).toBe(200);
      expect(mockUsersService.create).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("handles 23505 duplicate-key race condition", async () => {
      const duplicateError = new Error("duplicate key") as Error & {
        code: string;
      };
      duplicateError.code = "23505";
      mockUsersService.create.mockRejectedValue(duplicateError);

      const raceWinner = {
        id: "user-winner",
        is_active: true,
        organization_id: "org-winner",
        organization: { is_active: true },
        wallet_verified: true,
      };
      // First call returns null (new user path), subsequent calls return race winner
      mockUsersService.getByWalletAddressWithOrganization
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(raceWinner);
      mockApiKeysService.listByOrganization.mockResolvedValue([
        { user_id: "user-winner", is_active: true, key: "winner-key" },
      ]);

      const handler = await getHandler();
      const response = await handler(makeRequest(VALID_BODY));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.isNewAccount).toBe(false);
      // Org should have been cleaned up
      expect(mockOrganizationsService.delete).toHaveBeenCalledWith("org-new");
    });
  });
});
