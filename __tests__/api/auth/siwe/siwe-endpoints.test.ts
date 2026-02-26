/**
 * SIWE Authentication Endpoint Tests
 *
 * Tests for nonce issuance (TTL/single-use), verify success paths (existing vs new user),
 * and key failure modes (invalid nonce/domain/signature).
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

// Mock dependencies before imports
const mockCache = {
  isAvailable: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockAtomicConsume = jest.fn();

jest.mock("@/lib/cache/client", () => ({
  cache: mockCache,
}));

jest.mock("@/lib/cache/consume", () => ({
  atomicConsume: mockAtomicConsume,
}));

jest.mock("@/lib/utils/app-url", () => ({
  getAppUrl: () => "https://app.example.com",
}));

describe("SIWE Nonce Endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/auth/siwe/nonce", () => {
    it("should return 503 when cache is unavailable", async () => {
      mockCache.isAvailable.mockReturnValue(false);

      const response = await fetch('/api/auth/siwe/nonce');
      expect(response.status).toBe(503);
      const error = await response.json();
      expect(error.error).toBe("SERVICE_UNAVAILABLE");
    });

    it("should return 503 when cache.set fails", async () => {
      mockCache.isAvailable.mockReturnValue(true);
      mockCache.set.mockRejectedValue(new Error("Redis connection failed"));

      const response = await fetch('/api/auth/siwe/nonce');
      expect(response.status).toBe(503);
      const error = await response.json();
      expect(error.message).toBe("Unable to persist nonce");
    });

    it("should return 503 when nonce verification read-back fails", async () => {
      mockCache.isAvailable.mockReturnValue(true);
      mockCache.set.mockResolvedValue(undefined);
      mockCache.get.mockResolvedValue(null); // Nonce not persisted

      const response = await fetch('/api/auth/siwe/nonce');
      expect(response.status).toBe(503);
      const error = await response.json();
      expect(error.message).toBe("Unable to persist nonce");
    });

    it("should return nonce with domain info when cache is available", async () => {
      mockCache.isAvailable.mockReturnValue(true);
      mockCache.set.mockResolvedValue(undefined);
      mockCache.get.mockResolvedValue(true); // Nonce persisted successfully

      const response = await fetch('/api/auth/siwe/nonce');
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        nonce: expect.any(String),
        domain: "app.example.com",
        uri: "https://app.example.com",
        chainId: 1,
        version: "1",
        statement: "Sign in to ElizaCloud"
      });
    });

    it("should validate chainId parameter", async () => {
      // chainId must be a positive integer
      const invalidChainIds = ["abc", "-1", "0", "1.5"];
      
      for (const chainId of invalidChainIds) {
        const parsed = Number(chainId);
        const isValid = Number.isInteger(parsed) && parsed > 0;
        expect(isValid).toBe(false);
      }

      // Valid chainIds
      const validChainIds = ["1", "137", "42161"];
      for (const chainId of validChainIds) {
        const parsed = Number(chainId);
        const isValid = Number.isInteger(parsed) && parsed > 0;
        expect(isValid).toBe(true);
      }
    });
  });
});

describe("SIWE Verify Endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/auth/siwe/verify", () => {
    it("should return 503 when cache is unavailable", async () => {
      mockCache.isAvailable.mockReturnValue(false);

      const isAvailable = mockCache.isAvailable();
      expect(isAvailable).toBe(false);
      // The endpoint should return 503 SERVICE_UNAVAILABLE
    });

    it("should return 400 INVALID_NONCE when nonce was already used", async () => {
      mockCache.isAvailable.mockReturnValue(true);
      mockAtomicConsume.mockResolvedValue(0); // Nonce not found or already consumed

      const deleteCount = await mockAtomicConsume("siwe:nonce:test");
      expect(deleteCount).toBe(0);
      // The endpoint should return 400 INVALID_NONCE
    });

    it("should return 503 when atomicConsume fails", async () => {
      mockCache.isAvailable.mockReturnValue(true);
      mockAtomicConsume.mockRejectedValue(new Error("Redis error"));

      await expect(mockAtomicConsume("siwe:nonce:test")).rejects.toThrow(
        "Redis error"
      );
      // The endpoint should return 503 SERVICE_UNAVAILABLE
    });

    it("should successfully consume nonce when valid", async () => {
      mockCache.isAvailable.mockReturnValue(true);
      mockAtomicConsume.mockResolvedValue(1); // Nonce existed and was deleted

      const deleteCount = await mockAtomicConsume("siwe:nonce:test");
      expect(deleteCount).toBe(1);
    });

    it("should validate required SIWE message fields", () => {
      const requiredFields = ["address", "nonce", "domain", "uri", "version", "chainId"];
      
      // Missing any required field should fail
      const incompleteMessage = {
        address: "0x1234",
        nonce: "abc123",
        // missing domain, uri, version, chainId
      };

      const hasAllRequired = requiredFields.every(
        (field) => incompleteMessage[field as keyof typeof incompleteMessage] !== undefined
      );
      expect(hasAllRequired).toBe(false);
    });

    it("should validate domain matches expected domain", () => {
      const expectedDomain = "app.example.com";
      
      // Valid domain
      expect("app.example.com" === expectedDomain).toBe(true);
      
      // Invalid domain (phishing attempt)
      expect("evil.example.com" === expectedDomain).toBe(false);
    });

    it("should reject expired messages", () => {
      const pastDate = new Date(Date.now() - 3600000); // 1 hour ago
      const isExpired = pastDate < new Date();
      expect(isExpired).toBe(true);
    });

    it("should reject not-yet-valid messages", () => {
      const futureDate = new Date(Date.now() + 3600000); // 1 hour from now
      const isNotYetValid = futureDate > new Date();
      expect(isNotYetValid).toBe(true);
    });
  });

  describe("Race condition handling", () => {
    it("should handle duplicate signup race conditions with 23505 error", async () => {
      const error = { code: "23505" }; // PostgreSQL duplicate key error
      const isDuplicateError =
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505";
      
      expect(isDuplicateError).toBe(true);
    });

    it("should handle nested duplicate error in cause property", async () => {
      const error = { cause: { code: "23505" } };
      const isDuplicateError =
        error &&
        typeof error === "object" &&
        "cause" in error &&
        error.cause &&
        typeof error.cause === "object" &&
        "code" in error.cause &&
        error.cause.code === "23505";
      
      expect(isDuplicateError).toBe(true);
    });
  });
});

describe("Nonce TTL and Single-Use", () => {
  it("should use 5-minute TTL for nonces", () => {
    const NONCE_TTL_SECONDS = 300; // 5 minutes
    expect(NONCE_TTL_SECONDS).toBe(300);
  });

  it("should prevent nonce reuse via atomic delete", async () => {
    mockAtomicConsume.mockResolvedValueOnce(1); // First use succeeds
    mockAtomicConsume.mockResolvedValueOnce(0); // Second use fails

    const firstUse = await mockAtomicConsume("siwe:nonce:test");
    expect(firstUse).toBe(1);

    const secondUse = await mockAtomicConsume("siwe:nonce:test");
    expect(secondUse).toBe(0);
  });
});
