/**
 * Integration Tests: Secrets API
 *
 * Tests the full API workflow for secrets management.
 * These tests require a running database with the secrets tables.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { db } from "@/db/client";
import { secrets, oauthSessions, secretAuditLog } from "@/db/schemas/secrets";
import { organizations } from "@/db/schemas/organizations";
import { users } from "@/db/schemas/users";
import { eq } from "drizzle-orm";
import {
  secretsRepository,
  oauthSessionsRepository,
  secretAuditLogRepository,
} from "@/db/repositories/secrets";
import { SecretsService } from "@/lib/services/secrets/secrets";
import {
  LocalKMSProvider,
  SecretsEncryptionService,
} from "@/lib/services/secrets/encryption";
import type { AuditContext } from "@/lib/services/secrets";

// Test fixtures - using valid UUIDs
const TEST_ORG_ID = "00000000-0000-0000-0000-000000000001";
const TEST_USER_ID = "00000000-0000-0000-0000-000000000002";
const TEST_PROJECT_ID = "00000000-0000-0000-0000-000000000003";
const TEST_PROJECT_ID_2 = "00000000-0000-0000-0000-000000000004";
const TEST_MASTER_KEY =
  "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

// Secrets table check happens in beforeAll to avoid top-level async issues
let secretsTablesAvailable = false;

function skipIfNoTables() {
  if (!secretsTablesAvailable) {
    console.log("    ⏭️  SKIPPED (secrets tables not available)");
    return true;
  }
  return false;
}

describe("Secrets Integration Tests", () => {
  let service: SecretsService;
  let testOrgId: string;
  let testUserId: string;

  const auditContext: AuditContext = {
    actorType: "user",
    actorId: TEST_USER_ID,
    actorEmail: "test@example.com",
    source: "test",
    endpoint: "/test",
  };

  beforeAll(async () => {
    try {
      await db.execute("SELECT 1 FROM secrets LIMIT 1");
      secretsTablesAvailable = true;
    } catch {
      console.log("\n⚠️  [secrets-api.test.ts] Secrets tables not available.");
      console.log("   Run migration: bun drizzle-kit push");
      console.log("   Tests will be skipped.\n");
      return;
    }

    const kms = new LocalKMSProvider(TEST_MASTER_KEY);
    const encryption = new SecretsEncryptionService(kms);
    service = new SecretsService(encryption);

    const existingOrg = await db.query.organizations.findFirst({
      where: eq(organizations.id, TEST_ORG_ID),
    });
    if (!existingOrg) {
      await db.insert(organizations).values({
        id: TEST_ORG_ID,
        name: "Test Org for Secrets",
        credit_balance: 1000,
      });
    }
    testOrgId = TEST_ORG_ID;

    const existingUser = await db.query.users.findFirst({
      where: eq(users.id, TEST_USER_ID),
    });
    if (!existingUser) {
      await db.insert(users).values({
        id: TEST_USER_ID,
        email: "secrets-test@example.com",
        organization_id: TEST_ORG_ID,
      });
    }
    testUserId = TEST_USER_ID;
  });

  afterAll(async () => {
    if (!secretsTablesAvailable) return;
    await db
      .delete(secretAuditLog)
      .where(eq(secretAuditLog.organization_id, TEST_ORG_ID))
      .catch(() => {});
    await db
      .delete(oauthSessions)
      .where(eq(oauthSessions.organization_id, TEST_ORG_ID))
      .catch(() => {});
    await db
      .delete(secrets)
      .where(eq(secrets.organization_id, TEST_ORG_ID))
      .catch(() => {});
  });

  beforeEach(async () => {
    if (!secretsTablesAvailable) return;
    await db
      .delete(secretAuditLog)
      .where(eq(secretAuditLog.organization_id, TEST_ORG_ID))
      .catch(() => {});
    await db
      .delete(secrets)
      .where(eq(secrets.organization_id, TEST_ORG_ID))
      .catch(() => {});
  });

  describe("Secret CRUD Operations", () => {
    it("creates a secret with encryption", async () => {
      if (skipIfNoTables()) return;
      const result = await service.create(
        {
          organizationId: testOrgId,
          name: "TEST_API_KEY",
          value: "sk-test-12345",
          description: "Test API key",
          createdBy: testUserId,
        },
        auditContext,
      );

      expect(result.id).toBeDefined();
      expect(result.name).toBe("TEST_API_KEY");
      expect(result.description).toBe("Test API key");
      expect(result.version).toBe(1);

      // Verify in database - value should be encrypted
      const dbSecret = await secretsRepository.findById(result.id);
      expect(dbSecret).toBeDefined();
      expect(dbSecret!.encrypted_value).not.toBe("sk-test-12345");
      expect(dbSecret!.encrypted_dek).toBeDefined();
      expect(dbSecret!.nonce).toBeDefined();
      expect(dbSecret!.auth_tag).toBeDefined();
    });

    it("retrieves and decrypts a secret", async () => {
      if (skipIfNoTables()) return;
      const secretValue = "my-super-secret-value-abc123";

      await service.create(
        {
          organizationId: testOrgId,
          name: "DECRYPT_TEST",
          value: secretValue,
          createdBy: testUserId,
        },
        auditContext,
      );

      const retrieved = await service.get(testOrgId, "DECRYPT_TEST");

      expect(retrieved).toBe(secretValue);
    });

    it("lists secrets (metadata only)", async () => {
      if (skipIfNoTables()) return;
      await service.create(
        {
          organizationId: testOrgId,
          name: "LIST_SECRET_1",
          value: "value1",
          createdBy: testUserId,
        },
        auditContext,
      );

      await service.create(
        {
          organizationId: testOrgId,
          name: "LIST_SECRET_2",
          value: "value2",
          description: "Second secret",
          createdBy: testUserId,
        },
        auditContext,
      );

      const list = await service.list(testOrgId);

      expect(list).toHaveLength(2);
      expect(list.map((s) => s.name).sort()).toEqual([
        "LIST_SECRET_1",
        "LIST_SECRET_2",
      ]);

      // Ensure values are not in the list response
      for (const secret of list) {
        expect((secret as Record<string, unknown>).value).toBeUndefined();
        expect(
          (secret as Record<string, unknown>).encrypted_value,
        ).toBeUndefined();
      }
    });

    it("updates a secret value", async () => {
      if (skipIfNoTables()) return;
      const created = await service.create(
        {
          organizationId: testOrgId,
          name: "UPDATE_TEST",
          value: "original-value",
          createdBy: testUserId,
        },
        auditContext,
      );

      const updated = await service.update(
        created.id,
        testOrgId,
        { value: "new-value", description: "Updated description" },
        auditContext,
      );

      expect(updated.version).toBe(2);
      expect(updated.description).toBe("Updated description");

      // Verify decrypted value
      const retrieved = await service.get(testOrgId, "UPDATE_TEST");
      expect(retrieved).toBe("new-value");
    });

    it("rotates a secret", async () => {
      if (skipIfNoTables()) return;
      const created = await service.create(
        {
          organizationId: testOrgId,
          name: "ROTATE_TEST",
          value: "original-value",
          createdBy: testUserId,
        },
        auditContext,
      );

      const rotated = await service.rotate(
        created.id,
        testOrgId,
        "rotated-value",
        auditContext,
      );

      expect(rotated.version).toBe(2);
      expect(rotated.lastRotatedAt).toBeDefined();

      // Verify new value
      const retrieved = await service.get(testOrgId, "ROTATE_TEST");
      expect(retrieved).toBe("rotated-value");
    });

    it("deletes a secret", async () => {
      if (skipIfNoTables()) return;
      const created = await service.create(
        {
          organizationId: testOrgId,
          name: "DELETE_TEST",
          value: "to-be-deleted",
          createdBy: testUserId,
        },
        auditContext,
      );

      await service.delete(created.id, testOrgId, auditContext);

      const retrieved = await service.get(testOrgId, "DELETE_TEST");
      expect(retrieved).toBeNull();

      // Verify audit log exists
      const auditLog = await service.getSecretAuditLog(created.id);
      const deleteEntry = auditLog.find((e) => e.action === "deleted");
      expect(deleteEntry).toBeDefined();
    });
  });

  describe("Secret Scoping", () => {
    it("supports project-scoped secrets", async () => {
      if (skipIfNoTables()) return;

      await service.create(
        {
          organizationId: testOrgId,
          name: "PROJECT_SECRET",
          value: "project-value",
          scope: "project",
          projectId: TEST_PROJECT_ID,
          projectType: "container",
          createdBy: testUserId,
        },
        auditContext,
      );

      // Get with project context
      const withProject = await service.getDecrypted({
        organizationId: testOrgId,
        projectId: TEST_PROJECT_ID,
      });
      expect(withProject.PROJECT_SECRET).toBe("project-value");

      // Get without project context (should not find project-scoped secrets)
      const orgSecret = await service.get(testOrgId, "PROJECT_SECRET");
      expect(orgSecret).toBeNull();
    });

    it("supports environment-scoped secrets", async () => {
      if (skipIfNoTables()) return;
      await service.create(
        {
          organizationId: testOrgId,
          name: "ENV_SECRET",
          value: "prod-value",
          scope: "environment",
          environment: "production",
          createdBy: testUserId,
        },
        auditContext,
      );

      // Get with environment context
      const prodSecrets = await service.getDecrypted({
        organizationId: testOrgId,
        environment: "production",
      });
      expect(prodSecrets.ENV_SECRET).toBe("prod-value");

      // Dev environment should not have this secret
      const devSecret = await service.get(
        testOrgId,
        "ENV_SECRET",
        undefined,
        "development",
      );
      expect(devSecret).toBeNull();
    });

    it("prioritizes more specific secrets (project > org)", async () => {
      if (skipIfNoTables()) return;

      // Create org-level secret
      await service.create(
        {
          organizationId: testOrgId,
          name: "SHARED_CONFIG",
          value: "org-default",
          createdBy: testUserId,
        },
        auditContext,
      );

      // Create project-level override
      await service.create(
        {
          organizationId: testOrgId,
          name: "SHARED_CONFIG",
          value: "project-override",
          scope: "project",
          projectId: TEST_PROJECT_ID_2,
          createdBy: testUserId,
        },
        auditContext,
      );

      // With project context, should get project value
      const projectSecrets = await service.getDecrypted({
        organizationId: testOrgId,
        projectId: TEST_PROJECT_ID_2,
      });
      expect(projectSecrets.SHARED_CONFIG).toBe("project-override");

      // Without project, should get org value
      const orgSecrets = await service.getDecrypted({
        organizationId: testOrgId,
      });
      expect(orgSecrets.SHARED_CONFIG).toBe("org-default");
    });
  });

  describe("OAuth Token Storage", () => {
    it("stores and retrieves OAuth tokens", async () => {
      if (skipIfNoTables()) return;
      await service.storeOAuthTokens({
        organizationId: testOrgId,
        provider: "github",
        accessToken: "gho_test_access_token_123",
        refreshToken: "ghr_test_refresh_token_456",
        scopes: ["repo", "user"],
        accessTokenExpiresAt: new Date(Date.now() + 3600000),
      });

      const tokens = await service.getOAuthTokens(testOrgId, "github");

      expect(tokens).not.toBeNull();
      expect(tokens!.accessToken).toBe("gho_test_access_token_123");
      expect(tokens!.refreshToken).toBe("ghr_test_refresh_token_456");
      expect(tokens!.scopes).toContain("repo");
      expect(tokens!.isExpired).toBe(false);
    });

    it("updates existing OAuth tokens", async () => {
      if (skipIfNoTables()) return;
      await service.storeOAuthTokens({
        organizationId: testOrgId,
        provider: "google",
        accessToken: "old-token",
      });

      await service.storeOAuthTokens({
        organizationId: testOrgId,
        provider: "google",
        accessToken: "new-token",
      });

      const tokens = await service.getOAuthTokens(testOrgId, "google");
      expect(tokens!.accessToken).toBe("new-token");

      // Should only have one session
      const connections = await service.listOAuthConnections(testOrgId);
      const googleConnections = connections.filter(
        (c) => c.provider === "google",
      );
      expect(googleConnections).toHaveLength(1);
    });

    it("revokes OAuth connection", async () => {
      if (skipIfNoTables()) return;
      await service.storeOAuthTokens({
        organizationId: testOrgId,
        provider: "slack",
        accessToken: "xoxb-test-token",
      });

      const connections = await service.listOAuthConnections(testOrgId);
      const slackConnection = connections.find((c) => c.provider === "slack");
      expect(slackConnection).toBeDefined();

      await service.revokeOAuthConnection(
        slackConnection!.id,
        testOrgId,
        "User disconnected",
      );

      // Connection should still exist but be invalid
      const updatedConnections = await service.listOAuthConnections(testOrgId);
      const revokedConnection = updatedConnections.find(
        (c) => c.provider === "slack",
      );
      expect(revokedConnection).toBeDefined();
      expect(revokedConnection!.isValid).toBe(false);

      // Should not return tokens for revoked connection
      const tokens = await service.getOAuthTokens(testOrgId, "slack");
      expect(tokens).toBeNull();
    });
  });

  describe("Audit Logging", () => {
    it("logs all secret operations", async () => {
      if (skipIfNoTables()) return;
      const created = await service.create(
        {
          organizationId: testOrgId,
          name: "AUDIT_TEST",
          value: "initial",
          createdBy: testUserId,
        },
        auditContext,
      );

      await service.get(
        testOrgId,
        "AUDIT_TEST",
        undefined,
        undefined,
        auditContext,
      );
      await service.update(
        created.id,
        testOrgId,
        { value: "updated" },
        auditContext,
      );
      await service.rotate(created.id, testOrgId, "rotated", auditContext);
      await service.delete(created.id, testOrgId, auditContext);

      const auditLog = await service.getSecretAuditLog(created.id);
      const actions = auditLog.map((e) => e.action);

      expect(actions).toContain("created");
      expect(actions).toContain("read");
      expect(actions).toContain("updated");
      expect(actions).toContain("rotated");
      expect(actions).toContain("deleted");
    });

    it("includes audit context details", async () => {
      if (skipIfNoTables()) return;
      const customContext: AuditContext = {
        actorType: "api_key",
        actorId: "apikey-123",
        actorEmail: "api@example.com",
        ipAddress: "192.168.1.1",
        userAgent: "test-client/1.0",
        source: "api",
        endpoint: "/api/v1/secrets",
        requestId: "req-abc123",
      };

      const created = await service.create(
        {
          organizationId: testOrgId,
          name: "CONTEXT_AUDIT_TEST",
          value: "value",
          createdBy: testUserId,
        },
        customContext,
      );

      const auditLog = await service.getSecretAuditLog(created.id);
      const createEntry = auditLog.find((e) => e.action === "created");

      expect(createEntry).toBeDefined();
      expect(createEntry!.actor_type).toBe("api_key");
      expect(createEntry!.actor_id).toBe("apikey-123");
      expect(createEntry!.ip_address).toBe("192.168.1.1");
      expect(createEntry!.user_agent).toBe("test-client/1.0");
      expect(createEntry!.source).toBe("api");
      expect(createEntry!.request_id).toBe("req-abc123");
    });
  });

  describe("Error Handling", () => {
    it("prevents duplicate secrets in same context", async () => {
      if (skipIfNoTables()) return;
      await service.create(
        {
          organizationId: testOrgId,
          name: "DUPLICATE_TEST",
          value: "first",
          createdBy: testUserId,
        },
        auditContext,
      );

      await expect(
        service.create(
          {
            organizationId: testOrgId,
            name: "DUPLICATE_TEST",
            value: "second",
            createdBy: testUserId,
          },
          auditContext,
        ),
      ).rejects.toThrow("already exists");
    });

    it("prevents accessing secrets from other organizations", async () => {
      if (skipIfNoTables()) return;
      const created = await service.create(
        {
          organizationId: testOrgId,
          name: "ISOLATION_TEST",
          value: "secret",
          createdBy: testUserId,
        },
        auditContext,
      );

      // Try to update from different org
      await expect(
        service.update(
          created.id,
          "other-org",
          { value: "hacked" },
          auditContext,
        ),
      ).rejects.toThrow("not found");

      // Try to delete from different org
      await expect(
        service.delete(created.id, "other-org", auditContext),
      ).rejects.toThrow("not found");
    });
  });

  describe("Batch Operations", () => {
    it("retrieves multiple secrets efficiently", async () => {
      if (skipIfNoTables()) return;
      // Create multiple secrets
      const secretNames = [
        "BATCH_1",
        "BATCH_2",
        "BATCH_3",
        "BATCH_4",
        "BATCH_5",
      ];

      for (const name of secretNames) {
        await service.create(
          {
            organizationId: testOrgId,
            name,
            value: `value-for-${name}`,
            createdBy: testUserId,
          },
          auditContext,
        );
      }

      // Retrieve specific secrets
      const results = await service.getDecrypted({
        organizationId: testOrgId,
        names: ["BATCH_1", "BATCH_3", "BATCH_5"],
      });

      expect(Object.keys(results)).toHaveLength(3);
      expect(results.BATCH_1).toBe("value-for-BATCH_1");
      expect(results.BATCH_3).toBe("value-for-BATCH_3");
      expect(results.BATCH_5).toBe("value-for-BATCH_5");
      expect(results.BATCH_2).toBeUndefined();
    });
  });
});
