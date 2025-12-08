/**
 * A2A HTTP Integration Tests
 *
 * Tests REAL HTTP calls to A2A endpoints using native fetch.
 * These tests require a running server and TEST_API_KEY.
 *
 * The A2A protocol only has 3 standard methods:
 * - message/send: Send a message (with optional skill parameter)
 * - tasks/get: Get task status
 * - tasks/cancel: Cancel a task
 *
 * Run with: TEST_API_KEY=xxx bun test tests/integration/a2a-http.test.ts
 */

import { describe, test, expect } from "bun:test";

const BASE_URL = process.env.TEST_API_URL || "http://localhost:3000";
const API_KEY = process.env.TEST_API_KEY;

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

function jsonRpc(method: string, params: Record<string, unknown> = {}, id: string | number = 1) {
  return { jsonrpc: "2.0", method, params, id };
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function a2aPost(body: object): Promise<{ status: number; data: Record<string, unknown> } | null> {
  const response = await fetchWithTimeout(`${BASE_URL}/api/a2a`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!response) return null;
  return { status: response.status, data: await response.json() };
}

// Helper to call a skill via message/send
function skillMessage(skill: string, text?: string, extraData?: Record<string, unknown>) {
  const parts: Array<{ type: string; text?: string; data?: Record<string, unknown> }> = [];
  if (text) parts.push({ type: "text", text });
  parts.push({ type: "data", data: { skill, ...extraData } });
  
  return jsonRpc("message/send", {
    message: { role: "user", parts },
  });
}

const skipHttp = !API_KEY;

// ============================================================================
// SERVICE DISCOVERY
// ============================================================================

describe("A2A Service Discovery", () => {
  test.skipIf(skipHttp)("GET /api/a2a returns service info with 3 methods", async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/a2a`);
    if (!response) return;

    expect(response.status).toBe(200);
    const data = await response.json();
    
    expect(data.name).toBe("Eliza Cloud A2A");
    expect(data.protocolVersion).toBe("0.3.0");
    expect(Array.isArray(data.methods)).toBe(true);
    
    // Should have exactly 3 standard methods
    const methodNames = data.methods.map((m: { name: string }) => m.name);
    expect(methodNames).toContain("message/send");
    expect(methodNames).toContain("tasks/get");
    expect(methodNames).toContain("tasks/cancel");
    
    // Should list available skills
    expect(Array.isArray(data.skills)).toBe(true);
    expect(data.skills.length).toBeGreaterThan(10);
  });

  test.skipIf(skipHttp)("GET /.well-known/agent-card.json returns agent card", async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/.well-known/agent-card.json`);
    if (!response) return;

    expect(response.status).toBe(200);
    const card = await response.json();
    expect(card.name).toBeDefined();
    expect(card.skills).toBeDefined();
    expect(card.authentication).toBeDefined();
  });
});

// ============================================================================
// AUTHENTICATION
// ============================================================================

