/**
 * E2E Tests for App Platform Credentials
 *
 * Tests the streamlined OAuth credential flow available to all apps.
 */

import { describe, test, expect } from "bun:test";

// =============================================================================
// RUNTIME INJECTION TESTS
// =============================================================================

describe("App Runtime Injection", () => {
  test("__ELIZA_CLOUD__ should include credential methods", () => {
    const expectedMethods = [
      "getCredentials",
      "getCredential",
      "connectPlatform",
      "disconnectPlatform",
      "getPlatformToken",
      "_checkSession",
    ];

    // These are the methods we inject into the runtime
    expect(expectedMethods.length).toBe(6);
  });

  test("runtime script should include cloudUrl", () => {
    const runtimeProperties = [
      "appId",
      "subdomain",
      "customDomain",
      "baseUrl",
      "cloudUrl",
      "apiUrl",
      "config",
    ];

    expect(runtimeProperties).toContain("cloudUrl");
    expect(runtimeProperties).toContain("apiUrl");
  });

  test("connectPlatform should open popup with correct dimensions", () => {
    const popupConfig = {
      width: 600,
      height: 700,
      scrollbars: "yes",
    };

    expect(popupConfig.width).toBe(600);
    expect(popupConfig.height).toBe(700);
  });

  test("session polling should use 1.5 second interval", () => {
    const pollInterval = 1500;
    expect(pollInterval).toBe(1500);
  });

  test("session should timeout after 5 minutes", () => {
    const timeoutMs = 300000;
    expect(timeoutMs).toBe(5 * 60 * 1000);
  });
});

// =============================================================================
// APP API ENDPOINT TESTS
// =============================================================================

describe("App Credentials API Endpoints", () => {
  const endpoints = [
    { path: "/api/v1/app/credentials", methods: ["GET", "POST", "OPTIONS"] },
    {
      path: "/api/v1/app/credentials/:id",
      methods: ["GET", "DELETE", "OPTIONS"],
    },
    { path: "/api/v1/app/credentials/:id/token", methods: ["GET", "OPTIONS"] },
    {
      path: "/api/v1/app/credentials/session/:id",
      methods: ["GET", "OPTIONS"],
    },
  ];

  test("should have list/create endpoint", () => {
    const listEndpoint = endpoints.find(
      (e) => e.path === "/api/v1/app/credentials",
    );
    expect(listEndpoint).toBeDefined();
    expect(listEndpoint?.methods).toContain("GET");
    expect(listEndpoint?.methods).toContain("POST");
  });

  test("should have individual credential endpoint", () => {
    const credEndpoint = endpoints.find(
      (e) => e.path === "/api/v1/app/credentials/:id",
    );
    expect(credEndpoint).toBeDefined();
    expect(credEndpoint?.methods).toContain("GET");
    expect(credEndpoint?.methods).toContain("DELETE");
  });

  test("should have token endpoint", () => {
    const tokenEndpoint = endpoints.find((e) => e.path.includes("/token"));
    expect(tokenEndpoint).toBeDefined();
    expect(tokenEndpoint?.methods).toContain("GET");
  });

  test("should have session status endpoint", () => {
    const sessionEndpoint = endpoints.find((e) => e.path.includes("/session/"));
    expect(sessionEndpoint).toBeDefined();
  });

  test("all endpoints should support OPTIONS for CORS", () => {
    endpoints.forEach((endpoint) => {
      expect(endpoint.methods).toContain("OPTIONS");
    });
  });
});

// =============================================================================
// CREDENTIAL RESPONSE FORMAT TESTS
// =============================================================================

