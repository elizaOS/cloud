
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateSlugFromWallet, generateSlugFromEmail, getInitialCredits } from "@/lib/utils/signup-helpers";

// Unit tests for shared signup helpers used by SIWE and Privy flows
describe("signup-helpers", () => {
  describe("generateSlugFromWallet", () => {
    it("generates a slug from a wallet address", () => {
      const slug = generateSlugFromWallet("0xAbCdEf1234567890abcdef1234567890AbCdEf12");
      expect(slug).toMatch(/^abcdef-[a-f0-9]{6}$/);
    });

    it("strips 0x prefix and lowercases", () => {
      const slug = generateSlugFromWallet("0xAABBCC1234567890abcdef1234567890AbCdEf12");
      expect(slug.startsWith("aabbcc-")).toBe(true);
    });

    it("generates unique slugs on repeated calls", () => {
      const address = "0xAbCdEf1234567890abcdef1234567890AbCdEf12";
      const slugs = new Set(Array.from({ length: 20 }, () => generateSlugFromWallet(address)));
      // With 3 random bytes, collisions in 20 calls are extremely unlikely
      expect(slugs.size).toBeGreaterThan(1);
    });
  });

  describe("generateSlugFromEmail", () => {
    it("generates a slug from an email address", () => {
      const slug = generateSlugFromEmail("user@example.com");
      expect(slug).toMatch(/^user-[a-z0-9]+$/);
    });

    it("sanitizes special characters in email prefix", () => {
      const slug = generateSlugFromEmail("user.name+tag@example.com");
      expect(slug).toMatch(/^user-name-tag-[a-z0-9]+$/);
    });
  });

  describe("getInitialCredits", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.unstubAllEnvs();
    });

    it("returns default 5.0 when env var is unset", () => {
      delete process.env.INITIAL_FREE_CREDITS;
      expect(getInitialCredits()).toBe(5.0);
    });

    it("reads INITIAL_FREE_CREDITS env var", () => {
      vi.stubEnv("INITIAL_FREE_CREDITS", "10.0");
      expect(getInitialCredits()).toBe(10.0);
    });

    it("ignores invalid env var values", () => {
      vi.stubEnv("INITIAL_FREE_CREDITS", "not-a-number");
      expect(getInitialCredits()).toBe(5.0);
    });

    it("ignores negative env var values", () => {
      vi.stubEnv("INITIAL_FREE_CREDITS", "-5");
      expect(getInitialCredits()).toBe(5.0);
    });

    it("accepts zero credits", () => {
      vi.stubEnv("INITIAL_FREE_CREDITS", "0");
      expect(getInitialCredits()).toBe(0);
    });
  });
});

// Unit tests for atomicConsume
describe("atomicConsume", () => {
  it("returns 0 when redis is unavailable", async () => {
    vi.doMock("@/lib/cache/client", () => ({
      redis: null,
    }));
    const { atomicConsume } = await import("@/lib/cache/consume");
    expect(await atomicConsume("test-key")).toBe(0);
  });
});

// Integration-level test descriptions for SIWE nonce/verify flow
// These require mocking NextRequest, cache, and service layers.
describe("SIWE nonce endpoint", () => {
  it.todo("returns nonce, domain, uri, chainId, version, and statement");
  it.todo("returns 503 when cache is unavailable");
  it.todo("returns 400 for invalid chainId");
  it.todo("verifies nonce is persisted by reading it back");
  it.todo("nonce TTL: nonce expires after configured TTL");
});

describe("SIWE verify endpoint", () => {
  it.todo("returns 400 for missing message or signature");
  it.todo("returns 400 for invalid SIWE message fields");
  it.todo("returns 503 when cache is unavailable");
  it.todo("returns 400 for expired/already-used nonce (single-use enforcement)");
  it.todo("returns 400 for domain mismatch");
  it.todo("returns 400 for expired SIWE message");
  it.todo("returns 400 for invalid signature");
  it.todo("returns existing user and API key for known wallet (sign-in path)");
  it.todo("returns 403 for inactive account");
  it.todo("creates new org, user, and API key for unknown wallet (sign-up path)");
  it.todo("returns 403 when abuse detection blocks signup");
  it.todo("handles 23505 duplicate-key race condition gracefully");
  it.todo("cleans up orphaned org on signup failure");
});
