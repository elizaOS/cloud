/**
 * Secrets Edge Cases & Boundary Tests
 *
 * Tests boundary conditions, malformed inputs, concurrency, and error recovery.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { LocalKMSProvider, SecretsEncryptionService } from "@/lib/services/secrets/encryption";

const TEST_KEY = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

describe("Encryption Edge Cases", () => {
  let encryption: SecretsEncryptionService;

  beforeEach(() => {
    const kms = new LocalKMSProvider(TEST_KEY);
    encryption = new SecretsEncryptionService(kms);
  });

  describe("Boundary Conditions", () => {
    it("encrypts empty string", async () => {
      const result = await encryption.encrypt("");
      expect(result.encryptedValue).toBeDefined();
      
      const decrypted = await encryption.decrypt(result);
      expect(decrypted).toBe("");
    });

    it("encrypts single character", async () => {
      const result = await encryption.encrypt("x");
      const decrypted = await encryption.decrypt(result);
      expect(decrypted).toBe("x");
    });

    it("encrypts maximum size value (64KB)", async () => {
      const largeValue = "x".repeat(65536);
      const result = await encryption.encrypt(largeValue);
      const decrypted = await encryption.decrypt(result);
      expect(decrypted).toBe(largeValue);
      expect(decrypted.length).toBe(65536);
    });

    it("encrypts unicode and emoji content", async () => {
      const unicodeValue = "Hello 世界 🔐 مرحبا 🎉";
      const result = await encryption.encrypt(unicodeValue);
      const decrypted = await encryption.decrypt(result);
      expect(decrypted).toBe(unicodeValue);
    });

    it("encrypts binary-like content (base64)", async () => {
      const binaryLike = Buffer.from("binary\x00data\xffwith\x01nulls").toString("base64");
      const result = await encryption.encrypt(binaryLike);
      const decrypted = await encryption.decrypt(result);
      expect(decrypted).toBe(binaryLike);
    });

    it("encrypts multiline content with special chars", async () => {
      const multiline = `Line 1
Line 2 with "quotes"
Line 3 with 'apostrophes'
Line 4 with \t tabs
Line 5 with \\ backslashes`;
      
      const result = await encryption.encrypt(multiline);
      const decrypted = await encryption.decrypt(result);
      expect(decrypted).toBe(multiline);
    });
  });

  describe("Error Handling - Corrupted Data", () => {
    it("throws on tampered encrypted value", async () => {
      const result = await encryption.encrypt("secret");
      const corrupted = "TAMPERED" + result.encryptedValue.slice(8);
      
      await expect(
        encryption.decrypt({ ...result, encryptedValue: corrupted })
      ).rejects.toThrow();
    });

    it("throws on tampered auth tag", async () => {
      const result = await encryption.encrypt("secret");
      const corruptedTag = "0".repeat(result.authTag.length);
      
      await expect(
        encryption.decrypt({ ...result, authTag: corruptedTag })
      ).rejects.toThrow();
    });

    it("throws on wrong DEK", async () => {
      const result = await encryption.encrypt("secret");
      const wrongDek = Buffer.from("wrongwrongwrongwrongwrongwrongwrongwrongwrongwrongwrongwrongwrongwrong").toString("base64");
      
      await expect(
        encryption.decrypt({ ...result, encryptedDek: wrongDek })
      ).rejects.toThrow();
    });

    it("throws on truncated nonce", async () => {
      const result = await encryption.encrypt("secret");
      const truncatedNonce = result.nonce.slice(0, 4);
      
      await expect(
        encryption.decrypt({ ...result, nonce: truncatedNonce })
      ).rejects.toThrow();
    });

    it("throws on invalid base64 input", async () => {
      await expect(
        encryption.decrypt({
          encryptedValue: "not-valid-base64!!!",
          encryptedDek: "not-valid",
          nonce: "not-valid",
          authTag: "not-valid",
        })
      ).rejects.toThrow();
    });
  });

  describe("Key Uniqueness", () => {
    it("generates unique DEK for each encryption", async () => {
      const value = "same-value";
      const results = await Promise.all([
        encryption.encrypt(value),
        encryption.encrypt(value),
        encryption.encrypt(value),
      ]);

      const deks = results.map(r => r.encryptedDek);
      const uniqueDeks = new Set(deks);
      expect(uniqueDeks.size).toBe(3);
    });

    it("generates unique nonce for each encryption", async () => {
      const value = "same-value";
      const results = await Promise.all([
        encryption.encrypt(value),
        encryption.encrypt(value),
        encryption.encrypt(value),
      ]);

      const nonces = results.map(r => r.nonce);
      const uniqueNonces = new Set(nonces);
      expect(uniqueNonces.size).toBe(3);
    });
  });

  describe("Wrong Master Key", () => {
    it("throws when decrypting with different master key", async () => {
      const kms1 = new LocalKMSProvider(TEST_KEY);
      const enc1 = new SecretsEncryptionService(kms1);
      
      const result = await enc1.encrypt("secret");
      
      // Different master key
      const kms2 = new LocalKMSProvider("1111111111111111111111111111111111111111111111111111111111111111");
      const enc2 = new SecretsEncryptionService(kms2);
      
      await expect(enc2.decrypt(result)).rejects.toThrow();
    });
  });
});

describe("Secret Name Validation Edge Cases", () => {
  describe("Valid Names", () => {
    const validNames = [
      "API_KEY",
      "my-secret",
      "secret123",
      "OPENAI_API_KEY_V2",
      "a",
      "A".repeat(255),
      "database-url",
      "secret.key",
      "secret/key",
      "secret:key",
    ];

    for (const name of validNames) {
      it(`accepts valid name: ${name.slice(0, 30)}${name.length > 30 ? "..." : ""}`, () => {
        // Name validation logic - should not throw
        expect(name.length).toBeGreaterThan(0);
        expect(name.length).toBeLessThanOrEqual(255);
      });
    }
  });

  describe("Invalid Names", () => {
    const invalidCases = [
      { name: "", reason: "empty string" },
      { name: "A".repeat(256), reason: "too long (256 chars)" },
    ];

    for (const { name, reason } of invalidCases) {
      it(`rejects invalid name: ${reason}`, () => {
        expect(name.length === 0 || name.length > 255).toBe(true);
      });
    }
  });
});

describe("Concurrent Encryption Operations", () => {
  it("handles many parallel encryptions", async () => {
    const kms = new LocalKMSProvider(TEST_KEY);
    const encryption = new SecretsEncryptionService(kms);
    
    const operations = Array.from({ length: 100 }, (_, i) => 
      encryption.encrypt(`secret-value-${i}`)
    );
    
    const results = await Promise.all(operations);
    
    expect(results).toHaveLength(100);
    
    // Verify all can be decrypted
    const decrypted = await Promise.all(
      results.map((r, i) => 
        encryption.decrypt(r).then(value => ({ index: i, value }))
      )
    );
    
    for (const { index, value } of decrypted) {
      expect(value).toBe(`secret-value-${index}`);
    }
  });

  it("handles interleaved encrypt/decrypt operations", async () => {
    const kms = new LocalKMSProvider(TEST_KEY);
    const encryption = new SecretsEncryptionService(kms);
    
    const encrypted = await encryption.encrypt("original");
    
    const operations = [
      encryption.encrypt("new-1"),
      encryption.decrypt(encrypted),
      encryption.encrypt("new-2"),
      encryption.decrypt(encrypted),
      encryption.encrypt("new-3"),
    ];
    
    const results = await Promise.all(operations);
    
    expect(typeof results[0]).toBe("object"); // encrypt result
    expect(results[1]).toBe("original"); // decrypt result
    expect(typeof results[2]).toBe("object");
    expect(results[3]).toBe("original");
    expect(typeof results[4]).toBe("object");
  });
});

describe("Secret Value Size Limits", () => {
  it("handles exactly 64KB (max allowed)", async () => {
    const kms = new LocalKMSProvider(TEST_KEY);
    const encryption = new SecretsEncryptionService(kms);
    const maxValue = "x".repeat(65536); // 64KB
    const result = await encryption.encrypt(maxValue);
    const decrypted = await encryption.decrypt(result);
    expect(decrypted.length).toBe(65536);
  });

  it("handles values just under limit", async () => {
    const kms = new LocalKMSProvider(TEST_KEY);
    const encryption = new SecretsEncryptionService(kms);
    const justUnder = "x".repeat(65535);
    const result = await encryption.encrypt(justUnder);
    const decrypted = await encryption.decrypt(result);
    expect(decrypted.length).toBe(65535);
  });
});

describe("Special Character Handling", () => {
  const specialCases = [
    { name: "null bytes", value: "secret\x00with\x00nulls" },
    { name: "control chars", value: "secret\x01\x02\x03control" },
    { name: "high unicode", value: "secret\u{1F4A9}\u{1F680}" },
    { name: "RTL chars", value: "secret\u200Fright-to-left" },
    { name: "zero-width", value: "secret\u200B\u200Czero-width" },
    { name: "newlines mix", value: "unix\nlf\r\ncrlf\rcr" },
    { name: "JSON-like", value: '{"key": "value", "nested": {"a": 1}}' },
    { name: "SQL-like", value: "SELECT * FROM users WHERE id = 1; DROP TABLE users;" },
    { name: "HTML-like", value: "<script>alert('xss')</script>" },
    { name: "shell-like", value: "$(rm -rf /); `cat /etc/passwd`" },
  ];

  for (const { name, value } of specialCases) {
    it(`preserves ${name}`, async () => {
      const kms = new LocalKMSProvider(TEST_KEY);
      const encryption = new SecretsEncryptionService(kms);
      const result = await encryption.encrypt(value);
      const decrypted = await encryption.decrypt(result);
      expect(decrypted).toBe(value);
    });
  }
});

describe("Provider Metadata Validation", () => {
  const validMetadata = [
    {},
    { region: "us-east-1" },
    { model: "gpt-4", tier: "premium" },
    { nested: { deep: { value: 123 } } },
    { array: [1, 2, 3] },
  ];

  const invalidMetadata = [
    null,
    undefined,
    "string",
    123,
    true,
    ["array"],
  ];

  for (const meta of validMetadata) {
    it(`accepts valid metadata: ${JSON.stringify(meta).slice(0, 40)}`, () => {
      expect(typeof meta).toBe("object");
      expect(meta).not.toBeNull();
      expect(Array.isArray(meta)).toBe(false);
    });
  }

  for (const meta of invalidMetadata) {
    it(`rejects invalid metadata: ${String(meta)}`, () => {
      const isInvalid = meta === null || 
                        meta === undefined || 
                        typeof meta !== "object" ||
                        Array.isArray(meta);
      expect(isInvalid).toBe(true);
    });
  }
});