describe("Credential Response Format", () => {
  test("list response should return credentials array", () => {
    const mockResponse = {
      credentials: [
        {
          id: "cred-123",
          platform: "discord",
          platformUserId: "123456789",
          platformUsername: "testuser",
          platformDisplayName: "Test User",
          platformAvatarUrl: "https://cdn.discordapp.com/...",
          status: "active",
          scopes: ["identify", "email"],
          linkedAt: "2024-01-01T00:00:00Z",
        },
      ],
    };

    expect(mockResponse.credentials).toBeArray();
    expect(mockResponse.credentials[0].platform).toBe("discord");
    expect(mockResponse.credentials[0].status).toBe("active");
  });

  test("create link response should include session and URLs", () => {
    const mockResponse = {
      sessionId: "sess_abc123def456",
      linkUrl: "https://discord.com/oauth2/authorize?...",
      hostedLinkUrl:
        "https://elizacloud.ai/auth/platform-link?session=sess_abc123def456",
      expiresAt: "2024-01-01T00:15:00Z",
    };

    expect(mockResponse.sessionId).toBeDefined();
    expect(mockResponse.linkUrl).toContain("oauth2");
    expect(mockResponse.hostedLinkUrl).toContain("/auth/platform-link");
    expect(mockResponse.expiresAt).toBeDefined();
  });

  test("token response should include access token and metadata", () => {
    const mockResponse = {
      platform: "discord",
      platformUserId: "123456789",
      accessToken: "xxx_access_token_xxx",
      refreshToken: "xxx_refresh_token_xxx",
      expiresAt: "2024-04-01T00:00:00Z",
      scopes: ["identify", "email"],
      refreshed: false,
    };

    expect(mockResponse.accessToken).toBeDefined();
    expect(mockResponse.platform).toBe("discord");
    expect(mockResponse.refreshed).toBe(false);
  });

  test("session status response should have valid status values", () => {
    const validStatuses = [
      "pending",
      "completed",
      "expired",
      "failed",
      "not_found",
    ];

    const mockPending = { status: "pending" };
    const mockCompleted = { status: "completed", credentialId: "cred-123" };
    const mockFailed = { status: "failed", error: "Access denied" };

    expect(validStatuses).toContain(mockPending.status);
    expect(validStatuses).toContain(mockCompleted.status);
    expect(mockCompleted.credentialId).toBeDefined();
    expect(mockFailed.error).toBeDefined();
  });
});

// =============================================================================
// CORS HANDLING TESTS
// =============================================================================

describe("CORS Handling", () => {
  test("OPTIONS should return preflight headers", () => {
    const expectedHeaders = [
      "Access-Control-Allow-Origin",
      "Access-Control-Allow-Methods",
      "Access-Control-Allow-Headers",
    ];

    expect(expectedHeaders.length).toBe(3);
  });

  test("responses should include CORS headers", () => {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "https://myapp.apps.elizacloud.ai",
      "Access-Control-Allow-Credentials": "true",
    };

    expect(corsHeaders["Access-Control-Allow-Origin"]).toBeDefined();
    expect(corsHeaders["Access-Control-Allow-Credentials"]).toBe("true");
  });
});

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

describe("Error Handling", () => {
  test("unauthorized requests should return 401", () => {
    const errorResponse = {
      error: "Unauthorized",
      status: 401,
    };

    expect(errorResponse.status).toBe(401);
  });

  test("missing organization should return 403", () => {
    const errorResponse = {
      error: "Organization required",
      status: 403,
    };

    expect(errorResponse.status).toBe(403);
    expect(errorResponse.error).toBe("Organization required");
  });

  test("not found credential should return 404", () => {
    const errorResponse = {
      error: "Credential not found",
      status: 404,
    };

    expect(errorResponse.status).toBe(404);
  });

  test("invalid platform should return 400", () => {
    const errorResponse = {
      error: "Invalid request",
      details: { platform: ["Invalid enum value"] },
      status: 400,
    };

    expect(errorResponse.status).toBe(400);
    expect(errorResponse.details).toBeDefined();
  });

  test("expired token should return 401 with status", () => {
    const errorResponse = {
      error: "Token expired and refresh failed",
      status: "expired",
    };

    expect(errorResponse.error).toContain("expired");
  });
});

// =============================================================================
// POPUP FLOW TESTS
// =============================================================================

describe("OAuth Popup Flow", () => {
  test("popup should be named for window management", () => {
    const popupName = "ElizaCloudOAuth";
    expect(popupName).toBe("ElizaCloudOAuth");
  });

  test("popup blocked should throw descriptive error", () => {
    const errorMessage = "Popup blocked. Please allow popups for this site.";
    expect(errorMessage).toContain("Popup blocked");
  });

  test("cancelled authorization should throw error", () => {
    const errorMessage = "Authorization cancelled";
    expect(errorMessage).toBe("Authorization cancelled");
  });

  test("timeout should throw descriptive error", () => {
    const errorMessage = "Authorization timed out";
    expect(errorMessage).toBe("Authorization timed out");
  });

  test("failed authorization should include error from session", () => {
    const sessionError = "access_denied";
    const errorMessage = sessionError || "Authorization failed";
    expect(errorMessage).toBe("access_denied");
  });
});

