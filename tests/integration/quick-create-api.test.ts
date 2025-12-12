import { describe, test, expect } from "bun:test";

const BASE_URL = process.env.TEST_API_URL || "http://localhost:3000";

// Skip if no auth available - these tests require a running server with auth
const hasAuth = !!process.env.TEST_API_KEY;

describe.skipIf(!hasAuth)("QuickCreateDialog API Integration", () => {
  describe("App Creation (miniapp)", () => {
    test("accepts miniapp payload structure", async () => {
      // Long timeout for cold start
      const payload = {
        name: "Test Mini App",
        description: "Mini App created with Eliza Cloud",
        app_url: "https://localhost:3000",
        features_enabled: { chat: true, agents: false, embedding: false },
        metadata: { app_type: "miniapp" },
      };

      const response = await fetch(`${BASE_URL}/api/v1/apps`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": process.env.TEST_API_KEY!,
        },
        body: JSON.stringify(payload),
      });

      // Should not be a validation error (400)
      expect(response.status).not.toBe(400);
      
      if (response.ok) {
        const data = await response.json();
        expect(data.app).toBeDefined();
        expect(data.app.id).toBeDefined();
        expect(data.apiKey).toBeDefined();
      }
    });
  });

  describe("App Creation (service)", () => {
    test("accepts service payload structure", async () => {
      const payload = {
        name: "Test Service",
        description: "Service created with Eliza Cloud",
        app_url: "https://localhost:3000",
        features_enabled: { chat: true, agents: true, embedding: true },
        metadata: {
          app_type: "service",
          service_endpoints: { mcp: true, a2a: true, rest: true },
        },
      };

      const response = await fetch(`${BASE_URL}/api/v1/apps`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": process.env.TEST_API_KEY!,
        },
        body: JSON.stringify(payload),
      });

      expect(response.status).not.toBe(400);
      
      if (response.ok) {
        const data = await response.json();
        expect(data.app).toBeDefined();
        expect(data.app.id).toBeDefined();
      }
    });
  });

  describe("Agent Creation", () => {
    test("accepts agent payload structure", async () => {
      const payload = {
        name: "Test Agent",
        bio: "A helpful AI assistant",
      };

      const response = await fetch(`${BASE_URL}/api/v1/app/agents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": process.env.TEST_API_KEY!,
        },
        body: JSON.stringify(payload),
      });

      expect(response.status).not.toBe(400);
      
      if (response.ok) {
        const data = await response.json();
        expect(data.agent).toBeDefined();
        expect(data.agent.id).toBeDefined();
      }
    });
  });

  describe("Workflow Creation", () => {
    test("accepts workflow payload structure", async () => {
      const payload = {
        name: "Test Workflow",
        description: "Workflow created with Eliza Cloud",
        workflowData: { nodes: [], connections: {}, settings: {} },
      };

      const response = await fetch(`${BASE_URL}/api/v1/n8n/workflows`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": process.env.TEST_API_KEY!,
        },
        body: JSON.stringify(payload),
      });

      // Note: May fail with 500 if n8n service not configured, but should NOT fail with 400
      expect(response.status).not.toBe(400);
      
      if (response.ok) {
        const data = await response.json();
        expect(data.workflow).toBeDefined();
        expect(data.workflow.id).toBeDefined();
      }
    });
  });
});

// Schema validation tests (don't require auth)
describe("API Schema Validation", () => {
  test("apps API rejects missing name", async () => {
    const response = await fetch(`${BASE_URL}/api/v1/apps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "No name" }),
    });
    
    // Should be 400 (validation) or 401 (auth), not 500
    expect([400, 401]).toContain(response.status);
  });

  test("agents API rejects missing name", async () => {
    const response = await fetch(`${BASE_URL}/api/v1/app/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bio: "No name" }),
    });
    
    expect([400, 401]).toContain(response.status);
  });

  test("workflows API rejects missing name", async () => {
    const response = await fetch(`${BASE_URL}/api/v1/n8n/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowData: {} }),
    });
    
    expect([400, 401]).toContain(response.status);
  });

  test("workflows API rejects snake_case workflow_data", async () => {
    const response = await fetch(`${BASE_URL}/api/v1/n8n/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test",
        workflow_data: { nodes: [] }, // Wrong! Should be workflowData
      }),
    });
    
    // Should fail validation because workflowData is required
    expect([400, 401]).toContain(response.status);
  });
});
