
import { POST } from "../route";
import { NextRequest } from "next/server";
import { cache } from "@/lib/cache/client";
import { usersService } from "@/lib/services/users";
import { apiKeysService } from "@/lib/services/api-keys";
import { organizationsService } from "@/lib/services/organizations";
import { creditsService } from "@/lib/services/credits";
import { abuseDetectionService } from "@/lib/services/abuse-detection";
import { db } from "@/lib/db";
import * as viem from "viem";
import * as viemSiwe from "viem/siwe";

// Mock all dependencies
jest.mock("@/lib/cache/client");
jest.mock("@/lib/cache/consume");
jest.mock("@/lib/services/users");
jest.mock("@/lib/services/api-keys");
jest.mock("@/lib/services/organizations");
jest.mock("@/lib/services/credits");
jest.mock("@/lib/services/abuse-detection");
jest.mock("@/lib/db");
jest.mock("viem");
jest.mock("viem/siwe");

const mockCache = cache as jest.Mocked<typeof cache>;
const mockUsersService = usersService as jest.Mocked<typeof usersService>;
const mockApiKeysService = apiKeysService as jest.Mocked<typeof apiKeysService>;
const mockOrganizationsService = organizationsService as jest.Mocked<typeof organizationsService>;
const mockCreditsService = creditsService as jest.Mocked<typeof creditsService>;
const mockAbuseDetectionService = abuseDetectionService as jest.Mocked<typeof abuseDetectionService>;

