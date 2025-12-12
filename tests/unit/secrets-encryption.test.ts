import { describe, it, expect, beforeEach } from "bun:test";
import {
  SecretsEncryptionService,
  LocalKMSProvider,
  createEncryptionService,
} from "@/lib/services/secrets/encryption";

describe("SecretsEncryptionService", () => {
  let service: SecretsEncryptionService;

  beforeEach(() => {
    // Use a deterministic key for testing
    const testKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const kms = new LocalKMSProvider(testKey);
    service = createEncryptionService(kms);
  });

  describe("encrypt", () => {
    it("encrypts a simple string", async () => {
      const plaintext = "my-secret-api-key";
      const result = await service.encrypt(plaintext);

      expect(result.encryptedValue).toBeDefined();
      expect(result.encryptedValue).not.toBe(plaintext);
      expect(result.encryptedDek).toBeDefined();
      expect(result.nonce).toBeDefined();
      expect(result.authTag).toBeDefined();
      expect(result.keyId).toBe("local-kms-key");
    });

    it("produces different ciphertext for same plaintext (unique DEK per encryption)", async () => {
      const plaintext = "same-secret";

      const result1 = await service.encrypt(plaintext);
      const result2 = await service.encrypt(plaintext);

      // Different DEKs should produce different ciphertexts
      expect(result1.encryptedValue).not.toBe(result2.encryptedValue);
      expect(result1.encryptedDek).not.toBe(result2.encryptedDek);
      expect(result1.nonce).not.toBe(result2.nonce);
    });

    it("handles empty string", async () => {
      const plaintext = "";
      const result = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(result);

      expect(decrypted).toBe(plaintext);
    });

    it("handles unicode characters", async () => {
      const plaintext = "🔐 Secret with émojis and ünïcödé characters 中文";
      const result = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(result);

      expect(decrypted).toBe(plaintext);
    });

    it("handles large secrets (up to 64KB)", async () => {
      const plaintext = "x".repeat(65536);
      const result = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(result);

      expect(decrypted).toBe(plaintext);
    });

    it("handles JSON content", async () => {
      const plaintext = JSON.stringify({
        apiKey: "sk-test-123",
        endpoint: "https://api.example.com",
        config: { nested: { value: 42 } },
      });

      const result = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(result);

      expect(decrypted).toBe(plaintext);
      expect(JSON.parse(decrypted)).toEqual(JSON.parse(plaintext));
    });
  });

  describe("decrypt", () => {
    it("decrypts to original plaintext", async () => {
      const plaintext = "my-secret-value-12345";
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("fails with tampered ciphertext", async () => {
      const plaintext = "sensitive-data";
      const encrypted = await service.encrypt(plaintext);

      // Tamper with the ciphertext
      const tamperedValue = Buffer.from(encrypted.encryptedValue, "base64");
      tamperedValue[0] ^= 0xff;
      encrypted.encryptedValue = tamperedValue.toString("base64");

      await expect(service.decrypt(encrypted)).rejects.toThrow();
    });

    it("fails with wrong auth tag", async () => {
      const plaintext = "sensitive-data";
      const encrypted = await service.encrypt(plaintext);

      // Use a wrong auth tag
      const wrongTag = Buffer.alloc(16, 0xff);
      encrypted.authTag = wrongTag.toString("base64");

      await expect(service.decrypt(encrypted)).rejects.toThrow();
    });

    it("fails with wrong nonce", async () => {
      const plaintext = "sensitive-data";
      const encrypted = await service.encrypt(plaintext);

      // Use a wrong nonce
      const wrongNonce = Buffer.alloc(12, 0xff);
      encrypted.nonce = wrongNonce.toString("base64");

      await expect(service.decrypt(encrypted)).rejects.toThrow();
    });
  });

  describe("rotate", () => {
    it("re-encrypts with a new DEK", async () => {
      const plaintext = "secret-to-rotate";
      const original = await service.encrypt(plaintext);

      const rotated = await service.rotate(original);

      // Should have different encryption artifacts
      expect(rotated.encryptedValue).not.toBe(original.encryptedValue);
      expect(rotated.encryptedDek).not.toBe(original.encryptedDek);
      expect(rotated.nonce).not.toBe(original.nonce);

      // But decrypt to the same value
      const decrypted = await service.decrypt(rotated);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe("isConfigured", () => {
    it("returns true for local KMS", () => {
      expect(service.isConfigured()).toBe(true);
    });
  });
});

describe("LocalKMSProvider", () => {
  describe("constructor", () => {
    it("accepts a 64-character hex key", () => {
      const key = "0".repeat(64);
      expect(() => new LocalKMSProvider(key)).not.toThrow();
    });

    it("rejects invalid key length", () => {
      const shortKey = "0".repeat(32);
      expect(() => new LocalKMSProvider(shortKey)).toThrow("must be 64 hex characters");
    });
  });

  describe("generateDataKey", () => {
    it("returns plaintext and ciphertext", async () => {
      const kms = new LocalKMSProvider("0".repeat(64));
      const result = await kms.generateDataKey();

      expect(result.plaintext).toBeInstanceOf(Buffer);
      expect(result.plaintext.length).toBe(32); // 256 bits
      expect(result.ciphertext).toBeDefined();
      expect(typeof result.ciphertext).toBe("string");
      expect(result.keyId).toBe("local-kms-key");
    });

    it("produces unique data keys each time", async () => {
      const kms = new LocalKMSProvider("0".repeat(64));

      const result1 = await kms.generateDataKey();
      const result2 = await kms.generateDataKey();

      expect(result1.plaintext.equals(result2.plaintext)).toBe(false);
      expect(result1.ciphertext).not.toBe(result2.ciphertext);
    });
  });

  describe("decrypt", () => {
    it("decrypts an encrypted data key", async () => {
      const kms = new LocalKMSProvider("0".repeat(64));
      const { plaintext, ciphertext } = await kms.generateDataKey();

      const decrypted = await kms.decrypt(ciphertext);

      expect(decrypted.equals(plaintext)).toBe(true);
    });

    it("cannot decrypt with a different master key", async () => {
      const kms1 = new LocalKMSProvider("0".repeat(64));
      const kms2 = new LocalKMSProvider("1".repeat(64));

      const { ciphertext } = await kms1.generateDataKey();

      await expect(kms2.decrypt(ciphertext)).rejects.toThrow();
    });
  });
});

describe("End-to-end encryption workflow", () => {
  it("encrypts, stores metadata, and decrypts correctly", async () => {
    const kms = new LocalKMSProvider("a".repeat(64));
    const service = createEncryptionService(kms);

    // Simulate creating a secret
    const secretValue = "super-secret-api-key-abc123";
    const encrypted = await service.encrypt(secretValue);

    // Simulate storing in database (these would be DB columns)
    const stored = {
      encrypted_value: encrypted.encryptedValue,
      encrypted_dek: encrypted.encryptedDek,
      nonce: encrypted.nonce,
      auth_tag: encrypted.authTag,
      key_id: encrypted.keyId,
    };

    // Simulate retrieving from database and decrypting
    const decrypted = await service.decrypt({
      encryptedValue: stored.encrypted_value,
      encryptedDek: stored.encrypted_dek,
      nonce: stored.nonce,
      authTag: stored.auth_tag,
    });

    expect(decrypted).toBe(secretValue);
  });

  it("handles multiple secrets with different keys", async () => {
    const kms = new LocalKMSProvider("b".repeat(64));
    const service = createEncryptionService(kms);

    const secrets = [
      { name: "API_KEY", value: "sk-123456" },
      { name: "DATABASE_PASSWORD", value: "p@ssw0rd!" },
      { name: "JWT_SECRET", value: "jwt-hmac-secret-key" },
    ];

    // Encrypt all
    const encrypted = await Promise.all(
      secrets.map(async (s) => ({
        name: s.name,
        original: s.value,
        encrypted: await service.encrypt(s.value),
      }))
    );

    // Decrypt all and verify
    for (const item of encrypted) {
      const decrypted = await service.decrypt(item.encrypted);
      expect(decrypted).toBe(item.original);
    }
  });
});

// =============================================================================
// EDGE CASE TESTS
// =============================================================================

describe("Edge Cases and Boundary Conditions", () => {
  let service: SecretsEncryptionService;

  beforeEach(() => {
    const testKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const kms = new LocalKMSProvider(testKey);
    service = createEncryptionService(kms);
  });

  describe("Special Characters", () => {
    it("handles null bytes in plaintext", async () => {
      const plaintext = "before\x00after";
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
      expect(decrypted.includes("\x00")).toBe(true);
    });

    it("handles newlines and tabs", async () => {
      const plaintext = "line1\nline2\r\nline3\ttabbed";
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("handles backslashes and quotes", async () => {
      const plaintext = 'path\\to\\file and "quoted" and \'single\'';
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("handles control characters", async () => {
      const plaintext = "start\x01\x02\x03\x1Fend";
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("handles all printable ASCII", async () => {
      let plaintext = "";
      for (let i = 32; i < 127; i++) {
        plaintext += String.fromCharCode(i);
      }

      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
      expect(decrypted.length).toBe(95);
    });
  });

  describe("Size Boundaries", () => {
    it("handles single character", async () => {
      const plaintext = "a";
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("handles exactly 1KB", async () => {
      const plaintext = "x".repeat(1024);
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted.length).toBe(1024);
    });

    it("handles exactly 64KB boundary", async () => {
      const plaintext = "x".repeat(65536);
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted.length).toBe(65536);
    });

    it("handles just under 64KB", async () => {
      const plaintext = "x".repeat(65535);
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted.length).toBe(65535);
    });

    it("handles just over 64KB", async () => {
      const plaintext = "x".repeat(65537);
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted.length).toBe(65537);
    });
  });

  describe("Unicode and Internationalization", () => {
    it("handles emoji sequences", async () => {
      const plaintext = "👨‍👩‍👧‍👦 Family emoji and 🏳️‍🌈 flag";
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("handles RTL text", async () => {
      const plaintext = "مرحبا بالعالم";
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("handles CJK characters", async () => {
      const plaintext = "日本語 中文 한국어";
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("handles mixed scripts", async () => {
      const plaintext = "Hello Мир 世界 مرحبا";
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("handles combining characters", async () => {
      const plaintext = "café ñ ü ö";
      const encrypted = await service.encrypt(plaintext);
      const decrypted = await service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe("Tamper Detection", () => {
    it("detects bit flip in encrypted value", async () => {
      const plaintext = "sensitive-data";
      const encrypted = await service.encrypt(plaintext);

      // Flip a single bit in the middle
      const buffer = Buffer.from(encrypted.encryptedValue, "base64");
      buffer[Math.floor(buffer.length / 2)] ^= 0x01;
      encrypted.encryptedValue = buffer.toString("base64");

      await expect(service.decrypt(encrypted)).rejects.toThrow();
    });

    it("detects truncated ciphertext", async () => {
      const plaintext = "sensitive-data";
      const encrypted = await service.encrypt(plaintext);

      // Truncate the ciphertext
      const buffer = Buffer.from(encrypted.encryptedValue, "base64");
      const truncated = buffer.subarray(0, buffer.length - 5);
      encrypted.encryptedValue = truncated.toString("base64");

      await expect(service.decrypt(encrypted)).rejects.toThrow();
    });

    it("detects appended data", async () => {
      const plaintext = "sensitive-data";
      const encrypted = await service.encrypt(plaintext);

      // Append extra data
      const buffer = Buffer.from(encrypted.encryptedValue, "base64");
      const appended = Buffer.concat([buffer, Buffer.from("extra")]);
      encrypted.encryptedValue = appended.toString("base64");

      await expect(service.decrypt(encrypted)).rejects.toThrow();
    });

    it("detects swapped nonce", async () => {
      const encrypted1 = await service.encrypt("secret1");
      const encrypted2 = await service.encrypt("secret2");

      // Use nonce from second encryption with ciphertext from first
      encrypted1.nonce = encrypted2.nonce;

      await expect(service.decrypt(encrypted1)).rejects.toThrow();
    });

    it("detects swapped auth tag", async () => {
      const encrypted1 = await service.encrypt("secret1");
      const encrypted2 = await service.encrypt("secret2");

      // Use auth tag from second encryption with ciphertext from first
      encrypted1.authTag = encrypted2.authTag;

      await expect(service.decrypt(encrypted1)).rejects.toThrow();
    });
  });
});

// =============================================================================
// CONCURRENT ACCESS TESTS
// =============================================================================

describe("Concurrent Access Patterns", () => {
  let service: SecretsEncryptionService;

  beforeEach(() => {
    const testKey = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
    const kms = new LocalKMSProvider(testKey);
    service = createEncryptionService(kms);
  });

  it("handles parallel encryptions", async () => {
    const secrets = Array.from({ length: 20 }, (_, i) => `secret-${i}`);

    const results = await Promise.all(
      secrets.map(async (s) => {
        const encrypted = await service.encrypt(s);
        return { original: s, encrypted };
      })
    );

    // All should succeed
    expect(results.length).toBe(20);

    // All encrypted values should be unique
    const encryptedValues = new Set(results.map((r) => r.encrypted.encryptedValue));
    expect(encryptedValues.size).toBe(20);

    // All should decrypt correctly
    for (const { original, encrypted } of results) {
      const decrypted = await service.decrypt(encrypted);
      expect(decrypted).toBe(original);
    }
  });

  it("handles parallel decryptions", async () => {
    // First encrypt all
    const secrets = Array.from({ length: 20 }, (_, i) => `secret-${i}`);
    const encrypted = await Promise.all(
      secrets.map(async (s) => ({
        original: s,
        encrypted: await service.encrypt(s),
      }))
    );

    // Then decrypt all in parallel
    const decrypted = await Promise.all(
      encrypted.map(async ({ original, encrypted: enc }) => ({
        original,
        decrypted: await service.decrypt(enc),
      }))
    );

    // All should match
    for (const { original, decrypted: dec } of decrypted) {
      expect(dec).toBe(original);
    }
  });

  it("handles mixed encrypt/decrypt operations", async () => {
    const operations = [];

    // Mix of operations
    for (let i = 0; i < 10; i++) {
      operations.push(service.encrypt(`encrypt-${i}`));
    }

    // Pre-encrypt some for decryption
    const preEncrypted = await Promise.all(
      Array.from({ length: 10 }, (_, i) => service.encrypt(`decrypt-${i}`))
    );

    // Add decryption operations
    for (const enc of preEncrypted) {
      operations.push(service.decrypt(enc));
    }

    // Run all mixed operations
    const results = await Promise.allSettled(operations);

    // All should succeed
    const failures = results.filter((r) => r.status === "rejected");
    expect(failures.length).toBe(0);
  });
});

// =============================================================================
// KEY ROTATION TESTS
// =============================================================================

describe("Key Rotation Scenarios", () => {
  it("preserves data through rotation", async () => {
    const testKey = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const kms = new LocalKMSProvider(testKey);
    const service = createEncryptionService(kms);

    const originalValue = "value-to-preserve";
    const original = await service.encrypt(originalValue);

    // Rotate the secret
    const rotated = await service.rotate(original);

    // Should decrypt to same value
    const decrypted = await service.decrypt(rotated);
    expect(decrypted).toBe(originalValue);
  });

  it("generates new DEK on rotation", async () => {
    const testKey = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    const kms = new LocalKMSProvider(testKey);
    const service = createEncryptionService(kms);

    const original = await service.encrypt("test-value");
    const rotated = await service.rotate(original);

    // DEK should be different
    expect(rotated.encryptedDek).not.toBe(original.encryptedDek);

    // Nonce should be different
    expect(rotated.nonce).not.toBe(original.nonce);

    // Auth tag should be different
    expect(rotated.authTag).not.toBe(original.authTag);
  });

  it("handles multiple sequential rotations", async () => {
    const testKey = "9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba";
    const kms = new LocalKMSProvider(testKey);
    const service = createEncryptionService(kms);

    const originalValue = "rotate-multiple-times";
    let current = await service.encrypt(originalValue);

    // Rotate 5 times
    for (let i = 0; i < 5; i++) {
      current = await service.rotate(current);
    }

    // Should still decrypt correctly
    const decrypted = await service.decrypt(current);
    expect(decrypted).toBe(originalValue);
  });
});

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

describe("Error Handling", () => {
  it("provides meaningful error for invalid base64 in ciphertext", async () => {
    const testKey = "0".repeat(64);
    const kms = new LocalKMSProvider(testKey);
    const service = createEncryptionService(kms);

    const encrypted = await service.encrypt("test");
    encrypted.encryptedValue = "not-valid-base64!!!";

    await expect(service.decrypt(encrypted)).rejects.toThrow();
  });

  it("provides meaningful error for invalid base64 in DEK", async () => {
    const testKey = "0".repeat(64);
    const kms = new LocalKMSProvider(testKey);
    const service = createEncryptionService(kms);

    const encrypted = await service.encrypt("test");
    encrypted.encryptedDek = "not-valid-base64!!!";

    await expect(service.decrypt(encrypted)).rejects.toThrow();
  });

  it("provides meaningful error for invalid base64 in nonce", async () => {
    const testKey = "0".repeat(64);
    const kms = new LocalKMSProvider(testKey);
    const service = createEncryptionService(kms);

    const encrypted = await service.encrypt("test");
    encrypted.nonce = "not-valid-base64!!!";

    await expect(service.decrypt(encrypted)).rejects.toThrow();
  });

  it("provides meaningful error for invalid base64 in auth tag", async () => {
    const testKey = "0".repeat(64);
    const kms = new LocalKMSProvider(testKey);
    const service = createEncryptionService(kms);

    const encrypted = await service.encrypt("test");
    encrypted.authTag = "not-valid-base64!!!";

    await expect(service.decrypt(encrypted)).rejects.toThrow();
  });
});

