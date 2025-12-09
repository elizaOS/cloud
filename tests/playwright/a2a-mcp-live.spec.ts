import { test, expect } from "@playwright/test";

/**
 * A2A Live Integration Tests
 *
 * Tests the A2A endpoint with real HTTP calls.
 * The A2A route now only has 3 standard methods:
 * - message/send (with skill parameter for different operations)
 * - tasks/get
 * - tasks/cancel
 *
 * Prerequisites:
 * - TEST_API_KEY environment variable required
 * - Server running on port 3000
 *
 * NOTE: Some tests cost credits to run!
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const API_KEY = process.env.TEST_API_KEY;

function authHeaders() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

// JSON-RPC 2.0 request helper
function jsonRpc(method: string, params: Record<string, unknown> = {}, id = 1) {
  return {
    jsonrpc: "2.0",
    method,
    params,
    id,
  };
}

// Helper to invoke a skill via message/send
function skillMessage(skill: string, text?: string, extraData?: Record<string, unknown>) {
  const parts: Array<{ type: string; text?: string; data?: Record<string, unknown> }> = [];
  if (text) parts.push({ type: "text", text });
  parts.push({ type: "data", data: { skill, ...extraData } });

  return jsonRpc("message/send", {
    message: { role: "user", parts },
  });
}

// ============================================================================
// A2A Service Discovery
// ============================================================================

test.describe("A2A Service Discovery", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY required");

  test("GET /api/a2a returns service info with 3 methods and skills", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/a2a`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.name).toBe("Eliza Cloud A2A");
    expect(data.protocolVersion).toBe("0.3.0");

    // Should have exactly 3 standard methods
    expect(data.methods).toBeDefined();
    expect(Array.isArray(data.methods)).toBe(true);
    expect(data.methods.length).toBe(3);

    const methodNames = data.methods.map((m: { name: string }) => m.name);
    expect(methodNames).toContain("message/send");
    expect(methodNames).toContain("tasks/get");
    expect(methodNames).toContain("tasks/cancel");

    // Should list available skills
    expect(data.skills).toBeDefined();
    expect(Array.isArray(data.skills)).toBe(true);
    expect(data.skills.length).toBeGreaterThan(10);

    console.log(`✅ A2A service discovery: ${data.methods.length} methods, ${data.skills.length} skills`);
  });
});

// ============================================================================
// A2A Authentication
// ============================================================================

test.describe("A2A Authentication", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY required");

  test("unauthenticated POST returns 401 or 402", async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/a2a`, {
      headers: { "Content-Type": "application/json" },
      data: skillMessage("check_balance"),
    });
    expect([401, 402]).toContain(response.status());
  });

  test("invalid method returns 404", async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/a2a`, {
      headers: authHeaders(),
      data: jsonRpc("nonexistent.method"),
    });
    expect(response.status()).toBe(404);

    const data = await response.json();
    expect(data.error).toBeDefined();
    expect(data.error.code).toBe(-32601); // METHOD_NOT_FOUND
  });
});

// ============================================================================
// Skill: check_balance (FREE)
// ============================================================================

test.describe("Skill: check_balance", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY required");

  test("returns real credit balance via message/send", async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/a2a`, {
      headers: authHeaders(),
      data: skillMessage("check_balance"),
    });
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.jsonrpc).toBe("2.0");
    expect(data.result).toBeDefined();

    // Task should be completed
    const task = data.result;
    expect(task.status.state).toBe("completed");
    expect(task.id).toBeDefined();

    console.log(`✅ check_balance: task ${task.id} completed`);
  });
});

// ============================================================================
// Skill: list_agents (FREE)
// ============================================================================

test.describe("Skill: list_agents", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY required");

  test("returns agents list via message/send", async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/a2a`, {
      headers: authHeaders(),
      data: skillMessage("list_agents", undefined, { limit: 10 }),
    });
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.result).toBeDefined();
    expect(data.result.status.state).toBe("completed");

    console.log(`✅ list_agents: completed`);
  });
});

// ============================================================================
// Skill: get_user_profile (FREE)
// ============================================================================

test.describe("Skill: get_user_profile", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY required");

  test("returns user profile via message/send", async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/a2a`, {
      headers: authHeaders(),
      data: skillMessage("get_user_profile"),
    });
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.result).toBeDefined();
    expect(data.result.status.state).toBe("completed");

    console.log(`✅ get_user_profile: completed`);
  });
});

// ============================================================================
// Skill: list_containers (FREE)
// ============================================================================

test.describe("Skill: list_containers", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY required");

  test("returns containers list via message/send", async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/a2a`, {
      headers: authHeaders(),
      data: skillMessage("list_containers"),
    });
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.result).toBeDefined();
    expect(data.result.status.state).toBe("completed");

    console.log(`✅ list_containers: completed`);
  });
});

// ============================================================================
// Skill: get_usage (FREE)
// ============================================================================

test.describe("Skill: get_usage", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY required");

  test("returns usage stats via message/send", async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/a2a`, {
      headers: authHeaders(),
      data: skillMessage("get_usage", undefined, { limit: 10 }),
    });
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.result).toBeDefined();
    expect(data.result.status.state).toBe("completed");

    console.log(`✅ get_usage: completed`);
  });
});

// ============================================================================
// Task Lifecycle
// ============================================================================

test.describe("Task Lifecycle", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY required");

  let createdTaskId: string | null = null;

  test("message/send creates and returns a task", async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/a2a`, {
      headers: authHeaders(),
      data: skillMessage("check_balance"),
    });
    expect(response.status()).toBe(200);

    const data = await response.json();
    const task = data.result;

    expect(task.id).toBeDefined();
    expect(task.contextId).toBeDefined();
    expect(task.status.state).toBe("completed");

    createdTaskId = task.id;
    console.log(`✅ Created task: ${createdTaskId}`);
  });

  test("tasks/get retrieves the created task", async ({ request }) => {
    if (!createdTaskId) return;

    const response = await request.post(`${BASE_URL}/api/a2a`, {
      headers: authHeaders(),
      data: jsonRpc("tasks/get", { id: createdTaskId }),
    });
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.result.id).toBe(createdTaskId);
    expect(data.result.status.state).toBe("completed");

    console.log(`✅ Retrieved task: ${createdTaskId}`);
  });

  test("tasks/get for nonexistent task returns 404", async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/a2a`, {
      headers: authHeaders(),
      data: jsonRpc("tasks/get", { id: "nonexistent-task-id-12345" }),
    });
    expect(response.status()).toBe(404);

    const data = await response.json();
    expect(data.error).toBeDefined();
  });
});

// ============================================================================
// Skill: chat_completion (COSTS CREDITS)
// ============================================================================

test.describe("Skill: chat_completion (costs credits)", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY required");

  test("generates real text response via message/send", async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/a2a`, {
      headers: authHeaders(),
      data: skillMessage(
        "chat_completion",
        "What is 2+2? Reply with just the number.",
        { model: "gpt-4o-mini", maxTokens: 10 }
      ),
    });
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.result).toBeDefined();
    expect(data.result.status.state).toBe("completed");

    // Should have text response in the status message
    const textPart = data.result.status.message?.parts?.find(
      (p: { type: string }) => p.type === "text"
    );
    expect(textPart?.text).toBeDefined();
    expect(textPart?.text.length).toBeGreaterThan(0);

    console.log(`✅ chat_completion: "${textPart?.text?.substring(0, 50)}..."`);
  });

  test("default skill is chat_completion when text provided", async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/a2a`, {
      headers: authHeaders(),
      data: jsonRpc("message/send", {
        message: {
          role: "user",
          parts: [{ type: "text", text: "Say hello in one word" }],
        },
      }),
    });
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.result.status.state).toBe("completed");

    console.log(`✅ Default chat_completion: completed`);
  });
});

// ============================================================================
// CORS
// ============================================================================

test.describe("CORS", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY required");

  test("OPTIONS returns CORS headers", async ({ request }) => {
    const response = await request.fetch(`${BASE_URL}/api/a2a`, {
      method: "OPTIONS",
    });
    expect(response.status()).toBe(204);
    expect(response.headers()["access-control-allow-origin"]).toBe("*");
    expect(response.headers()["access-control-allow-methods"]).toContain("POST");
  });
});

// ============================================================================
// Summary
// ============================================================================

test.describe("A2A Test Summary", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY required");

  test("prints summary", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/a2a`);
    const data = await response.json();

    console.log(`
════════════════════════════════════════════════════════════════════
              A2A LIVE TEST SUMMARY
════════════════════════════════════════════════════════════════════

Endpoint: /api/a2a
Protocol: JSON-RPC 2.0
Version: ${data.protocolVersion || "0.3.0"}

Standard Methods (3):
├── message/send    - Send message with skill parameter
├── tasks/get       - Get task status and history
└── tasks/cancel    - Cancel a running task

Available Skills (${data.skills?.length || 0}):
├── chat_completion - LLM text generation
├── image_generation - Image generation
├── video_generation - Video generation (async)
├── check_balance   - Check credit balance
├── get_usage       - Get usage statistics
├── list_agents     - List available agents
├── chat_with_agent - Chat with specific agent
├── save_memory     - Save a memory
├── retrieve_memories - Retrieve memories
├── delete_memory   - Delete a memory
├── create_conversation - Create conversation
├── get_conversation_context - Get conversation details
├── list_containers - List deployed containers
└── get_user_profile - Get user profile

Skills are invoked via message/send with:
  { "skill": "skill_name", ...params }

════════════════════════════════════════════════════════════════════
`);
  });
});
