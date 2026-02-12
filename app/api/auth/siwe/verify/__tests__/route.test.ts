
import { POST } from "../route";
import { NextRequest } from "next/server";
import { cache } from "@/lib/cache/client";
import { usersService } from "@/lib/services/users";
import { organizationsService } from "@/lib/services/organizations";
import { creditsService } from "@/lib/services/credits";
import { apiKeysService } from "@/lib/services/api-keys";
import { abuseDetectionService } from "@/lib/services/abuse-detection";
import { db } from "@/lib/db";
import { recoverMessageAddress } from "viem";

// Mock all dependencies
jest.mock("@/lib/cache/client");
jest.mock("@/lib/cache/consume");
jest.mock("@/lib/services/users");
jest.mock("@/lib/services/organizations");
jest.mock("@/lib/services/credits");
jest.mock("@/lib/services/api-keys");
jest.mock("@/lib/services/abuse-detection");
jest.mock("@/lib/db");
jest.mock("viem", () => ({
  ...jest.requireActual("viem"),
  recoverMessageAddress: jest.fn(),
}));

const VALID_WALLET = "0x1234567890123456789012345678901234567890";
const VALID_NONCE = "test-nonce-uuid";
const VALID_MESSAGE = `localhost:3000 wants you to sign in with your Ethereum account:\n${VALID_WALLET}\n\nSign in with Ethereum\n\nURI: http://localhost:3000\nVersion: 1\nChain ID: 1\nNonce: ${VALID_NONCE}\nIssued At: 2024-01-01T00:00:00.000Z`;
const VALID_SIGNATURE = "0xabcdef1234567890";

describe("/api/auth/siwe/verify", () => {
  let mockCacheIsAvailable: jest.Mock;
  let mockAtomicConsume: jest.Mock;
  let mockRecoverMessageAddress: jest.MockedFunction<typeof recoverMessageAddress>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheIsAvailable = cache.isAvailable as jest.Mock;
    mockCacheIsAvailable.mockReturnValue(true);

    const atomicConsume = require("@/lib/cache/consume").atomicConsume;
    mockAtomicConsume = atomicConsume as jest.Mock;
    mockAtomicConsume.mockResolvedValue(1);

    mockRecoverMessageAddress = recoverMessageAddress as jest.MockedFunction<typeof recoverMessageAddress>;
    mockRecoverMessageAddress.mockResolvedValue(VALID_WALLET);

    (usersService.getByWalletAddressWithOrganization as jest.Mock).mockResolvedValue(null);
    (abuseDetectionService.checkSignupAbuse as jest.Mock).mockResolvedValue({ allowed: true });
    (db.transaction as jest.Mock).mockImplementation(async (callback) => callback({}));
  });

  describe("Nonce validation and single-use enforcement", () => {
    it("should reject request when cache is unavailable", async () => {
      mockCacheIsAvailable.mockReturnValue(false);

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: VALID_MESSAGE,
          signature: VALID_SIGNATURE,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("should reject when nonce does not exist (returns 0 from atomicConsume)", async () => {
      mockAtomicConsume.mockResolvedValue(0);

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: VALID_MESSAGE,
          signature: VALID_SIGNATURE,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_NONCE");
      expect(data.message).toContain("expired or was already used");
    });

    it("should consume nonce atomically to prevent race conditions", async () => {
      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: VALID_MESSAGE,
          signature: VALID_SIGNATURE,
        }),
      });

      await POST(request);

      expect(mockAtomicConsume).toHaveBeenCalledWith(
        expect.stringContaining(`siwe:nonce:${VALID_NONCE}`)
      );
      expect(mockAtomicConsume).toHaveBeenCalledTimes(1);
    });
  });

  describe("Signature verification success path", () => {
    it("should accept valid signature and return API key for existing user", async () => {
      const existingUser = {
        id: "user-123",
        wallet_address: VALID_WALLET.toLowerCase(),
        is_active: true,
        organization_id: "org-123",
        wallet_verified: true,
        organization: {
          id: "org-123",
          name: "Test Org",
          is_active: true,
          credit_balance: "100.00",
        },
      };

      (usersService.getByWalletAddressWithOrganization as jest.Mock).mockResolvedValue(existingUser);
      (apiKeysService.listByOrganization as jest.Mock).mockResolvedValue([
        { user_id: "user-123", is_active: true, key: "test-api-key" },
      ]);

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: VALID_MESSAGE,
          signature: VALID_SIGNATURE,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.apiKey).toBe("test-api-key");
      expect(data.isNewAccount).toBe(false);
      expect(data.address).toBe(VALID_WALLET);
    });

    it("should create new account with transaction when wallet is new", async () => {
      const mockOrg = { id: "org-new", name: "New Org", credit_balance: "0.00" };
      const mockUser = { id: "user-new", wallet_address: VALID_WALLET.toLowerCase() };
      const mockApiKey = { plainKey: "new-api-key" };

      (organizationsService.create as jest.Mock).mockResolvedValue(mockOrg);
      (organizationsService.getBySlug as jest.Mock).mockResolvedValue(null);
      (usersService.create as jest.Mock).mockResolvedValue(mockUser);
      (apiKeysService.create as jest.Mock).mockResolvedValue(mockApiKey);
      (creditsService.addCredits as jest.Mock).mockResolvedValue(undefined);
      (abuseDetectionService.recordSignupMetadata as jest.Mock).mockResolvedValue(undefined);

      const mockFinalUser = {
        ...mockUser,
        organization_id: mockOrg.id,
        organization: mockOrg,
        is_active: true,
      };
      (usersService.getByWalletAddressWithOrganization as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockFinalUser);

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: VALID_MESSAGE,
          signature: VALID_SIGNATURE,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isNewAccount).toBe(true);
      expect(db.transaction).toHaveBeenCalled();
    });
  });

  describe("Key failure modes", () => {
    it("should reject invalid signature", async () => {
      mockRecoverMessageAddress.mockRejectedValue(new Error("Invalid signature"));

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: VALID_MESSAGE,
          signature: "0xinvalid",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_SIGNATURE");
    });

    it("should reject mismatched domain", async () => {
      const wrongDomainMessage = VALID_MESSAGE.replace("localhost:3000", "evil.com");

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: wrongDomainMessage,
          signature: VALID_SIGNATURE,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_DOMAIN");
    });

    it("should reject expired message", async () => {
      const expiredMessage = `${VALID_MESSAGE}\nExpiration Time: 2020-01-01T00:00:00.000Z`;

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: expiredMessage,
          signature: VALID_SIGNATURE,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("MESSAGE_EXPIRED");
    });

    it("should reject invalid JSON body", async () => {
      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: "not-json",
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_BODY");
    });

    it("should reject missing message field", async () => {
      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          signature: VALID_SIGNATURE,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_BODY");
    });

    it("should block signup when abuse detection fails", async () => {
      (abuseDetectionService.checkSignupAbuse as jest.Mock).mockResolvedValue({
        allowed: false,
        reason: "Too many signups from this IP",
      });

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: VALID_MESSAGE,
          signature: VALID_SIGNATURE,
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("SIGNUP_BLOCKED");
    });

    it("should handle transaction rollback on credit failure", async () => {
      const txError = new Error("Credit service failed");
      (db.transaction as jest.Mock).mockRejectedValue(txError);

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({
          message: VALID_MESSAGE,
          signature: VALID_SIGNATURE,
        }),
      });

      await expect(POST(request)).rejects.toThrow();
    });
  });
});
