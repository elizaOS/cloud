/**
 * Secrets Encryption Service
 *
 * Implements envelope encryption for secrets:
 * 1. Generate a unique DEK (Data Encryption Key) via KMS
 * 2. Encrypt the secret with DEK using AES-256-GCM
 * 3. Encrypt DEK with KMS KEK (Key Encryption Key)
 * 4. Store encrypted secret + encrypted DEK + nonce
 *
 * On decryption:
 * 1. Decrypt DEK using KMS
 * 2. Decrypt secret using DEK
 * 3. Zero out DEK from memory
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { logger } from "@/lib/utils/logger";

export interface EncryptionResult {
  encryptedValue: string; // Base64 encoded ciphertext
  encryptedDek: string; // Base64 encoded encrypted DEK
  nonce: string; // Base64 encoded IV
  authTag: string; // Base64 encoded GCM auth tag
  keyId: string; // KMS key identifier
}

export interface DecryptionParams {
  encryptedValue: string;
  encryptedDek: string;
  nonce: string;
  authTag: string;
}

export interface KMSProvider {
  /**
   * Generate a new data encryption key.
   * Returns both plaintext (for immediate use) and ciphertext (for storage).
   */
  generateDataKey(): Promise<{
    plaintext: Buffer;
    ciphertext: string;
    keyId: string;
  }>;

  /**
   * Decrypt an encrypted data key.
   */
  decrypt(ciphertext: string): Promise<Buffer>;

  /**
   * Check if KMS is properly configured.
   */
  isConfigured(): boolean;
}

/** Local KMS provider for development/testing. Use real KMS in production. */
export class LocalKMSProvider implements KMSProvider {
  private masterKey: Buffer;
  private keyId: string;

  constructor(masterKeyHex?: string) {
    // Use provided key or generate from env/random
    const keySource =
      masterKeyHex ||
      process.env.SECRETS_MASTER_KEY ||
      // Default dev key (32 bytes = 256 bits)
      "0000000000000000000000000000000000000000000000000000000000000000";

    if (keySource.length !== 64) {
      throw new Error("Master key must be 64 hex characters (32 bytes)");
    }

    this.masterKey = Buffer.from(keySource, "hex");
    this.keyId = "local-kms-key";

    if (!process.env.SECRETS_MASTER_KEY && process.env.NODE_ENV === "production") {
      logger.warn(
        "[LocalKMS] Using default master key in production! Set SECRETS_MASTER_KEY env var."
      );
    }
  }

  async generateDataKey(): Promise<{
    plaintext: Buffer;
    ciphertext: string;
    keyId: string;
  }> {
    // Generate random 256-bit DEK
    const plaintext = randomBytes(32);

    // Encrypt DEK with master key using AES-256-GCM
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.masterKey, nonce);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Pack nonce + authTag + ciphertext
    const ciphertext = Buffer.concat([nonce, authTag, encrypted]).toString("base64");

    return { plaintext, ciphertext, keyId: this.keyId };
  }

  async decrypt(ciphertext: string): Promise<Buffer> {
    const data = Buffer.from(ciphertext, "base64");

    // Unpack nonce + authTag + ciphertext
    const nonce = data.subarray(0, 12);
    const authTag = data.subarray(12, 28);
    const encrypted = data.subarray(28);

    const decipher = createDecipheriv("aes-256-gcm", this.masterKey, nonce);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  isConfigured(): boolean {
    return true; // Always configured for local
  }
}

/** AWS KMS provider for production use. */
export class AWSKMSProvider implements KMSProvider {
  private keyId: string;
  private region: string;
  private client: KMSClientType | null = null;

  constructor() {
    this.keyId = process.env.AWS_KMS_KEY_ID || "";
    this.region = process.env.AWS_REGION || "us-east-1";
  }

  private async getClient(): Promise<KMSClientType> {
    if (this.client) return this.client;

    const { KMSClient } = await import("@aws-sdk/client-kms");
    this.client = new KMSClient({
      region: this.region,
      ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });

    return this.client;
  }

  async generateDataKey(): Promise<{
    plaintext: Buffer;
    ciphertext: string;
    keyId: string;
  }> {
    const { GenerateDataKeyCommand } = await import("@aws-sdk/client-kms");
    const client = await this.getClient();

    const response = await client.send(
      new GenerateDataKeyCommand({
        KeyId: this.keyId,
        KeySpec: "AES_256",
      })
    );

    if (!response.Plaintext || !response.CiphertextBlob) {
      throw new Error("KMS GenerateDataKey returned empty response");
    }

    return {
      plaintext: Buffer.from(response.Plaintext),
      ciphertext: Buffer.from(response.CiphertextBlob).toString("base64"),
      keyId: this.keyId,
    };
  }

  async decrypt(ciphertext: string): Promise<Buffer> {
    const { DecryptCommand } = await import("@aws-sdk/client-kms");
    const client = await this.getClient();

    const response = await client.send(
      new DecryptCommand({
        CiphertextBlob: Buffer.from(ciphertext, "base64"),
        KeyId: this.keyId,
      })
    );

    if (!response.Plaintext) {
      throw new Error("KMS Decrypt returned empty response");
    }

    return Buffer.from(response.Plaintext);
  }

  isConfigured(): boolean {
    return !!this.keyId;
  }
}

type KMSClientType = {
  send(command: unknown): Promise<{ Plaintext?: Uint8Array; CiphertextBlob?: Uint8Array }>;
};

export class SecretsEncryptionService {
  private kms: KMSProvider;

  constructor(kms?: KMSProvider) {
    // Auto-select KMS provider based on configuration
    if (kms) {
      this.kms = kms;
    } else if (process.env.AWS_KMS_KEY_ID) {
      this.kms = new AWSKMSProvider();
      logger.info("[SecretsEncryption] Using AWS KMS provider");
    } else {
      this.kms = new LocalKMSProvider();
      logger.info("[SecretsEncryption] Using local KMS provider (development mode)");
    }
  }

  isConfigured(): boolean {
    return this.kms.isConfigured();
  }

  async encrypt(plaintext: string): Promise<EncryptionResult> {
    const { plaintext: dekPlaintext, ciphertext: encryptedDek, keyId } = await this.kms.generateDataKey();
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", dekPlaintext, nonce);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    dekPlaintext.fill(0);

    return {
      encryptedValue: encrypted.toString("base64"),
      encryptedDek,
      nonce: nonce.toString("base64"),
      authTag: authTag.toString("base64"),
      keyId,
    };
  }

  async decrypt(params: DecryptionParams): Promise<string> {
    const { encryptedValue, encryptedDek, nonce, authTag } = params;
    const dekPlaintext = await this.kms.decrypt(encryptedDek);
    const decipher = createDecipheriv("aes-256-gcm", dekPlaintext, Buffer.from(nonce, "base64"));
    decipher.setAuthTag(Buffer.from(authTag, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64")), decipher.final()]).toString("utf8");
    dekPlaintext.fill(0);
    return plaintext;
  }

  async rotate(params: DecryptionParams): Promise<EncryptionResult> {
    return this.encrypt(await this.decrypt(params));
  }
}

let instance: SecretsEncryptionService | null = null;

export function getEncryptionService(): SecretsEncryptionService {
  return instance || (instance = new SecretsEncryptionService());
}

export function createEncryptionService(kms?: KMSProvider): SecretsEncryptionService {
  return new SecretsEncryptionService(kms);
}

