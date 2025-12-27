/**
 * ORG MCP Integration Tests
 *
 * Tests the Org MCP server endpoint with:
 * - JSON-RPC protocol compliance
 * - Tool discovery
 * - Tool execution
 * - Error handling
 *
 * Requirements:
 * - TEST_API_KEY or TEST_APP_TOKEN: Valid auth token
 * - Server running at TEST_SERVER_URL (default: http://localhost:3000)
 */

import { describe, test, expect, beforeAll } from "bun:test";

const SERVER_URL = process.env.TEST_SERVER_URL || "http://localhost:3000";
const APP_TOKEN = process.env.TEST_APP_TOKEN;
const API_KEY = process.env.TEST_API_KEY;
const MCP_ENDPOINT = "/api/mcp/org/sse";
const TIMEOUT = 30000;

// Runtime state
let serverRunning = false;
let authValid = false;

// ============================================================================
// Helpers
// ============================================================================

async function mcpRequest(
  method: string,
  params?: Record<string, unknown>,
): Promise<{
  jsonrpc: string;
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
}> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (APP_TOKEN) {
    headers["X-App-Token"] = APP_TOKEN;
  } else if (API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }

  const response = await fetch(`${SERVER_URL}${MCP_ENDPOINT}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id: Date.now(),
    }),
    signal: AbortSignal.timeout(TIMEOUT),
  });

  return response.json();
}

function skip(): boolean {
  return !serverRunning || !authValid;
}

// ============================================================================
// Setup
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
    console.log(`⚠️ No auth token set - authenticated tests will be skipped`);
  } else {
    authValid = true;
  }
});

// ============================================================================
// Protocol Tests
// ============================================================================

describe("MCP Protocol Compliance", () => {
  test("GET returns server info", async () => {
    if (!serverRunning) return;

    const response = await fetch(`${SERVER_URL}${MCP_ENDPOINT}`);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.protocolVersion).toBe("2024-11-05");
    expect(data.serverInfo).toHaveProperty("name");
    expect(data.serverInfo).toHaveProperty("version");
    expect(data.capabilities).toHaveProperty("tools");
  });

  test("POST initialize returns capabilities", async () => {
    if (!serverRunning) return;

    const data = await mcpRequest("initialize");

    // May require auth
    if (data.error && data.error.code === -32603) {
      return; // Auth required, skip
    }

    expect(data.result).toHaveProperty("protocolVersion");
    expect(data.result).toHaveProperty("serverInfo");
    expect(data.result).toHaveProperty("capabilities");
  });

  test("unknown method returns -32601 error", async () => {
    if (skip()) return;

    const data = await mcpRequest("unknown/method");

    expect(data.error).toBeDefined();
    expect(data.error?.code).toBe(-32601);
    expect(data.error?.message).toContain("not found");
  });
});

// ============================================================================
// Tool Discovery Tests
// ============================================================================

describe("Tool Discovery", () => {
  test("tools/list returns array of tools", async () => {
    if (skip()) return;

    const data = await mcpRequest("tools/list");

    expect(data.error).toBeUndefined();
    expect(data.result).toHaveProperty("tools");
    expect(Array.isArray((data.result as { tools: unknown[] }).tools)).toBe(
      true,
    );
  });

  test("tools have required properties", async () => {
    if (skip()) return;

    const data = await mcpRequest("tools/list");
    const tools = (
      data.result as {
        tools: Array<{
          name: string;
          description: string;
          inputSchema: { type: string; properties: Record<string, unknown> };
        }>;
      }
    ).tools;

    for (const tool of tools) {
      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");
      expect(tool.inputSchema).toHaveProperty("type");
      expect(tool.inputSchema).toHaveProperty("properties");
    }
  });

  test("all expected tools are present", async () => {
    if (skip()) return;

    const data = await mcpRequest("tools/list");
    const toolNames = (
      data.result as { tools: Array<{ name: string }> }
    ).tools.map((t) => t.name);

    // Todo tools
    expect(toolNames).toContain("create_todo");
    expect(toolNames).toContain("update_todo");
    expect(toolNames).toContain("list_todos");
    expect(toolNames).toContain("complete_todo");
    expect(toolNames).toContain("get_todo_stats");

    // Checkin tools
    expect(toolNames).toContain("create_checkin_schedule");
    expect(toolNames).toContain("record_checkin_response");
    expect(toolNames).toContain("list_checkin_schedules");

    // Team tools
    expect(toolNames).toContain("add_team_member");
    expect(toolNames).toContain("list_team_members");

    // Report tools
    expect(toolNames).toContain("generate_report");

    // Platform tools
    expect(toolNames).toContain("get_platform_status");
  });
});

// ============================================================================
// Tool Execution Tests
// ============================================================================

describe("Tool Execution", () => {
  test("create_todo works with valid input", async () => {
    if (skip()) return;

    const data = await mcpRequest("tools/call", {
      name: "create_todo",
      arguments: {
        title: "MCP Test Todo",
        description: "Created via MCP test",
        priority: "medium",
      },
    });

    expect(data.error).toBeUndefined();
    expect(data.result).toHaveProperty("content");

    const content = (
      data.result as { content: Array<{ type: string; text: string }> }
    ).content[0];
    expect(content.type).toBe("text");

    const parsed = JSON.parse(content.text);
    expect(parsed.success).toBe(true);
    expect(parsed.todo).toHaveProperty("id");
    expect(parsed.todo.title).toBe("MCP Test Todo");
  });

  test("list_todos returns array", async () => {
    if (skip()) return;

    const data = await mcpRequest("tools/call", {
      name: "list_todos",
      arguments: { limit: 5 },
    });

    expect(data.error).toBeUndefined();

    const content = (data.result as { content: Array<{ text: string }> })
      .content[0];
    const parsed = JSON.parse(content.text);

    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.todos)).toBe(true);
  });

  test("get_todo_stats returns stats object", async () => {
    if (skip()) return;

    const data = await mcpRequest("tools/call", {
      name: "get_todo_stats",
      arguments: {},
    });

    expect(data.error).toBeUndefined();

    const content = (data.result as { content: Array<{ text: string }> })
      .content[0];
    const parsed = JSON.parse(content.text);

    expect(parsed.success).toBe(true);
    expect(parsed.stats).toHaveProperty("total");
    expect(parsed.stats).toHaveProperty("pending");
    expect(parsed.stats).toHaveProperty("completed");
  });

  test("get_platform_status returns platforms array", async () => {
    if (skip()) return;

    const data = await mcpRequest("tools/call", {
      name: "get_platform_status",
      arguments: {},
    });

    expect(data.error).toBeUndefined();

    const content = (data.result as { content: Array<{ text: string }> })
      .content[0];
    const parsed = JSON.parse(content.text);

    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.platforms)).toBe(true);
  });

  test("list_checkin_schedules returns array", async () => {
    if (skip()) return;

    const data = await mcpRequest("tools/call", {
      name: "list_checkin_schedules",
      arguments: {},
    });

    expect(data.error).toBeUndefined();

    const content = (data.result as { content: Array<{ text: string }> })
      .content[0];
    const parsed = JSON.parse(content.text);

    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.schedules)).toBe(true);
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe("Input Validation", () => {
  test("create_todo requires title", async () => {
    if (skip()) return;

    const data = await mcpRequest("tools/call", {
      name: "create_todo",
      arguments: {
        // Missing title
        description: "No title provided",
      },
    });

    expect(data.error).toBeDefined();
    expect(data.error?.code).toBe(-32602); // Invalid params
  });

  test("create_todo validates priority enum", async () => {
    if (skip()) return;

    const data = await mcpRequest("tools/call", {
      name: "create_todo",
      arguments: {
        title: "Test",
        priority: "invalid_priority", // Invalid enum value
      },
    });

    expect(data.error).toBeDefined();
    expect(data.error?.code).toBe(-32602);
  });

  test("update_todo requires todoId", async () => {
    if (skip()) return;

    const data = await mcpRequest("tools/call", {
      name: "update_todo",
      arguments: {
        // Missing todoId
        status: "completed",
      },
    });

    expect(data.error).toBeDefined();
    expect(data.error?.code).toBe(-32602);
  });

  test("complete_todo requires valid UUID", async () => {
    if (skip()) return;

    const data = await mcpRequest("tools/call", {
      name: "complete_todo",
      arguments: {
        todoId: "not-a-valid-uuid",
      },
    });

    expect(data.error).toBeDefined();
  });

  test("list_team_members requires serverId", async () => {
    if (skip()) return;

    const data = await mcpRequest("tools/call", {
      name: "list_team_members",
      arguments: {
        // Missing serverId
      },
    });

    expect(data.error).toBeDefined();
    expect(data.error?.code).toBe(-32602);
  });

  test("generate_report requires all params", async () => {
    if (skip()) return;

    const data = await mcpRequest("tools/call", {
      name: "generate_report",
      arguments: {
        // Missing scheduleId, startDate, endDate
      },
    });

    expect(data.error).toBeDefined();
    expect(data.error?.code).toBe(-32602);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("Error Handling", () => {
  test("unknown tool returns error", async () => {
    if (skip()) return;

    const data = await mcpRequest("tools/call", {
      name: "unknown_tool",
      arguments: {},
    });

    expect(data.error).toBeDefined();
    expect(data.error?.message).toContain("Unknown tool");
  });

  test("invalid JSON-RPC format handled", async () => {
    if (!serverRunning) return;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (APP_TOKEN) headers["X-App-Token"] = APP_TOKEN;
    else if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;

    const response = await fetch(`${SERVER_URL}${MCP_ENDPOINT}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ invalid: "request" }),
    });

    // Should handle gracefully
    expect([200, 400]).toContain(response.status);
  });

  test("non-existent todo returns error", async () => {
    if (skip()) return;

    const data = await mcpRequest("tools/call", {
      name: "complete_todo",
      arguments: {
        todoId: "00000000-0000-0000-0000-000000000000",
      },
    });

    // Should return error in result content or as error
    if (data.error) {
      expect(data.error).toBeDefined();
    } else {
      const content = (data.result as { content: Array<{ text: string }> })
        .content[0];
      const parsed = JSON.parse(content.text);
      expect(parsed.success).toBe(false);
    }
  });
});

// ============================================================================
// Concurrent Request Tests
// ============================================================================

describe("Concurrent Requests", () => {
  test("handles multiple simultaneous requests", async () => {
    if (skip()) return;

    // Fire 5 requests at once
    const requests = Array(5)
      .fill(null)
      .map(() =>
        mcpRequest("tools/call", {
          name: "get_todo_stats",
          arguments: {},
        }),
      );

    const results = await Promise.all(requests);

    // All should succeed
    for (const data of results) {
      expect(data.error).toBeUndefined();
      const content = (data.result as { content: Array<{ text: string }> })
        .content[0];
      const parsed = JSON.parse(content.text);
      expect(parsed.success).toBe(true);
    }
  });
});
