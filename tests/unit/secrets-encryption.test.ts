/**
 * Unit Tests: Secrets Encryption Service
 *
 * Tests the encryption/decryption functionality using AES-256-GCM
 * with envelope encryption (DEK + KEK pattern).
 */

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

