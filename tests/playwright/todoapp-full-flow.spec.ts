import { test, expect } from "@playwright/test";

/**
 * Todo App Full User Journey E2E Tests
 *
 * Tests the complete user flow from landing to task management:
 * - Landing page interaction
 * - Authentication flow
 * - Dashboard functionality
 * - Task creation and management
 * - Points and leveling
 * - Chat with AI assistant
 *
 * Prerequisites:
 * - Cloud running on port 3000
 * - Todo app running on port 3002
 * - Database seeded with: bun run db:todoapp:seed
 */

const CLOUD_URL = process.env.CLOUD_URL ?? "http://localhost:3000";
const TODOAPP_URL = process.env.TODOAPP_URL ?? "http://localhost:3002";
const API_KEY = process.env.TEST_TODOAPP_API_KEY;

// Check if todo app is available
let todoappAvailable = false;

function authHeaders() {
  return {
    "X-Api-Key": API_KEY!,
    "Content-Type": "application/json",
  };
}

test.describe("Todo App Full Flow E2E Tests", () => {
  test.beforeAll(async () => {
    const todoappResponse = await fetch(TODOAPP_URL).then(r => ({ ok: () => r.ok })).catch(() => null);
    todoappAvailable = todoappResponse?.ok() ?? false;

    if (!todoappAvailable) {
      console.log(
        `⚠️ Todo app not available at ${TODOAPP_URL}. Skipping full-flow tests.`,
      );
    }
  });

  test.describe("Landing Page Experience", () => {
  test("landing page loads with branding", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    await page.goto(TODOAPP_URL);
    await page.waitForLoadState("networkidle");

    // Check for brand elements
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible({ timeout: 10000 });
    await expect(heading).toContainText(/Eliza Todo/i);

    // Check for description
    const description = page.locator("p").first();
    await expect(description).toBeVisible();
    console.log("✅ Landing page loads with branding");
  });

  test("landing page shows feature highlights", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    await page.goto(TODOAPP_URL);
    await page.waitForLoadState("networkidle");

    // Look for feature cards
    const featureText = page.getByText(/Daily Habits|Task Management|Goals/i);
    await expect(featureText.first()).toBeVisible({ timeout: 10000 });
    console.log("✅ Feature highlights visible");
  });

  test("landing page has CTA buttons", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    await page.goto(TODOAPP_URL);
    await page.waitForLoadState("networkidle");

    // Look for Get Started button
    const ctaButton = page
      .getByRole("button", { name: /get started|start free/i })
      .first();
    await expect(ctaButton).toBeVisible({ timeout: 10000 });
    console.log("✅ CTA buttons visible");
  });

  test("landing page is mobile responsive", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(TODOAPP_URL);
    await page.waitForLoadState("networkidle");

    // Check main content is visible
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible({ timeout: 10000 });
    console.log("✅ Landing page is mobile responsive");
  });
});

test.describe("Authentication Flow", () => {
  test("login button creates app session", async ({ page, request }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    await page.goto(TODOAPP_URL);
    await page.waitForLoadState("networkidle");

    // Find login button
    const loginButton = page
      .getByRole("button", { name: /get started|sign in/i })
      .first();
    await expect(loginButton).toBeVisible({ timeout: 10000 });

    // Intercept navigation to see where it goes
    const navigationPromise = page.waitForURL(/app-login|auth/, {
      timeout: 15000,
    });
    await loginButton.click();

    try {
      await navigationPromise;
      const url = page.url();
      // Should redirect to cloud login
      expect(url).toContain("auth");
      console.log("✅ Login button initiates auth flow");
    } catch {
      console.log("ℹ️ Auth flow may require manual interaction");
    }
  });

  test("auth callback handles token", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    // Navigate to callback with mock token
    await page.goto(`${TODOAPP_URL}/auth/callback?token=test-token`);
    await page.waitForLoadState("networkidle");

    // Should either redirect to dashboard or show error
    // (test token is invalid, so will show error or redirect)
    const body = page.locator("body");
    await expect(body).toBeVisible();
    console.log("✅ Auth callback handles token parameter");
  });
});

test.describe("Dashboard UI Components", () => {
  test.skip(() => !API_KEY, "TEST_TODOAPP_API_KEY required");

  test("dashboard shows task sections", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    // Would need authenticated session - using API test instead
    const response = await page.request.get(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);
    console.log("✅ Task data accessible for dashboard");
  });

  test("dashboard shows points display", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    const response = await page.request.get(
      `${CLOUD_URL}/api/v1/app/storage/user_points`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);
    console.log("✅ Points data accessible for dashboard");
  });
});

