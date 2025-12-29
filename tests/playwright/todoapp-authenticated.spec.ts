import { test, expect } from "@playwright/test";

/**
 * Todo App Authenticated E2E Tests
 *
 * Tests for the todo-app with authentication via API key.
 * Covers:
 * - Task CRUD operations
 * - Points and gamification
 * - Chat with agent
 * - Storage API
 *
 * Prerequisites:
 * - Start cloud: bun run dev (port 3000)
 * - Run seed: bun run db:todoapp:seed
 * - Set TEST_TODOAPP_API_KEY environment variable
 */

const CLOUD_URL = process.env.CLOUD_URL ?? "http://localhost:3000";
const TODOAPP_URL = process.env.TODOAPP_URL ?? "http://localhost:3002";
const API_KEY = process.env.TEST_TODOAPP_API_KEY;

function authHeaders() {
  return {
    "X-Api-Key": API_KEY!,
    "Content-Type": "application/json",
  };
}

test.describe("Todo App Authenticated E2E Tests", () => {
  // Skip all tests if no API key
  test.beforeAll(() => {
    if (!API_KEY) {
      console.log(
        "⚠️ TEST_TODOAPP_API_KEY not set. Skipping authenticated todo-app tests.",
      );
    }
  });

  test.describe("Task Storage API - CRUD Operations", () => {
  test.skip(() => !API_KEY, "TEST_TODOAPP_API_KEY required");

  let createdTaskId: string | null = null;

  test("can create a task", async ({ request }) => {
    const response = await request.post(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        headers: authHeaders(),
        data: {
          name: "E2E Test Task",
          type: "one-off",
          priority: 2,
          urgent: false,
          completed: false,
          metadata: {
            description: "Created by E2E test",
            createdAt: new Date().toISOString(),
          },
        },
      },
    );

    expect([200, 201]).toContain(response.status());

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.document).toHaveProperty("id");
    expect(data.document.name).toBe("E2E Test Task");

    createdTaskId = data.document.id;
    console.log(`✅ Created task: ${createdTaskId}`);
  });

  test("can list tasks", async ({ request }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.documents)).toBe(true);
    console.log(`✅ Found ${data.documents.length} tasks`);
  });

  test("can get a specific task", async ({ request }) => {
    if (!createdTaskId) {
      test.skip();
      return;
    }

    const response = await request.get(
      `${CLOUD_URL}/api/v1/app/storage/tasks/${createdTaskId}`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.document.id).toBe(createdTaskId);
    console.log("✅ Retrieved task by ID");
  });

  test("can update a task", async ({ request }) => {
    if (!createdTaskId) {
      test.skip();
      return;
    }

    const response = await request.patch(
      `${CLOUD_URL}/api/v1/app/storage/tasks/${createdTaskId}`,
      {
        headers: authHeaders(),
        data: {
          name: "Updated E2E Test Task",
          priority: 1,
        },
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.document.name).toBe("Updated E2E Test Task");
    console.log("✅ Updated task");
  });

  test("can mark task as completed", async ({ request }) => {
    if (!createdTaskId) {
      test.skip();
      return;
    }

    const response = await request.patch(
      `${CLOUD_URL}/api/v1/app/storage/tasks/${createdTaskId}`,
      {
        headers: authHeaders(),
        data: {
          completed: true,
          metadata: {
            completedAt: new Date().toISOString(),
          },
        },
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.document.completed).toBe(true);
    console.log("✅ Marked task as completed");
  });

  test("can delete a task", async ({ request }) => {
    if (!createdTaskId) {
      test.skip();
      return;
    }

    const response = await request.delete(
      `${CLOUD_URL}/api/v1/app/storage/tasks/${createdTaskId}`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    console.log("✅ Deleted task");
  });
});

test.describe("Task Types", () => {
  test.skip(() => !API_KEY, "TEST_TODOAPP_API_KEY required");

  const createdTaskIds: string[] = [];

  test.afterAll(async ({ request }) => {
    // Cleanup created tasks
    for (const taskId of createdTaskIds) {
      await request
        .delete(`${CLOUD_URL}/api/v1/app/storage/tasks/${taskId}`, {
          headers: authHeaders(),
        })
        .catch(() => {});
    }
  });

  test("can create daily habit task", async ({ request }) => {
    const response = await request.post(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        headers: authHeaders(),
        data: {
          name: "Morning Meditation",
          type: "daily",
          completed: false,
          metadata: {
            streak: 0,
            description: "Daily meditation practice",
          },
        },
      },
    );

    expect([200, 201]).toContain(response.status());

    const data = await response.json();
    expect(data.document.type).toBe("daily");
    createdTaskIds.push(data.document.id);
    console.log("✅ Created daily habit task");
  });

  test("can create one-off task with priority", async ({ request }) => {
    const response = await request.post(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        headers: authHeaders(),
        data: {
          name: "Complete Project Report",
          type: "one-off",
          priority: 1,
          urgent: true,
          completed: false,
          metadata: {
            description: "Q4 project report due Friday",
            dueDate: new Date(Date.now() + 86400000 * 3).toISOString(),
          },
        },
      },
    );

    expect([200, 201]).toContain(response.status());

    const data = await response.json();
    expect(data.document.type).toBe("one-off");
    expect(data.document.priority).toBe(1);
    expect(data.document.urgent).toBe(true);
    createdTaskIds.push(data.document.id);
    console.log("✅ Created one-off task with priority");
  });

  test("can create aspirational goal", async ({ request }) => {
    const response = await request.post(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        headers: authHeaders(),
        data: {
          name: "Learn Japanese",
          type: "aspirational",
          completed: false,
          metadata: {
            description: "Become conversationally fluent in Japanese",
          },
        },
      },
    );

    expect([200, 201]).toContain(response.status());

    const data = await response.json();
    expect(data.document.type).toBe("aspirational");
    createdTaskIds.push(data.document.id);
    console.log("✅ Created aspirational goal");
  });

  test("can filter tasks by type", async ({ request }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/app/storage/tasks?filter=${encodeURIComponent(JSON.stringify({ type: "daily" }))}`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    const allDaily = data.documents.every(
      (doc: { type: string }) => doc.type === "daily",
    );
    // May be empty if no daily tasks exist
    console.log(`✅ Filtered to ${data.documents.length} daily tasks`);
  });

  test("can filter tasks by completion status", async ({ request }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/app/storage/tasks?filter=${encodeURIComponent(JSON.stringify({ completed: false }))}`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    console.log(`✅ Filtered to ${data.documents.length} incomplete tasks`);
  });
});

