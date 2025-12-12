import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import { AWSKMSProvider } from "@/lib/services/secrets/encryption";

// Mock AWS SDK
const mockSend = mock(() => Promise.resolve({
  Plaintext: new Uint8Array(32).fill(1),
  CiphertextBlob: new Uint8Array(48).fill(2),
}));

const MockKMSClient = mock(function() {
  return { send: mockSend };
});

const MockGenerateDataKeyCommand = mock(function(params: unknown) {
  return { type: "GenerateDataKey", params };
});

const MockDecryptCommand = mock(function(params: unknown) {
  return { type: "Decrypt", params };
});

mock.module("@aws-sdk/client-kms", () => ({
  KMSClient: MockKMSClient,
  GenerateDataKeyCommand: MockGenerateDataKeyCommand,
  DecryptCommand: MockDecryptCommand,
}));

describe("AWSKMSProvider", () => {
  beforeEach(() => {
    mockSend.mockClear();
    MockKMSClient.mockClear();
    MockGenerateDataKeyCommand.mockClear();
    MockDecryptCommand.mockClear();
    
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

  describe("generateDataKey", () => {
    it("calls KMS with correct parameters", async () => {
      process.env.AWS_KMS_KEY_ID = "test-key-id";
      const provider = new AWSKMSProvider();
      
      const result = await provider.generateDataKey();
      
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(MockGenerateDataKeyCommand).toHaveBeenCalledWith({
        KeyId: "test-key-id",
        KeySpec: "AES_256",
      });
      expect(result.keyId).toBe("test-key-id");
      expect(result.plaintext).toBeInstanceOf(Buffer);
      expect(result.ciphertext).toBeDefined();
    });

    it("throws on empty response", async () => {
      mockSend.mockResolvedValueOnce({});
      process.env.AWS_KMS_KEY_ID = "test-key";
      const provider = new AWSKMSProvider();
      
      await expect(provider.generateDataKey()).rejects.toThrow("empty response");
    });

    it("reuses KMS client across calls", async () => {
      process.env.AWS_KMS_KEY_ID = "test-key";
      const provider = new AWSKMSProvider();
      
      await provider.generateDataKey();
      await provider.generateDataKey();
      
      // Client should only be created once
      expect(MockKMSClient).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe("decrypt", () => {
    it("calls KMS decrypt with correct parameters", async () => {
      process.env.AWS_KMS_KEY_ID = "test-key-id";
      const provider = new AWSKMSProvider();
      
      const testCiphertext = Buffer.from("test-encrypted-data").toString("base64");
      const result = await provider.decrypt(testCiphertext);
      
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(MockDecryptCommand).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Buffer);
    });

    it("throws on empty plaintext response", async () => {
      mockSend.mockResolvedValueOnce({ Plaintext: undefined });
      process.env.AWS_KMS_KEY_ID = "test-key";
      const provider = new AWSKMSProvider();
      
      await expect(provider.decrypt("dGVzdA==")).rejects.toThrow("empty response");
    });
  });

  describe("Credential handling", () => {
    it("uses explicit credentials when provided", async () => {
      process.env.AWS_KMS_KEY_ID = "test-key";
      process.env.AWS_ACCESS_KEY_ID = "AKIATEST";
      process.env.AWS_SECRET_ACCESS_KEY = "secret123";
      
      const provider = new AWSKMSProvider();
      await provider.generateDataKey();
      
      // KMSClient should be constructed with credentials
      expect(MockKMSClient).toHaveBeenCalled();
    });

    it("works without explicit credentials (uses IAM role)", async () => {
      process.env.AWS_KMS_KEY_ID = "test-key";
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      
      const provider = new AWSKMSProvider();
      await provider.generateDataKey();
      
      expect(MockKMSClient).toHaveBeenCalled();
    });
  });
});

describe("SecretsEncryptionService with AWS KMS", () => {
  it("selects AWS KMS when key ID is set", async () => {
    process.env.AWS_KMS_KEY_ID = "test-key";
    
    // Dynamic import to pick up env change
    const { SecretsEncryptionService } = await import("@/lib/services/secrets/encryption");
    const service = new SecretsEncryptionService();
    
    expect(service.isConfigured()).toBe(true);
  });
});

