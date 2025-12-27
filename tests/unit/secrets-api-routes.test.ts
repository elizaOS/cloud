import { describe, it, expect, beforeEach, mock } from "bun:test";

// Mock auth before importing routes
const mockUser = {
  id: "user-123",
  email: "test@example.com",
  organization_id: "org-123",
};

mock.module("@/lib/auth", () => ({
  requireAuthOrApiKeyWithOrg: mock(async () => ({ user: mockUser })),
}));

// Mock rate limiting
mock.module("@/lib/middleware/rate-limit", () => ({
  withRateLimit: (handler: Function) => handler,
  RateLimitPresets: { STRICT: {} },
}));

// Mock secrets service
const mockSecretsService = {
  listFiltered: mock(() => Promise.resolve({ secrets: [], total: 0 })),
  create: mock(() => Promise.resolve({ id: "s1", name: "TEST" })),
  bulkCreate: mock(() => Promise.resolve({ created: [], errors: [] })),
  bindSecret: mock(() => Promise.resolve({ id: "b1" })),
  bindSecrets: mock(() => Promise.resolve({ bound: [], errors: [] })),
  unbindSecret: mock(() => Promise.resolve()),
  listBindings: mock(() => Promise.resolve([])),
  listSecretBindings: mock(() => Promise.resolve([])),
  getSecretAuditLog: mock(() => Promise.resolve([])),
  getOrganizationAuditLog: mock(() => Promise.resolve([])),
};

mock.module("@/lib/services/secrets", () => ({
  secretsService: mockSecretsService,
}));

// Mock logger
mock.module("@/lib/utils/logger", () => ({
  logger: {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
  },
}));

const resetMocks = () => {
  Object.values(mockSecretsService).forEach((m) => {
    if (typeof m.mockReset === "function") m.mockReset();
  });
};

describe("Provider Test Endpoint", () => {
  beforeEach(resetMocks);

  describe("POST /api/v1/secrets/test", () => {
    it("validates required fields", async () => {
      const { POST } = await import("@/app/api/v1/secrets/test/route");

      const request = new Request("http://localhost/api/v1/secrets/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid request");
    });

    it("rejects invalid provider", async () => {
      const { POST } = await import("@/app/api/v1/secrets/test/route");

      const request = new Request("http://localhost/api/v1/secrets/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "invalid", value: "key123" }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid request");
    });

    it("requires customTestUrl for custom provider", async () => {
      const { POST } = await import("@/app/api/v1/secrets/test/route");

      const request = new Request("http://localhost/api/v1/secrets/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "custom", value: "key123" }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("customTestUrl required");
    });

    it("validates value is not empty", async () => {
      const { POST } = await import("@/app/api/v1/secrets/test/route");

      const request = new Request("http://localhost/api/v1/secrets/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "openai", value: "" }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it("returns unsupported provider error for non-testable providers", async () => {
      const { POST } = await import("@/app/api/v1/secrets/test/route");

      // fal, slack, aws, twitter don't have test handlers
      const request = new Request("http://localhost/api/v1/secrets/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "fal", value: "key123" }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Testing not supported");
    });
  });
});

describe("Bindings Endpoints", () => {
  beforeEach(resetMocks);

  describe("GET /api/v1/secrets/bindings", () => {
    it("requires projectId or secretId query param", async () => {
      const { GET } = await import("@/app/api/v1/secrets/bindings/route");

      const request = new Request("http://localhost/api/v1/secrets/bindings", {
        method: "GET",
      });
      request.nextUrl = new URL("http://localhost/api/v1/secrets/bindings");

      const response = await GET(request as never);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("projectId or secretId");
    });

    it("validates projectType enum", async () => {
      const { GET } = await import("@/app/api/v1/secrets/bindings/route");

      const url = new URL(
        "http://localhost/api/v1/secrets/bindings?projectId=p1&projectType=invalid",
      );
      const request = new Request(url, { method: "GET" });
      request.nextUrl = url;

      const response = await GET(request as never);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid projectType");
    });

    it("returns bindings for valid projectId", async () => {
      mockSecretsService.listBindings.mockResolvedValue({
        bindings: [
          {
            id: "b1",
            secretId: "s1",
            secretName: "API_KEY",
            projectId: "p1",
            projectType: "app",
          },
        ],
        total: 1,
      });

      const { GET } = await import("@/app/api/v1/secrets/bindings/route");

      const url = new URL(
        "http://localhost/api/v1/secrets/bindings?projectId=p1",
      );
      const request = new Request(url, { method: "GET" });
      request.nextUrl = url;

      const response = await GET(request as never);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.bindings).toHaveLength(1);
      expect(data.bindings[0].secretName).toBe("API_KEY");
      expect(data.total).toBe(1);
    });

    it("returns bindings for secretId", async () => {
      mockSecretsService.listSecretBindings.mockResolvedValue([
        { id: "b1", projectId: "p1", projectType: "app" },
      ]);

      const { GET } = await import("@/app/api/v1/secrets/bindings/route");

      const url = new URL(
        "http://localhost/api/v1/secrets/bindings?secretId=s1",
      );
      const request = new Request(url, { method: "GET" });
      request.nextUrl = url;

      const response = await GET(request as never);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.bindings).toHaveLength(1);
    });
  });

  describe("POST /api/v1/secrets/bindings", () => {
    it("creates single binding", async () => {
      mockSecretsService.bindSecret.mockResolvedValue({
        id: "binding-1",
        secretId: "s1",
        projectId: "p1",
        projectType: "app",
      });

      const { POST } = await import("@/app/api/v1/secrets/bindings/route");

      const request = new Request("http://localhost/api/v1/secrets/bindings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secretId: "550e8400-e29b-41d4-a716-446655440000",
          projectId: "550e8400-e29b-41d4-a716-446655440001",
          projectType: "app",
        }),
      });

      const response = await POST(request as never);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.binding.id).toBe("binding-1");
    });

    it("creates bulk bindings", async () => {
      mockSecretsService.bindSecrets.mockResolvedValue({
        bound: [{ id: "b1" }, { id: "b2" }],
        errors: [],
      });

      const { POST } = await import("@/app/api/v1/secrets/bindings/route");

      const request = new Request("http://localhost/api/v1/secrets/bindings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secretIds: [
            "550e8400-e29b-41d4-a716-446655440000",
            "550e8400-e29b-41d4-a716-446655440001",
          ],
          projectId: "550e8400-e29b-41d4-a716-446655440002",
          projectType: "workflow",
        }),
      });

      const response = await POST(request as never);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.bound.length).toBe(2);
    });

    it("validates UUID format", async () => {
      const { POST } = await import("@/app/api/v1/secrets/bindings/route");

      const request = new Request("http://localhost/api/v1/secrets/bindings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secretId: "not-a-uuid",
          projectId: "also-not-uuid",
          projectType: "app",
        }),
      });

      const response = await POST(request as never);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid request");
    });

    it("validates projectType enum in binding", async () => {
      const { POST } = await import("@/app/api/v1/secrets/bindings/route");

      const request = new Request("http://localhost/api/v1/secrets/bindings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secretId: "550e8400-e29b-41d4-a716-446655440000",
          projectId: "550e8400-e29b-41d4-a716-446655440001",
          projectType: "invalid-type",
        }),
      });

      const response = await POST(request as never);

      expect(response.status).toBe(400);
    });
  });
});

