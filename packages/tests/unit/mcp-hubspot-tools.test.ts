/**
 * HubSpot MCP Tools Integration Tests
 *
 * Tests the HubSpot MCP tools module with coverage for:
 * - Tool registration and export
 * - Error handling when HubSpot not connected
 * - API response handling for contacts, companies, deals, owners
 * - Association creation
 * - Network error handling
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { authContextStorage } from "@/app/api/mcp/lib/context";

// Mock fetch globally for API tests
const originalFetch = globalThis.fetch;
let mockFetchResponses: Map<string, { status: number; body: any }> = new Map();

function setupMockFetch() {
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = url.toString();

    // Find matching mock response
    for (const [pattern, response] of mockFetchResponses) {
      if (urlStr.includes(pattern)) {
        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Default: return 404
    return new Response(JSON.stringify({ error: { message: "Not found" } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

function resetMockFetch() {
  globalThis.fetch = originalFetch;
  mockFetchResponses.clear();
}

// Mock OAuth service
const mockOAuthService = {
  getValidTokenByPlatform: mock(async ({ organizationId, platform }: { organizationId: string; platform: string }) => {
    if (platform !== "hubspot") {
      throw new Error(`Unknown platform: ${platform}`);
    }
    // By default, throw "not connected" - tests can override
    throw new Error("No active connection found for hubspot");
  }),
  listConnections: mock(async ({ organizationId, platform }: { organizationId: string; platform?: string }) => {
    return [];
  }),
  isPlatformConnected: mock(async (organizationId: string, platform: string) => {
    return false;
  }),
};

// Mock the oauth service module
mock.module("@/lib/services/oauth", () => ({
  oauthService: mockOAuthService,
}));

// Create mock auth context
function createMockAuth(orgId: string = "test-org-123") {
  return {
    user: {
      id: `user-${orgId}`,
      organization_id: orgId,
      organization: { id: orgId, name: "Test Organization", credit_balance: 100 },
    },
  } as any;
}

describe("HubSpot MCP Tools", () => {
  beforeEach(() => {
    setupMockFetch();
    mockOAuthService.getValidTokenByPlatform.mockReset();
    mockOAuthService.listConnections.mockReset();
  });

  afterEach(() => {
    resetMockFetch();
  });

  // ============================================
  // Module Import & Registration Tests
  // ============================================

  describe("Module Registration", () => {
    test("registerHubSpotTools is exported", async () => {
      const { registerHubSpotTools } = await import("@/app/api/mcp/tools/hubspot");
      expect(registerHubSpotTools).toBeDefined();
      expect(typeof registerHubSpotTools).toBe("function");
    });

    test("registers all expected tools", async () => {
      const { registerHubSpotTools } = await import("@/app/api/mcp/tools/hubspot");

      const registeredTools: string[] = [];
      const mockServer = {
        registerTool: (name: string, _schema: any, _handler: any) => {
          registeredTools.push(name);
        },
      };

      registerHubSpotTools(mockServer as any);

      expect(registeredTools).toContain("hubspot_status");
      expect(registeredTools).toContain("hubspot_list_contacts");
      expect(registeredTools).toContain("hubspot_get_contact");
      expect(registeredTools).toContain("hubspot_create_contact");
      expect(registeredTools).toContain("hubspot_update_contact");
      expect(registeredTools).toContain("hubspot_search_contacts");
      expect(registeredTools).toContain("hubspot_list_companies");
      expect(registeredTools).toContain("hubspot_create_company");
      expect(registeredTools).toContain("hubspot_search_companies");
      expect(registeredTools).toContain("hubspot_list_deals");
      expect(registeredTools).toContain("hubspot_create_deal");
      expect(registeredTools).toContain("hubspot_update_deal");
      expect(registeredTools).toContain("hubspot_search_deals");
      expect(registeredTools).toContain("hubspot_list_owners");
      expect(registeredTools).toContain("hubspot_associate");
      expect(registeredTools.length).toBe(15);
    });
  });

  // ============================================
  // hubspot_status Tool Tests
  // ============================================

  describe("hubspot_status", () => {
    test("returns connected=false when no HubSpot connection", async () => {
      const { registerHubSpotTools } = await import("@/app/api/mcp/tools/hubspot");

      mockOAuthService.listConnections.mockImplementation(async () => []);

      let handler: any;
      const mockServer = {
        registerTool: (name: string, _schema: any, h: any) => {
          if (name === "hubspot_status") handler = h;
        },
      };
      registerHubSpotTools(mockServer as any);

      const result = await authContextStorage.run(createMockAuth(), async () => {
        return handler({});
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.connected).toBe(false);
      expect(parsed.message).toContain("not connected");
    });

    test("returns connection details when connected", async () => {
      const { registerHubSpotTools } = await import("@/app/api/mcp/tools/hubspot");

      mockOAuthService.listConnections.mockImplementation(async () => [
        {
          id: "conn-123",
          status: "active",
          email: "user@example.com",
          scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write"],
          linkedAt: "2024-01-15T10:00:00Z",
        },
      ]);

      let handler: any;
      const mockServer = {
        registerTool: (name: string, _schema: any, h: any) => {
          if (name === "hubspot_status") handler = h;
        },
      };
      registerHubSpotTools(mockServer as any);

      const result = await authContextStorage.run(createMockAuth(), async () => {
        return handler({});
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.connected).toBe(true);
      expect(parsed.email).toBe("user@example.com");
      expect(parsed.scopes).toContain("crm.objects.contacts.read");
    });

    test("handles service errors gracefully", async () => {
      const { registerHubSpotTools } = await import("@/app/api/mcp/tools/hubspot");

      mockOAuthService.listConnections.mockImplementation(async () => {
        throw new Error("Database connection failed");
      });

      let handler: any;
      const mockServer = {
        registerTool: (name: string, _schema: any, h: any) => {
          if (name === "hubspot_status") handler = h;
        },
      };
      registerHubSpotTools(mockServer as any);

      const result = await authContextStorage.run(createMockAuth(), async () => {
        return handler({});
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe("Database connection failed");
    });

    test("filters for active connections only", async () => {
      const { registerHubSpotTools } = await import("@/app/api/mcp/tools/hubspot");

      mockOAuthService.listConnections.mockImplementation(async () => [
        { id: "conn-1", status: "revoked", email: "old@example.com" },
        { id: "conn-2", status: "expired", email: "expired@example.com" },
      ]);

      let handler: any;
      const mockServer = {
        registerTool: (name: string, _schema: any, h: any) => {
          if (name === "hubspot_status") handler = h;
        },
      };
      registerHubSpotTools(mockServer as any);

      const result = await authContextStorage.run(createMockAuth(), async () => {
        return handler({});
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.connected).toBe(false);
    });
  });

  // ============================================
  // hubspot_list_contacts Tool Tests
  // ============================================

  describe("hubspot_list_contacts", () => {
    test("returns error when HubSpot not connected", async () => {
      const { registerHubSpotTools } = await import("@/app/api/mcp/tools/hubspot");

      mockOAuthService.getValidTokenByPlatform.mockImplementation(async () => {
        throw new Error("No active connection found for hubspot");
      });

      let handler: any;
      const mockServer = {
        registerTool: (name: string, _schema: any, h: any) => {
          if (name === "hubspot_list_contacts") handler = h;
        },
      };
      registerHubSpotTools(mockServer as any);

      const result = await authContextStorage.run(createMockAuth(), async () => {
        return handler({ limit: 10 });
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("HubSpot account not connected");
    });

    test("lists contacts successfully", async () => {
      const { registerHubSpotTools } = await import("@/app/api/mcp/tools/hubspot");

      mockOAuthService.getValidTokenByPlatform.mockImplementation(async () => ({
        accessToken: "mock-hubspot-token",
      }));

      mockFetchResponses.set("api.hubapi.com/crm/v3/objects/contacts", {
        status: 200,
        body: {
          results: [
            {
              id: "101",
              properties: { firstname: "John", lastname: "Doe", email: "john@example.com" },
              createdAt: "2024-01-10T00:00:00Z",
              updatedAt: "2024-01-15T00:00:00Z",
            },
          ],
          paging: { next: { after: "cursor-abc" } },
        },
      });

      let handler: any;
      const mockServer = {
        registerTool: (name: string, _schema: any, h: any) => {
          if (name === "hubspot_list_contacts") handler = h;
        },
      };
      registerHubSpotTools(mockServer as any);

      const result = await authContextStorage.run(createMockAuth(), async () => {
        return handler({ limit: 20 });
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(1);
      expect(parsed.contacts[0].firstname).toBe("John");
      expect(parsed.contacts[0].email).toBe("john@example.com");
      expect(parsed.paging.next.after).toBe("cursor-abc");
    });
  });

  // ============================================
  // hubspot_create_contact Tool Tests
  // ============================================

  describe("hubspot_create_contact", () => {
    test("creates contact successfully", async () => {
      const { registerHubSpotTools } = await import("@/app/api/mcp/tools/hubspot");

      mockOAuthService.getValidTokenByPlatform.mockImplementation(async () => ({
        accessToken: "mock-hubspot-token",
      }));

      mockFetchResponses.set("api.hubapi.com/crm/v3/objects/contacts", {
        status: 201,
        body: {
          id: "201",
          properties: { email: "new@example.com", firstname: "Jane", lastname: "Smith" },
        },
      });

      let handler: any;
      const mockServer = {
        registerTool: (name: string, _schema: any, h: any) => {
          if (name === "hubspot_create_contact") handler = h;
        },
      };
      registerHubSpotTools(mockServer as any);

      const result = await authContextStorage.run(createMockAuth(), async () => {
        return handler({
          email: "new@example.com",
          firstname: "Jane",
          lastname: "Smith",
        });
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.contactId).toBe("201");
      expect(parsed.contact.email).toBe("new@example.com");
    });

    test("handles HubSpot API errors", async () => {
      const { registerHubSpotTools } = await import("@/app/api/mcp/tools/hubspot");

      mockOAuthService.getValidTokenByPlatform.mockImplementation(async () => ({
        accessToken: "mock-hubspot-token",
      }));

      mockFetchResponses.set("api.hubapi.com/crm/v3/objects/contacts", {
        status: 409,
        body: { message: "Contact already exists" },
      });

      let handler: any;
      const mockServer = {
        registerTool: (name: string, _schema: any, h: any) => {
          if (name === "hubspot_create_contact") handler = h;
        },
      };
      registerHubSpotTools(mockServer as any);

      const result = await authContextStorage.run(createMockAuth(), async () => {
        return handler({ email: "existing@example.com" });
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Contact already exists");
    });
  });

  // ============================================
  // hubspot_list_companies Tool Tests
  // ============================================

  describe("hubspot_list_companies", () => {
    test("lists companies successfully", async () => {
      const { registerHubSpotTools } = await import("@/app/api/mcp/tools/hubspot");

      mockOAuthService.getValidTokenByPlatform.mockImplementation(async () => ({
        accessToken: "mock-hubspot-token",
      }));

      mockFetchResponses.set("api.hubapi.com/crm/v3/objects/companies", {
        status: 200,
        body: {
          results: [
            {
              id: "301",
              properties: { name: "Acme Corp", domain: "acme.com", industry: "Technology" },
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-10T00:00:00Z",
            },
          ],
        },
      });

      let handler: any;
      const mockServer = {
        registerTool: (name: string, _schema: any, h: any) => {
          if (name === "hubspot_list_companies") handler = h;
        },
      };
      registerHubSpotTools(mockServer as any);

      const result = await authContextStorage.run(createMockAuth(), async () => {
        return handler({ limit: 20 });
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(1);
      expect(parsed.companies[0].name).toBe("Acme Corp");
      expect(parsed.companies[0].domain).toBe("acme.com");
    });
  });

  // ============================================
  // hubspot_list_deals Tool Tests
  // ============================================

  describe("hubspot_list_deals", () => {
    test("lists deals successfully", async () => {
      const { registerHubSpotTools } = await import("@/app/api/mcp/tools/hubspot");

      mockOAuthService.getValidTokenByPlatform.mockImplementation(async () => ({
        accessToken: "mock-hubspot-token",
      }));

      mockFetchResponses.set("api.hubapi.com/crm/v3/objects/deals", {
        status: 200,
        body: {
          results: [
            {
              id: "401",
              properties: { dealname: "Big Deal", amount: "50000", dealstage: "qualifiedtobuy" },
              createdAt: "2024-02-01T00:00:00Z",
              updatedAt: "2024-02-05T00:00:00Z",
            },
          ],
        },
      });

      let handler: any;
      const mockServer = {
        registerTool: (name: string, _schema: any, h: any) => {
          if (name === "hubspot_list_deals") handler = h;
        },
      };
      registerHubSpotTools(mockServer as any);

      const result = await authContextStorage.run(createMockAuth(), async () => {
        return handler({ limit: 20 });
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(1);
      expect(parsed.deals[0].dealname).toBe("Big Deal");
      expect(parsed.deals[0].amount).toBe("50000");
    });
  });

  // ============================================
  // hubspot_list_owners Tool Tests
  // ============================================

  describe("hubspot_list_owners", () => {
    test("lists owners successfully", async () => {
      const { registerHubSpotTools } = await import("@/app/api/mcp/tools/hubspot");

      mockOAuthService.getValidTokenByPlatform.mockImplementation(async () => ({
        accessToken: "mock-hubspot-token",
      }));

      mockFetchResponses.set("api.hubapi.com/crm/v3/owners", {
        status: 200,
        body: {
          results: [
            {
              id: "501",
              email: "owner@company.com",
              firstName: "Alice",
              lastName: "Johnson",
              userId: 12345,
              teams: [],
            },
          ],
        },
      });

      let handler: any;
      const mockServer = {
        registerTool: (name: string, _schema: any, h: any) => {
          if (name === "hubspot_list_owners") handler = h;
        },
      };
      registerHubSpotTools(mockServer as any);

      const result = await authContextStorage.run(createMockAuth(), async () => {
        return handler({ limit: 100 });
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(1);
      expect(parsed.owners[0].email).toBe("owner@company.com");
      expect(parsed.owners[0].firstName).toBe("Alice");
    });
  });

  // ============================================
  // hubspot_associate Tool Tests
  // ============================================

  describe("hubspot_associate", () => {
    test("creates association between contact and company", async () => {
      const { registerHubSpotTools } = await import("@/app/api/mcp/tools/hubspot");

      mockOAuthService.getValidTokenByPlatform.mockImplementation(async () => ({
        accessToken: "mock-hubspot-token",
      }));

      mockFetchResponses.set("api.hubapi.com/crm/v3/objects/contacts/101/associations/companies/301/1", {
        status: 200,
        body: {},
      });

      let handler: any;
      const mockServer = {
        registerTool: (name: string, _schema: any, h: any) => {
          if (name === "hubspot_associate") handler = h;
        },
      };
      registerHubSpotTools(mockServer as any);

      const result = await authContextStorage.run(createMockAuth(), async () => {
        return handler({
          fromObjectType: "contacts",
          fromObjectId: "101",
          toObjectType: "companies",
          toObjectId: "301",
        });
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.message).toContain("Associated");
    });
  });

  // ============================================
  // Edge Cases & Error Handling
  // ============================================

  describe("Edge Cases", () => {
    test("handles network timeout gracefully", async () => {
      const { registerHubSpotTools } = await import("@/app/api/mcp/tools/hubspot");

      mockOAuthService.getValidTokenByPlatform.mockImplementation(async () => ({
        accessToken: "mock-hubspot-token",
      }));

      globalThis.fetch = mock(async () => {
        throw new Error("Network request failed");
      }) as typeof fetch;

      let handler: any;
      const mockServer = {
        registerTool: (name: string, _schema: any, h: any) => {
          if (name === "hubspot_list_contacts") handler = h;
        },
      };
      registerHubSpotTools(mockServer as any);

      const result = await authContextStorage.run(createMockAuth(), async () => {
        return handler({ limit: 10 });
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain("Network request failed");
    });

    test("handles concurrent requests with different orgs", async () => {
      const { registerHubSpotTools } = await import("@/app/api/mcp/tools/hubspot");

      const orgRequests: string[] = [];

      mockOAuthService.listConnections.mockImplementation(async ({ organizationId }) => {
        orgRequests.push(organizationId);
        await new Promise((r) => setTimeout(r, Math.random() * 50));
        return [
          {
            id: `conn-${organizationId}`,
            status: "active",
            email: `user-${organizationId}@example.com`,
            scopes: [],
          },
        ];
      });

      let handler: any;
      const mockServer = {
        registerTool: (name: string, _schema: any, h: any) => {
          if (name === "hubspot_status") handler = h;
        },
      };
      registerHubSpotTools(mockServer as any);

      const results = await Promise.all([
        authContextStorage.run(createMockAuth("org-1"), async () => handler({})),
        authContextStorage.run(createMockAuth("org-2"), async () => handler({})),
        authContextStorage.run(createMockAuth("org-3"), async () => handler({})),
      ]);

      results.forEach((result) => {
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.connected).toBe(true);
      });

      expect(orgRequests).toContain("org-1");
      expect(orgRequests).toContain("org-2");
      expect(orgRequests).toContain("org-3");
    });
  });
});
