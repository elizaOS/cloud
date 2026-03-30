import { beforeEach, describe, expect, it, mock } from "bun:test";
import crypto from "crypto";

const dbReadFindFirst = mock(async () => null);
const dbWriteFindFirst = mock(async () => null);
const insertReturning = mock(async () => []);
const loggerWarn = mock(() => undefined);
const loggerInfo = mock(() => undefined);
const loggerError = mock(() => undefined);

const mockDbRead = {
  query: {
    organizationEncryptionKeys: {
      findFirst: (...args: unknown[]) => dbReadFindFirst(...args),
    },
  },
};

const mockDbWrite = {
  query: {
    organizationEncryptionKeys: {
      findFirst: (...args: unknown[]) => dbWriteFindFirst(...args),
    },
  },
  insert: () => ({
    values: () => ({
      onConflictDoNothing: () => ({
        returning: insertReturning,
      }),
    }),
  }),
  update: () => ({
    set: () => ({
      where: async () => undefined,
    }),
  }),
};

mock.module("@/db/helpers", () => ({
  writeTransaction: async (fn: (tx: unknown) => unknown) => fn({}),
  dbRead: mockDbRead,
  dbWrite: mockDbWrite,
}));

mock.module("@/lib/utils/logger", () => ({
  logger: {
    warn: (...args: unknown[]) => loggerWarn(...args),
    info: (...args: unknown[]) => loggerInfo(...args),
    error: (...args: unknown[]) => loggerError(...args),
  },
}));

const TEST_MASTER_KEY = "11".repeat(32);

function wrapDekForTest(dek: Buffer, masterKeyHex: string): string {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(masterKeyHex, "hex"), nonce);
  const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [nonce.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(
    ":",
  );
}

function createOrgKey(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "key-1",
    organization_id: "org-1",
    encrypted_dek: wrapDekForTest(Buffer.alloc(32, 7), TEST_MASTER_KEY),
    key_version: 1,
    rotated_at: null,
    ...overrides,
  };
}

async function loadService() {
  const { FieldEncryptionService } = await import("@/lib/services/field-encryption");
  return new FieldEncryptionService();
}

describe("FieldEncryptionService", () => {
  beforeEach(() => {
    dbReadFindFirst.mockReset();
    dbWriteFindFirst.mockReset();
    insertReturning.mockReset();
    loggerWarn.mockReset();
    loggerInfo.mockReset();
    loggerError.mockReset();
    process.env.SECRETS_MASTER_KEY = TEST_MASTER_KEY;
  });

  it("encrypts and decrypts values with the organization key", async () => {
    const orgKey = createOrgKey();
    dbReadFindFirst.mockResolvedValue(orgKey);
    dbWriteFindFirst.mockResolvedValue(orgKey);

    const service = await loadService();
    const plaintext = "postgres://user:password@db.example.com/app";

    const encrypted = await service.encrypt("org-1", plaintext);
    expect(encrypted.startsWith(`enc:v1:${orgKey.id}:`)).toBe(true);

    await expect(service.decrypt(encrypted)).resolves.toBe(plaintext);
    expect(dbReadFindFirst).toHaveBeenCalledTimes(1);
    expect(dbWriteFindFirst).toHaveBeenCalledTimes(1);
  });

  it("rejects tampered ciphertext", async () => {
    const orgKey = createOrgKey();
    dbReadFindFirst.mockResolvedValue(orgKey);
    dbWriteFindFirst.mockResolvedValue(orgKey);

    const service = await loadService();
    const encrypted = await service.encrypt("org-1", "postgres://user:password@db.example.com/app");
    const parts = encrypted.split(":");
    const tamperedCiphertext = Buffer.from(parts[5], "base64");
    tamperedCiphertext[0] ^= 1;
    parts[5] = tamperedCiphertext.toString("base64");

    await expect(service.decrypt(parts.join(":"))).rejects.toThrow();
  });

  it("warns generically when decryptIfNeeded sees plaintext", async () => {
    const service = await loadService();
    const plaintext = "postgres://user:super-secret@db.example.com/app";

    await expect(service.decryptIfNeeded(plaintext)).resolves.toBe(plaintext);
    expect(loggerWarn).toHaveBeenCalledWith("Found unencrypted value where encrypted was expected");
    expect(JSON.stringify(loggerWarn.mock.calls[0])).not.toContain("super-secret");
  });

  it("falls back to the primary database after an insert race", async () => {
    const raceKey = createOrgKey();
    dbReadFindFirst.mockResolvedValueOnce(null);
    insertReturning.mockResolvedValueOnce([]);
    dbWriteFindFirst.mockResolvedValueOnce(raceKey);

    const service = await loadService();
    const encrypted = await service.encrypt("org-1", "postgres://user:password@db.example.com/app");

    expect(encrypted.startsWith(`enc:v1:${raceKey.id}:`)).toBe(true);
    expect(dbWriteFindFirst).toHaveBeenCalledTimes(1);
  });

  it("fails fast when the master key is missing", async () => {
    delete process.env.SECRETS_MASTER_KEY;

    const service = await loadService();

    await expect(
      service.encrypt("org-1", "postgres://user:password@db.example.com/app"),
    ).rejects.toThrow("SECRETS_MASTER_KEY must be set for field encryption");
  });
});
