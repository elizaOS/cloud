/**
 * ORG Cross-Platform Integration Tests
 * 
 * Tests the integration between:
 * - Web UI (org-app)
 * - Discord bot
 * - Telegram bot
 * - Cloud APIs
 * - MCP tools
 * 
 * Verifies that:
 * - Todos created via one platform appear in others
 * - Check-in responses sync across platforms
 * - Team members are tracked correctly
 * - Reports aggregate data from all platforms
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";

const SERVER_URL = process.env.TEST_SERVER_URL || "http://localhost:3000";
const APP_TOKEN = process.env.TEST_APP_TOKEN;
const API_KEY = process.env.TEST_API_KEY;
const TIMEOUT = 30000;

// Track created resources
const createdResources: {
  todos: string[];
  schedules: string[];
} = {
  todos: [],
  schedules: [],
};

// Runtime state
let serverRunning = false;
let authValid = false;

// ============================================================================
// Helpers
// ============================================================================

async function apiRequest(
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

async function mcpToolCall(toolName: string, args: Record<string, unknown> = {}): Promise<{
  success: boolean;
  [key: string]: unknown;
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
  });
  
  const data = await response.json();
  const text = data.result?.content?.[0]?.text;
  if (!text) throw new Error("No MCP response");
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
  } catch {
    console.log(`⚠️ Server not responding`);
    return;
  }

  if (!serverRunning) {
    console.log(`⚠️ Server not running, skipping auth check`);
    return;
  }

  // Check auth
  if (APP_TOKEN || API_KEY) {
    try {
      const response = await apiRequest("/user");
      authValid = response.ok;
    } catch {
      console.log(`⚠️ Auth check failed`);
    }
  }
});

afterAll(async () => {
  if (!authValid) return;

  // Cleanup
  for (const todoId of createdResources.todos) {
    await apiRequest(`/tasks/${todoId}`, "DELETE").catch(() => {});
  }
});

// ============================================================================
// Cross-Platform Todo Tests
// ============================================================================

describe("Cross-Platform Todo Sync", () => {
  test("Todo created via API appears in MCP list", async () => {
    if (skip()) return;

    // Create via API
    const createResponse = await apiRequest("/tasks", "POST", {
      title: "API Created Todo",
      description: "Testing cross-platform sync",
      priority: "high",
    });
    
    expect(createResponse.status).toBe(200);
    const { todo: createdTodo } = await createResponse.json();
    createdResources.todos.push(createdTodo.id);

    // Verify via MCP
    const mcpResult = await mcpToolCall("list_todos", { limit: 10 });
    expect(mcpResult.success).toBe(true);

    const found = (mcpResult.todos as Array<{ id: string }>).find(
      (t) => t.id === createdTodo.id
    );
    expect(found).toBeDefined();
  });

  test("Todo created via MCP appears in API list", async () => {
    if (skip()) return;

    // Create via MCP
    const mcpResult = await mcpToolCall("create_todo", {
      title: "MCP Created Todo",
      description: "Testing reverse sync",
      priority: "low",
    });
    
    expect(mcpResult.success).toBe(true);
    const todoId = (mcpResult.todo as { id: string }).id;
    createdResources.todos.push(todoId);

    // Verify via API
    const getResponse = await apiRequest(`/tasks/${todoId}`);
    expect(getResponse.status).toBe(200);

    const { todo } = await getResponse.json();
    expect(todo.title).toBe("MCP Created Todo");
  });

  test("Todo updated via API reflects in MCP", async () => {
    if (skip()) return;

    // Create todo
    const createResponse = await apiRequest("/tasks", "POST", {
      title: "Todo for Update Test",
    });
    const { todo: createdTodo } = await createResponse.json();
    createdResources.todos.push(createdTodo.id);

    // Update via API
    await apiRequest(`/tasks/${createdTodo.id}`, "PATCH", {
      status: "in_progress",
      priority: "urgent",
    });

    // Verify via MCP list
    const mcpResult = await mcpToolCall("list_todos", { limit: 50 });
    const found = (mcpResult.todos as Array<{ id: string; status: string; priority: string }>).find(
      (t) => t.id === createdTodo.id
    );
    
    expect(found).toBeDefined();
    expect(found!.status).toBe("in_progress");
    expect(found!.priority).toBe("urgent");
  });

  test("Todo completed via MCP reflects in API", async () => {
    if (skip()) return;

    // Create todo via API
    const createResponse = await apiRequest("/tasks", "POST", {
      title: "Todo to Complete via MCP",
    });
    const { todo: createdTodo } = await createResponse.json();
    createdResources.todos.push(createdTodo.id);

    // Complete via MCP
    const mcpResult = await mcpToolCall("complete_todo", {
      todoId: createdTodo.id,
    });
    expect(mcpResult.success).toBe(true);

    // Verify via API
    const getResponse = await apiRequest(`/tasks/${createdTodo.id}`);
    const { todo } = await getResponse.json();
    
    expect(todo.status).toBe("completed");
    expect(todo.completedAt).not.toBeNull();
  });

  test("Stats are consistent across API and MCP", async () => {
    if (skip()) return;

    // Get stats via API
    const apiResponse = await apiRequest("/tasks");
    const apiData = await apiResponse.json();

    // Get stats via MCP
    const mcpResult = await mcpToolCall("get_todo_stats", {});

    // Compare key metrics
    expect(apiData.stats.total).toBe((mcpResult.stats as { total: number }).total);
    expect(apiData.stats.pending).toBe((mcpResult.stats as { pending: number }).pending);
    expect(apiData.stats.completed).toBe((mcpResult.stats as { completed: number }).completed);
  });
});

// ============================================================================
// Platform Source Tracking Tests
// ============================================================================

describe("Platform Source Tracking", () => {
  test("Todo created with web source is tracked", async () => {
    if (skip()) return;

    const response = await apiRequest("/tasks", "POST", {
      title: "Web-sourced Todo",
      sourcePlatform: "web",
    });
    
    const { todo } = await response.json();
    createdResources.todos.push(todo.id);

    expect(todo.source.platform).toBe("web");
  });

  test("Todo created with Discord source is tracked", async () => {
    if (skip()) return;

    const response = await apiRequest("/tasks", "POST", {
      title: "Discord-sourced Todo",
      sourcePlatform: "discord",
      sourceServerId: "123456789",
      sourceChannelId: "987654321",
      sourceMessageId: "111222333",
    });
    
    const { todo } = await response.json();
    createdResources.todos.push(todo.id);

    expect(todo.source.platform).toBe("discord");
    expect(todo.source.serverId).toBe("123456789");
  });

  test("Todo created with Telegram source is tracked", async () => {
    if (skip()) return;

    const response = await apiRequest("/tasks", "POST", {
      title: "Telegram-sourced Todo",
      sourcePlatform: "telegram",
      sourceServerId: "-1001234567890",
      sourceMessageId: "444",
    });
    
    const { todo } = await response.json();
    createdResources.todos.push(todo.id);

    expect(todo.source.platform).toBe("telegram");
  });

  test("Filter by source platform works", async () => {
    if (skip()) return;

    // Create todos from different platforms
    await apiRequest("/tasks", "POST", {
      title: "Filter Test - Web",
      sourcePlatform: "web",
    });

    await apiRequest("/tasks", "POST", {
      title: "Filter Test - Discord",
      sourcePlatform: "discord",
    });

    // Filter by web
    const webResponse = await apiRequest("/tasks?sourcePlatform=web");
    const webData = await webResponse.json();

    // All returned should be from web
    for (const todo of webData.todos) {
      if (todo.source.platform) {
        expect(todo.source.platform).toBe("web");
      }
    }
  });
});

// ============================================================================
// Assignee Cross-Platform Tests
// ============================================================================

describe("Assignee Cross-Platform", () => {
  test("Discord assignee is stored correctly", async () => {
    if (skip()) return;

    const response = await apiRequest("/tasks", "POST", {
      title: "Assigned to Discord User",
      assigneePlatformId: "discord-user-123",
      assigneePlatform: "discord",
      assigneeName: "DiscordUser#1234",
    });
    
    const { todo } = await response.json();
    createdResources.todos.push(todo.id);

    expect(todo.assignee).not.toBeNull();
    expect(todo.assignee.platformId).toBe("discord-user-123");
    expect(todo.assignee.platform).toBe("discord");
    expect(todo.assignee.name).toBe("DiscordUser#1234");
  });

  test("Telegram assignee is stored correctly", async () => {
    if (skip()) return;

    const response = await apiRequest("/tasks", "POST", {
      title: "Assigned to Telegram User",
      assigneePlatformId: "telegram-user-456",
      assigneePlatform: "telegram",
      assigneeName: "@telegramuser",
    });
    
    const { todo } = await response.json();
    createdResources.todos.push(todo.id);

    expect(todo.assignee).not.toBeNull();
    expect(todo.assignee.platformId).toBe("telegram-user-456");
    expect(todo.assignee.platform).toBe("telegram");
  });

  test("Filter by assignee works", async () => {
    if (skip()) return;

    const assigneeId = `test-assignee-${Date.now()}`;

    // Create assigned todo
    const createResponse = await apiRequest("/tasks", "POST", {
      title: "Filtered Assignee Test",
      assigneePlatformId: assigneeId,
      assigneePlatform: "discord",
    });
    const { todo } = await createResponse.json();
    createdResources.todos.push(todo.id);

    // Filter
    const filterResponse = await apiRequest(
      `/tasks?assigneePlatformId=${assigneeId}`
    );
    const filterData = await filterResponse.json();

    expect(filterData.todos.length).toBeGreaterThanOrEqual(1);
    const found = filterData.todos.find((t: { id: string }) => t.id === todo.id);
    expect(found).toBeDefined();
  });
});

// ============================================================================
// Platform Connection Status Tests
// ============================================================================

describe("Bot Connection Status", () => {
  test("Bot status via API", async () => {
    if (skip()) return;

    const response = await apiRequest("/bots");
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data.bots)).toBe(true);
  });

  test("Platform status via MCP", async () => {
    if (skip()) return;

    const result = await mcpToolCall("get_platform_status", {});
    expect(result.success).toBe(true);
    expect(Array.isArray(result.platforms)).toBe(true);
  });

  test("Bot status matches between API and MCP", async () => {
    if (skip()) return;

    // Get via API
    const apiResponse = await apiRequest("/bots");
    const apiData = await apiResponse.json();

    // Get via MCP
    const mcpResult = await mcpToolCall("get_platform_status", {});

    // Compare counts
    expect(apiData.bots.length).toBe(
      (mcpResult.platforms as unknown[]).length
    );
  });
});

// ============================================================================
// Data Consistency Tests
// ============================================================================

describe("Data Consistency", () => {
  test("Rapid create/update maintains consistency", async () => {
    if (skip()) return;

    // Create multiple todos rapidly
    const createPromises = Array(5).fill(null).map((_, i) =>
      apiRequest("/tasks", "POST", {
        title: `Rapid Create Test ${i}`,
        priority: i % 2 === 0 ? "high" : "low",
      })
    );

    const responses = await Promise.all(createPromises);
    const todos = await Promise.all(
      responses.map(async (r) => {
        const data = await r.json();
        createdResources.todos.push(data.todo.id);
        return data.todo;
      })
    );

    // Verify all were created
    expect(todos.length).toBe(5);

    // Verify they appear in list
    const listResponse = await apiRequest("/tasks?limit=100");
    const listData = await listResponse.json();

    for (const todo of todos) {
      const found = listData.todos.find((t: { id: string }) => t.id === todo.id);
      expect(found).toBeDefined();
    }
  });

  test("Concurrent updates don't lose data", async () => {
    if (skip()) return;

    // Create todo
    const createResponse = await apiRequest("/tasks", "POST", {
      title: "Concurrent Update Test",
      description: "Original description",
    });
    const { todo } = await createResponse.json();
    createdResources.todos.push(todo.id);

    // Update concurrently
    const updatePromises = [
      apiRequest(`/tasks/${todo.id}`, "PATCH", { priority: "high" }),
      apiRequest(`/tasks/${todo.id}`, "PATCH", { status: "in_progress" }),
    ];

    await Promise.all(updatePromises);

    // Verify final state
    const getResponse = await apiRequest(`/tasks/${todo.id}`);
    const { todo: finalTodo } = await getResponse.json();

    // Both updates should have been applied
    expect(finalTodo.priority).toBe("high");
    expect(finalTodo.status).toBe("in_progress");
  });
});

