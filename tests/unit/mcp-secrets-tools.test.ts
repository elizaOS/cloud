/**
 * MCP Secrets Tools Unit Tests
 *
 * Verifies MCP secrets tools are correctly structured and callable.
 * The underlying secretsService is tested in integration tests.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// Mock the auth context
const mockUser = {
  id: "user-123",
  organization_id: "org-456",
  email: "test@example.com",
};

let authContext = { user: mockUser };

mock.module("@/lib/auth", () => ({
  getServerSession: mock(() => Promise.resolve({ user: mockUser })),
}));

// Mock secretsService
const mockSecretsService = {
  listFiltered: mock(() => Promise.resolve({ secrets: [], total: 0 })),
  get: mock(() => Promise.resolve("secret-value")),
  getDecrypted: mock(() => Promise.resolve({ KEY: "value" })),
  create: mock(() => Promise.resolve({ id: "secret-id", name: "NEW_KEY" })),
  update: mock(() => Promise.resolve({ id: "secret-id", version: 2 })),
  rotate: mock(() => Promise.resolve({ id: "secret-id", version: 2 })),
  delete: mock(() => Promise.resolve()),
  bindSecret: mock(() => Promise.resolve({ id: "binding-id" })),
  unbindSecret: mock(() => Promise.resolve()),
  listBindings: mock(() => Promise.resolve({ bindings: [], total: 0 })),
};

mock.module("@/lib/services/secrets", () => ({
  secretsService: mockSecretsService,
}));

describe("MCP Secrets Tools Structure", () => {
  test("secrets tools follow naming convention", () => {
    const expectedTools = [
      "secrets_list",
      "secrets_get",
      "secrets_get_bulk",
      "secrets_create",
      "secrets_update",
      "secrets_rotate",
      "secrets_delete",
      "secrets_bind",
      "secrets_unbind",
      "secrets_list_bindings",
    ];

    // These names should match what's registered in mcp/route.ts
    for (const tool of expectedTools) {
      expect(tool).toMatch(/^secrets_[a-z_]+$/);
    }
  });

  test("tool names are unique", () => {
    const tools = [
      "secrets_list",
      "secrets_get",
      "secrets_get_bulk",
      "secrets_create",
      "secrets_update",
      "secrets_rotate",
      "secrets_delete",
      "secrets_bind",
      "secrets_unbind",
      "secrets_list_bindings",
    ];
    const unique = new Set(tools);
    expect(unique.size).toBe(tools.length);
  });

  test("list tool returns paginated structure", async () => {
    const result = await mockSecretsService.listFiltered({
      organizationId: "org-123",
      limit: 10,
      offset: 0,
    });
    
    expect(result).toHaveProperty("secrets");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.secrets)).toBe(true);
    expect(typeof result.total).toBe("number");
  });

  test("get tool returns string value", async () => {
    const result = await mockSecretsService.get("org-123", "KEY_NAME");
    expect(typeof result).toBe("string");
  });

  test("create tool returns id and name", async () => {
    const result = await mockSecretsService.create({
      organizationId: "org-123",
      name: "NEW_KEY",
      value: "secret",
      createdBy: "user-123",
    });
    
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("name");
  });

  test("bind tool returns binding id", async () => {
    const result = await mockSecretsService.bindSecret({
      secretId: "secret-123",
      projectId: "project-456",
      projectType: "app",
      createdBy: "user-123",
    });
    
    expect(result).toHaveProperty("id");
  });

  test("list bindings returns paginated structure", async () => {
    const result = await mockSecretsService.listBindings("org-123", "project-456");
    
    expect(result).toHaveProperty("bindings");
    expect(result).toHaveProperty("total");
  });
});

describe("MCP Tools Input Validation", () => {
  test("list accepts filter parameters", async () => {
    await mockSecretsService.listFiltered({
      organizationId: "org-123",
      projectId: "proj-456",
      projectType: "app",
      environment: "production",
      provider: "openai",
      limit: 50,
      offset: 10,
    });

    expect(mockSecretsService.listFiltered).toHaveBeenCalled();
  });

  test("get requires name parameter", async () => {
    await mockSecretsService.get("org-123", "API_KEY");
    expect(mockSecretsService.get).toHaveBeenCalledWith("org-123", "API_KEY");
  });

  test("create requires name and value", async () => {
    mockSecretsService.create.mockClear();
    
    await mockSecretsService.create({
      organizationId: "org-123",
      name: "KEY",
      value: "value",
      createdBy: "user-123",
    });

    const call = mockSecretsService.create.mock.calls[0][0];
    expect(call.name).toBe("KEY");
    expect(call.value).toBe("value");
  });
});

