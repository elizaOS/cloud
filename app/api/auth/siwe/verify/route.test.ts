
/**
 * SIWE Verify Endpoint Tests
 *
 * Tests nonce issuance/consumption, signature verification, existing vs new user paths,
 * and key failure modes (invalid nonce/domain/signature).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";
import { cache } from "@/lib/cache/client";
import { CacheKeys } from "@/lib/cache/keys";
import { usersService } from "@/lib/services/users";
import { organizationsService } from "@/lib/services/organizations";
import { apiKeysService } from "@/lib/services/api-keys";
import { creditsService } from "@/lib/services/credits";
import { abuseDetectionService } from "@/lib/services/abuse-detection";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";

vi.mock("@/lib/cache/client");
vi.mock("@/lib/services/users");
vi.mock("@/lib/services/organizations");
vi.mock("@/lib/services/api-keys");
vi.mock("@/lib/services/credits");
vi.mock("@/lib/services/abuse-detection");

describe("POST /api/auth/siwe/verify", () => {
  const mockAccount = privateKeyToAccount(generatePrivateKey());
  const testNonce = "test-nonce-123";
  const testDomain = "localhost";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = `http://${testDomain}:3000`;
    vi.mocked(cache.isAvailable).mockReturnValue(true);
    vi.mocked(abuseDetectionService.checkSignupAbuse).mockResolvedValue({
      allowed: true,
    });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  async function createSignedRequest(overrides?: {
    nonce?: string;
    domain?: string;
    expirationTime?: Date;
  }) {
    const message = createSiweMessage({
      address: mockAccount.address,
      chainId: 1,
      domain: overrides?.domain || testDomain,
      nonce: overrides?.nonce || testNonce,
      uri: `http://${testDomain}:3000`,
      version: "1",
      expirationTime: overrides?.expirationTime,
    });

    const signature = await mockAccount.signMessage({ message });

    return new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
  }

  describe("Nonce validation", () => {
    it("should reject request when cache is unavailable", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);
      const request = await createSignedRequest();

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("should reject invalid nonce (already used or expired)", async () => {
      vi.mocked(cache.del).mockResolvedValue(0); // Nonce not found
      const request = await createSignedRequest();

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("INVALID_NONCE");
      expect(cache.del).toHaveBeenCalledWith(CacheKeys.siwe.nonce(testNonce));
    });

    it("should consume nonce atomically on valid request", async () => {
      vi.mocked(cache.del).mockResolvedValue(1);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        organization_id: "org-1",
        is_active: true,
        wallet_verified: true,
        organization: { id: "org-1", is_active: true, credit_balance: "10.00" },
      } as any);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { id: "key-1", user_id: "user-1", is_active: true, key: "test-key" },
      ] as any);

      const request = await createSignedRequest();
      await POST(request);

      expect(cache.del).toHaveBeenCalledTimes(1);
      expect(cache.del).toHaveBeenCalledWith(CacheKeys.siwe.nonce(testNonce));
    });
  });

  describe("Domain validation", () => {
    it("should reject message with wrong domain", async () => {
      vi.mocked(cache.del).mockResolvedValue(1);
      const request = await createSignedRequest({ domain: "evil.com" });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("INVALID_DOMAIN");
    });
  });

  describe("Signature verification", () => {
    it("should reject invalid signature", async () => {
      vi.mocked(cache.del).mockResolvedValue(1);
      const message = createSiweMessage({
        address: mockAccount.address,
        chainId: 1,
        domain: testDomain,
        nonce: testNonce,
        uri: `http://${testDomain}:3000`,
        version: "1",
      });

      const request = new NextRequest("http://localhost:3000/api/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message, signature: "0xinvalid" }),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("INVALID_SIGNATURE");
    });
  });

  describe("Existing user path", () => {
    it("should return API key for existing active user", async () => {
      vi.mocked(cache.del).mockResolvedValue(1);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        organization_id: "org-1",
        is_active: true,
        wallet_verified: true,
        name: "Test User",
        organization: {
          id: "org-1",
          name: "Test Org",
          is_active: true,
          credit_balance: "10.00",
        },
      } as any);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { id: "key-1", user_id: "user-1", is_active: true, key: "existing-key" },
      ] as any);

      const request = await createSignedRequest();
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.apiKey).toBe("existing-key");
      expect(body.isNewAccount).toBe(false);
      expect(body.user.id).toBe("user-1");
    });

    it("should reject inactive user", async () => {
      vi.mocked(cache.del).mockResolvedValue(1);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        organization_id: "org-1",
        is_active: false,
        organization: { id: "org-1", is_active: true },
      } as any);

      const request = await createSignedRequest();
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toBe("ACCOUNT_INACTIVE");
    });

    it("should mark wallet as verified for Privy users", async () => {
      vi.mocked(cache.del).mockResolvedValue(1);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue({
        id: "user-1",
        organization_id: "org-1",
        is_active: true,
        wallet_verified: false,
        privy_user_id: "privy-123",
        organization: { id: "org-1", is_active: true, credit_balance: "10.00" },
      } as any);
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([]);
      vi.mocked(apiKeysService.create).mockResolvedValue({
        plainKey: "new-key",
      } as any);

      const request = await createSignedRequest();
      await POST(request);

      expect(usersService.update).toHaveBeenCalledWith("user-1", {
        wallet_verified: true,
      });
    });
  });

  describe("New user path", () => {
    it("should create org, user, and API key for new wallet", async () => {
      vi.mocked(cache.del).mockResolvedValue(1);
      vi.mocked(usersService.getByWalletAddressWithOrganization)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          id: "user-1",
          organization_id: "org-1",
          name: "0x1234...5678",
          organization: {
            id: "org-1",
            name: "0x1234...5678's Organization",
            credit_balance: "10.00",
          },
        } as any);
      vi.mocked(organizationsService.getBySlug).mockResolvedValue(undefined);
      vi.mocked(organizationsService.create).mockResolvedValue({
        id: "org-1",
        credit_balance: "0.00",
      } as any);
      vi.mocked(creditsService.addCredits).mockResolvedValue(undefined);
      vi.mocked(usersService.create).mockResolvedValue({ id: "user-1" } as any);
      vi.mocked(apiKeysService.create).mockResolvedValue({
        plainKey: "new-key",
      } as any);

      const request = await createSignedRequest();
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.isNewAccount).toBe(true);
      expect(body.apiKey).toBe("new-key");
      expect(organizationsService.create).toHaveBeenCalled();
      expect(usersService.create).toHaveBeenCalled();
    });

    it("should block signup when abuse detected", async () => {
      vi.mocked(cache.del).mockResolvedValue(1);
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(
        undefined
      );
      vi.mocked(abuseDetectionService.checkSignupAbuse).mockResolvedValue({
        allowed: false,
        reason: "Too many signups from this IP",
      });

      const request = await createSignedRequest();
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toBe("SIGNUP_BLOCKED");
      expect(organizationsService.create).not.toHaveBeenCalled();
    });

    it("should handle race condition on duplicate wallet", async () => {
      vi.mocked(cache.del).mockResolvedValue(1);
      vi.mocked(usersService.getByWalletAddressWithOrganization)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          id: "user-1",
          organization_id: "org-1",
          wallet_verified: true,
          organization: { id: "org-1", is_active: true, credit_balance: "10.00" },
        } as any);
      vi.mocked(organizationsService.create).mockResolvedValue({
        id: "orphan-org",
      } as any);
      vi.mocked(usersService.create).mockRejectedValue({ code: "23505" });
      vi.mocked(apiKeysService.listByOrganization).mockResolvedValue([
        { id: "key-1", user_id: "user-1", is_active: true, key: "winner-key" },
      ] as any);

      const request = await createSignedRequest();
      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.apiKey).toBe("winner-key");
      expect(organizationsService.delete).toHaveBeenCalledWith("orphan-org");
    });
  });

  describe("Message expiration", () => {
    it("should reject expired message", async () => {
      vi.mocked(cache.del).mockResolvedValue(1);
      const pastTime = new Date(Date.now() - 10000);
      const request = await createSignedRequest({ expirationTime: pastTime });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("MESSAGE_EXPIRED");
    });
  });
});
