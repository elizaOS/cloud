/**
 * Unit Tests: Secrets Service
 *
 * Tests the SecretsService CRUD operations, OAuth management,
 * and audit logging functionality.
 * 
 * Uses bun:test native testing framework.
 */

import { describe, it, expect, beforeEach, mock } from "bun:test";
import { SecretsService, type AuditContext } from "@/lib/services/secrets/secrets";
import {
  SecretsEncryptionService,
  LocalKMSProvider,
} from "@/lib/services/secrets/encryption";

// Create mock repository functions
const mockCreate = mock(() => Promise.resolve({} as never));
const mockFindById = mock(() => Promise.resolve(undefined));
const mockFindByName = mock(() => Promise.resolve(undefined));
const mockFindByContext = mock(() => Promise.resolve([] as never[]));
const mockListByOrganization = mock(() => Promise.resolve([] as never[]));
const mockUpdate = mock(() => Promise.resolve({} as never));
const mockDelete = mock(() => Promise.resolve(true));
const mockRecordAccess = mock(() => Promise.resolve());

const mockOauthFindByOrgAndProvider = mock(() => Promise.resolve(undefined));
const mockOauthCreate = mock(() => Promise.resolve({} as never));
const mockOauthUpdate = mock(() => Promise.resolve({} as never));
const mockOauthRecordUsage = mock(() => Promise.resolve());
const mockOauthRevoke = mock(() => Promise.resolve({} as never));
const mockOauthFindById = mock(() => Promise.resolve(undefined));
const mockOauthListByOrganization = mock(() => Promise.resolve([] as never[]));

const mockAuditCreate = mock(() => Promise.resolve({} as never));

// Mock the module
mock.module("@/db/repositories/secrets", () => ({
  secretsRepository: {
    create: mockCreate,
    findById: mockFindById,
    findByName: mockFindByName,
    findByContext: mockFindByContext,
    listByOrganization: mockListByOrganization,
    update: mockUpdate,
    delete: mockDelete,
    recordAccess: mockRecordAccess,
  },
  oauthSessionsRepository: {
    create: mockOauthCreate,
    findById: mockOauthFindById,
    findByOrgAndProvider: mockOauthFindByOrgAndProvider,
    listByOrganization: mockOauthListByOrganization,
    update: mockOauthUpdate,
    revoke: mockOauthRevoke,
    recordUsage: mockOauthRecordUsage,
  },
  secretAuditLogRepository: {
    create: mockAuditCreate,
  },
}));

