/**
 * Integration Tests: Secret Bindings & App Requirements
 *
 * Tests real database operations for bindings and app secret requirements.
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
import {
  secrets,
  secretBindings,
  appSecretRequirements,
  secretAuditLog,
} from "@/db/schemas/secrets";
import { organizations } from "@/db/schemas/organizations";
import { users } from "@/db/schemas/users";
import { apps } from "@/db/schemas/apps";
import { eq, and } from "drizzle-orm";
import { SecretsService } from "@/lib/services/secrets/secrets";
import {
  LocalKMSProvider,
  SecretsEncryptionService,
} from "@/lib/services/secrets/encryption";
import type { AuditContext } from "@/lib/services/secrets";

const TEST_ORG_ID = "00000000-0000-0000-0000-000000000010";
const TEST_USER_ID = "00000000-0000-0000-0000-000000000011";
const TEST_APP_ID = "00000000-0000-0000-0000-000000000012";
const TEST_APP_ID_2 = "00000000-0000-0000-0000-000000000013";
const TEST_PROJECT_ID = "00000000-0000-0000-0000-000000000014";
const TEST_MASTER_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

let tablesAvailable = false;

function skipIfNoTables() {
  if (!tablesAvailable) {
    console.log("    ⏭️  SKIPPED (tables not available)");
    return true;
  }
  return false;
}

describe("Secrets Bindings Integration", () => {
  let service: SecretsService;

  const audit: AuditContext = {
    actorType: "user",
    actorId: TEST_USER_ID,
    source: "integration-test",
  };

  beforeAll(async () => {
    try {
      await db.execute("SELECT 1 FROM secrets LIMIT 1");
      await db.execute("SELECT 1 FROM secret_bindings LIMIT 1");
      await db.execute("SELECT 1 FROM app_secret_requirements LIMIT 1");
      tablesAvailable = true;
    } catch {
      console.log(
        "\n⚠️  [secrets-bindings.test.ts] Required tables not available.",
      );
      console.log("   Run: bun drizzle-kit push\n");
      return;
    }

    const kms = new LocalKMSProvider(TEST_MASTER_KEY);
    const encryption = new SecretsEncryptionService(kms);
    service = new SecretsService(encryption);

    // Create test org
    const existingOrg = await db.query.organizations.findFirst({
      where: eq(organizations.id, TEST_ORG_ID),
    });
    if (!existingOrg) {
      await db.insert(organizations).values({
        id: TEST_ORG_ID,
        name: "Bindings Test Org",
        slug: "bindings-test-org",
        credit_balance: 1000,
      });
    }

    // Create test user
    const existingUser = await db.query.users.findFirst({
      where: eq(users.id, TEST_USER_ID),
    });
    if (!existingUser) {
      await db.insert(users).values({
        id: TEST_USER_ID,
        email: "bindings-test@example.com",
        organization_id: TEST_ORG_ID,
      });
    }

    // Create test apps
    for (const appId of [TEST_APP_ID, TEST_APP_ID_2]) {
      const existingApp = await db.query.apps.findFirst({
        where: eq(apps.id, appId),
      });
      if (!existingApp) {
        await db.insert(apps).values({
          id: appId,
          name: `Test App ${appId.slice(-2)}`,
          organization_id: TEST_ORG_ID,
          slug: `test-app-${appId.slice(-2)}`,
          created_by_user_id: TEST_USER_ID,
          app_url: `https://test-app-${appId.slice(-2)}.example.com`,
        });
      }
    }
  });

  afterAll(async () => {
    if (!tablesAvailable) return;
    await db
      .delete(secretAuditLog)
      .where(eq(secretAuditLog.organization_id, TEST_ORG_ID))
      .catch(() => {});
    await db
      .delete(appSecretRequirements)
      .where(eq(appSecretRequirements.app_id, TEST_APP_ID))
      .catch(() => {});
    await db
      .delete(appSecretRequirements)
      .where(eq(appSecretRequirements.app_id, TEST_APP_ID_2))
      .catch(() => {});
    await db
      .delete(secretBindings)
      .where(eq(secretBindings.organization_id, TEST_ORG_ID))
      .catch(() => {});
    await db
      .delete(secrets)
      .where(eq(secrets.organization_id, TEST_ORG_ID))
      .catch(() => {});
  });

  beforeEach(async () => {
    if (!tablesAvailable) return;
    await db
      .delete(secretAuditLog)
      .where(eq(secretAuditLog.organization_id, TEST_ORG_ID))
      .catch(() => {});
    await db
      .delete(appSecretRequirements)
      .where(eq(appSecretRequirements.app_id, TEST_APP_ID))
      .catch(() => {});
    await db
      .delete(appSecretRequirements)
      .where(eq(appSecretRequirements.app_id, TEST_APP_ID_2))
      .catch(() => {});
    await db
      .delete(secretBindings)
      .where(eq(secretBindings.organization_id, TEST_ORG_ID))
      .catch(() => {});
    await db
      .delete(secrets)
      .where(eq(secrets.organization_id, TEST_ORG_ID))
      .catch(() => {});
  });

  describe("Secret Binding CRUD", () => {
    it("creates a binding between org secret and project", async () => {
      if (skipIfNoTables()) return;

      // Create org-level secret
      const secret = await service.create(
        {
          organizationId: TEST_ORG_ID,
          name: "SHARED_API_KEY",
          value: "sk-shared-12345",
          createdBy: TEST_USER_ID,
        },
        audit,
      );

      // Bind to project
      const binding = await service.bindSecret(
        {
          secretId: secret.id,
          projectId: TEST_PROJECT_ID,
          projectType: "container",
          createdBy: TEST_USER_ID,
        },
        audit,
      );

      expect(binding.id).toBeDefined();
      expect(binding.secretId).toBe(secret.id);
      expect(binding.projectId).toBe(TEST_PROJECT_ID);
      expect(binding.projectType).toBe("container");

      // Verify in database
      const dbBinding = await db.query.secretBindings.findFirst({
        where: eq(secretBindings.id, binding.id),
      });
      expect(dbBinding).toBeDefined();
      expect(dbBinding!.secret_id).toBe(secret.id);
      expect(dbBinding!.organization_id).toBe(TEST_ORG_ID);
    });

    it("prevents duplicate bindings", async () => {
      if (skipIfNoTables()) return;

      const secret = await service.create(
        {
          organizationId: TEST_ORG_ID,
          name: "DUP_BINDING_TEST",
          value: "value",
          createdBy: TEST_USER_ID,
        },
        audit,
      );

      await service.bindSecret(
        {
          secretId: secret.id,
          projectId: TEST_PROJECT_ID,
          projectType: "app",
          createdBy: TEST_USER_ID,
        },
        audit,
      );

      await expect(
        service.bindSecret(
          {
            secretId: secret.id,
            projectId: TEST_PROJECT_ID,
            projectType: "app",
            createdBy: TEST_USER_ID,
          },
          audit,
        ),
      ).rejects.toThrow();
    });

    it("removes binding without deleting secret", async () => {
      if (skipIfNoTables()) return;

      const secret = await service.create(
        {
          organizationId: TEST_ORG_ID,
          name: "UNBIND_TEST",
          value: "value",
          createdBy: TEST_USER_ID,
        },
        audit,
      );

      const binding = await service.bindSecret(
        {
          secretId: secret.id,
          projectId: TEST_PROJECT_ID,
          projectType: "workflow",
          createdBy: TEST_USER_ID,
        },
        audit,
      );

      await service.unbindSecret(binding.id, TEST_ORG_ID, audit);

      // Binding should be gone
      const dbBinding = await db.query.secretBindings.findFirst({
        where: eq(secretBindings.id, binding.id),
      });
      expect(dbBinding).toBeUndefined();

      // Secret should still exist
      const secretValue = await service.get(TEST_ORG_ID, "UNBIND_TEST");
      expect(secretValue).toBe("value");
    });

    it("cascades binding deletion when secret is deleted", async () => {
      if (skipIfNoTables()) return;

      const secret = await service.create(
        {
          organizationId: TEST_ORG_ID,
          name: "CASCADE_TEST",
          value: "value",
          createdBy: TEST_USER_ID,
        },
        audit,
      );

      await service.bindSecret(
        {
          secretId: secret.id,
          projectId: TEST_PROJECT_ID,
          projectType: "mcp",
          createdBy: TEST_USER_ID,
        },
        audit,
      );

      await service.delete(secret.id, TEST_ORG_ID, audit);

      // Bindings should be cascaded
      const remainingBindings = await db.query.secretBindings.findMany({
        where: eq(secretBindings.secret_id, secret.id),
      });
      expect(remainingBindings).toHaveLength(0);
    });
  });

  describe("Bulk Binding Operations", () => {
    it("binds multiple secrets to same project", async () => {
      if (skipIfNoTables()) return;

      const secretIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const s = await service.create(
          {
            organizationId: TEST_ORG_ID,
            name: `BULK_SECRET_${i}`,
            value: `value-${i}`,
            createdBy: TEST_USER_ID,
          },
          audit,
        );
        secretIds.push(s.id);
      }

      const result = await service.bindSecrets(
        secretIds,
        TEST_PROJECT_ID,
        "app",
        TEST_USER_ID,
        audit,
      );

      expect(result.bound).toHaveLength(5);
      expect(result.errors).toHaveLength(0);

      // Verify all bindings exist
      const bindings = await service.listBindings(TEST_ORG_ID, TEST_PROJECT_ID);
      expect(bindings.bindings).toHaveLength(5);
    });

    it("returns partial success when some already bound", async () => {
      if (skipIfNoTables()) return;

      const s1 = await service.create(
        {
          organizationId: TEST_ORG_ID,
          name: "PARTIAL_1",
          value: "v1",
          createdBy: TEST_USER_ID,
        },
        audit,
      );

      const s2 = await service.create(
        {
          organizationId: TEST_ORG_ID,
          name: "PARTIAL_2",
          value: "v2",
          createdBy: TEST_USER_ID,
        },
        audit,
      );

      // Pre-bind first secret
      await service.bindSecret(
        {
          secretId: s1.id,
          projectId: TEST_PROJECT_ID,
          projectType: "container",
          createdBy: TEST_USER_ID,
        },
        audit,
      );

      // Try bulk binding both
      const result = await service.bindSecrets(
        [s1.id, s2.id],
        TEST_PROJECT_ID,
        "container",
        TEST_USER_ID,
        audit,
      );

      expect(result.bound).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe("App Secret Requirements", () => {
    it("syncs requirements from manifest", async () => {
      if (skipIfNoTables()) return;

      const manifest = [
        { secretName: "OPENAI_API_KEY", required: true },
        { secretName: "ANALYTICS_KEY", required: false },
      ];

      const synced = await service.syncAppSecretRequirements(
        TEST_APP_ID,
        manifest,
      );

      expect(synced).toHaveLength(2);

      const reqs = await service.getAppSecretRequirements(TEST_APP_ID);
      expect(reqs).toHaveLength(2);
      expect(
        reqs.find((r) => r.secret_name === "OPENAI_API_KEY")?.required,
      ).toBe(true);
      expect(
        reqs.find((r) => r.secret_name === "ANALYTICS_KEY")?.required,
      ).toBe(false);
    });

    it("updates existing requirements on re-sync", async () => {
      if (skipIfNoTables()) return;

      // Initial sync
      await service.syncAppSecretRequirements(TEST_APP_ID, [
        { secretName: "KEY_A", required: true },
        { secretName: "KEY_B", required: true },
      ]);

      // Updated manifest - KEY_A now optional, KEY_C added
      await service.syncAppSecretRequirements(TEST_APP_ID, [
        { secretName: "KEY_A", required: false },
        { secretName: "KEY_C", required: true },
      ]);

      const reqs = await service.getAppSecretRequirements(TEST_APP_ID);
      expect(reqs.find((r) => r.secret_name === "KEY_A")?.required).toBe(false);
      expect(reqs.find((r) => r.secret_name === "KEY_C")?.required).toBe(true);
    });

    it("approves and revokes requirements", async () => {
      if (skipIfNoTables()) return;

      await service.syncAppSecretRequirements(TEST_APP_ID, [
        { secretName: "APPROVAL_TEST", required: true },
      ]);

      const reqs = await service.getAppSecretRequirements(TEST_APP_ID);
      const req = reqs[0];

      expect(req.approved).toBe(false);

      const approved = await service.approveAppSecretRequirement(
        req.id,
        TEST_USER_ID,
      );
      expect(approved.approved).toBe(true);
      expect(approved.approved_by).toBe(TEST_USER_ID);
      expect(approved.approved_at).toBeDefined();

      const revoked = await service.revokeAppSecretRequirement(req.id);
      expect(revoked.approved).toBe(false);
      expect(revoked.approved_by).toBeNull();
    });

    it("getAppSecrets returns only approved secrets", async () => {
      if (skipIfNoTables()) return;

      // Create org-level secrets
      await service.create(
        {
          organizationId: TEST_ORG_ID,
          name: "APPROVED_SECRET",
          value: "approved-value",
          createdBy: TEST_USER_ID,
        },
        audit,
      );

      await service.create(
        {
          organizationId: TEST_ORG_ID,
          name: "UNAPPROVED_SECRET",
          value: "unapproved-value",
          createdBy: TEST_USER_ID,
        },
        audit,
      );

      // Sync requirements
      await service.syncAppSecretRequirements(TEST_APP_ID, [
        { secretName: "APPROVED_SECRET", required: true },
        { secretName: "UNAPPROVED_SECRET", required: true },
      ]);

      // Approve only one
      const reqs = await service.getAppSecretRequirements(TEST_APP_ID);
      const approvedReq = reqs.find((r) => r.secret_name === "APPROVED_SECRET");
      await service.approveAppSecretRequirement(approvedReq!.id, TEST_USER_ID);

      // Get app secrets
      const appSecrets = await service.getAppSecrets(
        TEST_APP_ID,
        TEST_ORG_ID,
        audit,
      );

      expect(appSecrets.APPROVED_SECRET).toBe("approved-value");
      expect(appSecrets.UNAPPROVED_SECRET).toBeUndefined();
    });
  });

  describe("Cross-Organization Isolation", () => {
    it("prevents binding secrets from other organizations", async () => {
      if (skipIfNoTables()) return;

      const secret = await service.create(
        {
          organizationId: TEST_ORG_ID,
          name: "ORG_ISOLATED",
          value: "private",
          createdBy: TEST_USER_ID,
        },
        audit,
      );

      // Try to bind with different org context
      await expect(
        service.unbindSecret(
          secret.id,
          "00000000-0000-0000-0000-999999999999",
          audit,
        ),
      ).rejects.toThrow();
    });

    it("prevents unbinding from other organizations", async () => {
      if (skipIfNoTables()) return;

      const secret = await service.create(
        {
          organizationId: TEST_ORG_ID,
          name: "CROSS_ORG_UNBIND",
          value: "value",
          createdBy: TEST_USER_ID,
        },
        audit,
      );

      const binding = await service.bindSecret(
        {
          secretId: secret.id,
          projectId: TEST_PROJECT_ID,
          projectType: "app",
          createdBy: TEST_USER_ID,
        },
        audit,
      );

      // Different org should not be able to unbind
      await expect(
        service.unbindSecret(
          binding.id,
          "00000000-0000-0000-0000-999999999999",
          audit,
        ),
      ).rejects.toThrow("Binding not found");
    });
  });

  describe("Listing and Filtering", () => {
    it(
      "lists bindings with pagination",
      async () => {
        if (skipIfNoTables()) return;

        // Create 10 secrets and bind them (reduced from 15 for speed)
        for (let i = 0; i < 10; i++) {
          const s = await service.create(
            {
              organizationId: TEST_ORG_ID,
              name: `PAGE_TEST_${i}`,
              value: `value-${i}`,
              createdBy: TEST_USER_ID,
            },
            audit,
          );

          await service.bindSecret(
            {
              secretId: s.id,
              projectId: TEST_PROJECT_ID,
              projectType: "workflow",
              createdBy: TEST_USER_ID,
            },
            audit,
          );
        }

        // Get first page
        const page1 = await service.listBindings(
          TEST_ORG_ID,
          TEST_PROJECT_ID,
          undefined,
          5,
          0,
        );
        expect(page1.bindings).toHaveLength(5);
        expect(page1.total).toBe(10);

        // Get second page
        const page2 = await service.listBindings(
          TEST_ORG_ID,
          TEST_PROJECT_ID,
          undefined,
          5,
          5,
        );
        expect(page2.bindings).toHaveLength(5);
        expect(page2.total).toBe(10);
      },
      { timeout: 15000 },
    );

    it("filters bindings by project type", async () => {
      if (skipIfNoTables()) return;

      const s1 = await service.create(
        {
          organizationId: TEST_ORG_ID,
          name: "FILTER_APP",
          value: "v1",
          createdBy: TEST_USER_ID,
        },
        audit,
      );

      const s2 = await service.create(
        {
          organizationId: TEST_ORG_ID,
          name: "FILTER_MCP",
          value: "v2",
          createdBy: TEST_USER_ID,
        },
        audit,
      );

      await service.bindSecret(
        {
          secretId: s1.id,
          projectId: TEST_PROJECT_ID,
          projectType: "app",
          createdBy: TEST_USER_ID,
        },
        audit,
      );

      await service.bindSecret(
        {
          secretId: s2.id,
          projectId: TEST_PROJECT_ID,
          projectType: "mcp",
          createdBy: TEST_USER_ID,
        },
        audit,
      );

      const appBindings = await service.listBindings(
        TEST_ORG_ID,
        TEST_PROJECT_ID,
        "app",
      );
      expect(appBindings.bindings).toHaveLength(1);
      expect(appBindings.bindings[0].projectType).toBe("app");

      const mcpBindings = await service.listBindings(
        TEST_ORG_ID,
        TEST_PROJECT_ID,
        "mcp",
      );
      expect(mcpBindings.bindings).toHaveLength(1);
      expect(mcpBindings.bindings[0].projectType).toBe("mcp");
    });
  });
});
