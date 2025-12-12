import { describe, it, expect, beforeEach, mock } from "bun:test";
import { SecretsService, type AuditContext } from "@/lib/services/secrets/secrets";
import {
  SecretsEncryptionService,
  LocalKMSProvider,
} from "@/lib/services/secrets/encryption";
import type { SecretProjectType } from "@/db/schemas/secrets";

const TEST_KEY = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
const ORG_ID = "org-test-bindings";
const USER_ID = "user-test-bindings";

// Mock repositories
const mockSecretsFindById = mock(() => Promise.resolve(undefined));
const mockSecretsCreate = mock(() => Promise.resolve({} as never));
const mockSecretsFindByName = mock(() => Promise.resolve(undefined));
const mockSecretsFindByContext = mock(() => Promise.resolve([] as never[]));
const mockSecretsListByOrganization = mock(() => Promise.resolve([] as never[]));
const mockSecretsListByProject = mock(() => Promise.resolve([] as never[]));
const mockSecretsListFiltered = mock(() => Promise.resolve({ secrets: [], total: 0 } as never));
const mockSecretsUpdate = mock(() => Promise.resolve({} as never));
const mockSecretsDelete = mock(() => Promise.resolve(true));
const mockSecretsRecordAccess = mock(() => Promise.resolve());

const mockBindingsCreate = mock(() => Promise.resolve({} as never));
const mockBindingsFindById = mock(() => Promise.resolve(undefined));
const mockBindingsFindByProject = mock(() => Promise.resolve([] as never[]));
const mockBindingsFindBySecret = mock(() => Promise.resolve([] as never[]));
const mockBindingsFindBySecretAndProject = mock(() => Promise.resolve(undefined));
const mockBindingsDelete = mock(() => Promise.resolve());

const mockAppReqsCreate = mock(() => Promise.resolve({} as never));
const mockAppReqsFindById = mock(() => Promise.resolve(undefined));
const mockAppReqsFindByAppAndName = mock(() => Promise.resolve(undefined));
const mockAppReqsFindByApp = mock(() => Promise.resolve([] as never[]));
const mockAppReqsFindApprovedByApp = mock(() => Promise.resolve([] as never[]));
const mockAppReqsSyncRequirements = mock(() => Promise.resolve([] as never[]));
const mockAppReqsApprove = mock(() => Promise.resolve({} as never));
const mockAppReqsRevoke = mock(() => Promise.resolve({} as never));
const mockAppReqsUpdate = mock(() => Promise.resolve({} as never));
const mockAppReqsDelete = mock(() => Promise.resolve());

const mockAuditCreate = mock(() => Promise.resolve({} as never));
const mockAuditFindBySecret = mock(() => Promise.resolve([] as never[]));
const mockAuditFindByOrg = mock(() => Promise.resolve([] as never[]));

const mockOauthFindByOrgAndProvider = mock(() => Promise.resolve(undefined));
const mockOauthCreate = mock(() => Promise.resolve({} as never));
const mockOauthUpdate = mock(() => Promise.resolve({} as never));
const mockOauthRecordUsage = mock(() => Promise.resolve());
const mockOauthRevoke = mock(() => Promise.resolve({} as never));
const mockOauthFindById = mock(() => Promise.resolve(undefined));
const mockOauthListByOrganization = mock(() => Promise.resolve([] as never[]));

mock.module("@/db/repositories/secrets", () => ({
  secretsRepository: {
    create: mockSecretsCreate,
    findById: mockSecretsFindById,
    findByName: mockSecretsFindByName,
    findByContext: mockSecretsFindByContext,
    listByOrganization: mockSecretsListByOrganization,
    listByProject: mockSecretsListByProject,
    listFiltered: mockSecretsListFiltered,
    update: mockSecretsUpdate,
    delete: mockSecretsDelete,
    recordAccess: mockSecretsRecordAccess,
  },
  secretBindingsRepository: {
    create: mockBindingsCreate,
    findById: mockBindingsFindById,
    findByProject: mockBindingsFindByProject,
    findBySecret: mockBindingsFindBySecret,
    findBySecretAndProject: mockBindingsFindBySecretAndProject,
    delete: mockBindingsDelete,
  },
  appSecretRequirementsRepository: {
    create: mockAppReqsCreate,
    findById: mockAppReqsFindById,
    findByAppAndName: mockAppReqsFindByAppAndName,
    findByApp: mockAppReqsFindByApp,
    findApprovedByApp: mockAppReqsFindApprovedByApp,
    syncRequirements: mockAppReqsSyncRequirements,
    approve: mockAppReqsApprove,
    revoke: mockAppReqsRevoke,
    update: mockAppReqsUpdate,
    delete: mockAppReqsDelete,
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
    findBySecret: mockAuditFindBySecret,
    findByOrganization: mockAuditFindByOrg,
  },
}));

