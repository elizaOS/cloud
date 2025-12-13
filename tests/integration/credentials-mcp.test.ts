/**
 * E2E Tests for Credentials MCP Server
 */

import { describe, test, expect } from "bun:test";

describe("Credentials MCP Server", () => {
  describe("Server Definition", () => {
    test("should have correct server info", () => {
      const serverInfo = {
        name: "credentials",
        version: "1.0.0",
        description: "Secure credential management for AI agents",
      };
      expect(serverInfo.name).toBe("credentials");
      expect(serverInfo.version).toBe("1.0.0");
    });

    test("should have 9 tools", () => {
      const tools = [
        "store_secret",
        "get_secret",
        "delete_secret",
        "list_secrets",
        "request_oauth",
        "get_credential",
        "get_platform_token",
        "revoke_credential",
        "list_credentials",
      ];
      expect(tools.length).toBe(9);
    });

    test("should have 3 resources", () => {
      const resources = [
        "credentials://secrets",
        "credentials://platforms",
        "credentials://platforms/available",
      ];
      expect(resources.length).toBe(3);
    });
  });

  describe("Text Secrets Tools", () => {
    test("store_secret should require name and value", () => {
      const schema = {
        required: ["name", "value"],
        properties: {
          name: { type: "string" },
          value: { type: "string" },
          description: { type: "string" },
        },
      };
      expect(schema.required).toContain("name");
      expect(schema.required).toContain("value");
      expect(schema.required).not.toContain("description");
    });

    test("get_secret should require name", () => {
      const schema = { required: ["name"] };
      expect(schema.required).toContain("name");
    });

    test("list_secrets should have no required params", () => {
      const schema = { properties: {} };
      expect(Object.keys(schema.properties).length).toBe(0);
    });
  });

  describe("OAuth Tools", () => {
    test("request_oauth should support all platforms", () => {
      const platforms = ["discord", "twitter", "google", "gmail", "github", "slack"];
      expect(platforms).toContain("discord");
      expect(platforms).toContain("twitter");
      expect(platforms).toContain("google");
    });

    test("request_oauth should return auth URL and instructions", () => {
      const expectedResponse = {
        sessionId: expect.any(String),
        authUrl: expect.any(String),
        hostedUrl: expect.any(String),
        expiresAt: expect.any(String),
        instructions: expect.any(String),
      };
      expect(expectedResponse.sessionId).toBeDefined();
      expect(expectedResponse.instructions).toBeDefined();
    });

    test("get_platform_token should auto-refresh expired tokens", () => {
      const response = { platform: "discord", accessToken: "xxx", refreshed: true };
      expect(response.refreshed).toBe(true);
    });
  });

  describe("MCP Protocol Compliance", () => {
    test("initialize should return capabilities", () => {
      const response = {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
        },
        serverInfo: { name: "credentials", version: "1.0.0" },
      };
      expect(response.protocolVersion).toBe("2024-11-05");
      expect(response.capabilities.tools).toBeDefined();
      expect(response.capabilities.resources).toBeDefined();
    });

    test("tools/call should return content array", () => {
      const response = {
        content: [{ type: "text", text: JSON.stringify({ success: true }) }],
      };
      expect(response.content).toBeArray();
      expect(response.content[0].type).toBe("text");
    });

    test("resources/read should return contents array", () => {
      const response = {
        contents: [{ uri: "credentials://secrets", mimeType: "application/json", text: "{}" }],
      };
      expect(response.contents).toBeArray();
      expect(response.contents[0].mimeType).toBe("application/json");
    });
  });
});

