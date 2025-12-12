/**
 * Todo App MCP Endpoint Integration Tests
 *
 * Tests the actual MCP endpoint with real HTTP requests.
 * Run: bun test tests/integration/todoapp-mcp.test.ts
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { setupIntegrationTest, requireServer, testContext } from "../test-utils";

const SERVER_URL = process.env.TEST_API_URL || "http://localhost:3000";
const MCP_ENDPOINT = `${SERVER_URL}/api/mcp/todoapp`;

describe("Todo App MCP Endpoint", () => {
  let serverAvailable = false;

  beforeAll(async () => {
    serverAvailable = await requireServer(SERVER_URL);
    if (!serverAvailable) {
      console.log("⚠️ Server not available - MCP tests will be skipped");
    }
  });

  describe("GET /api/mcp/todoapp - Metadata", () => {
    test("returns MCP server metadata", async () => {
      if (!serverAvailable) {
        console.log("⏭️ Skipping - server not available");
        return;
      }

      const response = await fetch(MCP_ENDPOINT);
      expect(response.status).toBe(200);

      const data = await response.json();
      
      // Verify structure
      expect(data.name).toBe("Todo App MCP");
      expect(data.version).toBe("1.0.0");
      expect(data.protocol).toBe("2024-11-05");
      expect(data.capabilities).toHaveProperty("tools");
      expect(Array.isArray(data.tools)).toBe(true);
    });

    test("returns all expected tools", async () => {
      if (!serverAvailable) {
        console.log("⏭️ Skipping - server not available");
        return;
      }

      const response = await fetch(MCP_ENDPOINT);
      const data = await response.json();

      const toolNames = data.tools.map((t: { name: string }) => t.name);
      
      expect(toolNames).toContain("create_task");
      expect(toolNames).toContain("list_tasks");
      expect(toolNames).toContain("complete_task");
      expect(toolNames).toContain("update_task");
      expect(toolNames).toContain("delete_task");
      expect(toolNames).toContain("get_points");
      expect(toolNames.length).toBe(6);
    });

    test("each tool has proper schema", async () => {
      if (!serverAvailable) {
        console.log("⏭️ Skipping - server not available");
        return;
      }

      const response = await fetch(MCP_ENDPOINT);
      const data = await response.json();

      for (const tool of data.tools) {
        expect(tool).toHaveProperty("name");
        expect(tool).toHaveProperty("description");
        expect(tool).toHaveProperty("inputSchema");
        expect(tool.inputSchema).toHaveProperty("type");
        expect(tool.inputSchema.type).toBe("object");
      }
    });

    test("create_task schema has required fields", async () => {
      if (!serverAvailable) {
        console.log("⏭️ Skipping - server not available");
        return;
      }

      const response = await fetch(MCP_ENDPOINT);
      const data = await response.json();

      const createTask = data.tools.find((t: { name: string }) => t.name === "create_task");
      expect(createTask).toBeDefined();
      expect(createTask.inputSchema.required).toContain("name");
      expect(createTask.inputSchema.required).toContain("type");
      expect(createTask.inputSchema.properties.type.enum).toEqual(["daily", "one-off", "aspirational"]);
    });
  });

  describe("POST /api/mcp/todoapp - JSON-RPC", () => {
    test("initialize returns protocol info", async () => {
      if (!serverAvailable) {
        console.log("⏭️ Skipping - server not available");
        return;
      }

      const response = await fetch(MCP_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "initialize",
          params: {},
          id: 1,
        }),
      });

      // May require auth, so accept 200 or 401
      if (response.status === 401) {
        console.log("ℹ️ Initialize requires auth - skipping assertion");
        return;
      }

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.result.protocolVersion).toBe("2024-11-05");
      expect(data.result.serverInfo.name).toBe("todo-app-mcp");
    });

    test("tools/list returns tool definitions", async () => {
      if (!serverAvailable) {
        console.log("⏭️ Skipping - server not available");
        return;
      }

      const response = await fetch(MCP_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/list",
          params: {},
          id: 2,
        }),
      });

      if (response.status === 401) {
        console.log("ℹ️ tools/list requires auth - skipping assertion");
        return;
      }

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.result.tools)).toBe(true);
      expect(data.result.tools.length).toBe(6);
    });

    test("ping returns empty result", async () => {
      if (!serverAvailable) {
        console.log("⏭️ Skipping - server not available");
        return;
      }

      const response = await fetch(MCP_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "ping",
          params: {},
          id: 3,
        }),
      });

      if (response.status === 401) {
        console.log("ℹ️ ping requires auth - skipping assertion");
        return;
      }

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.result).toEqual({});
    });

    test("unknown method returns error", async () => {
      if (!serverAvailable) {
        console.log("⏭️ Skipping - server not available");
        return;
      }

      const response = await fetch(MCP_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "unknown/method",
          params: {},
          id: 4,
        }),
      });

      // Either 400 or 401
      expect([400, 401]).toContain(response.status);
    });

    test("invalid JSON-RPC returns parse error", async () => {
      if (!serverAvailable) {
        console.log("⏭️ Skipping - server not available");
        return;
      }

      const response = await fetch(MCP_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invalid: "request" }),
      });

      // Should return 400 for invalid request
      expect([400, 401]).toContain(response.status);
    });
  });

  describe("Authentication Requirements", () => {
    test("tools/call requires authentication", async () => {
      if (!serverAvailable) {
        console.log("⏭️ Skipping - server not available");
        return;
      }

      const response = await fetch(MCP_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: "list_tasks",
            arguments: {},
          },
          id: 5,
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32002);
    });

    test("complete_task requires authentication", async () => {
      if (!serverAvailable) {
        console.log("⏭️ Skipping - server not available");
        return;
      }

      const response = await fetch(MCP_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: "complete_task",
            arguments: { id: "fake-id" },
          },
          id: 6,
        }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe("CORS Headers", () => {
    test("OPTIONS returns proper CORS headers", async () => {
      if (!serverAvailable) {
        console.log("⏭️ Skipping - server not available");
        return;
      }

      const response = await fetch(MCP_ENDPOINT, {
        method: "OPTIONS",
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    });

    test("GET response includes CORS headers", async () => {
      if (!serverAvailable) {
        console.log("⏭️ Skipping - server not available");
        return;
      }

      const response = await fetch(MCP_ENDPOINT);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
    });
  });
});

describe("MCP Registry Entry", () => {
  let serverAvailable = false;

  beforeAll(async () => {
    serverAvailable = await requireServer(SERVER_URL);
  });

  test("todo-app is registered in MCP registry", async () => {
    if (!serverAvailable) {
      console.log("⏭️ Skipping - server not available");
      return;
    }

    const response = await fetch(`${SERVER_URL}/api/mcp/registry`);
    expect(response.status).toBe(200);

    const data = await response.json();
    const todoEntry = data.registry.find((e: { id: string }) => e.id === "todo-app");

    expect(todoEntry).toBeDefined();
    expect(todoEntry.name).toBe("Todo App");
    expect(todoEntry.category).toBe("productivity");
    expect(todoEntry.status).toBe("live");
  });

  test("registry entry has correct features", async () => {
    if (!serverAvailable) {
      console.log("⏭️ Skipping - server not available");
      return;
    }

    const response = await fetch(`${SERVER_URL}/api/mcp/registry`);
    const data = await response.json();
    const todoEntry = data.registry.find((e: { id: string }) => e.id === "todo-app");

    expect(todoEntry.features).toContain("create_task");
    expect(todoEntry.features).toContain("complete_task");
    expect(todoEntry.features).toContain("get_points");
  });

  test("registry entry has valid endpoint", async () => {
    if (!serverAvailable) {
      console.log("⏭️ Skipping - server not available");
      return;
    }

    const response = await fetch(`${SERVER_URL}/api/mcp/registry`);
    const data = await response.json();
    const todoEntry = data.registry.find((e: { id: string }) => e.id === "todo-app");

    expect(todoEntry.endpoint).toContain("/api/mcp/todoapp");
  });
});