const resetMocks = () => {
  [
    mockSecretsFindById, mockSecretsCreate, mockSecretsFindByName,
    mockSecretsFindByContext, mockSecretsListByOrganization, mockSecretsListByProject,
    mockSecretsListFiltered, mockSecretsUpdate, mockSecretsDelete, mockSecretsRecordAccess,
    mockBindingsCreate, mockBindingsFindById, mockBindingsFindByProject,
    mockBindingsFindBySecret, mockBindingsFindBySecretAndProject, mockBindingsDelete,
    mockAppReqsCreate, mockAppReqsFindById, mockAppReqsFindByAppAndName,
    mockAppReqsFindByApp, mockAppReqsFindApprovedByApp, mockAppReqsSyncRequirements,
    mockAppReqsApprove, mockAppReqsRevoke, mockAppReqsUpdate, mockAppReqsDelete,
    mockAuditCreate, mockAuditFindBySecret, mockAuditFindByOrg,
    mockOauthFindByOrgAndProvider, mockOauthCreate, mockOauthUpdate,
    mockOauthRecordUsage, mockOauthRevoke, mockOauthFindById, mockOauthListByOrganization,
  ].forEach(m => m.mockReset());
};

const auditCtx: AuditContext = {
  actorType: "user",
  actorId: USER_ID,
  source: "test",
};

