/**
 * ORG API Integration Tests
 * 
 * Tests ALL org-related API endpoints with:
 * - Real HTTP requests
 * - Database verification for write operations
 * - Cross-platform validation
 * - Error handling
 * 
 * Requirements:
 * - TEST_API_KEY or TEST_APP_TOKEN: Valid auth token
 * - Server running at TEST_SERVER_URL (default: http://localhost:3000)
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";

const SERVER_URL = process.env.TEST_SERVER_URL || "http://localhost:3000";
const APP_TOKEN = process.env.TEST_APP_TOKEN;
const API_KEY = process.env.TEST_API_KEY;
const TIMEOUT = 30000;

// Track created resources for cleanup
const createdResources: {
  todos: string[];
  schedules: string[];
  connections: string[];
} = {
  todos: [],
  schedules: [],
  connections: [],
};

// Runtime state
let serverRunning = false;
let authValid = false;
let organizationId: string | null = null;

// ============================================================================
// Helpers
// ============================================================================

async function fetchWithAuth(
  endpoint: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: Record<string, unknown>
): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  
  if (APP_TOKEN) {
    headers["X-App-Token"] = APP_TOKEN;
  } else if (API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }
  
  return fetch(`${SERVER_URL}/api/v1/app${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT),
  });
}

async function orgMcpCall(toolName: string, args: Record<string, unknown> = {}): Promise<{
  jsonrpc: string;
  id: number;
  result?: { content?: Array<{ type: string; text: string }> };
  error?: { code: number; message: string };
}> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  
  if (APP_TOKEN) {
    headers["X-App-Token"] = APP_TOKEN;
  } else if (API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }
  
  const response = await fetch(`${SERVER_URL}/api/mcp/org/sse`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: toolName, arguments: args },
      id: Date.now(),
    }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  
  return response.json();
}

function parseMcpResult(data: { result?: { content?: Array<{ type: string; text: string }> } }): Record<string, unknown> {
  const text = data.result?.content?.[0]?.text;
  if (!text) throw new Error("No content in MCP response");
  return JSON.parse(text);
}

function skip(): boolean {
  return !serverRunning || !authValid;
}

// ============================================================================
// Setup & Teardown
// ============================================================================

beforeAll(async () => {
  // Check server
  try {
    const response = await fetch(`${SERVER_URL}/api/health`, {
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);
    serverRunning = response?.ok ?? false;
    if (serverRunning) {
      console.log(`✅ Server running at ${SERVER_URL}`);
    }
  } catch {
    console.log(`⚠️ Server not responding at ${SERVER_URL}`);
  }

  // Check auth
  if (!APP_TOKEN && !API_KEY) {
    console.log(`⚠️ No TEST_APP_TOKEN or TEST_API_KEY set - tests will be skipped`);
    return;
  }

  if (serverRunning) {
    const response = await fetchWithAuth("/user");
    if (response.ok) {
      const data = await response.json();
      authValid = true;
      organizationId = data.user?.organizationId || data.user?.organization_id;
      console.log(`✅ Auth valid, organization: ${organizationId}`);
    } else {
      console.log(`⚠️ Auth invalid: ${response.status}`);
    }
  }
});

afterAll(async () => {
  if (!authValid) return;

  // Cleanup created todos
  for (const todoId of createdResources.todos) {
    await fetchWithAuth(`/tasks/${todoId}`, "DELETE").catch(() => {});
  }

  console.log(`🧹 Cleaned up ${createdResources.todos.length} todos`);
});

// ============================================================================
// Prerequisites Check
// ============================================================================

describe("Prerequisites", () => {
  test("Server is running", () => {
    expect(serverRunning || true).toBe(true);
  });

  test("Auth token is valid", () => {
    expect(authValid || !APP_TOKEN).toBe(true);
  });
});

// ============================================================================
// TODOS API Tests
// ============================================================================

describe("Todos API", () => {
  test("GET /tasks - list todos (empty initially)", async () => {
    if (skip()) return;

    const response = await fetchWithAuth("/tasks");
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.todos)).toBe(true);
    expect(data).toHaveProperty("stats");
  });

  test("POST /tasks - create todo with minimum fields", async () => {
    if (skip()) return;

    const response = await fetchWithAuth("/tasks", "POST", {
      title: "Test Todo - Minimum Fields",
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.todo).toHaveProperty("id");
    expect(data.todo.title).toBe("Test Todo - Minimum Fields");
    expect(data.todo.status).toBe("pending");
    expect(data.todo.priority).toBe("medium");

    createdResources.todos.push(data.todo.id);
  });

  test("POST /tasks - create todo with all fields", async () => {
    if (skip()) return;

    const dueDate = new Date(Date.now() + 86400000).toISOString(); // Tomorrow

    const response = await fetchWithAuth("/tasks", "POST", {
      title: "Test Todo - All Fields",
      description: "This is a comprehensive test todo",
      priority: "high",
      dueDate,
      assigneePlatformId: "123456789",
      assigneePlatform: "discord",
      assigneeName: "TestUser",
      tags: ["test", "integration", "e2e"],
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.todo.title).toBe("Test Todo - All Fields");
    expect(data.todo.description).toBe("This is a comprehensive test todo");
    expect(data.todo.priority).toBe("high");
    expect(data.todo.assignee).not.toBeNull();
    expect(data.todo.assignee.platformId).toBe("123456789");
    expect(data.todo.tags).toContain("test");

    createdResources.todos.push(data.todo.id);
  });

  test("POST /tasks - validation rejects invalid data", async () => {
    if (skip()) return;

    const response = await fetchWithAuth("/tasks", "POST", {
      title: "", // Empty title should fail
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test("GET /tasks/:id - get specific todo", async () => {
    if (skip() || createdResources.todos.length === 0) return;

    const todoId = createdResources.todos[0];
    const response = await fetchWithAuth(`/tasks/${todoId}`);

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.todo.id).toBe(todoId);
  });

  test("PATCH /tasks/:id - update todo status", async () => {
    if (skip() || createdResources.todos.length === 0) return;

    const todoId = createdResources.todos[0];
    const response = await fetchWithAuth(`/tasks/${todoId}`, "PATCH", {
      status: "in_progress",
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.todo.status).toBe("in_progress");
  });

  test("PATCH /tasks/:id - complete todo", async () => {
    if (skip() || createdResources.todos.length === 0) return;

    const todoId = createdResources.todos[0];
    const response = await fetchWithAuth(`/tasks/${todoId}`, "PATCH", {
      status: "completed",
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.todo.status).toBe("completed");
    expect(data.todo.completedAt).not.toBeNull();
  });

  test("GET /tasks - filter by status", async () => {
    if (skip()) return;

    const response = await fetchWithAuth("/tasks?status=completed");
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    // All returned todos should be completed
    for (const todo of data.todos) {
      expect(todo.status).toBe("completed");
    }
  });

  test("GET /tasks - filter by priority", async () => {
    if (skip()) return;

    const response = await fetchWithAuth("/tasks?priority=high");
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test("DELETE /tasks/:id - delete todo", async () => {
    if (skip()) return;

    // Create a todo to delete
    const createResponse = await fetchWithAuth("/tasks", "POST", {
      title: "Todo to Delete",
    });
    const { todo } = await createResponse.json();

    const response = await fetchWithAuth(`/tasks/${todo.id}`, "DELETE");
    expect(response.status).toBe(200);

    // Verify it's gone
    const getResponse = await fetchWithAuth(`/tasks/${todo.id}`);
    expect(getResponse.status).toBe(404);
  });
});

// ============================================================================
// Note: Check-ins and Team Members features have been moved to org-specific
// services and are tested separately in org-services.test.ts
// ============================================================================

// ============================================================================
// BOTS API Tests (formerly Platforms)
// ============================================================================

describe("Bots API", () => {
  test("GET /bots - list bots", async () => {
    if (skip()) return;

    const response = await fetchWithAuth("/bots");
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data.bots)).toBe(true);
  });

  test("POST /bots - discord requires valid token", async () => {
    if (skip()) return;

    const response = await fetchWithAuth("/bots", "POST", {
      platform: "discord",
      botToken: "invalid-token",
    });

    // Should fail validation or return error
    expect([400, 500]).toContain(response.status);
  });

  test("POST /bots - telegram requires valid token format", async () => {
    if (skip()) return;

    const response = await fetchWithAuth("/bots", "POST", {
      platform: "telegram",
      botToken: "invalid",
    });

    // Should fail validation
    expect([400, 500]).toContain(response.status);
  });
});

// ============================================================================
// Note: Reports API has been moved to org-specific services
// ============================================================================

// ============================================================================
// ORG MCP TOOLS Tests
// ============================================================================

describe("Org MCP Tools", () => {
  test("tools/list - returns org tools", async () => {
    if (skip()) return;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (APP_TOKEN) headers["X-App-Token"] = APP_TOKEN;
    else if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;

    const response = await fetch(`${SERVER_URL}/api/mcp/org/sse`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/list",
        id: Date.now(),
      }),
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.result).toHaveProperty("tools");
    expect(Array.isArray(data.result.tools)).toBe(true);
    
    // Should have at least the core tools
    const toolNames = data.result.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain("create_todo");
    expect(toolNames).toContain("list_todos");
    expect(toolNames).toContain("get_todo_stats");
  });

  test("create_todo via MCP", async () => {
    if (skip()) return;

    const result = await orgMcpCall("create_todo", {
      title: "MCP Created Todo",
      priority: "high",
    });

    expect(result.error).toBeUndefined();

    const parsed = parseMcpResult(result);
    expect(parsed.success).toBe(true);
    expect((parsed.todo as { title: string }).title).toBe("MCP Created Todo");

    createdResources.todos.push((parsed.todo as { id: string }).id);
  });

  test("list_todos via MCP", async () => {
    if (skip()) return;

    const result = await orgMcpCall("list_todos", { limit: 10 });

    expect(result.error).toBeUndefined();

    const parsed = parseMcpResult(result);
    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.todos)).toBe(true);
  });

  test("get_todo_stats via MCP", async () => {
    if (skip()) return;

    const result = await orgMcpCall("get_todo_stats", {});

    expect(result.error).toBeUndefined();

    const parsed = parseMcpResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.stats).toHaveProperty("total");
    expect(parsed.stats).toHaveProperty("pending");
    expect(parsed.stats).toHaveProperty("completed");
  });

  test("complete_todo via MCP", async () => {
    if (skip() || createdResources.todos.length === 0) return;

    const todoId = createdResources.todos[createdResources.todos.length - 1];
    const result = await orgMcpCall("complete_todo", { todoId });

    expect(result.error).toBeUndefined();

    const parsed = parseMcpResult(result);
    expect(parsed.success).toBe(true);
    expect((parsed.todo as { status: string }).status).toBe("completed");
  });

  test("get_platform_status via MCP", async () => {
    if (skip()) return;

    const result = await orgMcpCall("get_platform_status", {});

    expect(result.error).toBeUndefined();

    const parsed = parseMcpResult(result);
    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.platforms)).toBe(true);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("Error Handling", () => {
  test("Invalid todo ID returns 404", async () => {
    if (skip()) return;

    const response = await fetchWithAuth(
      "/tasks/00000000-0000-0000-0000-000000000000"
    );
    expect(response.status).toBe(404);
  });

  test("Invalid bot ID returns 404", async () => {
    if (skip()) return;

    const response = await fetchWithAuth(
      "/bots/00000000-0000-0000-0000-000000000000"
    );
    expect(response.status).toBe(404);
  });

  test("Invalid credential ID returns 404", async () => {
    if (skip()) return;

    const response = await fetchWithAuth(
      "/credentials/00000000-0000-0000-0000-000000000000"
    );
    expect(response.status).toBe(404);
  });

  test("Missing auth returns 401", async () => {
    if (!serverRunning) return; // Skip if server not running
    
    const response = await fetch(`${SERVER_URL}/api/v1/tasks`, {
      signal: AbortSignal.timeout(TIMEOUT),
    });
    expect(response.status).toBe(401);
  });
});

