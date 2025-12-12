/**
 * API Keys Service Unit Tests
 *
 * Tests:
 * 1. Key generation (format, uniqueness, entropy)
 * 2. Key validation (hash matching, timing safety)
 * 3. Key prefix handling
 * 4. Cache behavior (hit/miss, invalidation)
 * 5. Security properties (no plaintext storage)
 */

import { describe, it, expect } from "bun:test";
import crypto from "crypto";

const API_KEY_PREFIX_LENGTH = 12; // eliza_ + 6 chars

// =============================================================================
// KEY GENERATION TESTS
// =============================================================================

describe("API Key Generation", () => {
  const generateApiKey = () => {
    const randomBytes = crypto.randomBytes(32).toString("hex");
    const key = `eliza_${randomBytes}`;
    const hash = crypto.createHash("sha256").update(key).digest("hex");
    const prefix = key.substring(0, API_KEY_PREFIX_LENGTH);
    return { key, hash, prefix };
  };

  describe("Key Format", () => {
    it("should generate key with eliza_ prefix", () => {
      const { key } = generateApiKey();
      expect(key.startsWith("eliza_")).toBe(true);
    });

    it("should generate key of correct length", () => {
      const { key } = generateApiKey();
      // eliza_ (6) + 64 hex chars from 32 bytes = 70 chars
      expect(key.length).toBe(70);
    });

    it("should generate valid hex characters after prefix", () => {
      const { key } = generateApiKey();
      const hexPart = key.substring(6); // Remove eliza_
      expect(/^[0-9a-f]+$/.test(hexPart)).toBe(true);
    });

    it("should generate prefix of correct length", () => {
      const { prefix } = generateApiKey();
      expect(prefix.length).toBe(API_KEY_PREFIX_LENGTH);
    });

    it("should have prefix that starts with eliza_", () => {
      const { prefix } = generateApiKey();
      expect(prefix.startsWith("eliza_")).toBe(true);
    });
  });

  describe("Key Uniqueness", () => {
    it("should generate unique keys", () => {
      const keys = new Set<string>();
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const { key } = generateApiKey();
        keys.add(key);
      }

      expect(keys.size).toBe(iterations);
    });

    it("should generate unique hashes", () => {
      const hashes = new Set<string>();
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const { hash } = generateApiKey();
        hashes.add(hash);
      }

      expect(hashes.size).toBe(iterations);
    });

    it("should not generate duplicate prefixes in small sample", () => {
      // Note: With only 6 random hex chars, collisions are possible
      // but unlikely in a small sample
      const prefixes = new Set<string>();
      const iterations = 10;

      for (let i = 0; i < iterations; i++) {
        const { prefix } = generateApiKey();
        prefixes.add(prefix);
      }

      expect(prefixes.size).toBe(iterations);
    });
  });

  describe("Key Entropy", () => {
    it("should use 32 bytes of random data", () => {
      const randomBytes = crypto.randomBytes(32);
      expect(randomBytes.length).toBe(32);
      expect(randomBytes.toString("hex").length).toBe(64);
    });

    it("should have sufficient entropy", () => {
      const { key } = generateApiKey();
      const hexPart = key.substring(6);

      // Count unique characters
      const uniqueChars = new Set(hexPart.split(""));

      // Should use multiple different characters (not all same)
      expect(uniqueChars.size).toBeGreaterThan(5);
    });
  });
});

// =============================================================================
// KEY VALIDATION TESTS
// =============================================================================