describe("Secret Bindings", () => {
  let service: SecretsService;

  beforeEach(() => {
    resetMocks();
    const encryption = new SecretsEncryptionService(new LocalKMSProvider(TEST_KEY));
    service = new SecretsService(encryption);
  });

  describe("bindSecret", () => {
    it("creates a binding between secret and project", async () => {
      const secretId = "secret-123";
      const projectId = "project-456";

      mockSecretsFindById.mockResolvedValue({
        id: secretId,
        organization_id: ORG_ID,
        name: "API_KEY",
      } as never);

      mockBindingsCreate.mockResolvedValue({
        id: "binding-789",
        secret_id: secretId,
        organization_id: ORG_ID,
        project_id: projectId,
        project_type: "app",
        created_by: USER_ID,
        created_at: new Date(),
      } as never);

      const result = await service.bindSecret({
        secretId,
        projectId,
        projectType: "app",
        createdBy: USER_ID,
      }, auditCtx);

      expect(result.id).toBe("binding-789");
      expect(result.secretId).toBe(secretId);
      expect(result.projectId).toBe(projectId);
      expect(result.projectType).toBe("app");
      expect(mockBindingsCreate).toHaveBeenCalledTimes(1);
    });

    it("throws when secret not found", async () => {
      mockSecretsFindById.mockResolvedValue(undefined);

      await expect(
        service.bindSecret({
          secretId: "nonexistent",
          projectId: "project-1",
          projectType: "app",
          createdBy: USER_ID,
        }, auditCtx)
      ).rejects.toThrow("Secret not found");
    });

    it("supports all project types", async () => {
      const projectTypes: SecretProjectType[] = ["character", "app", "workflow", "container", "mcp"];

      for (const projectType of projectTypes) {
        mockSecretsFindById.mockResolvedValue({
          id: "secret-123",
          organization_id: ORG_ID,
          name: "KEY",
        } as never);

        mockBindingsCreate.mockResolvedValue({
          id: `binding-${projectType}`,
          secret_id: "secret-123",
          organization_id: ORG_ID,
          project_id: `project-${projectType}`,
          project_type: projectType,
          created_by: USER_ID,
          created_at: new Date(),
        } as never);

        const result = await service.bindSecret({
          secretId: "secret-123",
          projectId: `project-${projectType}`,
          projectType,
          createdBy: USER_ID,
        }, auditCtx);

        expect(result.projectType).toBe(projectType);
      }
    });
  });

  describe("bindSecrets (bulk)", () => {
    it("binds multiple secrets to a project", async () => {
      const secretIds = ["s1", "s2", "s3"];
      const projectId = "project-bulk";

      let callCount = 0;
      mockSecretsFindById.mockImplementation(async () => ({
        id: secretIds[callCount++] || "s1",
        organization_id: ORG_ID,
        name: `KEY_${callCount}`,
      } as never));

      let bindCount = 0;
      mockBindingsCreate.mockImplementation(async () => ({
        id: `binding-${++bindCount}`,
        secret_id: secretIds[bindCount - 1],
        organization_id: ORG_ID,
        project_id: projectId,
        project_type: "workflow",
        created_by: USER_ID,
        created_at: new Date(),
      } as never));

      const result = await service.bindSecrets(
        secretIds,
        projectId,
        "workflow",
        USER_ID,
        auditCtx
      );

      expect(result.bound.length).toBe(3);
      expect(result.errors.length).toBe(0);
      expect(mockBindingsCreate).toHaveBeenCalledTimes(3);
    });

    it("returns partial success when some bindings fail", async () => {
      const secretIds = ["s1", "s2", "s3"];

      let callCount = 0;
      mockSecretsFindById.mockImplementation(async () => {
        callCount++;
        if (callCount === 2) return undefined; // s2 not found
        return {
          id: secretIds[callCount - 1],
          organization_id: ORG_ID,
          name: `KEY_${callCount}`,
        } as never;
      });

      mockBindingsCreate.mockResolvedValue({
        id: "binding-success",
        secret_id: "s1",
        organization_id: ORG_ID,
        project_id: "project-1",
        project_type: "app",
        created_by: USER_ID,
        created_at: new Date(),
      } as never);

      const result = await service.bindSecrets(
        secretIds,
        "project-1",
        "app",
        USER_ID,
        auditCtx
      );

      expect(result.bound.length).toBe(2);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].secretId).toBe("s2");
      expect(result.errors[0].error).toContain("not found");
    });

    it("handles empty array", async () => {
      const result = await service.bindSecrets(
        [],
        "project-1",
        "app",
        USER_ID,
        auditCtx
      );

      expect(result.bound.length).toBe(0);
      expect(result.errors.length).toBe(0);
    });
  });

  describe("unbindSecret", () => {
    it("removes a binding", async () => {
      mockBindingsFindById.mockResolvedValue({
        id: "binding-123",
        secret_id: "secret-123",
        organization_id: ORG_ID,
        project_id: "project-1",
        project_type: "app",
      } as never);

      mockSecretsFindById.mockResolvedValue({
        id: "secret-123",
        organization_id: ORG_ID,
        name: "KEY",
      } as never);

      await service.unbindSecret("binding-123", ORG_ID, auditCtx);

      expect(mockBindingsDelete).toHaveBeenCalledWith("binding-123");
    });

    it("throws when binding not found", async () => {
      mockBindingsFindById.mockResolvedValue(undefined);

      await expect(
        service.unbindSecret("nonexistent", ORG_ID, auditCtx)
      ).rejects.toThrow("Binding not found");
    });

    it("throws when secret belongs to different org", async () => {
      mockBindingsFindById.mockResolvedValue({
        id: "binding-123",
        secret_id: "secret-123",
        organization_id: ORG_ID,
      } as never);

      mockSecretsFindById.mockResolvedValue({
        id: "secret-123",
        organization_id: "other-org", // Different org
        name: "KEY",
      } as never);

      await expect(
        service.unbindSecret("binding-123", ORG_ID, auditCtx)
      ).rejects.toThrow("Secret not found");
    });
  });

  describe("listBindings", () => {
    it("returns bindings for a project", async () => {
      mockBindingsFindByProject.mockResolvedValue([
        {
          id: "b1",
          secret_id: "s1",
          organization_id: ORG_ID,
          project_id: "project-1",
          project_type: "app",
          created_by: USER_ID,
          created_at: new Date(),
        },
        {
          id: "b2",
          secret_id: "s2",
          organization_id: ORG_ID,
          project_id: "project-1",
          project_type: "app",
          created_by: USER_ID,
          created_at: new Date(),
        },
      ] as never[]);

      mockSecretsFindById.mockImplementation(async (id) => ({
        id,
        name: id === "s1" ? "API_KEY" : "DATABASE_URL",
        organization_id: ORG_ID,
      } as never));

      const bindings = await service.listBindings("project-1");

      expect(bindings.length).toBe(2);
      expect(bindings[0].secretName).toBe("API_KEY");
      expect(bindings[1].secretName).toBe("DATABASE_URL");
    });

    it("filters by project type", async () => {
      mockBindingsFindByProject.mockResolvedValue([]);

      await service.listBindings("project-1", "workflow");

      expect(mockBindingsFindByProject).toHaveBeenCalledWith("project-1", "workflow");
    });
  });
});

