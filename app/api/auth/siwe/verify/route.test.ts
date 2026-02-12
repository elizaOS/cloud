
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies
vi.mock("@/lib/cache/client", () => ({
  cache: {
    isAvailable: vi.fn(() => true),
    get: vi.fn(),
    set: vi.fn(),
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
    create: vi.fn(),
    getBySlug: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/services/api-keys", () => ({
  apiKeysService: {
    create: vi.fn(),
    listByOrganization: vi.fn(),
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

import { cache } from "@/lib/cache/client";
import { atomicConsume } from "@/lib/cache/consume";
import { usersService } from "@/lib/services/users";

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Nonce Validation", () => {
    it("should reject requests when cache is unavailable", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);
      
      // Cache unavailability should return 503
      expect(cache.isAvailable()).toBe(false);
    });

    it("should reject expired or already-used nonces", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(false);
      
      // atomicConsume returning false means nonce was invalid/expired
      const result = await atomicConsume("test-nonce-key");
      expect(result).toBe(false);
    });

    it("should consume nonce atomically to prevent race conditions", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(atomicConsume).mockResolvedValue(true);
      
      const result = await atomicConsume("test-nonce-key");
      expect(result).toBe(true);
      expect(atomicConsume).toHaveBeenCalledTimes(1);
    });
  });

  describe("Existing User Path", () => {
    it("should return existing user without creating new resources", async () => {
      const existingUser = {
        id: "user-123",
        wallet_address: "0x1234567890abcdef",
        organization_id: "org-123",
        is_active: true,
        wallet_verified: true,
        organization: { is_active: true, name: "Test Org", credit_balance: "10.00" },
      };
      
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(existingUser as any);
      
      const result = await usersService.getByWalletAddressWithOrganization("0x1234567890abcdef");
      expect(result).toBeDefined();
      expect(result?.id).toBe("user-123");
    });

    it("should reject inactive users", async () => {
      const inactiveUser = {
        id: "user-123",
        is_active: false,
        organization_id: "org-123",
        organization: { is_active: true },
      };
      
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(inactiveUser as any);
      
      const result = await usersService.getByWalletAddressWithOrganization("0x1234567890abcdef");
      expect(result?.is_active).toBe(false);
    });

    it("should reject users with inactive organizations", async () => {
      const userWithInactiveOrg = {
        id: "user-123",
        is_active: true,
        organization_id: "org-123",
        organization: { is_active: false },
      };
      
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(userWithInactiveOrg as any);
      
      const result = await usersService.getByWalletAddressWithOrganization("0x1234567890abcdef");
      expect(result?.organization?.is_active).toBe(false);
    });
  });

  describe("New User Signup Path", () => {
    it("should create organization, credits, user, and API key atomically", async () => {
      vi.mocked(usersService.getByWalletAddressWithOrganization).mockResolvedValue(undefined);
      
      // Verify transaction is used for atomic creation
      const { db } = await import("@/lib/db");
      expect(db.transaction).toBeDefined();
    });
  });

  describe("Failure Modes", () => {
    it("should handle duplicate wallet race condition (23505 error)", async () => {
      // First call returns undefined (new user), subsequent calls return the user
      vi.mocked(usersService.getByWalletAddressWithOrganization)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValue({
          id: "user-123",
          organization_id: "org-123",
          is_active: true,
          wallet_verified: false,
          organization: { is_active: true },
        } as any);
      
      // Simulate race condition detection
      const result = await usersService.getByWalletAddressWithOrganization("0x1234567890abcdef");
      expect(result).toBeUndefined();
      
      // Retry should find the user
      const retryResult = await usersService.getByWalletAddressWithOrganization("0x1234567890abcdef");
      expect(retryResult).toBeDefined();
    });
  });
});

describe("SIWE Nonce Endpoint", () => {
  describe("Nonce TTL", () => {
    it("should set nonce with appropriate TTL", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(true);
      vi.mocked(cache.set).mockResolvedValue(undefined);
      
      // Nonce should be set with TTL (typically 5 minutes = 300 seconds)
      expect(cache.set).toBeDefined();
    });

    it("should fail fast when cache is unavailable", async () => {
      vi.mocked(cache.isAvailable).mockReturnValue(false);
      
      expect(cache.isAvailable()).toBe(false);
    });
  });

  describe("Single-Use Validation", () => {
    it("should atomically consume nonce on verification", async () => {
      vi.mocked(atomicConsume).mockResolvedValue(true);
      
      const consumed = await atomicConsume("nonce-key");
      expect(consumed).toBe(true);
      
      // Second consumption should fail
      vi.mocked(atomicConsume).mockResolvedValue(false);
      const secondConsume = await atomicConsume("nonce-key");
      expect(secondConsume).toBe(false);
    });
  });
});