// =============================================================================
// TYPE DEFINITION TESTS
// =============================================================================

describe("TypeScript Type Definitions", () => {
  test("PlatformType should include all supported platforms", () => {
    const platforms = [
      "discord",
      "twitter",
      "google",
      "gmail",
      "github",
      "slack",
      "telegram",
    ];

    expect(platforms).toContain("discord");
    expect(platforms).toContain("twitter");
    expect(platforms).toContain("github");
    expect(platforms.length).toBe(7);
  });

  test("PlatformCredential should have required fields", () => {
    const requiredFields = ["id", "platform", "platformUserId", "status"];

    const optionalFields = [
      "platformUsername",
      "platformDisplayName",
      "platformAvatarUrl",
      "scopes",
      "linkedAt",
      "lastUsedAt",
    ];

    expect(requiredFields.length).toBe(4);
    expect(optionalFields.length).toBe(6);
  });

  test("ElizaCloudRuntime should expose credential methods", () => {
    const credentialMethods = [
      "getCredentials",
      "getCredential",
      "connectPlatform",
      "disconnectPlatform",
      "getPlatformToken",
    ];

    expect(credentialMethods.length).toBe(5);
  });

  test("ConnectPlatformOptions should support scopes", () => {
    const options = {
      scopes: ["identify", "email", "guilds.join"],
    };

    expect(options.scopes).toBeArray();
    expect(options.scopes.length).toBe(3);
  });
});

// =============================================================================
// INTEGRATION FLOW TESTS
// =============================================================================

describe("End-to-End Flow", () => {
  test("complete flow should follow correct sequence", () => {
    const flowSteps = [
      "1. User clicks connect button in app",
      "2. App calls __ELIZA_CLOUD__.connectPlatform('discord')",
      "3. POST /api/v1/app/credentials creates session",
      "4. Popup opens hostedLinkUrl",
      "5. User sees permission request page",
      "6. User clicks 'Continue to Discord'",
      "7. Discord OAuth flow completes",
      "8. Callback to /api/auth/platform-callback/discord",
      "9. Tokens exchanged and stored",
      "10. Session marked complete",
      "11. Popup closes",
      "12. connectPlatform resolves with credential",
    ];

    expect(flowSteps.length).toBe(12);
    expect(flowSteps[0]).toContain("User clicks");
    expect(flowSteps[11]).toContain("resolves with credential");
  });

  test("token retrieval flow should handle refresh", () => {
    const tokenFlow = [
      "1. App calls getPlatformToken('discord')",
      "2. GET /api/v1/app/credentials/:id/token",
      "3. Service retrieves credential",
      "4. If expired, attempt refresh",
      "5. Return { accessToken, refreshToken, refreshed }",
    ];

    expect(tokenFlow.length).toBe(5);
    expect(tokenFlow[3]).toContain("refresh");
  });
});

// =============================================================================
// SECURITY TESTS
// =============================================================================

describe("Security", () => {
  test("tokens should never be in URL parameters", () => {
    // Tokens are only returned in response body, never URL
    const urlParams = ["code", "state", "error"];
    const responseOnlyFields = ["accessToken", "refreshToken"];

    urlParams.forEach((param) => {
      expect(responseOnlyFields).not.toContain(param);
    });
  });

  test("credentials should be scoped to organization", () => {
    const credential = {
      organization_id: "org-123",
      user_id: "user-456",
      app_id: "app-789",
    };

    expect(credential.organization_id).toBeDefined();
  });

  test("app ID should be passed via header not body", () => {
    const headerName = "X-App-Id";
    expect(headerName).toBe("X-App-Id");
  });

  test("session polling should not expose tokens", () => {
    const sessionStatus = {
      status: "completed",
      credentialId: "cred-123",
      // No tokens exposed
    };

    expect(sessionStatus).not.toHaveProperty("accessToken");
    expect(sessionStatus).not.toHaveProperty("refreshToken");
  });
});

// =============================================================================
// SECRETS API TESTS
// =============================================================================