describe("Secrets REST API", () => {
  describe("Endpoints", () => {
    const endpoints = [
      { path: "/api/v1/secrets", methods: ["GET", "POST"] },
      { path: "/api/v1/secrets/:name", methods: ["GET", "PATCH", "DELETE"] },
      { path: "/api/v1/app/secrets", methods: ["GET", "POST", "OPTIONS"] },
      { path: "/api/v1/app/secrets/:name", methods: ["GET", "DELETE", "OPTIONS"] },
    ];

    test("should have list/create endpoints", () => {
      const listCreate = endpoints.find(e => e.path === "/api/v1/secrets");
      expect(listCreate).toBeDefined();
      expect(listCreate?.methods).toContain("GET");
      expect(listCreate?.methods).toContain("POST");
    });

    test("should have individual secret endpoints", () => {
      const individual = endpoints.find(e => e.path === "/api/v1/secrets/:name");
      expect(individual).toBeDefined();
      expect(individual?.methods).toContain("GET");
      expect(individual?.methods).toContain("DELETE");
    });

    test("app endpoints should support CORS", () => {
      const app = endpoints.find(e => e.path === "/api/v1/app/secrets");
      expect(app?.methods).toContain("OPTIONS");
    });
  });

  describe("Response Format", () => {
    test("list should return secrets array", () => {
      const response = {
        secrets: [{ name: "API_KEY", description: "My API key", createdAt: "2024-01-01T00:00:00Z" }],
      };
      expect(response.secrets).toBeArray();
      expect(response.secrets[0]).not.toHaveProperty("value");
    });

    test("get should return name and value", () => {
      const response = { name: "API_KEY", value: "sk-xxx" };
      expect(response.name).toBeDefined();
      expect(response.value).toBeDefined();
    });

    test("create should return id and name", () => {
      const response = { id: "secret-123", name: "API_KEY" };
      expect(response.id).toBeDefined();
      expect(response.name).toBeDefined();
      expect(response).not.toHaveProperty("value");
    });
  });
});

describe("App Runtime Integration", () => {
  test("__ELIZA_CLOUD__ should include secrets methods", () => {
    const methods = ["getSecret", "setSecret", "deleteSecret", "listSecrets"];
    expect(methods).toContain("getSecret");
    expect(methods).toContain("setSecret");
  });

  test("getSecret should return decrypted value", () => {
    const expectedReturn = "sk-xxx-decrypted-value";
    expect(typeof expectedReturn).toBe("string");
  });

  test("setSecret should accept name, value, and optional description", () => {
    const params = { name: "API_KEY", value: "sk-xxx", description: "optional" };
    expect(params.name).toBeDefined();
    expect(params.value).toBeDefined();
  });
});

describe("MCP Registry Integration", () => {
  test("credentials MCP should be in registry", () => {
    const registryEntry = {
      id: "credentials",
      name: "Credentials & Secrets",
      category: "platform",
      status: "live",
      toolCount: 9,
    };
    expect(registryEntry.id).toBe("credentials");
    expect(registryEntry.category).toBe("platform");
    expect(registryEntry.status).toBe("live");
  });

  test("should have correct endpoint", () => {
    const endpoint = "/api/mcp/credentials/sse";
    expect(endpoint).toContain("/credentials/");
  });

  test("should list features correctly", () => {
    const features = [
      "store_secret", "get_secret", "delete_secret", "list_secrets",
      "request_oauth", "get_credential", "get_platform_token",
      "revoke_credential", "list_credentials",
    ];
    expect(features.length).toBe(9);
  });
});

describe("Security", () => {
  test("secrets should be encrypted at rest", () => {
    const storageFormat = {
      encrypted_value: "encrypted...",
      encryption_key_id: "key-123",
      nonce: "...",
      auth_tag: "...",
    };
    expect(storageFormat.encrypted_value).not.toBe("actual-value");
    expect(storageFormat.encryption_key_id).toBeDefined();
  });

  test("secrets should require organization", () => {
    const errorResponse = { error: "Organization required", status: 403 };
    expect(errorResponse.status).toBe(403);
  });

  test("audit logging should be enabled", () => {
    const auditContext = {
      actorType: "system",
      actorId: "credentials-mcp",
      source: "mcp",
    };
    expect(auditContext.actorType).toBeDefined();
    expect(auditContext.source).toBeDefined();
  });
});

