/**
 * A2A Secrets Skills Unit Tests
 *
 * Verifies A2A secrets skills are correctly structured.
 * The underlying secretsService is tested in integration tests.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// Mock secretsService before importing skills
const mockSecretsService = {
  listFiltered: mock(() => Promise.resolve({
    secrets: [{
      id: "s1",
      name: "API_KEY",
      description: "Test key",
      scope: "organization",
      projectId: null,
      projectType: null,
      environment: null,
      provider: "openai",
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessedAt: null,
      accessCount: 0,
    }],
    total: 1,
  })),
  get: mock(() => Promise.resolve("secret-value")),
  getDecrypted: mock(() => Promise.resolve({ KEY: "value" })),
  create: mock(() => Promise.resolve({ id: "secret-id", name: "NEW_KEY", version: 1 })),
  update: mock(() => Promise.resolve({ id: "secret-id", version: 2 })),
  rotate: mock(() => Promise.resolve({ id: "secret-id", version: 2 })),
  delete: mock(() => Promise.resolve()),
  bindSecret: mock(() => Promise.resolve({
    id: "binding-id",
    secretId: "secret-123",
    projectId: "project-456",
    projectType: "app",
  })),
  unbindSecret: mock(() => Promise.resolve()),
  listBindings: mock(() => Promise.resolve({ bindings: [], total: 0 })),
};

mock.module("@/lib/services/secrets", () => ({
  secretsService: mockSecretsService,
}));

// Mock enums
mock.module("@/db/schemas/secrets", () => ({
  SecretProvider: { enumValues: ["openai", "anthropic", "custom"] },
  SecretProjectType: { enumValues: ["character", "app", "workflow", "container", "mcp"] },
  SecretEnvironment: { enumValues: ["development", "preview", "production"] },
}));

// Import skills after mocking
import {
  executeSkillSecretsList,
  executeSkillSecretsGet,
  executeSkillSecretsGetBulk,
  executeSkillSecretsCreate,
} from "@/lib/api/a2a/skills";

const mockContext = {
  user: {
    id: "user-123",
    organization_id: "org-456",
    email: "test@example.com",
    organization: { credit_balance: "100.00" },
  },
  apiKeyId: "key-789",
};

describe("A2A Secrets Skills", () => {
  beforeEach(() => {
    Object.values(mockSecretsService).forEach(m => {
      if (typeof m.mockClear === "function") m.mockClear();
    });
  });

  describe("executeSkillSecretsList", () => {
    test("returns secrets array with metadata", async () => {
      const result = await executeSkillSecretsList({}, mockContext);

      expect(result).toHaveProperty("secrets");
      expect(result).toHaveProperty("total");
      expect(Array.isArray(result.secrets)).toBe(true);
    });

    test("passes filter parameters to service", async () => {
      await executeSkillSecretsList({
        projectId: "proj-123",
        projectType: "app",
        environment: "production",
        provider: "openai",
        limit: 50,
        offset: 10,
      }, mockContext);

      expect(mockSecretsService.listFiltered).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org-456",
          projectId: "proj-123",
          limit: 50,
          offset: 10,
        })
      );
    });
  });

  describe("executeSkillSecretsGet", () => {
    test("returns secret value", async () => {
      const result = await executeSkillSecretsGet({ name: "API_KEY" }, mockContext);

      expect(result).toHaveProperty("name", "API_KEY");
      expect(result).toHaveProperty("value", "secret-value");
    });

    test("passes name and environment to service", async () => {
      await executeSkillSecretsGet({
        name: "DB_URL",
        environment: "production",
      }, mockContext);

      expect(mockSecretsService.get).toHaveBeenCalledWith(
        "org-456",
        "DB_URL",
        undefined,
        "production",
        expect.any(Object)
      );
    });

    test("returns null for missing secret", async () => {
      mockSecretsService.get.mockResolvedValueOnce(null);

      const result = await executeSkillSecretsGet({ name: "MISSING" }, mockContext);

      expect(result).toBeNull();
    });
  });

  describe("executeSkillSecretsGetBulk", () => {
    test("returns key-value object", async () => {
      const result = await executeSkillSecretsGetBulk({
        names: ["KEY1", "KEY2"],
      }, mockContext);

      expect(typeof result).toBe("object");
      expect(result.KEY).toBe("value");
    });
  });

  describe("executeSkillSecretsCreate", () => {
    test("creates secret and returns id/name", async () => {
      const result = await executeSkillSecretsCreate({
        name: "NEW_SECRET",
        value: "secret-value",
        description: "Test secret",
      }, mockContext);

      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("name");
    });

    test("passes all parameters to service", async () => {
      await executeSkillSecretsCreate({
        name: "API_KEY",
        value: "sk-123",
        description: "API key",
        provider: "openai",
        projectId: "proj-123",
        projectType: "app",
        environment: "production",
      }, mockContext);

      expect(mockSecretsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org-456",
          name: "API_KEY",
          value: "sk-123",
          description: "API key",
          createdBy: "user-123",
        }),
        expect.any(Object)
      );
    });
  });
});

describe("A2A Skills Audit Context", () => {
  test("includes actor info in audit context", async () => {
    mockSecretsService.create.mockClear();
    
    await executeSkillSecretsCreate({
      name: "AUDIT_TEST",
      value: "value",
    }, mockContext);

    const auditArg = mockSecretsService.create.mock.calls[0][1];
    expect(auditArg).toHaveProperty("actorType", "api_key");
    expect(auditArg).toHaveProperty("actorId"); // Can be user.id or apiKeyId
    expect(auditArg).toHaveProperty("source", "a2a");
  });
});

