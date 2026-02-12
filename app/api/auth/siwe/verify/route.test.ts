
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { cache } from "@/lib/cache/client";
import { atomicConsume } from "@/lib/cache/consume";
import { usersService } from "@/lib/services/users";
import { apiKeysService } from "@/lib/services/api-keys";
import { organizationsService } from "@/lib/services/organizations";
import { creditsService } from "@/lib/services/credits";
import { abuseDetectionService } from "@/lib/services/abuse-detection";
import { recoverMessageAddress } from "viem";
import { db } from "@/lib/db";

vi.mock("@/lib/cache/client");
vi.mock("@/lib/cache/consume");
vi.mock("@/lib/services/users");
vi.mock("@/lib/services/api-keys");
vi.mock("@/lib/services/organizations");
vi.mock("@/lib/services/credits");
vi.mock("@/lib/services/abuse-detection");
vi.mock("viem", async () => {
  const actual = await vi.importActual("viem");
  return {
    ...actual,
    recoverMessageAddress: vi.fn(),
  };
});
vi.mock("@/lib/db", () => ({
  db: {
    transaction: vi.fn(),
  },
}));
vi.mock("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: any) => handler,
  RateLimitPresets: { STRICT: {} },
}));

const VALID_ADDRESS = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1";
const MOCK_SIWE_MESSAGE = `localhost:3000 wants you to sign in with your Ethereum account:
${VALID_ADDRESS}

Sign in to ElizaCloud

URI: http://localhost:3000
Version: 1
Chain ID: 1
Nonce: testNonce123
Issued At: 2024-01-01T00:00:00.000Z`;

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Request Validation", () => {
    it("rejects requests with missing body", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: "",
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_BODY");
    });

    it("rejects requests with missing message field", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ signature: "0x123" }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_BODY");
    });

    it("rejects requests with missing signature field", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: MOCK_SIWE_MESSAGE }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_BODY");
    });
  });

  describe("Cache Availability", () => {
    it("returns 503 when cache is unavailable", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);

      const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: MOCK_SIWE_MESSAGE,
          signature: "0x123",
        }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });
  });

  describe("Nonce Validation", () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
    });

    it("rejects invalid nonce", async () => {
      vi.mocked(atomicConsume).mockResolvedValue(false);

      const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: MOCK_SIWE_MESSAGE,
          signature: "0x123",
        }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_NONCE");
    });

    it("ensures nonce is consumed only once", async () => {
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(recoverMessageAddress).mockResolvedValue(VALID_ADDRESS);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-123",
        organization_id: "org-123",
        is_active: true,
        wallet_verified: true,
        organization: { id: "org-123", is_active: true },
      } as any);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { user_id: "user-123", is_active: true, key: "test-key" },
      ] as any);

      const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: MOCK_SIWE_MESSAGE,
          signature: "0xvalidsig",
        }),
      });

      await POST(req);

      expect(atomicConsume).toHaveBeenCalledWith(expect.stringContaining("testNonce123"));
      expect(atomicConsume).toHaveBeenCalledTimes(1);
    });
  });

  describe("Domain Validation", () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
    });

    it("rejects messages with wrong domain", async () => {
      const wrongDomainMessage = MOCK_SIWE_MESSAGE.replace("localhost:3000", "evil.com");

      const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: wrongDomainMessage,
          signature: "0x123",
        }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_DOMAIN");
    });
  });

  describe("Signature Verification", () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
    });

    it("rejects invalid signature", async () => {
      vi.mocked(recoverMessageAddress).mockRejectedValue(new Error("Invalid signature"));

      const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: MOCK_SIWE_MESSAGE,
          signature: "0xinvalid",
        }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_SIGNATURE");
    });

    it("rejects signature that doesn't match claimed address", async () => {
      vi.mocked(recoverMessageAddress).mockResolvedValue("0xDifferentAddress");

      const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: MOCK_SIWE_MESSAGE,
          signature: "0xvalidsig",
        }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_SIGNATURE");
    });
  });

  describe("Existing User Flow", () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(recoverMessageAddress).mockResolvedValue(VALID_ADDRESS);
    });

    it("returns existing user with API key", async () => {
      const mockUser = {
        id: "user-123",
        organization_id: "org-123",
        is_active: true,
        wallet_verified: true,
        name: "Test User",
        privy_user_id: null,
        organization: {
          id: "org-123",
          is_active: true,
          name: "Test Org",
          credit_balance: "100.00",
        },
      };

      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(mockUser as any);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { user_id: "user-123", is_active: true, key: "existing-key" },
      ] as any);

      const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: MOCK_SIWE_MESSAGE,
          signature: "0xvalidsig",
        }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isNewAccount).toBe(false);
      expect(data.apiKey).toBe("existing-key");
      expect(data.address).toBe(VALID_ADDRESS);
    });

    it("marks wallet as verified for Privy users", async () => {
      const mockUser = {
        id: "user-123",
        organization_id: "org-123",
        is_active: true,
        wallet_verified: false,
        privy_user_id: "privy-123",
        organization: { id: "org-123", is_active: true },
      };

      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(mockUser as any);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { user_id: "user-123", is_active: true, key: "test-key" },
      ] as any);

      const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: MOCK_SIWE_MESSAGE,
          signature: "0xvalidsig",
        }),
      });

      await POST(req);

      expect(usersService.update).toHaveBeenCalledWith("user-123", { wallet_verified: true });
    });

    it("rejects inactive users", async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-123",
        organization_id: "org-123",
        is_active: false,
        organization: { id: "org-123", is_active: true },
      } as any);

      const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: MOCK_SIWE_MESSAGE,
          signature: "0xvalidsig",
        }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("ACCOUNT_INACTIVE");
    });
  });

  describe("New User Signup Flow", () => {
    beforeEach(() => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
      vi.mocked(recoverMessageAddress).mockResolvedValue(VALID_ADDRESS);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(undefined);
      vi.mocked(abuseDetectionService.checkSignupAbuse).mockResolvedValue({ allowed: true });
      vi.mocked(organizationsService.getBySlug).mockResolvedValue(null);
    });

    it("creates organization, user, and API key atomically", async () => {
      const mockOrg = { id: "org-123", name: "Test Org", slug: "test-org" };
      const mockUser = {
        id: "user-123",
        organization_id: "org-123",
        wallet_address: VALID_ADDRESS.toLowerCase(),
        organization: mockOrg,
      };

      vi.mocked(db.transaction).mockImplementation(async (callback) => {
        const tx = {} as any;
        vi.mocked(organizationsService.create).mockResolvedValue(mockOrg as any);
        vi.mocked(usersService.create).mockResolvedValue(mockUser as any);
        vi.mocked(apiKeysService.create).mockResolvedValue({ plainKey: "new-key" } as any);
        return callback(tx);
      });

      vi.mocked(usersService.getByWalletAddressWithOrganization)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockUser as any);

      const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: MOCK_SIWE_MESSAGE,
          signature: "0xvalidsig",
        }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isNewAccount).toBe(true);
      expect(db.transaction).toHaveBeenCalled();
    });

    it("blocks signup when abuse detection fails", async () => {
      vi.mocked(abuseDetectionService.checkSignupAbuse).mockResolvedValue({
        allowed: false,
        reason: "Too many signups from this IP",
      });

      const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: MOCK_SIWE_MESSAGE,
          signature: "0xvalidsig",
        }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("SIGNUP_BLOCKED");
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("handles race condition on duplicate wallet signup", async () => {
      const duplicateError = new Error("Duplicate key") as any;
      duplicateError.code = "23505";

      const mockUser = {
        id: "user-123",
        organization_id: "org-123",
        wallet_address: VALID_ADDRESS.toLowerCase(),
        organization: { id: "org-123", is_active: true },
      };

      vi.mocked(db.transaction).mockRejectedValue(duplicateError);
      vi.mocked(usersService.getByWalletAddressWithOrganization)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(mockUser as any);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { user_id: "user-123", is_active: true, key: "race-key" },
      ] as any);

      const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: MOCK_SIWE_MESSAGE,
          signature: "0xvalidsig",
        }),
      });

      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isNewAccount).toBe(false);
      expect(data.apiKey).toBe("race-key");
    });

    it("rolls back transaction on credit service failure", async () => {
      const creditError = new Error("Credit service unavailable");

      vi.mocked(db.transaction).mockImplementation(async (callback) => {
        const tx = {} as any;
        vi.mocked(organizationsService.create).mockResolvedValue({ id: "org-123" } as any);
        vi.mocked(creditsService.addCredits).mockRejectedValue(creditError);
        return callback(tx);
      });

      const req = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: MOCK_SIWE_MESSAGE,
          signature: "0xvalidsig",
        }),
      });

      await expect(POST(req)).rejects.toThrow();
    });
  });
});