describe("listFiltered", () => {
  let service: SecretsService;

  beforeEach(() => {
    resetMocks();
    const encryption = new SecretsEncryptionService(new LocalKMSProvider(TEST_KEY));
    service = new SecretsService(encryption);
  });

  it("returns filtered secrets with pagination", async () => {
    mockSecretsListFiltered.mockResolvedValue({
      secrets: [
        {
          id: "s1",
          name: "OPENAI_KEY",
          organization_id: ORG_ID,
          provider: "openai",
          version: 1,
          created_at: new Date(),
          updated_at: new Date(),
          access_count: 5,
        },
      ],
      total: 10,
    } as never);

    const result = await service.listFiltered({
      organizationId: ORG_ID,
      provider: "openai",
      limit: 10,
      offset: 0,
    });

    expect(result.secrets.length).toBe(1);
    expect(result.total).toBe(10);
    expect(result.secrets[0].name).toBe("OPENAI_KEY");
  });

  it("passes all filter parameters", async () => {
    mockSecretsListFiltered.mockResolvedValue({ secrets: [], total: 0 } as never);

    await service.listFiltered({
      organizationId: ORG_ID,
      provider: "anthropic",
      projectType: "container",
      environment: "production",
      limit: 50,
      offset: 100,
    });

    expect(mockSecretsListFiltered).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      projectId: undefined,
      projectType: "container",
      environment: "production",
      provider: "anthropic",
      limit: 50,
      offset: 100,
    });
  });

  it("passes through undefined for optional parameters", async () => {
    mockSecretsListFiltered.mockResolvedValue({ secrets: [], total: 0 } as never);

    await service.listFiltered({ organizationId: ORG_ID });

    expect(mockSecretsListFiltered).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_ID,
      })
    );
  });
});