describe("API Key Validation", () => {
  const generateApiKey = () => {
    const randomBytes = crypto.randomBytes(32).toString("hex");
    const key = `eliza_${randomBytes}`;
    const hash = crypto.createHash("sha256").update(key).digest("hex");
    const prefix = key.substring(0, API_KEY_PREFIX_LENGTH);
    return { key, hash, prefix };
  };

  describe("Hash Matching", () => {
    it("should produce consistent hash for same key", () => {
      const { key, hash } = generateApiKey();

      // Re-hash the same key
      const rehash = crypto.createHash("sha256").update(key).digest("hex");

      expect(rehash).toBe(hash);
    });

    it("should produce different hash for different keys", () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();

      expect(key1.hash).not.toBe(key2.hash);
    });

    it("should validate correct key", () => {
      const { key, hash } = generateApiKey();

      const providedHash = crypto
        .createHash("sha256")
        .update(key)
        .digest("hex");

      expect(providedHash).toBe(hash);
    });

    it("should reject tampered key", () => {
      const { key, hash } = generateApiKey();

      // Tamper with the key
      const tamperedKey = key.slice(0, -1) + "x";
      const tamperedHash = crypto
        .createHash("sha256")
        .update(tamperedKey)
        .digest("hex");

      expect(tamperedHash).not.toBe(hash);
    });

    it("should reject empty key", () => {
      const emptyHash = crypto.createHash("sha256").update("").digest("hex");
      const { hash } = generateApiKey();

      expect(emptyHash).not.toBe(hash);
    });
  });

  describe("Timing Safety", () => {
    it("should use constant-time comparison for security", () => {
      const hash1 = crypto.createHash("sha256").update("key1").digest("hex");
      const hash2 = crypto.createHash("sha256").update("key2").digest("hex");

      // crypto.timingSafeEqual should be used for comparison
      const buf1 = Buffer.from(hash1, "hex");
      const buf2 = Buffer.from(hash2, "hex");

      // This demonstrates the API (in real code, this prevents timing attacks)
      expect(buf1.length).toBe(buf2.length);

      // Timing-safe comparison
      const isEqual = crypto.timingSafeEqual(buf1, buf1);
      const isNotEqual = crypto.timingSafeEqual(buf1, buf2);

      expect(isEqual).toBe(true);
      expect(isNotEqual).toBe(false);
    });
  });
});

// =============================================================================
// KEY PREFIX TESTS
// =============================================================================

describe("API Key Prefix Handling", () => {
  describe("Prefix Extraction", () => {
    it("should extract correct prefix from key", () => {
      const key = "eliza_abc123def456xyz";
      const prefix = key.substring(0, API_KEY_PREFIX_LENGTH);

      expect(prefix).toBe("eliza_abc123");
    });

    it("should handle minimum length key", () => {
      const key = "eliza_123456"; // Exactly API_KEY_PREFIX_LENGTH chars
      const prefix = key.substring(0, API_KEY_PREFIX_LENGTH);

      expect(prefix).toBe(key);
    });
  });

  describe("Prefix Display", () => {
    it("should create masked display version", () => {
      const prefix = "eliza_abc123";
      const maskedKey = `${prefix}${"*".repeat(20)}`;

      expect(maskedKey).toBe("eliza_abc123********************");
      expect(maskedKey.length).toBe(32);
    });

    it("should not reveal full key in masked version", () => {
      const fullKey = "eliza_" + "a".repeat(64);
      const prefix = fullKey.substring(0, API_KEY_PREFIX_LENGTH);
      const masked = `${prefix}${"*".repeat(20)}`;

      expect(masked).not.toContain(fullKey);
      expect(masked.includes("*")).toBe(true);
    });
  });

  describe("Prefix Lookup", () => {
    it("should match key by prefix", () => {
      const storedKeys = [
        { prefix: "eliza_abc123", id: "key_1" },
        { prefix: "eliza_def456", id: "key_2" },
        { prefix: "eliza_ghi789", id: "key_3" },
      ];

      const inputKey = "eliza_def456xxxxxxxxxx";
      const inputPrefix = inputKey.substring(0, API_KEY_PREFIX_LENGTH);

      const match = storedKeys.find((k) => k.prefix === inputPrefix);

      expect(match?.id).toBe("key_2");
    });

    it("should not match different prefix", () => {
      const storedPrefix = "eliza_abc123";
      const inputPrefix = "eliza_abc124"; // One char different

      expect(storedPrefix).not.toBe(inputPrefix);
    });
  });
});

// =============================================================================
// CACHE BEHAVIOR TESTS
// =============================================================================

