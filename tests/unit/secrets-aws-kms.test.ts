import { describe, it, expect, beforeEach } from "bun:test";
import { AWSKMSProvider } from "@/lib/services/secrets/encryption";

/**
 * AWS KMS Provider Tests
 * 
 * Note: AWSKMSProvider is deprecated and now falls back to LocalKMSProvider.
 * These tests verify the deprecation behavior and fallback logic.
 */

describe("AWSKMSProvider (Deprecated)", () => {
  beforeEach(() => {
    // Reset env
    process.env.AWS_KMS_KEY_ID = "test-key-id";
    process.env.AWS_REGION = "us-west-2";
  });

  describe("Configuration", () => {
    it("reads key ID from environment", () => {
      process.env.AWS_KMS_KEY_ID = "arn:aws:kms:us-east-1:123456789:key/test";
      const provider = new AWSKMSProvider();
      expect(provider.isConfigured()).toBe(true);
    });

    it("is not configured when no key ID", () => {
      delete process.env.AWS_KMS_KEY_ID;
      const provider = new AWSKMSProvider();
      expect(provider.isConfigured()).toBe(false);
    });

    it("uses default region when not specified", () => {
      delete process.env.AWS_REGION;
      process.env.AWS_KMS_KEY_ID = "test-key";
      const provider = new AWSKMSProvider();
      expect(provider.isConfigured()).toBe(true);
    });
  });

  describe("Fallback to LocalKMSProvider", () => {
    it("generateDataKey falls back to LocalKMSProvider", async () => {
      process.env.AWS_KMS_KEY_ID = "test-key-id";
      const provider = new AWSKMSProvider();

      const result = await provider.generateDataKey();

      // Should return a valid result from LocalKMSProvider
      expect(result.keyId).toBe("local-kms-key");
      expect(result.plaintext).toBeInstanceOf(Buffer);
      expect(result.plaintext.length).toBe(32);
      expect(result.ciphertext).toBeDefined();
    });

    it("decrypt falls back to LocalKMSProvider", async () => {
      process.env.AWS_KMS_KEY_ID = "test-key-id";
      const provider = new AWSKMSProvider();

      // Generate a key and then decrypt the ciphertext
      const { plaintext, ciphertext } = await provider.generateDataKey();
      const decrypted = await provider.decrypt(ciphertext);

      expect(decrypted).toBeInstanceOf(Buffer);
      expect(decrypted.length).toBe(32);
      // The decrypted key should match the original plaintext
      expect(decrypted.toString("hex")).toBe(plaintext.toString("hex"));
    });

    it("decrypt rejects invalid ciphertext gracefully", async () => {
      process.env.AWS_KMS_KEY_ID = "test-key-id";
      const provider = new AWSKMSProvider();

      // Invalid base64 that decodes to something too short
      const invalidCiphertext = Buffer.from("invalid").toString("base64");
      
      await expect(provider.decrypt(invalidCiphertext)).rejects.toThrow();
    });
  });
});

describe("SecretsEncryptionService with AWS KMS", () => {
  it("selects AWS KMS when key ID is set", async () => {
    process.env.AWS_KMS_KEY_ID = "test-key";

    // Dynamic import to pick up env change
    const { SecretsEncryptionService } =
      await import("@/lib/services/secrets/encryption");
    const service = new SecretsEncryptionService();

    expect(service.isConfigured()).toBe(true);
  });
});