describe("SIWE Verify Endpoint", () => {
  const validAddress = "0x1234567890123456789012345678901234567890";
  const validNonce = "test-nonce-123";
  const validMessage = `localhost wants you to sign in with your Ethereum account:\n${validAddress}\n\nSign in\n\nURI: http://localhost:3000\nVersion: 1\nChain ID: 1\nNonce: ${validNonce}\nIssued At: 2024-01-01T00:00:00.000Z`;
  const validSignature = "0xabcdef1234567890";

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    
    // Default mocks
    mockCache.isAvailable.mockReturnValue(true);
    (viem.getAddress as jest.Mock).mockImplementation((addr: string) => addr);
    (viemSiwe.parseSiweMessage as jest.Mock).mockReturnValue({
      address: validAddress,
      nonce: validNonce,
      domain: "localhost",
      expirationTime: new Date(Date.now() + 100000),
    });
    (viem.recoverMessageAddress as jest.Mock).mockResolvedValue(validAddress);
  });

  describe("Nonce validation", () => {
    it("should reject when cache is unavailable", async () => {
      mockCache.isAvailable.mockReturnValue(false);

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: validMessage, signature: validSignature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("should reject expired or already-used nonces", async () => {
      const { atomicConsume } = require("@/lib/cache/consume");
      atomicConsume.mockResolvedValue(0); // nonce not found

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: validMessage, signature: validSignature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_NONCE");
    });

    it("should accept valid single-use nonce", async () => {
      const { atomicConsume } = require("@/lib/cache/consume");
      atomicConsume.mockResolvedValue(1); // nonce consumed successfully
      
      mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-123",
        wallet_address: validAddress.toLowerCase(),
        organization_id: "org-123",
        is_active: true,
        wallet_verified: true,
        organization: { id: "org-123", is_active: true, name: "Test Org" },
      } as any);

      mockApiKeysService.listByOrganization.mockResolvedValue([
        { user_id: "user-123", is_active: true, key: "test-key" } as any,
      ]);

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: validMessage, signature: validSignature }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      expect(atomicConsume).toHaveBeenCalledTimes(1);
    });
  });

  describe("Domain validation", () => {
    it("should reject messages with wrong domain", async () => {
      const { atomicConsume } = require("@/lib/cache/consume");
      atomicConsume.mockResolvedValue(1);

      (viemSiwe.parseSiweMessage as jest.Mock).mockReturnValue({
        address: validAddress,
        nonce: validNonce,
        domain: "evil.com",
        expirationTime: new Date(Date.now() + 100000),
      });

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: validMessage, signature: validSignature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_DOMAIN");
    });
  });

  describe("Signature verification", () => {
    it("should reject invalid signatures", async () => {
      const { atomicConsume } = require("@/lib/cache/consume");
      atomicConsume.mockResolvedValue(1);

      (viem.recoverMessageAddress as jest.Mock).mockRejectedValue(new Error("Invalid signature"));

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: validMessage, signature: validSignature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_SIGNATURE");
    });

    it("should reject when recovered address doesn't match claimed address", async () => {
      const { atomicConsume } = require("@/lib/cache/consume");
      atomicConsume.mockResolvedValue(1);

      (viem.recoverMessageAddress as jest.Mock).mockResolvedValue("0xdifferentaddress");

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: validMessage, signature: validSignature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("INVALID_SIGNATURE");
    });
  });

  describe("Existing user flow", () => {
    it("should return API key for existing active user", async () => {
      const { atomicConsume } = require("@/lib/cache/consume");
      atomicConsume.mockResolvedValue(1);

      const existingUser = {
        id: "user-123",
        wallet_address: validAddress.toLowerCase(),
        organization_id: "org-123",
        is_active: true,
        wallet_verified: true,
        organization: {
          id: "org-123",
          is_active: true,
          name: "Test Org",
          credit_balance: "100.00",
        },
      };

      mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue(existingUser as any);
      mockApiKeysService.listByOrganization.mockResolvedValue([
        { user_id: "user-123", is_active: true, key: "existing-key-123" } as any,
      ]);

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: validMessage, signature: validSignature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.apiKey).toBe("existing-key-123");
      expect(data.isNewAccount).toBe(false);
    });

    it("should reject inactive users", async () => {
      const { atomicConsume } = require("@/lib/cache/consume");
      atomicConsume.mockResolvedValue(1);

      mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue({
        id: "user-123",
        is_active: false,
        organization_id: "org-123",
        organization: { is_active: true },
      } as any);

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: validMessage, signature: validSignature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("ACCOUNT_INACTIVE");
    });
  });

  describe("New user signup flow", () => {
    it("should create organization, user, and API key in transaction", async () => {
      const { atomicConsume } = require("@/lib/cache/consume");
      atomicConsume.mockResolvedValue(1);

      mockUsersService.getByWalletAddressWithOrganization
        .mockResolvedValueOnce(undefined) // First call: no existing user
        .mockResolvedValueOnce({ // Second call after transaction: return created user
          id: "new-user-123",
          wallet_address: validAddress.toLowerCase(),
          organization_id: "new-org-123",
          organization: { id: "new-org-123", credit_balance: "10.00" },
        } as any);

      mockAbuseDetectionService.checkSignupAbuse.mockResolvedValue({ allowed: true });

      const mockTx = {};
      (db.transaction as jest.Mock).mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      mockOrganizationsService.getBySlug.mockResolvedValue(undefined);
      mockOrganizationsService.create.mockResolvedValue({ id: "new-org-123" } as any);
      mockUsersService.create.mockResolvedValue({ id: "new-user-123" } as any);
      mockApiKeysService.create.mockResolvedValue({ plainKey: "new-key-123" } as any);

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: validMessage, signature: validSignature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isNewAccount).toBe(true);
      expect(data.apiKey).toBe("new-key-123");
      expect(db.transaction).toHaveBeenCalled();
    });

    it("should block signup when abuse detected", async () => {
      const { atomicConsume } = require("@/lib/cache/consume");
      atomicConsume.mockResolvedValue(1);

      mockUsersService.getByWalletAddressWithOrganization.mockResolvedValue(undefined);
      mockAbuseDetectionService.checkSignupAbuse.mockResolvedValue({
        allowed: false,
        reason: "Too many signups from this IP",
      });

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: validMessage, signature: validSignature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe("SIGNUP_BLOCKED");
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("should handle race condition on duplicate wallet signup", async () => {
      const { atomicConsume } = require("@/lib/cache/consume");
      atomicConsume.mockResolvedValue(1);

      mockUsersService.getByWalletAddressWithOrganization
        .mockResolvedValueOnce(undefined) // First check: no user
        .mockResolvedValueOnce({ // After race: user exists
          id: "race-user-123",
          wallet_address: validAddress.toLowerCase(),
          organization_id: "race-org-123",
          wallet_verified: false,
        } as any);

      mockAbuseDetectionService.checkSignupAbuse.mockResolvedValue({ allowed: true });

      const duplicateError = new Error("Duplicate key");
      (duplicateError as any).code = "23505";
      (db.transaction as jest.Mock).mockRejectedValue(duplicateError);

      mockApiKeysService.listByOrganization.mockResolvedValue([
        { user_id: "race-user-123", is_active: true, key: "race-key-123" } as any,
      ]);

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message: validMessage, signature: validSignature }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isNewAccount).toBe(false);
      expect(mockUsersService.update).toHaveBeenCalledWith("race-user-123", { wallet_verified: true });
    });
  });
});