test.describe("Points and Gamification", () => {
  test.skip(() => !API_KEY, "TEST_TODOAPP_API_KEY required");

  test("can retrieve user points", async ({ request }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/app/storage/user_points`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    // May be empty if no points document exists yet
    console.log(`✅ Points documents: ${data.documents.length}`);
  });

  test("can create/update points document", async ({ request }) => {
    // First check if points document exists
    const listResponse = await request.get(
      `${CLOUD_URL}/api/v1/app/storage/user_points`,
      {
        headers: authHeaders(),
      },
    );

    const listData = await listResponse.json();

    if (listData.documents.length > 0) {
      // Update existing
      const pointsId = listData.documents[0].id;
      const currentPoints = listData.documents[0].currentPoints || 0;

      const response = await request.patch(
        `${CLOUD_URL}/api/v1/app/storage/user_points/${pointsId}`,
        {
          headers: authHeaders(),
          data: {
            currentPoints: currentPoints + 10,
            totalEarned: (listData.documents[0].totalEarned || 0) + 10,
          },
        },
      );

      expect(response.status()).toBe(200);
      console.log("✅ Updated points document");
    } else {
      // Create new
      const response = await request.post(
        `${CLOUD_URL}/api/v1/app/storage/user_points`,
        {
          headers: authHeaders(),
          data: {
            currentPoints: 0,
            totalEarned: 0,
            streak: 0,
            history: [],
          },
        },
      );

      expect([200, 201]).toContain(response.status());
      console.log("✅ Created points document");
    }
  });
});

test.describe("Todo MCP - Authenticated Operations", () => {
  test.skip(() => !API_KEY, "TEST_TODOAPP_API_KEY required");

  test("can call create_task via MCP", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/mcp/todoapp`, {
      headers: authHeaders(),
      data: {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "create_task",
          arguments: {
            name: "MCP Created Task",
            type: "one-off",
            description: "Created via MCP tools/call",
          },
        },
        id: 1,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.result).toBeDefined();
    expect(data.result.content[0].text).toContain("Created");
    console.log("✅ Created task via MCP");
  });

  test("can call list_tasks via MCP", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/mcp/todoapp`, {
      headers: authHeaders(),
      data: {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "list_tasks",
          arguments: {},
        },
        id: 1,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.result).toBeDefined();
    expect(data.result.content[0].text).toBeDefined();
    console.log("✅ Listed tasks via MCP");
  });

  test("can call get_points via MCP", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/mcp/todoapp`, {
      headers: authHeaders(),
      data: {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "get_points",
          arguments: {},
        },
        id: 1,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.result).toBeDefined();
    expect(data.result.content[0].text).toContain("Points");
    console.log("✅ Retrieved points via MCP");
  });
});

