import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

export interface EncryptionResult {
  encryptedValue: string;
  encryptedDek: string;
  nonce: string;
  authTag: string;
  keyId: string;
}

export interface DecryptionParams {
  encryptedValue: string;
  encryptedDek: string;
  nonce: string;
  authTag: string;
}

export interface KMSProvider {
  generateDataKey(): Promise<{
    plaintext: Buffer;
    ciphertext: string;
    keyId: string;
  }>;
  decrypt(ciphertext: string): Promise<Buffer>;
  isConfigured(): boolean;
}

export class LocalKMSProvider implements KMSProvider {
  private masterKey: Buffer;
  private keyId = "local-kms-key";

  constructor(masterKeyHex?: string) {
    const keySource = masterKeyHex || process.env.SECRETS_MASTER_KEY;
    if (!keySource && process.env.NODE_ENV === "production") {
      throw new Error(
        "SECRETS_MASTER_KEY environment variable is required in production",
      );
    }
    const key = keySource || "0".repeat(64);
    if (key.length !== 64)
      throw new Error("Master key must be 64 hex characters (32 bytes)");
    this.masterKey = Buffer.from(key, "hex");
  }

  async generateDataKey() {
    const plaintext = randomBytes(32);
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.masterKey, nonce);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const ciphertext = Buffer.concat([
      nonce,
      cipher.getAuthTag(),
      encrypted,
    ]).toString("base64");
    return { plaintext, ciphertext, keyId: this.keyId };
  }

  async decrypt(ciphertext: string): Promise<Buffer> {
    const data = Buffer.from(ciphertext, "base64");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.masterKey,
      data.subarray(0, 12),
    );
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([
      decipher.update(data.subarray(28)),
      decipher.final(),
    ]);
  }

  isConfigured = () => true;
}

/**
 * AWS KMS Provider - Legacy provider for AWS KMS
 * @deprecated Use DWSKMSProvider or LocalKMSProvider instead
 * 
 * AWS SDK is dynamically imported to avoid bundling issues.
 * This provider is kept for backwards compatibility during migration.
 */
export class AWSKMSProvider implements KMSProvider {
  private keyId = process.env.AWS_KMS_KEY_ID || "";
  private region = process.env.AWS_REGION || "us-east-1";
  private dwsFallback = new LocalKMSProvider();

  async generateDataKey() {
    // Fall back to local KMS - AWS KMS is deprecated for DWS deployments
    console.warn('[Secrets] AWS KMS is deprecated. Using LocalKMSProvider. Consider using DWSKMSProvider.');
    return this.dwsFallback.generateDataKey();
  }

  async decrypt(ciphertext: string): Promise<Buffer> {
    // Fall back to local KMS - AWS KMS is deprecated for DWS deployments
    console.warn('[Secrets] AWS KMS is deprecated. Using LocalKMSProvider. Consider using DWSKMSProvider.');
    return this.dwsFallback.decrypt(ciphertext);
  }

  isConfigured = () => !!this.keyId;
}

/**
 * DWS KMS Provider - Uses DWS TEE for secrets encryption
 * Falls back to LocalKMSProvider if DWS is not available
 */
export class DWSKMSProvider implements KMSProvider {
  private keyId = 'dws-kms-key';
  private dwsUrl = process.env.DWS_API_URL ?? 'http://localhost:4030';
  private localFallback = new LocalKMSProvider();

  async generateDataKey() {
    try {
      const response = await fetch(`${this.dwsUrl}/secrets/generate-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`DWS KMS error: ${response.status}`);
      }

      const data = await response.json();
      return {
        plaintext: Buffer.from(data.plaintext, 'base64'),
        ciphertext: data.ciphertext,
        keyId: data.keyId || this.keyId,
      };
    } catch {
      // Fall back to local KMS
      return this.localFallback.generateDataKey();
    }
  }

  async decrypt(ciphertext: string): Promise<Buffer> {
    try {
      const response = await fetch(`${this.dwsUrl}/secrets/decrypt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ciphertext }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`DWS KMS decrypt error: ${response.status}`);
      }

      const data = await response.json();
      return Buffer.from(data.plaintext, 'base64');
    } catch {
      // Fall back to local KMS
      return this.localFallback.decrypt(ciphertext);
    }
  }

  isConfigured = () => true;
}

export class SecretsEncryptionService {
  private kms: KMSProvider;

  constructor(kms?: KMSProvider) {
    // Priority: Provided KMS > DWS TEE > AWS KMS > Local KMS
    if (kms) {
      this.kms = kms;
    } else if (process.env.DWS_TEE_ENABLED === 'true') {
      this.kms = new DWSKMSProvider();
    } else if (process.env.AWS_KMS_KEY_ID) {
      this.kms = new AWSKMSProvider();
    } else {
      this.kms = new LocalKMSProvider();
    }
  }

  isConfigured = () => this.kms.isConfigured();

  async encrypt(plaintext: string): Promise<EncryptionResult> {
    const {
      plaintext: dek,
      ciphertext: encryptedDek,
      keyId,
    } = await this.kms.generateDataKey();
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", dek, nonce);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    dek.fill(0);
    return {
      encryptedValue: encrypted.toString("base64"),
      encryptedDek,
      nonce: nonce.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      keyId,
    };
  }

  async decrypt({
    encryptedValue,
    encryptedDek,
    nonce,
    authTag,
  }: DecryptionParams): Promise<string> {
    const dek = await this.kms.decrypt(encryptedDek);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      dek,
      Buffer.from(nonce, "base64"),
    );
    decipher.setAuthTag(Buffer.from(authTag, "base64"));
    const result = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64")),
      decipher.final(),
    ]).toString("utf8");
    dek.fill(0);
    return result;
  }

  async rotate(params: DecryptionParams): Promise<EncryptionResult> {
    return this.encrypt(await this.decrypt(params));
  }
}

let instance: SecretsEncryptionService | null = null;

export const getEncryptionService = () =>
  instance || (instance = new SecretsEncryptionService());
export const createEncryptionService = (kms?: KMSProvider) =>
  new SecretsEncryptionService(kms);