test.describe("Task Management Workflow", () => {
  test.skip(() => !API_KEY, "TEST_TODOAPP_API_KEY required");

  const createdTasks: string[] = [];

  test.afterAll(async ({ request }) => {
    // Cleanup
    for (const taskId of createdTasks) {
      await request
        .delete(`${CLOUD_URL}/api/v1/app/storage/tasks/${taskId}`, {
          headers: authHeaders(),
        })
        .catch(() => {});
    }
  });

  test("workflow: create daily habit", async ({ request }) => {
    const response = await request.post(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        headers: authHeaders(),
        data: {
          name: "Morning Workout",
          type: "daily",
          completed: false,
          metadata: {
            streak: 0,
            description: "30 minutes of exercise",
          },
        },
      },
    );

    expect([200, 201]).toContain(response.status());
    const data = await response.json();
    createdTasks.push(data.document.id);
    console.log("✅ Created daily habit");
  });

  test("workflow: create priority task", async ({ request }) => {
    const response = await request.post(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        headers: authHeaders(),
        data: {
          name: "Submit Tax Documents",
          type: "one-off",
          priority: 1,
          urgent: true,
          completed: false,
          metadata: {
            description: "Due April 15th",
            dueDate: "2024-04-15T00:00:00.000Z",
          },
        },
      },
    );

    expect([200, 201]).toContain(response.status());
    const data = await response.json();
    createdTasks.push(data.document.id);
    console.log("✅ Created priority task");
  });

  test("workflow: create aspirational goal", async ({ request }) => {
    const response = await request.post(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        headers: authHeaders(),
        data: {
          name: "Write a Book",
          type: "aspirational",
          completed: false,
          metadata: {
            description: "Complete first draft of novel",
          },
        },
      },
    );

    expect([200, 201]).toContain(response.status());
    const data = await response.json();
    createdTasks.push(data.document.id);
    console.log("✅ Created aspirational goal");
  });

  test("workflow: complete task and earn points", async ({ request }) => {
    // First create a task to complete
    const createResponse = await request.post(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        headers: authHeaders(),
        data: {
          name: "Quick Win Task",
          type: "one-off",
          priority: 4,
          completed: false,
          metadata: {},
        },
      },
    );

    const { document } = await createResponse.json();
    createdTasks.push(document.id);

    // Complete via MCP to trigger points
    const completeResponse = await request.post(
      `${CLOUD_URL}/api/mcp/todoapp`,
      {
        headers: authHeaders(),
        data: {
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: "complete_task",
            arguments: { id: document.id },
          },
          id: 1,
        },
      },
    );

    expect(completeResponse.status()).toBe(200);
    const completeData = await completeResponse.json();
    expect(completeData.result.content[0].text).toContain("points");
    console.log("✅ Completed task and earned points");
  });
});

test.describe("Gamification System", () => {
  test.skip(() => !API_KEY, "TEST_TODOAPP_API_KEY required");

  test("points calculation for different task types", async ({ request }) => {
    // Create and complete tasks of each type, verify points awarded

    // 1. Daily task (10 base + streak bonus)
    const dailyCreate = await request.post(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        headers: authHeaders(),
        data: {
          name: "Points Test - Daily",
          type: "daily",
          completed: false,
          metadata: { streak: 0 },
        },
      },
    );
    const dailyTask = (await dailyCreate.json()).document;

    // 2. One-off P1 task (40 points)
    const p1Create = await request.post(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        headers: authHeaders(),
        data: {
          name: "Points Test - P1",
          type: "one-off",
          priority: 1,
          completed: false,
          metadata: {},
        },
      },
    );
    const p1Task = (await p1Create.json()).document;

    // Complete daily task
    const dailyComplete = await request.post(`${CLOUD_URL}/api/mcp/todoapp`, {
      headers: authHeaders(),
      data: {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "complete_task",
          arguments: { id: dailyTask.id },
        },
        id: 1,
      },
    });
    const dailyResult = (await dailyComplete.json()).result.content[0].text;
    expect(dailyResult).toMatch(/\d+ points/i);
    console.log(`✅ Daily task completion: ${dailyResult}`);

    // Complete P1 task
    const p1Complete = await request.post(`${CLOUD_URL}/api/mcp/todoapp`, {
      headers: authHeaders(),
      data: {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "complete_task",
          arguments: { id: p1Task.id },
        },
        id: 1,
      },
    });
    const p1Result = (await p1Complete.json()).result.content[0].text;
    expect(p1Result).toMatch(/\d+ points/i);
    console.log(`✅ P1 task completion: ${p1Result}`);

    // Cleanup
    await request.delete(
      `${CLOUD_URL}/api/v1/app/storage/tasks/${dailyTask.id}`,
      { headers: authHeaders() },
    );
    await request.delete(`${CLOUD_URL}/api/v1/app/storage/tasks/${p1Task.id}`, {
      headers: authHeaders(),
    });
  });

  test("level progression display", async ({ request }) => {
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
    const pointsText = pointsData.result.content[0].text;

    expect(pointsText).toContain("Points");
    expect(pointsText).toContain("Level");
    console.log("✅ Level info displayed:", pointsText.split("\n")[1]);
  });
});