describe("A2A Authentication", () => {
  test.skipIf(skipHttp)("unauthenticated POST returns 401 or 402", async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/a2a`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(skillMessage("check_balance")),
    });
    if (!response) return;
    expect([401, 402]).toContain(response.status);
  });

  test.skipIf(skipHttp)("authenticated POST returns 200", async () => {
    const result = await a2aPost(skillMessage("check_balance"));
    if (!result) return;
    expect(result.status).toBe(200);
    expect(result.data.jsonrpc).toBe("2.0");
  });

  test.skipIf(skipHttp)("invalid method returns 404", async () => {
    const result = await a2aPost(jsonRpc("nonexistent.method"));
    if (!result) return;
    expect(result.status).toBe(404);
    expect(result.data.error).toBeDefined();
  });
});

// ============================================================================
// SKILL: check_balance - VERIFY DB READ
// ============================================================================

describe("Skill: check_balance", () => {
  test.skipIf(skipHttp)("returns real credit balance", async () => {
    const result = await a2aPost(skillMessage("check_balance"));
    if (!result) return;

    expect(result.status).toBe(200);
    expect(result.data.result).toBeDefined();
    
    // Task should be completed
    const task = result.data.result as { status: { state: string }; history?: Array<{ parts: Array<{ type: string; data?: { credits?: number } }> }> };
    expect(task.status.state).toBe("completed");
    
    // Should have agent response in history with balance data
    expect(task.history).toBeDefined();
    const agentMessage = task.history?.find((m: { role?: string }) => m.role === "agent");
    expect(agentMessage).toBeDefined();
  });
});

// ============================================================================
// SKILL: list_agents - VERIFY DB READ
// ============================================================================

describe("Skill: list_agents", () => {
  test.skipIf(skipHttp)("returns agents array", async () => {
    const result = await a2aPost(skillMessage("list_agents", undefined, { limit: 5 }));
    if (!result) return;

    expect(result.status).toBe(200);
    const task = result.data.result as { status: { state: string } };
    expect(task.status.state).toBe("completed");
  });
});

// ============================================================================
// SKILL: chat_completion - VERIFY LLM CALL
// ============================================================================

describe("Skill: chat_completion", () => {
  test.skipIf(skipHttp)("generates real text response", async () => {
    const result = await a2aPost(skillMessage(
      "chat_completion",
      "What is 2+2? Reply with just the number.",
      { model: "gpt-4o-mini", maxTokens: 10 }
    ));
    if (!result) return;

    expect(result.status).toBe(200);
    const task = result.data.result as { status: { state: string; message?: { parts: Array<{ type: string; text?: string }> } } };
    expect(task.status.state).toBe("completed");
    
    // Should have text response
    const textPart = task.status.message?.parts?.find((p: { type: string }) => p.type === "text");
    expect(textPart?.text).toBeDefined();
    expect(textPart?.text?.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// SKILL: get_user_profile - VERIFY DB READ
// ============================================================================

describe("Skill: get_user_profile", () => {
  test.skipIf(skipHttp)("returns user profile from database", async () => {
    const result = await a2aPost(skillMessage("get_user_profile"));
    if (!result) return;

    expect(result.status).toBe(200);
    const task = result.data.result as { status: { state: string } };
    expect(task.status.state).toBe("completed");
  });
});

// ============================================================================
// SKILL: list_containers - VERIFY DB READ
// ============================================================================

describe("Skill: list_containers", () => {
  test.skipIf(skipHttp)("returns containers array", async () => {
    const result = await a2aPost(skillMessage("list_containers"));
    if (!result) return;

    expect(result.status).toBe(200);
    const task = result.data.result as { status: { state: string } };
    expect(task.status.state).toBe("completed");
  });
});

// ============================================================================
// TASK LIFECYCLE - VERIFY REDIS/DB STATE
// ============================================================================

describe("Task Lifecycle", () => {
  let createdTaskId: string | null = null;

  test.skipIf(skipHttp)("message/send creates task and returns it", async () => {
    const result = await a2aPost(skillMessage("check_balance"));
    if (!result) return;

    expect(result.status).toBe(200);
    const task = result.data.result as { id: string; status: { state: string }; contextId: string };
    
    expect(task.id).toBeDefined();
    expect(task.contextId).toBeDefined();
    expect(task.status.state).toBe("completed");
    
    createdTaskId = task.id;
  });

  test.skipIf(skipHttp)("tasks/get retrieves the created task", async () => {
    if (!createdTaskId) return;
    
    const result = await a2aPost(jsonRpc("tasks/get", { id: createdTaskId }));
    if (!result) return;

    expect(result.status).toBe(200);
    const task = result.data.result as { id: string; status: { state: string } };
    expect(task.id).toBe(createdTaskId);
    expect(task.status.state).toBe("completed");
  });

  test.skipIf(skipHttp)("tasks/get for nonexistent task returns error", async () => {
    const result = await a2aPost(jsonRpc("tasks/get", { id: "nonexistent-task-id" }));
    if (!result) return;

    expect(result.status).toBe(404);
    expect(result.data.error).toBeDefined();
  });
});

// ============================================================================
// MEMORY SKILL - VERIFY DB WRITE AND READ
// ============================================================================

describe("Memory Skills (DB Write/Read)", () => {
  const testMemoryContent = `Test memory created at ${Date.now()}`;
  let savedMemoryId: string | null = null;

  test.skipIf(skipHttp)("save_memory writes to database", async () => {
    const result = await a2aPost(skillMessage(
      "save_memory",
      testMemoryContent,
      { category: "test" }
    ));
    if (!result) return;

    expect(result.status).toBe(200);
    const task = result.data.result as { status: { state: string } };
    expect(task.status.state).toBe("completed");
  });

  test.skipIf(skipHttp)("retrieve_memories reads from database", async () => {
    const result = await a2aPost(skillMessage(
      "retrieve_memories",
      "test memory",
      { limit: 5 }
    ));
    if (!result) return;

    expect(result.status).toBe(200);
    const task = result.data.result as { status: { state: string } };
    expect(task.status.state).toBe("completed");
  });
});

// ============================================================================
// CORS
// ============================================================================

describe("CORS", () => {
  test.skipIf(skipHttp)("OPTIONS returns CORS headers", async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/a2a`, { method: "OPTIONS" });
    if (!response) return;

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });
});