describe("Audit Endpoint", () => {
  beforeEach(resetMocks);

  describe("GET /api/v1/secrets/audit", () => {
    it("returns organization audit log", async () => {
      mockSecretsService.getOrganizationAuditLog.mockResolvedValue([
        {
          id: "audit-1",
          secret_id: "s1",
          secret_name: "API_KEY",
          action: "created",
          actor_type: "user",
          actor_id: "u1",
          actor_email: "user@example.com",
          source: "api",
          ip_address: "127.0.0.1",
          created_at: new Date("2024-01-01T00:00:00Z"),
        },
      ]);

      const { GET } = await import("@/app/api/v1/secrets/audit/route");

      const url = new URL("http://localhost/api/v1/secrets/audit");
      const request = new Request(url, { method: "GET" });
      request.nextUrl = url;

      const response = await GET(request as never);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.entries).toHaveLength(1);
      expect(data.entries[0].action).toBe("created");
      expect(data.entries[0].secretName).toBe("API_KEY");
    });

    it("filters by secretId", async () => {
      mockSecretsService.getSecretAuditLog.mockResolvedValue([
        {
          id: "audit-1",
          secret_id: "s1",
          secret_name: "API_KEY",
          action: "read",
          actor_type: "api_key",
          actor_id: "key1",
          actor_email: null,
          source: "mcp",
          ip_address: null,
          created_at: new Date("2024-01-01T00:00:00Z"),
        },
      ]);

      const { GET } = await import("@/app/api/v1/secrets/audit/route");

      const url = new URL("http://localhost/api/v1/secrets/audit?secretId=s1");
      const request = new Request(url, { method: "GET" });
      request.nextUrl = url;

      const response = await GET(request as never);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockSecretsService.getSecretAuditLog).toHaveBeenCalledWith(
        "s1",
        100,
      );
    });

    it("respects limit parameter (max 1000)", async () => {
      mockSecretsService.getOrganizationAuditLog.mockResolvedValue([]);

      const { GET } = await import("@/app/api/v1/secrets/audit/route");

      const url = new URL("http://localhost/api/v1/secrets/audit?limit=5000");
      const request = new Request(url, { method: "GET" });
      request.nextUrl = url;

      await GET(request as never);

      expect(mockSecretsService.getOrganizationAuditLog).toHaveBeenCalledWith(
        "org-123",
        1000, // capped at 1000
      );
    });
  });
});