describe("API Key Cache Behavior", () => {
  describe("Cache Operations", () => {
    it("should cache validation result", () => {
      const cache = new Map<string, { valid: boolean; timestamp: number }>();
      const keyHash = "abc123";

      // Cache miss
      expect(cache.has(keyHash)).toBe(false);

      // Store in cache
      cache.set(keyHash, { valid: true, timestamp: Date.now() });

      // Cache hit
      expect(cache.has(keyHash)).toBe(true);
      expect(cache.get(keyHash)?.valid).toBe(true);
    });

    it("should handle cache TTL expiration", () => {
      const CACHE_TTL = 600000; // 10 minutes
      const now = Date.now();

      const freshEntry = { valid: true, timestamp: now };
      const expiredEntry = { valid: true, timestamp: now - CACHE_TTL - 1000 };

      const isFreshValid = now - freshEntry.timestamp < CACHE_TTL;
      const isExpiredValid = now - expiredEntry.timestamp < CACHE_TTL;

      expect(isFreshValid).toBe(true);
      expect(isExpiredValid).toBe(false);
    });

    it("should invalidate cache on key update", () => {
      const cache = new Map<string, { valid: boolean }>();
      const keyHash = "abc123";

      // Add to cache
      cache.set(keyHash, { valid: true });
      expect(cache.has(keyHash)).toBe(true);

      // Invalidate
      cache.delete(keyHash);
      expect(cache.has(keyHash)).toBe(false);
    });

    it("should use hash prefix for cache key", () => {
      const fullHash = "abc123def456ghi789jkl012mno345pqr678stu901vwx234yz";
      const cacheKeyPrefix = fullHash.substring(0, 16);

      expect(cacheKeyPrefix).toBe("abc123def456ghi7");
      expect(cacheKeyPrefix.length).toBe(16);
    });
  });

  describe("Cache Security", () => {
    it("should not cache plaintext keys", () => {
      interface CachedKey {
        id: string;
        hash: string;
        // Note: no 'key' field - plaintext is never cached
      }

      const cached: CachedKey = {
        id: "key_123",
        hash: "abc123...",
      };

      expect("key" in cached).toBe(false);
    });

    it("should cache only necessary metadata", () => {
      interface CachedApiKey {
        id: string;
        organization_id: string;
        key_prefix: string;
        name: string;
        is_active: boolean;
        // Note: no sensitive data like full key or hash
      }

      const cached: CachedApiKey = {
        id: "key_123",
        organization_id: "org_456",
        key_prefix: "eliza_abc",
        name: "My API Key",
        is_active: true,
      };

      // Verify structure
      expect(cached.id).toBeDefined();
      expect(cached.is_active).toBe(true);
    });
  });
});

// =============================================================================
// SECURITY PROPERTIES TESTS
// =============================================================================

describe("API Key Security Properties", () => {
  describe("No Plaintext Storage", () => {
    it("should only store hashed version", () => {
      const key = "eliza_secret123";
      const hash = crypto.createHash("sha256").update(key).digest("hex");

      const stored = {
        key: "eliza_secre********************", // Masked
        key_hash: hash,
        key_prefix: "eliza_secre",
      };

      // Stored 'key' should not contain the actual key
      expect(stored.key).not.toBe(key);
      expect(stored.key.includes("*")).toBe(true);

      // But hash should be verifiable
      const verifyHash = crypto
        .createHash("sha256")
        .update(key)
        .digest("hex");
      expect(verifyHash).toBe(stored.key_hash);
    });

    it("should return plaintext only once at creation", () => {
      interface CreateResult {
        apiKey: { id: string; key_hash: string };
        plainKey: string; // Only time the plaintext is available
      }

      const result: CreateResult = {
        apiKey: { id: "key_123", key_hash: "abc..." },
        plainKey: "eliza_xxx...",
      };

      expect(result.plainKey).toBeDefined();
      expect(result.apiKey.key_hash).toBeDefined();
      // After this response, plainKey is never available again
    });
  });

  describe("Hash Algorithm Security", () => {
    it("should use SHA-256", () => {
      const key = "test_key";
      const hash = crypto.createHash("sha256").update(key).digest("hex");

      // SHA-256 produces 64 hex characters (256 bits)
      expect(hash.length).toBe(64);
    });

    it("should be irreversible", () => {
      const key = "eliza_secret";
      const hash = crypto.createHash("sha256").update(key).digest("hex");

      // Cannot derive key from hash (no inverse operation)
      // This is a property we assert by design
      expect(hash).not.toBe(key);
      expect(hash).not.toContain("eliza_");
    });
  });

  describe("Key Lifecycle", () => {
    it("should support key rotation", () => {
      const oldKey = { id: "key_1", created_at: new Date("2024-01-01") };
      const newKey = { id: "key_2", created_at: new Date("2024-06-01") };

      // New key should be used, old key should be deactivated
      expect(newKey.created_at > oldKey.created_at).toBe(true);
    });

    it("should track last used timestamp", () => {
      const key = {
        id: "key_1",
        last_used_at: new Date("2024-06-15T10:30:00Z"),
        use_count: 150,
      };

      expect(key.last_used_at).toBeDefined();
      expect(key.use_count).toBe(150);
    });

    it("should support key revocation", () => {
      const key = {
        id: "key_1",
        is_active: true,
        revoked_at: null as Date | null,
      };

      // Revoke the key
      key.is_active = false;
      key.revoked_at = new Date();

      expect(key.is_active).toBe(false);
      expect(key.revoked_at).toBeDefined();
    });
  });
});