describe("App Secret Requirements", () => {
  let service: SecretsService;

  beforeEach(() => {
    resetMocks();
    const encryption = new SecretsEncryptionService(new LocalKMSProvider(TEST_KEY));
    service = new SecretsService(encryption);
  });

  describe("getAppSecretRequirements", () => {
    it("returns app secret requirements", async () => {
      mockAppReqsFindByApp.mockResolvedValue([
        {
          id: "req-1",
          app_id: "app-123",
          secret_name: "OPENAI_API_KEY",
          required: true,
          approved: false,
          approved_by: null,
          approved_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: "req-2",
          app_id: "app-123",
          secret_name: "OPTIONAL_KEY",
          required: false,
          approved: true,
          approved_by: USER_ID,
          approved_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as never[]);

      const requirements = await service.getAppSecretRequirements("app-123");

      expect(requirements.length).toBe(2);
      expect(requirements[0].secret_name).toBe("OPENAI_API_KEY");
      expect(requirements[0].approved).toBe(false);
      expect(requirements[1].approved).toBe(true);
    });
  });

  describe("syncAppSecretRequirements", () => {
    it("syncs requirements from app manifest", async () => {
      const manifestReqs = [
        { secretName: "API_KEY", required: true },
        { secretName: "WEBHOOK_SECRET", required: false },
      ];

      mockAppReqsSyncRequirements.mockResolvedValue([
        {
          id: "req-1",
          app_id: "app-123",
          secret_name: "API_KEY",
          required: true,
          approved: false,
          approved_by: null,
          approved_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: "req-2",
          app_id: "app-123",
          secret_name: "WEBHOOK_SECRET",
          required: false,
          approved: false,
          approved_by: null,
          approved_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ] as never[]);

      const synced = await service.syncAppSecretRequirements("app-123", manifestReqs);

      expect(synced.length).toBe(2);
      expect(mockAppReqsSyncRequirements).toHaveBeenCalledWith("app-123", manifestReqs);
    });
  });

  describe("approveAppSecretRequirement", () => {
    it("marks a requirement as approved", async () => {
      mockAppReqsApprove.mockResolvedValue({
        id: "req-1",
        app_id: "app-123",
        secret_name: "API_KEY",
        required: true,
        approved: true,
        approved_by: USER_ID,
        approved_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      } as never);

      const result = await service.approveAppSecretRequirement("req-1", USER_ID);

      expect(result.approved).toBe(true);
      expect(result.approved_by).toBe(USER_ID);
      expect(mockAppReqsApprove).toHaveBeenCalledWith("req-1", USER_ID);
    });
  });

  describe("revokeAppSecretRequirement", () => {
    it("revokes an approved requirement", async () => {
      mockAppReqsRevoke.mockResolvedValue({
        id: "req-1",
        app_id: "app-123",
        secret_name: "API_KEY",
        approved: false,
        approved_by: null,
        approved_at: null,
      } as never);

      const result = await service.revokeAppSecretRequirement("req-1");

      expect(result.approved).toBe(false);
      expect(result.approved_by).toBeNull();
    });
  });

  describe("getApprovedAppSecrets", () => {
    it("returns only approved secret names", async () => {
      mockAppReqsFindApprovedByApp.mockResolvedValue([
        { id: "req-1", app_id: "app-123", secret_name: "APPROVED_1", approved: true },
        { id: "req-3", app_id: "app-123", secret_name: "APPROVED_2", approved: true },
      ] as never[]);

      const approved = await service.getApprovedAppSecrets("app-123");

      expect(approved).toEqual(["APPROVED_1", "APPROVED_2"]);
    });
  });

  describe("getAppSecrets", () => {
    it("returns decrypted values only for approved secrets", async () => {
      mockAppReqsFindApprovedByApp.mockResolvedValue([
        { id: "req-1", app_id: "app-123", secret_name: "APPROVED_KEY", approved: true },
      ] as never[]);

      const enc = await service["encryption"].encrypt("secret-value");
      mockSecretsFindByContext.mockResolvedValue([
        {
          id: "s1",
          name: "APPROVED_KEY",
          organization_id: ORG_ID,
          encrypted_value: enc.encryptedValue,
          encrypted_dek: enc.encryptedDek,
          nonce: enc.nonce,
          auth_tag: enc.authTag,
        },
      ] as never[]);

      const secrets = await service.getAppSecrets("app-123", ORG_ID);

      expect(Object.keys(secrets)).toEqual(["APPROVED_KEY"]);
      expect(secrets.APPROVED_KEY).toBe("secret-value");
    });
  });
});

describe("bulkCreate", () => {
  let service: SecretsService;

  beforeEach(() => {
    resetMocks();
    const encryption = new SecretsEncryptionService(new LocalKMSProvider(TEST_KEY));
    service = new SecretsService(encryption);
  });

  it("creates multiple secrets at once", async () => {
    mockSecretsFindByName.mockResolvedValue(undefined);

    let createCount = 0;
    mockSecretsCreate.mockImplementation(async () => ({
      id: `secret-${++createCount}`,
      organization_id: ORG_ID,
      name: `KEY_${createCount}`,
      version: 1,
      created_at: new Date(),
      updated_at: new Date(),
    } as never));

    const result = await service.bulkCreate({
      organizationId: ORG_ID,
      secrets: [
        { name: "KEY_1", value: "value1" },
        { name: "KEY_2", value: "value2" },
        { name: "KEY_3", value: "value3", description: "Third key" },
      ],
      createdBy: USER_ID,
    }, auditCtx);

    expect(result.created.length).toBe(3);
    expect(result.errors.length).toBe(0);
    expect(mockSecretsCreate).toHaveBeenCalledTimes(3);
  });

  it("handles partial failures gracefully", async () => {
    let callCount = 0;
    mockSecretsFindByName.mockImplementation(async () => {
      callCount++;
      // Second secret already exists
      if (callCount === 2) {
        return { id: "existing", name: "DUPLICATE" } as never;
      }
      return undefined;
    });

    mockSecretsCreate.mockResolvedValue({
      id: "secret-new",
      organization_id: ORG_ID,
      name: "KEY",
      version: 1,
      created_at: new Date(),
      updated_at: new Date(),
    } as never);

    const result = await service.bulkCreate({
      organizationId: ORG_ID,
      secrets: [
        { name: "KEY_1", value: "value1" },
        { name: "DUPLICATE", value: "value2" },
        { name: "KEY_3", value: "value3" },
      ],
      createdBy: USER_ID,
    }, auditCtx);

    expect(result.created.length).toBe(2);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].name).toBe("DUPLICATE");
    expect(result.errors[0].error).toContain("already exists");
  });

  it("validates secret size limits", async () => {
    mockSecretsFindByName.mockResolvedValue(undefined);

    const result = await service.bulkCreate({
      organizationId: ORG_ID,
      secrets: [
        { name: "TOO_LARGE", value: "x".repeat(65537) }, // Over 64KB
      ],
      createdBy: USER_ID,
    }, auditCtx);

    expect(result.created.length).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].error).toContain("exceeds maximum size");
  });

  it("handles empty array", async () => {
    const result = await service.bulkCreate({
      organizationId: ORG_ID,
      secrets: [],
      createdBy: USER_ID,
    }, auditCtx);

    expect(result.created.length).toBe(0);
    expect(result.errors.length).toBe(0);
  });
});