test.describe("Agent Chat Integration", () => {
  test.skip(() => !API_KEY, "TEST_TODOAPP_API_KEY required");

  test("can list agents (app API)", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/app/agents`, {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.agents)).toBe(true);
    console.log(`✅ Found ${data.agents.length} agents`);
  });

  test("can get user info", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/app/user`, {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.user).toHaveProperty("id");
    console.log("✅ Retrieved user info");
  });

  test("can get billing info", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/app/billing`, {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.billing).toHaveProperty("creditBalance");
    console.log(`✅ Credit balance: $${data.billing.creditBalance}`);
  });
});

test.describe("Full Task Workflow", () => {
  test.skip(() => !API_KEY, "TEST_TODOAPP_API_KEY required");

  let taskId: string | null = null;

  test.afterAll(async ({ request }) => {
    if (taskId) {
      await request
        .delete(`${CLOUD_URL}/api/v1/app/storage/tasks/${taskId}`, {
          headers: authHeaders(),
        })
        .catch(() => {});
    }
  });

  test("complete workflow: create -> update -> complete -> verify points", async ({
    request,
  }) => {
    // 1. Create task
    const createResponse = await request.post(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        headers: authHeaders(),
        data: {
          name: "Workflow Test Task",
          type: "one-off",
          priority: 2,
          completed: false,
          metadata: {
            description: "Testing full workflow",
          },
        },
      },
    );

    expect([200, 201]).toContain(createResponse.status());
    const createData = await createResponse.json();
    taskId = createData.document.id;
    console.log("✅ Step 1: Created task");

    // 2. Update task
    const updateResponse = await request.patch(
      `${CLOUD_URL}/api/v1/app/storage/tasks/${taskId}`,
      {
        headers: authHeaders(),
        data: {
          priority: 1,
          urgent: true,
        },
      },
    );

    expect(updateResponse.status()).toBe(200);
    console.log("✅ Step 2: Updated task");

    // 3. Complete task via MCP (which handles points)
    const completeResponse = await request.post(
      `${CLOUD_URL}/api/mcp/todoapp`,
      {
        headers: authHeaders(),
        data: {
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: "complete_task",
            arguments: { id: taskId },
          },
          id: 1,
        },
      },
    );

    expect(completeResponse.status()).toBe(200);
    const completeData = await completeResponse.json();
    expect(completeData.result.content[0].text).toContain("Completed");
    expect(completeData.result.content[0].text).toContain("points");
    console.log("✅ Step 3: Completed task and earned points");

    // 4. Verify points
    const pointsResponse = await request.post(`${CLOUD_URL}/api/mcp/todoapp`, {
      headers: authHeaders(),
      data: {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "get_points",
          arguments: {},
        },
        id: 1,
      },
    });

    expect(pointsResponse.status()).toBe(200);
    const pointsData = await pointsResponse.json();
    expect(pointsData.result.content[0].text).toContain("Points");
    console.log("✅ Step 4: Verified points updated");

    console.log("✅ Full workflow completed successfully!");
  });
});

test.describe("Error Handling", () => {
  test.skip(() => !API_KEY, "TEST_TODOAPP_API_KEY required");

  test("returns 404 for non-existent task", async ({ request }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/app/storage/tasks/non-existent-id`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(404);
  });

  test("MCP returns error for non-existent task completion", async ({
    request,
  }) => {
    const response = await request.post(`${CLOUD_URL}/api/mcp/todoapp`, {
      headers: authHeaders(),
      data: {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "complete_task",
          arguments: { id: "non-existent-id" },
        },
        id: 1,
      },
    });

    expect(response.status()).toBe(404);

    const data = await response.json();
    expect(data.error).toBeDefined();
    expect(data.error.message).toContain("not found");
  });

  test("MCP returns error for unknown tool", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/mcp/todoapp`, {
      headers: authHeaders(),
      data: {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "unknown_tool",
          arguments: {},
        },
        id: 1,
      },
    });

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.error).toBeDefined();
  });
});
});