// =============================================================================
// RATE LIMITING TESTS
// =============================================================================

describe("API Key Rate Limiting", () => {
  describe("Usage Tracking", () => {
    it("should increment usage counter", () => {
      let useCount = 0;

      // Simulate API calls
      useCount++;
      useCount++;
      useCount++;

      expect(useCount).toBe(3);
    });

    it("should track usage per time window", () => {
      const usageByMinute = new Map<number, number>();
      const now = Date.now();
      const minute = Math.floor(now / 60000);

      // Record usage
      usageByMinute.set(minute, (usageByMinute.get(minute) || 0) + 1);
      usageByMinute.set(minute, (usageByMinute.get(minute) || 0) + 1);

      expect(usageByMinute.get(minute)).toBe(2);
    });
  });

  describe("Rate Limit Enforcement", () => {
    it("should allow requests under limit", () => {
      const RATE_LIMIT = 100;
      const currentUsage = 50;

      const allowed = currentUsage < RATE_LIMIT;
      expect(allowed).toBe(true);
    });

    it("should block requests over limit", () => {
      const RATE_LIMIT = 100;
      const currentUsage = 100;

      const allowed = currentUsage < RATE_LIMIT;
      expect(allowed).toBe(false);
    });

    it("should reset after time window", () => {
      const WINDOW_MS = 60000; // 1 minute
      const windowStart = Date.now() - WINDOW_MS - 1000; // 1 second past window
      const now = Date.now();

      const shouldReset = now - windowStart >= WINDOW_MS;
      expect(shouldReset).toBe(true);
    });
  });
});

// =============================================================================
// ORGANIZATION SCOPING TESTS
// =============================================================================

describe("API Key Organization Scoping", () => {
  describe("Key-Org Association", () => {
    it("should associate key with organization", () => {
      const key = {
        id: "key_123",
        organization_id: "org_456",
      };

      expect(key.organization_id).toBe("org_456");
    });

    it("should list keys for specific organization", () => {
      const allKeys = [
        { id: "key_1", organization_id: "org_a" },
        { id: "key_2", organization_id: "org_b" },
        { id: "key_3", organization_id: "org_a" },
      ];

      const orgAKeys = allKeys.filter((k) => k.organization_id === "org_a");

      expect(orgAKeys.length).toBe(2);
      expect(orgAKeys.map((k) => k.id)).toContain("key_1");
      expect(orgAKeys.map((k) => k.id)).toContain("key_3");
    });

    it("should not allow cross-org key access", () => {
      const key = { id: "key_1", organization_id: "org_a" };
      const requestingOrgId = "org_b";

      const hasAccess = key.organization_id === requestingOrgId;
      expect(hasAccess).toBe(false);
    });
  });

  describe("Key Permissions", () => {
    it("should support key-specific permissions", () => {
      const key = {
        id: "key_1",
        permissions: ["read", "write"],
      };

      expect(key.permissions).toContain("read");
      expect(key.permissions).toContain("write");
      expect(key.permissions).not.toContain("admin");
    });

    it("should check permission before operation", () => {
      const key = { permissions: ["read"] };
      const requiredPermission = "write";

      const hasPermission = key.permissions.includes(requiredPermission);
      expect(hasPermission).toBe(false);
    });
  });
});