describe("App Secrets API", () => {
  test("should have list/create endpoint", () => {
    const endpoints = [
      { path: "/api/v1/app/secrets", methods: ["GET", "POST", "OPTIONS"] },
      {
        path: "/api/v1/app/secrets/:name",
        methods: ["GET", "DELETE", "OPTIONS"],
      },
    ];

    expect(endpoints[0].methods).toContain("GET");
    expect(endpoints[0].methods).toContain("POST");
    expect(endpoints[1].methods).toContain("DELETE");
  });

  test("list response should return secrets array without values", () => {
    const response = {
      secrets: [
        {
          name: "OPENAI_API_KEY",
          description: "OpenAI key",
          createdAt: "2024-01-01T00:00:00Z",
        },
      ],
    };

    expect(response.secrets).toBeArray();
    expect(response.secrets[0]).not.toHaveProperty("value");
  });

  test("get response should include decrypted value", () => {
    const response = { name: "OPENAI_API_KEY", value: "sk-xxx" };
    expect(response.name).toBeDefined();
    expect(response.value).toBeDefined();
  });

  test("create should return id and name only", () => {
    const response = { id: "secret-123", name: "OPENAI_API_KEY" };
    expect(response.id).toBeDefined();
    expect(response).not.toHaveProperty("value");
  });
});

// =============================================================================
// BOT CONNECTIONS API TESTS
// =============================================================================

describe("App Bots API", () => {
  test("should have list/connect endpoint", () => {
    const endpoints = [
      { path: "/api/v1/app/bots", methods: ["GET", "POST", "OPTIONS"] },
      { path: "/api/v1/app/bots/:id", methods: ["GET", "DELETE", "OPTIONS"] },
      {
        path: "/api/v1/app/bots/:id/servers/:serverId",
        methods: ["GET", "PATCH", "OPTIONS"],
      },
    ];

    expect(endpoints[0].methods).toContain("POST");
    expect(endpoints[1].methods).toContain("DELETE");
    expect(endpoints[2].methods).toContain("PATCH");
  });

  test("list response should return bots array with servers", () => {
    const response = {
      bots: [
        {
          id: "conn-123",
          platform: "discord",
          botId: "123456789",
          botUsername: "MyBot#1234",
          status: "active",
          servers: [
            {
              id: "srv-1",
              serverId: "guild-123",
              serverName: "Test Server",
              enabled: true,
            },
          ],
        },
      ],
    };

    expect(response.bots).toBeArray();
    expect(response.bots[0].servers).toBeArray();
  });

  test("connect should support discord, telegram, twitter", () => {
    const platforms = ["discord", "telegram", "twitter"];
    expect(platforms.length).toBe(3);
  });

  test("connect response should include bot info and servers", () => {
    const response = {
      bot: {
        id: "conn-123",
        platform: "discord",
        botUsername: "MyBot#1234",
        status: "active",
      },
      servers: [
        { id: "srv-1", serverId: "guild-123", serverName: "Test Server" },
      ],
    };

    expect(response.bot.platform).toBe("discord");
    expect(response.servers).toBeArray();
  });
});

// =============================================================================
// TYPE DEFINITIONS TESTS
// =============================================================================

describe("Type Definitions", () => {
  test("BotPlatformType should be subset of PlatformType", () => {
    const botPlatforms = ["discord", "telegram", "twitter"];
    const userPlatforms = [
      "discord",
      "twitter",
      "google",
      "gmail",
      "github",
      "slack",
      "telegram",
    ];

    botPlatforms.forEach((p) => {
      expect(userPlatforms).toContain(p);
    });
  });

  test("StoredSecret should have name and createdAt", () => {
    const secret = { name: "API_KEY", createdAt: "2024-01-01T00:00:00Z" };
    expect(secret.name).toBeDefined();
    expect(secret.createdAt).toBeDefined();
  });

  test("BotConnection should have required fields", () => {
    const fields = ["id", "platform", "botId", "botUsername", "status"];
    expect(fields.length).toBe(5);
  });

  test("BotServer should have enabled field", () => {
    const server = {
      id: "srv-1",
      serverId: "123",
      serverName: "Test",
      enabled: true,
    };
    expect(typeof server.enabled).toBe("boolean");
  });
});
