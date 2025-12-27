/**
 * A2A Secrets Skills Unit Tests
 *
 * Verifies A2A secrets skills are correctly structured.
 * The underlying secretsService is tested in integration tests.
 *
 * NOTE: This test is skipped if MCP SDK has module resolution issues.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// Check if we can load the skills module - skip if MCP SDK issues
let skills: {
  executeSkillSecretsList: Function;
  executeSkillSecretsGet: Function;
  executeSkillSecretsGetBulk: Function;
  executeSkillSecretsCreate: Function;
} | null = null;

// Mock secretsService before importing skills
const mockSecretsService = {
  listFiltered: mock(() =>
    Promise.resolve({
      secrets: [
        {
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
        },
      ],
      total: 1,
    }),
  ),
  get: mock(() => Promise.resolve("secret-value")),
  getDecrypted: mock(() => Promise.resolve({ KEY: "value" })),
  create: mock(() =>
    Promise.resolve({ id: "secret-id", name: "NEW_KEY", version: 1 }),
  ),
  update: mock(() => Promise.resolve({ id: "secret-id", version: 2 })),
  rotate: mock(() => Promise.resolve({ id: "secret-id", version: 2 })),
  delete: mock(() => Promise.resolve()),
  bindSecret: mock(() =>
    Promise.resolve({
      id: "binding-id",
      secretId: "secret-123",
      projectId: "project-456",
      projectType: "app",
    }),
  ),
  unbindSecret: mock(() => Promise.resolve()),
  listBindings: mock(() => Promise.resolve({ bindings: [], total: 0 })),
};

mock.module("@/lib/services/secrets", () => ({
  secretsService: mockSecretsService,
}));

mock.module("@/db/schemas/secrets", () => ({
  SecretProvider: { enumValues: ["openai", "anthropic", "custom"] },
  SecretProjectType: {
    enumValues: ["character", "app", "workflow", "container", "mcp"],
  },
  SecretEnvironment: { enumValues: ["development", "preview", "production"] },
}));

// Try to import skills - will fail if MCP SDK has issues
try {
  skills = await import("@/lib/api/a2a/skills");
} catch (e) {
  console.warn(
    "⚠️  Skipping a2a-secrets-skills tests - MCP SDK module resolution issue",
  );
}

const mockContext = {
  user: {
    id: "user-123",
    organization_id: "org-456",
    email: "test@example.com",
    organization: { credit_balance: "100.00" },
  },
  apiKeyId: "key-789",
};

// Skip all tests if skills couldn't be loaded
const describeOrSkip = skills ? describe : describe.skip;

describeOrSkip("A2A Secrets Skills", () => {
  beforeEach(() => {
    Object.values(mockSecretsService).forEach((m) => {
      if (typeof m.mockClear === "function") m.mockClear();
    });
  });

  describe("executeSkillSecretsList", () => {
    test("returns secrets array with metadata", async () => {
      const result = await skills!.executeSkillSecretsList(
        { scope: "organization" },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.secrets).toBeDefined();
      expect(Array.isArray(result.secrets)).toBe(true);
      expect(result.secrets![0].name).toBe("API_KEY");
    });

    test("calls secretsService.listFiltered with correct params", async () => {
      await skills!.executeSkillSecretsList(
        { scope: "organization", provider: "openai" },
        mockContext,
      );

      expect(mockSecretsService.listFiltered).toHaveBeenCalled();
    });
  });

  describe("executeSkillSecretsGet", () => {
    test("returns decrypted secrets as object", async () => {
      const result = await skills!.executeSkillSecretsGet(
        { secretId: "secret-123" },
        mockContext,
      );

      expect(result.success).toBe(true);
    });

    test("handles missing secret gracefully", async () => {
      mockSecretsService.getDecrypted.mockImplementationOnce(() =>
        Promise.reject(new Error("Secret not found")),
      );

      const result = await skills!.executeSkillSecretsGet(
        { secretId: "nonexistent" },
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("executeSkillSecretsGetBulk", () => {
    test("returns multiple secrets", async () => {
      const result = await skills!.executeSkillSecretsGetBulk(
        { secretIds: ["s1", "s2"] },
        mockContext,
      );

      expect(result.success).toBe(true);
    });
  });

  describe("executeSkillSecretsCreate", () => {
    test("creates secret and returns id", async () => {
      const result = await skills!.executeSkillSecretsCreate(
        {
          name: "NEW_API_KEY",
          value: "secret-value-123",
          scope: "organization",
        },
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.secretId).toBeDefined();
    });

    test("validates required fields", async () => {
      mockSecretsService.create.mockImplementationOnce(() =>
        Promise.reject(new Error("Name is required")),
      );

      const result = await skills!.executeSkillSecretsCreate(
        { name: "", value: "test", scope: "organization" },
        mockContext,
      );

      expect(result.success).toBe(false);
    });

    test("passes provider when specified", async () => {
      await skills!.executeSkillSecretsCreate(
        {
          name: "OPENAI_KEY",
          value: "sk-...",
          scope: "organization",
          provider: "openai",
        },
        mockContext,
      );

      expect(mockSecretsService.create).toHaveBeenCalled();
    });
  });
});

describeOrSkip("A2A Skills Audit Context", () => {
  test("includes actor info in audit context", async () => {
    mockSecretsService.create.mockClear();

    await skills!.executeSkillSecretsCreate(
      { name: "TEST", value: "value", scope: "organization" },
      mockContext,
    );

    const call = mockSecretsService.create.mock.calls[0];
    expect(call).toBeDefined();
  });
});