describe("Concurrent Binding Operations", () => {
  let service: SecretsService;

  beforeEach(() => {
    resetMocks();
    const encryption = new SecretsEncryptionService(new LocalKMSProvider(TEST_KEY));
    service = new SecretsService(encryption);
  });

  it("handles parallel binding operations", async () => {
    const secrets = Array.from({ length: 10 }, (_, i) => `secret-${i}`);

    mockSecretsFindById.mockImplementation(async (id) => ({
      id,
      organization_id: ORG_ID,
      name: `KEY_${id}`,
    } as never));

    let bindCount = 0;
    mockBindingsCreate.mockImplementation(async () => ({
      id: `binding-${++bindCount}`,
      secret_id: `secret-${bindCount - 1}`,
      organization_id: ORG_ID,
      project_id: "project-1",
      project_type: "app",
      created_by: USER_ID,
      created_at: new Date(),
    } as never));

    const operations = secrets.map((secretId) =>
      service.bindSecret({
        secretId,
        projectId: "project-1",
        projectType: "app",
        createdBy: USER_ID,
      }, auditCtx)
    );

    const results = await Promise.all(operations);

    expect(results.length).toBe(10);
    expect(mockBindingsCreate).toHaveBeenCalledTimes(10);
  });

  it("handles interleaved bind/unbind operations", async () => {
    mockSecretsFindById.mockResolvedValue({
      id: "secret-1",
      organization_id: ORG_ID,
      name: "KEY",
    } as never);

    mockBindingsCreate.mockResolvedValue({
      id: "binding-new",
      secret_id: "secret-1",
      organization_id: ORG_ID,
      project_id: "project-1",
      project_type: "app",
      created_by: USER_ID,
      created_at: new Date(),
    } as never);

    mockBindingsFindById.mockResolvedValue({
      id: "binding-old",
      organization_id: ORG_ID,
    } as never);

    const operations = [
      service.bindSecret({ secretId: "secret-1", projectId: "p1", projectType: "app", createdBy: USER_ID }, auditCtx),
      service.unbindSecret("binding-old", ORG_ID, auditCtx),
      service.bindSecret({ secretId: "secret-1", projectId: "p2", projectType: "app", createdBy: USER_ID }, auditCtx),
    ];

    const results = await Promise.allSettled(operations);

    const fulfilled = results.filter(r => r.status === "fulfilled");
    expect(fulfilled.length).toBe(3);
  });
});