describe("Secrets List Endpoint", () => {
  beforeEach(resetMocks);

  describe("GET /api/v1/secrets", () => {
    it("returns filtered secrets with pagination", async () => {
      mockSecretsService.listFiltered.mockResolvedValue({
        secrets: [
          {
            id: "s1",
            name: "OPENAI_KEY",
            description: null,
            scope: "organization",
            projectId: null,
            projectType: null,
            environment: null,
            provider: "openai",
            version: 1,
            createdAt: new Date("2024-01-01"),
            updatedAt: new Date("2024-01-01"),
            lastAccessedAt: null,
            accessCount: 0,
          },
        ],
        total: 10,
      });

      const { GET } = await import("@/app/api/v1/secrets/route");

      const url = new URL(
        "http://localhost/api/v1/secrets?provider=openai&limit=10",
      );
      const request = new Request(url, { method: "GET" });
      request.nextUrl = url;

      const response = await GET(request as never);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.secrets).toHaveLength(1);
      expect(data.total).toBe(10);
      expect(mockSecretsService.listFiltered).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "openai",
          limit: 10,
        }),
      );
    });

    it("accepts all filter parameters", async () => {
      mockSecretsService.listFiltered.mockResolvedValue({
        secrets: [],
        total: 0,
      });

      const { GET } = await import("@/app/api/v1/secrets/route");

      const url = new URL(
        "http://localhost/api/v1/secrets?provider=anthropic&projectType=container&environment=production&limit=50&offset=100",
      );
      const request = new Request(url, { method: "GET" });
      request.nextUrl = url;

      await GET(request as never);

      expect(mockSecretsService.listFiltered).toHaveBeenCalledWith({
        organizationId: "org-123",
        provider: "anthropic",
        projectType: "container",
        environment: "production",
        limit: 50,
        offset: 100,
      });
    });
  });

  describe("POST /api/v1/secrets (bulk create)", () => {
    it("creates multiple secrets from array", async () => {
      mockSecretsService.bulkCreate.mockResolvedValue({
        created: [
          { id: "s1", name: "KEY_1" },
          { id: "s2", name: "KEY_2" },
        ],
        errors: [],
      });

      const { POST } = await import("@/app/api/v1/secrets/route");

      const request = new Request("http://localhost/api/v1/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secrets: [
            { name: "KEY_1", value: "value1" },
            { name: "KEY_2", value: "value2" },
          ],
        }),
      });

      const response = await POST(request as never);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.created).toHaveLength(2);
    });

    it("creates single secret", async () => {
      mockSecretsService.create.mockResolvedValue({
        id: "s1",
        name: "SINGLE_KEY",
        description: null,
        scope: "organization",
        projectId: null,
        projectType: null,
        environment: null,
        provider: null,
        version: 1,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
        lastAccessedAt: null,
        accessCount: 0,
      });

      const { POST } = await import("@/app/api/v1/secrets/route");

      const request = new Request("http://localhost/api/v1/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "SINGLE_KEY",
          value: "single-value",
        }),
      });

      const response = await POST(request as never);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.name).toBe("SINGLE_KEY"); // API returns { id, name }
      expect(data.id).toBe("s1");
    });

    it("validates single secret required fields", async () => {
      const { POST } = await import("@/app/api/v1/secrets/route");

      const request = new Request("http://localhost/api/v1/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "NO_VALUE" }),
      });

      const response = await POST(request as never);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid request");
    });
  });
});

describe("Edge Cases and Error Handling", () => {
  beforeEach(resetMocks);

  it("handles malformed JSON", async () => {
    const { POST } = await import("@/app/api/v1/secrets/test/route");

    const request = new Request("http://localhost/api/v1/secrets/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid json",
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
  });

  it("handles very long secret names in request", async () => {
    const { POST } = await import("@/app/api/v1/secrets/route");

    const longName = "A".repeat(1000);
    const request = new Request("http://localhost/api/v1/secrets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: longName,
        value: "test",
      }),
    });

    const response = await POST(request as never);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid request");
  });

  it("handles special characters in filter params", async () => {
    mockSecretsService.listFiltered.mockResolvedValue({
      secrets: [],
      total: 0,
    });

    const { GET } = await import("@/app/api/v1/secrets/route");

    const url = new URL("http://localhost/api/v1/secrets");
    url.searchParams.set("projectId", "proj-<script>alert(1)</script>");
    const request = new Request(url, { method: "GET" });
    request.nextUrl = url;

    const response = await GET(request as never);

    // Should handle gracefully - the projectId will be passed as-is to service
    expect(response.status).toBe(200);
  });
});

describe("Binding Delete Endpoint", () => {
  beforeEach(resetMocks);

  describe("DELETE /api/v1/secrets/bindings/[bindingId]", () => {
    it("deletes a binding", async () => {
      mockSecretsService.unbindSecret.mockResolvedValue(undefined);

      const { DELETE } =
        await import("@/app/api/v1/secrets/bindings/[bindingId]/route");

      const request = new Request(
        "http://localhost/api/v1/secrets/bindings/binding-123",
        {
          method: "DELETE",
        },
      );

      const response = await DELETE(request as never, {
        params: Promise.resolve({ bindingId: "binding-123" }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockSecretsService.unbindSecret).toHaveBeenCalledWith(
        "binding-123",
        "org-123",
        expect.any(Object),
      );
    });
  });
});