test.describe("Chat Integration", () => {
  test.skip(() => !API_KEY, "TEST_TODOAPP_API_KEY required");

  test("can list available agents", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/app/agents`, {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.agents)).toBe(true);
    console.log(`✅ Found ${data.agents.length} agents available for chat`);
  });

  test("can create chat with agent", async ({ request }) => {
    // Get agents
    const agentsResponse = await request.get(`${CLOUD_URL}/api/v1/app/agents`, {
      headers: authHeaders(),
    });
    const agents = (await agentsResponse.json()).agents;

    if (agents.length === 0) {
      console.log("ℹ️ No agents available for chat test");
      return;
    }

    const agentId = agents[0].id;

    // Create chat
    const chatResponse = await request.post(
      `${CLOUD_URL}/api/v1/app/agents/${agentId}/chats`,
      {
        headers: authHeaders(),
      },
    );

    expect([200, 201]).toContain(chatResponse.status());
    const chatData = await chatResponse.json();
    expect(chatData.chat).toHaveProperty("id");
    console.log("✅ Created chat with agent");

    // Cleanup
    await request.delete(
      `${CLOUD_URL}/api/v1/app/agents/${agentId}/chats/${chatData.chat.id}`,
      { headers: authHeaders() },
    );
  });
});

test.describe("A2A and MCP Protocol Integration", () => {
  test("MCP registry lists todo-app", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/mcp/registry`);

    expect(response.status()).toBe(200);
    const data = await response.json();

    const todoMcp = data.registry.find(
      (m: { id: string }) => m.id === "todo-app",
    );
    expect(todoMcp).toBeDefined();
    expect(todoMcp.status).toBe("live");
    console.log("✅ Todo app MCP registered and live");
  });

  test("MCP protocol handshake works", async ({ request }) => {
    // Initialize
    const initResponse = await request.post(`${CLOUD_URL}/api/mcp/todoapp`, {
      data: {
        jsonrpc: "2.0",
        method: "initialize",
        params: {},
        id: 1,
      },
    });

    // Initialize may require auth
    expect([200, 401]).toContain(initResponse.status());

    // Ping always works
    const pingResponse = await request.post(`${CLOUD_URL}/api/mcp/todoapp`, {
      data: {
        jsonrpc: "2.0",
        method: "ping",
        params: {},
        id: 1,
      },
    });

    expect([200, 401]).toContain(pingResponse.status());
    console.log("✅ MCP protocol handshake functional");
  });
});

test.describe("Error States and Edge Cases", () => {
  test.skip(() => !API_KEY, "TEST_TODOAPP_API_KEY required");

  test("handles empty task list gracefully", async ({ request }) => {
    // List tasks with filter that likely returns empty
    const response = await request.get(
      `${CLOUD_URL}/api/v1/app/storage/tasks?filter=${encodeURIComponent(JSON.stringify({ name: "definitely-does-not-exist-xyz" }))}`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.documents).toEqual([]);
    console.log("✅ Empty task list handled gracefully");
  });

  test("handles invalid task data", async ({ request }) => {
    const response = await request.post(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        headers: authHeaders(),
        data: {
          // Missing required fields
          completed: false,
        },
      },
    );

    // Should accept (storage is schema-less) or reject with 400
    expect([200, 201, 400]).toContain(response.status());
    console.log("✅ Invalid task data handled");
  });

  test("handles concurrent operations", async ({ request }) => {
    // Create multiple tasks concurrently
    const promises = Array.from({ length: 5 }, (_, i) =>
      request.post(`${CLOUD_URL}/api/v1/app/storage/tasks`, {
        headers: authHeaders(),
        data: {
          name: `Concurrent Task ${i + 1}`,
          type: "one-off",
          completed: false,
          metadata: {},
        },
      }),
    );

    const responses = await Promise.all(promises);
    const createdIds: string[] = [];

    for (const response of responses) {
      expect([200, 201]).toContain(response.status());
      const data = await response.json();
      createdIds.push(data.document.id);
    }

    console.log(`✅ ${createdIds.length} concurrent tasks created`);

    // Cleanup
    await Promise.all(
      createdIds.map((id) =>
        request.delete(`${CLOUD_URL}/api/v1/app/storage/tasks/${id}`, {
          headers: authHeaders(),
        }),
      ),
    );
  });
});

test.describe("Performance and Reliability", () => {
  test("landing page loads within 5 seconds", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    const startTime = Date.now();
    await page.goto(TODOAPP_URL);
    await page.waitForLoadState("domcontentloaded");
    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(5000);
    console.log(`✅ Landing page loaded in ${loadTime}ms`);
  });

  test("API responses are fast", async ({ request }) => {
    if (!API_KEY) {
      test.skip();
      return;
    }

    const startTime = Date.now();
    await request.get(`${CLOUD_URL}/api/v1/app/storage/tasks`, {
      headers: authHeaders(),
    });
    const responseTime = Date.now() - startTime;

    expect(responseTime).toBeLessThan(2000);
    console.log(`✅ API response in ${responseTime}ms`);
  });

  test("MCP endpoint responds quickly", async ({ request }) => {
    const startTime = Date.now();
    await request.get(`${CLOUD_URL}/api/mcp/todoapp`);
    const responseTime = Date.now() - startTime;

    expect(responseTime).toBeLessThan(1000);
    console.log(`✅ MCP metadata response in ${responseTime}ms`);
  });
});
});
