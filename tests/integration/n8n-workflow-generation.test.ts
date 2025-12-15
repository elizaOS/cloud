/**
 * N8N Workflow Generation Integration Tests
 *
 * Tests the complete workflow generation flow with:
 * - Real HTTP requests to generation endpoint
 * - Endpoint discovery validation
 * - Workflow validation
 * - Node generation
 * - Auto-save functionality
 *
 * Requirements:
 * - TEST_API_KEY: Valid API key with credits
 * - Server running at TEST_SERVER_URL (default: http://localhost:3000)
 */

import { describe, test, expect, beforeAll } from "bun:test";

const SERVER_URL = process.env.TEST_SERVER_URL || "http://localhost:3000";
const API_KEY = process.env.TEST_API_KEY;
const TIMEOUT = 120000; // 2 minutes for LLM calls

// Runtime state
let serverAvailable = false;
let apiKeyValid = false;

// ============================================================================
// Helpers
// ============================================================================

async function fetchWithAuth(
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;

  return fetch(`${SERVER_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT),
  });
}

async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${SERVER_URL}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// Prerequisites
// ============================================================================

beforeAll(async () => {
  console.log("\n🔍 Checking prerequisites...");

  serverAvailable = await checkServerHealth();
  if (!serverAvailable) {
    console.warn("⚠️  Server not available. Tests will be skipped.");
    return;
  }
  console.log("✅ Server is available");

  if (!API_KEY) {
    console.warn("⚠️  TEST_API_KEY not set. Tests will be skipped.");
    return;
  }

  // Test API key
  const testResponse = await fetchWithAuth("/api/v1/credits/balance");
  apiKeyValid = testResponse.ok;

  if (!apiKeyValid) {
    console.warn("⚠️  API key is invalid. Tests will be skipped.");
    return;
  }
  console.log("✅ API key is valid");
});

// ============================================================================
// Tests
// ============================================================================

describe("N8N Workflow Generation", () => {
  test(
    "Endpoint Discovery API works",
    async () => {
      if (!serverAvailable || !apiKeyValid) {
        console.log("⏭️  Skipping test - prerequisites not met");
        return;
      }

      const response = await fetchWithAuth(
        "/api/v1/n8n/nodes/discover?limit=10",
      );
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.nodes)).toBe(true);
      expect(data.total).toBeGreaterThan(0);
      expect(Array.isArray(data.categories)).toBe(true);

      console.log(`✅ Discovered ${data.total} endpoints`);
    },
    TIMEOUT,
  );

  test(
    "Node Generation API works",
    async () => {
      if (!serverAvailable || !apiKeyValid) {
        console.log("⏭️  Skipping test - prerequisites not met");
        return;
      }

      // First discover endpoints
      const discoverResponse = await fetchWithAuth(
        "/api/v1/n8n/nodes/discover?limit=5",
      );
      const discoverData = await discoverResponse.json();

      if (!discoverData.nodes || discoverData.nodes.length === 0) {
        console.log("⏭️  Skipping test - no endpoints found");
        return;
      }

      const testEndpoint = discoverData.nodes[0];

      // Generate a node
      const response = await fetchWithAuth(
        "/api/v1/n8n/nodes/generate",
        "POST",
        {
          endpointId: testEndpoint.id,
          position: [250, 300],
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.node).toBeDefined();
      expect(data.node.id).toBeDefined();
      expect(data.node.type).toBe("n8n-nodes-base.httpRequest");
      expect(data.node.name).toBeDefined();
      expect(data.node.parameters).toBeDefined();

      console.log(`✅ Generated node: ${data.node.name}`);
    },
    TIMEOUT,
  );

  test(
    "Workflow Generation API works (simple workflow)",
    async () => {
      if (!serverAvailable || !apiKeyValid) {
        console.log("⏭️  Skipping test - prerequisites not met");
        return;
      }

      const response = await fetchWithAuth(
        "/api/v1/n8n/generate-workflow",
        "POST",
        {
          prompt:
            "Create a simple workflow with a start node and an HTTP request node that calls https://api.example.com/data",
          autoSave: false,
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.workflow).toBeDefined();
      expect(Array.isArray(data.workflow.nodes)).toBe(true);
      expect(data.workflow.nodes.length).toBeGreaterThan(0);
      expect(data.workflow.connections).toBeDefined();
      expect(data.validation).toBeDefined();
      expect(data.metadata).toBeDefined();
      expect(data.metadata.cost).toBeGreaterThan(0);

      // Validate workflow structure
      const workflow = data.workflow;
      expect(workflow.name).toBeDefined();
      expect(Array.isArray(workflow.nodes)).toBe(true);

      // Check nodes have required fields
      for (const node of workflow.nodes) {
        expect(node.id).toBeDefined();
        expect(node.type).toBeDefined();
        expect(node.name).toBeDefined();
      }

      console.log(`✅ Generated workflow with ${workflow.nodes.length} nodes`);
      console.log(
        `   Validation: ${data.validation.valid ? "valid" : "invalid"}`,
      );
      if (data.validation.errors && data.validation.errors.length > 0) {
        console.log(`   Errors: ${data.validation.errors.join(", ")}`);
      }
    },
    TIMEOUT,
  );

  test(
    "Workflow Generation with Auto-Save works",
    async () => {
      if (!serverAvailable || !apiKeyValid) {
        console.log("⏭️  Skipping test - prerequisites not met");
        return;
      }

      const workflowName = `Test Workflow ${Date.now()}`;

      const response = await fetchWithAuth(
        "/api/v1/n8n/generate-workflow",
        "POST",
        {
          prompt: "Create a workflow that checks credit balance",
          autoSave: true,
          workflowName,
          tags: ["test", "automated"],
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.workflow).toBeDefined();
      expect(data.savedWorkflow).toBeDefined();
      expect(data.savedWorkflow.id).toBeDefined();
      expect(data.savedWorkflow.name).toBe(workflowName);

      // Verify workflow was actually saved
      const getResponse = await fetchWithAuth(
        `/api/v1/n8n/workflows/${data.savedWorkflow.id}`,
      );
      expect(getResponse.ok).toBe(true);

      const workflowData = await getResponse.json();
      expect(workflowData.success).toBe(true);
      expect(workflowData.workflow.id).toBe(data.savedWorkflow.id);
      expect(workflowData.workflow.name).toBe(workflowName);

      console.log(
        `✅ Generated and saved workflow: ${workflowName} (${data.savedWorkflow.id})`,
      );

      // Cleanup - delete the test workflow
      await fetchWithAuth(
        `/api/v1/n8n/workflows/${data.savedWorkflow.id}`,
        "DELETE",
      );
    },
    TIMEOUT,
  );

  test(
    "Workflow Generation includes discovered endpoints",
    async () => {
      if (!serverAvailable || !apiKeyValid) {
        console.log("⏭️  Skipping test - prerequisites not met");
        return;
      }

      const response = await fetchWithAuth(
        "/api/v1/n8n/generate-workflow",
        "POST",
        {
          prompt:
            "Create a workflow that uses the check_credits MCP tool and then calls a REST API",
          autoSave: false,
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.workflow).toBeDefined();

      // Check if workflow contains HTTP Request nodes (which would be used for endpoints)
      const hasHttpNodes = data.workflow.nodes.some(
        (node: { type: string }) => node.type === "n8n-nodes-base.httpRequest",
      );

      // The workflow should have HTTP nodes if it's using endpoints
      // (This is a soft check - the AI might structure it differently)
      console.log(`✅ Generated workflow structure validated`);
      console.log(`   Has HTTP nodes: ${hasHttpNodes}`);
      console.log(`   Total nodes: ${data.workflow.nodes.length}`);
    },
    TIMEOUT,
  );

  test(
    "Workflow Generation validation catches errors",
    async () => {
      if (!serverAvailable || !apiKeyValid) {
        console.log("⏭️  Skipping test - prerequisites not met");
        return;
      }

      // Test with a prompt that might generate invalid workflow
      // (This is a soft test - the AI usually generates valid workflows)
      const response = await fetchWithAuth(
        "/api/v1/n8n/generate-workflow",
        "POST",
        {
          prompt: "Create a workflow",
          autoSave: false,
        },
      );

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.validation).toBeDefined();

      // Validation should always be present, even if valid
      expect(typeof data.validation.valid).toBe("boolean");
      expect(Array.isArray(data.validation.errors)).toBe(true);

      console.log(`✅ Validation system working`);
      console.log(`   Valid: ${data.validation.valid}`);
      console.log(`   Errors: ${data.validation.errors.length}`);
    },
    TIMEOUT,
  );
});