describe("SecretsService", () => {
  let service: SecretsService;
  const testKms = new LocalKMSProvider("0".repeat(64));
  const testEncryption = new SecretsEncryptionService(testKms);

  const mockAuditContext: AuditContext = {
    actorType: "user",
    actorId: "user-123",
    actorEmail: "test@example.com",
    source: "dashboard",
    endpoint: "/api/v1/secrets",
  };

  const mockOrganizationId = "org-123";
  const mockUserId = "user-123";

  beforeEach(() => {
    service = new SecretsService(testEncryption);
    // Reset all mocks
    mockCreate.mockReset();
    mockFindById.mockReset();
    mockFindByName.mockReset();
    mockFindByContext.mockReset();
    mockListByOrganization.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockRecordAccess.mockReset();
    mockOauthFindByOrgAndProvider.mockReset();
    mockOauthCreate.mockReset();
    mockOauthUpdate.mockReset();
    mockOauthRecordUsage.mockReset();
    mockOauthRevoke.mockReset();
    mockOauthFindById.mockReset();
    mockOauthListByOrganization.mockReset();
    mockAuditCreate.mockReset();
  });

  describe("create", () => {
    it("creates an encrypted secret", async () => {
      const mockSecret = {
        id: "secret-123",
        organization_id: mockOrganizationId,
        name: "API_KEY",
        description: "Test API key",
        scope: "organization",
        project_id: null,
        project_type: null,
        environment: null,
        encrypted_value: "encrypted",
        encryption_key_id: "local-kms-key",
        encrypted_dek: "dek",
        nonce: "nonce",
        auth_tag: "tag",
        version: 1,
        expires_at: null,
        last_rotated_at: null,
        last_accessed_at: null,
        access_count: 0,
        created_by: mockUserId,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockFindByName.mockResolvedValue(undefined);
      mockCreate.mockResolvedValue(mockSecret as never);
      mockAuditCreate.mockResolvedValue({} as never);

      const result = await service.create(
        {
          organizationId: mockOrganizationId,
          name: "API_KEY",
          value: "sk-test-123",
          description: "Test API key",
          createdBy: mockUserId,
        },
        mockAuditContext
      );

      expect(mockCreate).toHaveBeenCalled();
      expect(result.id).toBe("secret-123");
      expect(result.name).toBe("API_KEY");
      expect(result.version).toBe(1);
    });

    it("throws if secret already exists", async () => {
      mockFindByName.mockResolvedValue({ id: "existing" } as never);

      expect(
        service.create(
          {
            organizationId: mockOrganizationId,
            name: "EXISTING_KEY",
            value: "value",
            createdBy: mockUserId,
          },
          mockAuditContext
        )
      ).rejects.toThrow("already exists");
    });
  });

  describe("get", () => {
    it("decrypts and returns secret value", async () => {
      const secretValue = "my-secret-value";
      const encrypted = await testEncryption.encrypt(secretValue);

      mockFindByName.mockResolvedValue({
        id: "secret-123",
        organization_id: mockOrganizationId,
        name: "MY_SECRET",
        encrypted_value: encrypted.encryptedValue,
        encrypted_dek: encrypted.encryptedDek,
        nonce: encrypted.nonce,
        auth_tag: encrypted.authTag,
      } as never);
      mockRecordAccess.mockResolvedValue(undefined);
      mockAuditCreate.mockResolvedValue({} as never);

      const result = await service.get(
        mockOrganizationId,
        "MY_SECRET",
        undefined,
        undefined,
        mockAuditContext
      );

      expect(result).toBe(secretValue);
      expect(mockRecordAccess).toHaveBeenCalledWith("secret-123");
    });

    it("returns null for non-existent secret", async () => {
      mockFindByName.mockResolvedValue(undefined);

      const result = await service.get(
        mockOrganizationId,
        "NON_EXISTENT",
        undefined,
        undefined,
        mockAuditContext
      );

      expect(result).toBeNull();
    });
  });

  describe("getDecrypted", () => {
    it("returns multiple decrypted secrets", async () => {
      const secret1Value = "value-1";
      const secret2Value = "value-2";
      const encrypted1 = await testEncryption.encrypt(secret1Value);
      const encrypted2 = await testEncryption.encrypt(secret2Value);

      mockFindByContext.mockResolvedValue([
        {
          id: "secret-1",
          name: "SECRET_1",
          encrypted_value: encrypted1.encryptedValue,
          encrypted_dek: encrypted1.encryptedDek,
          nonce: encrypted1.nonce,
          auth_tag: encrypted1.authTag,
        },
        {
          id: "secret-2",
          name: "SECRET_2",
          encrypted_value: encrypted2.encryptedValue,
          encrypted_dek: encrypted2.encryptedDek,
          nonce: encrypted2.nonce,
          auth_tag: encrypted2.authTag,
        },
      ] as never[]);
      mockRecordAccess.mockResolvedValue(undefined);

      const result = await service.getDecrypted({
        organizationId: mockOrganizationId,
      });

      expect(result).toEqual({
        SECRET_1: secret1Value,
        SECRET_2: secret2Value,
      });
    });
  });

  describe("update", () => {
    it("updates secret value with new encryption", async () => {
      const oldValue = "old-value";
      const oldEncrypted = await testEncryption.encrypt(oldValue);

      mockFindById.mockResolvedValue({
        id: "secret-123",
        organization_id: mockOrganizationId,
        name: "MY_SECRET",
        version: 1,
        encrypted_value: oldEncrypted.encryptedValue,
        encrypted_dek: oldEncrypted.encryptedDek,
        nonce: oldEncrypted.nonce,
        auth_tag: oldEncrypted.authTag,
      } as never);

      mockUpdate.mockResolvedValue({
        id: "secret-123",
        organization_id: mockOrganizationId,
        name: "MY_SECRET",
        description: "Updated description",
        scope: "organization",
        project_id: null,
        project_type: null,
        environment: null,
        version: 2,
        expires_at: null,
        last_rotated_at: null,
        last_accessed_at: null,
        access_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      } as never);
      mockAuditCreate.mockResolvedValue({} as never);

      const result = await service.update(
        "secret-123",
        mockOrganizationId,
        { value: "new-value", description: "Updated description" },
        mockAuditContext
      );

      expect(mockUpdate).toHaveBeenCalled();
      expect(result.version).toBe(2);
    });

    it("throws if secret not found", async () => {
      mockFindById.mockResolvedValue(undefined);

      expect(
        service.update("non-existent", mockOrganizationId, { value: "x" }, mockAuditContext)
      ).rejects.toThrow("Secret not found");
    });

    it("throws if secret belongs to different org", async () => {
      mockFindById.mockResolvedValue({
        id: "secret-123",
        organization_id: "other-org",
      } as never);

      expect(
        service.update("secret-123", mockOrganizationId, { value: "x" }, mockAuditContext)
      ).rejects.toThrow("Secret not found");
    });
  });

  describe("rotate", () => {
    it("rotates secret with new DEK and increments version", async () => {
      const oldValue = "old-value";
      const oldEncrypted = await testEncryption.encrypt(oldValue);

      mockFindById.mockResolvedValue({
        id: "secret-123",
        organization_id: mockOrganizationId,
        name: "MY_SECRET",
        version: 3,
        encrypted_value: oldEncrypted.encryptedValue,
        encrypted_dek: oldEncrypted.encryptedDek,
        nonce: oldEncrypted.nonce,
        auth_tag: oldEncrypted.authTag,
      } as never);

      const rotatedAt = new Date();
      mockUpdate.mockResolvedValue({
        id: "secret-123",
        organization_id: mockOrganizationId,
        name: "MY_SECRET",
        description: null,
        scope: "organization",
        project_id: null,
        project_type: null,
        environment: null,
        version: 4,
        expires_at: null,
        last_rotated_at: rotatedAt,
        last_accessed_at: null,
        access_count: 0,
        created_at: new Date(),
        updated_at: new Date(),
      } as never);
      mockAuditCreate.mockResolvedValue({} as never);

      const result = await service.rotate(
        "secret-123",
        mockOrganizationId,
        "new-rotated-value",
        mockAuditContext
      );

      expect(mockUpdate).toHaveBeenCalled();
      expect(result.version).toBe(4);
    });
  });

  describe("delete", () => {
    it("deletes secret and creates audit log", async () => {
      mockFindById.mockResolvedValue({
        id: "secret-123",
        organization_id: mockOrganizationId,
        name: "MY_SECRET",
      } as never);
      mockDelete.mockResolvedValue(true);
      mockAuditCreate.mockResolvedValue({} as never);

      await service.delete("secret-123", mockOrganizationId, mockAuditContext);

      expect(mockDelete).toHaveBeenCalledWith("secret-123");
      expect(mockAuditCreate).toHaveBeenCalled();
    });
  });

  describe("list", () => {
    it("returns secrets metadata without values", async () => {
      mockListByOrganization.mockResolvedValue([
        {
          id: "secret-1",
          name: "API_KEY",
          description: "API key",
          scope: "organization",
          project_id: null,
          project_type: null,
          environment: null,
          version: 1,
          expires_at: null,
          last_rotated_at: null,
          last_accessed_at: null,
          access_count: 5,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: "secret-2",
          name: "DATABASE_URL",
          description: "Database connection",
          scope: "project",
          project_id: "proj-123",
          project_type: "container",
          environment: "production",
          version: 2,
          expires_at: null,
          last_rotated_at: new Date(),
          last_accessed_at: null,
          access_count: 10,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as never[]);

      const result = await service.list(mockOrganizationId);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("API_KEY");
      expect(result[1].name).toBe("DATABASE_URL");
      expect(result[1].projectId).toBe("proj-123");
    });
  });

  describe("OAuth sessions", () => {
    describe("storeOAuthTokens", () => {
      it("creates new OAuth session with encrypted tokens", async () => {
        mockOauthFindByOrgAndProvider.mockResolvedValue(undefined);
        mockOauthCreate.mockResolvedValue({
          id: "oauth-123",
          organization_id: mockOrganizationId,
          provider: "github",
          encrypted_access_token: "encrypted",
          encrypted_dek: "dek",
          nonce: "nonce",
          auth_tag: "tag",
          token_type: "Bearer",
          scopes: ["repo", "user"],
          is_valid: true,
          created_at: new Date(),
          updated_at: new Date(),
        } as never);

        const result = await service.storeOAuthTokens({
          organizationId: mockOrganizationId,
          provider: "github",
          accessToken: "gho_test123",
          refreshToken: "ghr_refresh456",
          scopes: ["repo", "user"],
        });

        expect(mockOauthCreate).toHaveBeenCalled();
        expect(result.id).toBe("oauth-123");
      });

      it("updates existing OAuth session", async () => {
        const existingSession = {
          id: "oauth-existing",
          organization_id: mockOrganizationId,
          provider: "github",
        };

        mockOauthFindByOrgAndProvider.mockResolvedValue(existingSession as never);
        mockOauthUpdate.mockResolvedValue({
          ...existingSession,
          is_valid: true,
          updated_at: new Date(),
        } as never);

        await service.storeOAuthTokens({
          organizationId: mockOrganizationId,
          provider: "github",
          accessToken: "new-token",
        });

        expect(mockOauthUpdate).toHaveBeenCalled();
      });
    });

    describe("getOAuthTokens", () => {
      it("returns decrypted access token", async () => {
        const accessToken = "gho_test123";
        const encryptedAccess = await testEncryption.encrypt(accessToken);

        mockOauthFindByOrgAndProvider.mockResolvedValue({
          id: "oauth-123",
          organization_id: mockOrganizationId,
          provider: "github",
          encrypted_access_token: encryptedAccess.encryptedValue,
          encrypted_refresh_token: null,
          encrypted_dek: encryptedAccess.encryptedDek,
          nonce: encryptedAccess.nonce,
          auth_tag: encryptedAccess.authTag,
          refresh_encrypted_dek: null,
          refresh_nonce: null,
          refresh_auth_tag: null,
          token_type: "Bearer",
          scopes: ["repo"],
          access_token_expires_at: new Date(Date.now() + 3600000),
          is_valid: true,
        } as never);
        mockOauthRecordUsage.mockResolvedValue(undefined);

        const result = await service.getOAuthTokens(mockOrganizationId, "github");

        expect(result).not.toBeNull();
        expect(result!.accessToken).toBe(accessToken);
        expect(result!.refreshToken).toBeUndefined();
        expect(result!.isExpired).toBe(false);
      });

      it("returns decrypted access and refresh tokens", async () => {
        const accessToken = "gho_test123";
        const refreshToken = "ghr_refresh456";
        const encryptedAccess = await testEncryption.encrypt(accessToken);
        const encryptedRefresh = await testEncryption.encrypt(refreshToken);

        mockOauthFindByOrgAndProvider.mockResolvedValue({
          id: "oauth-123",
          organization_id: mockOrganizationId,
          provider: "github",
          encrypted_access_token: encryptedAccess.encryptedValue,
          encrypted_refresh_token: encryptedRefresh.encryptedValue,
          encrypted_dek: encryptedAccess.encryptedDek,
          nonce: encryptedAccess.nonce,
          auth_tag: encryptedAccess.authTag,
          refresh_encrypted_dek: encryptedRefresh.encryptedDek,
          refresh_nonce: encryptedRefresh.nonce,
          refresh_auth_tag: encryptedRefresh.authTag,
          token_type: "Bearer",
          scopes: ["repo"],
          access_token_expires_at: new Date(Date.now() + 3600000),
          is_valid: true,
        } as never);
        mockOauthRecordUsage.mockResolvedValue(undefined);

        const result = await service.getOAuthTokens(mockOrganizationId, "github");

        expect(result).not.toBeNull();
        expect(result!.accessToken).toBe(accessToken);
        expect(result!.refreshToken).toBe(refreshToken);
        expect(result!.isExpired).toBe(false);
      });

      it("returns null for non-existent session", async () => {
        mockOauthFindByOrgAndProvider.mockResolvedValue(undefined);

        const result = await service.getOAuthTokens(mockOrganizationId, "github");

        expect(result).toBeNull();
      });
    });

    describe("revokeOAuthConnection", () => {
      it("revokes OAuth session", async () => {
        mockOauthFindById.mockResolvedValue({
          id: "oauth-123",
          organization_id: mockOrganizationId,
          provider: "github",
        } as never);
        mockOauthRevoke.mockResolvedValue({} as never);

        await service.revokeOAuthConnection("oauth-123", mockOrganizationId, "User requested");

        expect(mockOauthRevoke).toHaveBeenCalledWith("oauth-123", "User requested");
      });

      it("throws if session not found", async () => {
        mockOauthFindById.mockResolvedValue(undefined);

        expect(
          service.revokeOAuthConnection("non-existent", mockOrganizationId, "reason")
        ).rejects.toThrow("OAuth session not found");
      });
    });
  });

  describe("isConfigured", () => {
    it("returns true when encryption is configured", () => {
      expect(service.isConfigured()).toBe(true);
    });
  });
});
