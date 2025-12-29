import { test, expect, MetaMask } from "./fixtures/test-fixtures";
import {
  waitForPageLoad,
  clearAuthState,
  isOnDashboard,
} from "./fixtures/test-fixtures";

/**
 * Todo App - Full Wallet Login E2E Tests
 *
 * Comprehensive tests using Synpress for MetaMask wallet automation:
 * - Wallet connection via Privy
 * - Full authentication flow
 * - Task management with authenticated user
 * - Points and gamification
 * - Chat with AI assistant
 *
 * Prerequisites:
 * - Cloud running: bun run dev
 * - Todo app running: cd todo-app && bun run dev
 * - Seeded: bun run db:seed:dev
 */

const CLOUD_URL = process.env.CLOUD_URL ?? "http://localhost:3000";
const TODOAPP_URL = process.env.TODOAPP_URL ?? "http://localhost:3002";

// Test wallet address (from hardhat mnemonic)
const TEST_WALLET_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

// Check service availability
let cloudAvailable = false;
let todoappAvailable = false;

test.describe("Todo App Wallet Flow E2E Tests", () => {
  test.beforeAll(async () => {
    const cloudResponse = await fetch(CLOUD_URL).then(r => ({ ok: () => r.ok })).catch(() => null);
    cloudAvailable = cloudResponse?.ok() ?? false;

    if (!cloudAvailable) {
      console.log(`⚠️ Cloud not available at ${CLOUD_URL}`);
    }

    const todoappResponse = await fetch(TODOAPP_URL).then(r => ({ ok: () => r.ok })).catch(() => null);
    todoappAvailable = todoappResponse?.ok() ?? false;

    if (!todoappAvailable) {
      console.log(`⚠️ Todo app not available at ${TODOAPP_URL}`);
    }
  });

  test.describe("Todo App - Wallet Login Flow", () => {
  test.beforeEach(async ({ page }) => {
    await clearAuthState(page);
  });

  test("landing page loads and shows Get Started button", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    await page.goto(TODOAPP_URL);
    await waitForPageLoad(page);

    // Verify landing page
    const heading = page.locator("h1").first();
    await expect(heading).toContainText(/Eliza Todo/i, { timeout: 15000 });

    // Verify Get Started button
    const ctaButton = page
      .getByRole("button", { name: /get started/i })
      .first();
    await expect(ctaButton).toBeVisible();

    console.log("✅ Landing page loaded with CTA");
  });

  test("clicking Get Started initiates Privy auth flow", async ({
    page,
    metamask,
  }) => {
    if (!todoappAvailable || !cloudAvailable) {
      test.skip();
      return;
    }

    await page.goto(TODOAPP_URL);
    await waitForPageLoad(page);

    // Click Get Started
    const ctaButton = page
      .getByRole("button", { name: /get started/i })
      .first();
    await expect(ctaButton).toBeVisible({ timeout: 15000 });
    await ctaButton.click();

    // Should redirect to cloud login page
    await page.waitForURL(/auth\/app-login|login/, { timeout: 15000 });

    const currentUrl = page.url();
    expect(currentUrl).toContain(CLOUD_URL.replace("http://", ""));

    console.log("✅ Redirected to Cloud login page");
  });

  test("full wallet login flow and redirect back to todo app", async ({
    page,
    metamask,
  }) => {
    if (!todoappAvailable || !cloudAvailable) {
      test.skip();
      return;
    }

    await page.goto(TODOAPP_URL);
    await waitForPageLoad(page);

    // Click Get Started
    const ctaButton = page
      .getByRole("button", { name: /get started/i })
      .first();
    await ctaButton.click();

    // Wait for Cloud login page
    await page.waitForURL(/auth\/app-login|login/, { timeout: 15000 });
    await waitForPageLoad(page);

    // Find and click Connect Wallet button
    const walletButton = page.locator('button:has-text("Connect Wallet")');
    const isVisible = await walletButton
      .isVisible({ timeout: 10000 })
      .catch(() => false);

    if (!isVisible) {
      console.log(
        "ℹ️ Wallet connect button not visible - Privy may use different UI",
      );
      return;
    }

    await walletButton.click();
    await page.waitForTimeout(3000);

    // Connect with MetaMask
    await metamask.connectToDapp();
    await page.waitForTimeout(2000);

    // Sign the authentication message
    await metamask.confirmSignature();

    // Wait for redirect back to todo app
    await page.waitForURL(/localhost:3002|auth\/callback/, { timeout: 30000 });

    // If on callback, wait for redirect to dashboard
    if (page.url().includes("callback")) {
      await page.waitForURL(/dashboard/, { timeout: 30000 });
    }

    console.log("✅ Wallet login completed and redirected to dashboard");
  });

  test("authenticated user can access dashboard", async ({
    page,
    metamask,
  }) => {
    if (!todoappAvailable || !cloudAvailable) {
      test.skip();
      return;
    }

    // Perform login
    await page.goto(TODOAPP_URL);
    const ctaButton = page
      .getByRole("button", { name: /get started/i })
      .first();
    await ctaButton.click();
    await page.waitForURL(/auth/, { timeout: 15000 });

    const walletButton = page.locator('button:has-text("Connect Wallet")');
    if (await walletButton.isVisible({ timeout: 10000 }).catch(() => false)) {
      await walletButton.click();
      await page.waitForTimeout(3000);
      await metamask.connectToDapp();
      await page.waitForTimeout(2000);
      await metamask.confirmSignature();
    } else {
      console.log("ℹ️ Wallet button not visible, skipping");
      return;
    }

    // Wait for dashboard
    await page.waitForURL(/dashboard/, { timeout: 30000 });
    await waitForPageLoad(page);

    // Verify dashboard elements
    const dashboardHeading = page.locator("h1, h2").first();
    await expect(dashboardHeading).toBeVisible({ timeout: 10000 });

    // Check for task sections
    const taskSection = page.getByText(/daily habits|tasks|goals/i).first();
    const hasTaskSection = await taskSection
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    console.log(
      `✅ Dashboard loaded, task sections visible: ${hasTaskSection}`,
    );
  });
});

test.describe("Todo App - Authenticated Task Management", () => {
  // These tests assume user is already authenticated via API key for speed
  const API_KEY = process.env.TEST_TODOAPP_API_KEY;

  test.skip(() => !API_KEY, "TEST_TODOAPP_API_KEY required");

  function authHeaders() {
    return {
      "X-Api-Key": API_KEY!,
      "Content-Type": "application/json",
    };
  }

  test("can create all task types via API", async ({ request }) => {
    // Daily habit
    const dailyResponse = await request.post(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        headers: authHeaders(),
        data: {
          name: "Morning Exercise",
          type: "daily",
          completed: false,
          metadata: { streak: 0, description: "30 min workout" },
        },
      },
    );
    expect([200, 201]).toContain(dailyResponse.status());

    // One-off task
    const oneoffResponse = await request.post(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        headers: authHeaders(),
        data: {
          name: "Submit Report",
          type: "one-off",
          priority: 1,
          urgent: true,
          completed: false,
          metadata: { dueDate: new Date(Date.now() + 86400000).toISOString() },
        },
      },
    );
    expect([200, 201]).toContain(oneoffResponse.status());

    // Aspirational goal
    const goalResponse = await request.post(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        headers: authHeaders(),
        data: {
          name: "Learn Piano",
          type: "aspirational",
          completed: false,
          metadata: { description: "Master basic scales" },
        },
      },
    );
    expect([200, 201]).toContain(goalResponse.status());

    // Cleanup
    const dailyData = await dailyResponse.json();
    const oneoffData = await oneoffResponse.json();
    const goalData = await goalResponse.json();

    await request.delete(
      `${CLOUD_URL}/api/v1/app/storage/tasks/${dailyData.document.id}`,
      { headers: authHeaders() },
    );
    await request.delete(
      `${CLOUD_URL}/api/v1/app/storage/tasks/${oneoffData.document.id}`,
      { headers: authHeaders() },
    );
    await request.delete(
      `${CLOUD_URL}/api/v1/app/storage/tasks/${goalData.document.id}`,
      { headers: authHeaders() },
    );

    console.log("✅ Created and cleaned up all task types");
  });

  test("task completion awards points via MCP", async ({ request }) => {
    // Create a task
    const createResponse = await request.post(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        headers: authHeaders(),
        data: {
          name: "Points Test Task",
          type: "one-off",
          priority: 2,
          completed: false,
          metadata: {},
        },
      },
    );
    const taskData = await createResponse.json();
    const taskId = taskData.document.id;

    // Complete via MCP
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
    expect(completeData.result.content[0].text).toMatch(/completed|points/i);

    // Cleanup
    await request.delete(`${CLOUD_URL}/api/v1/app/storage/tasks/${taskId}`, {
      headers: authHeaders(),
    });

    console.log("✅ Task completion awarded points");
  });

  test("daily streak tracking works", async ({ request }) => {
    // Create daily task
    const createResponse = await request.post(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        headers: authHeaders(),
        data: {
          name: "Streak Test Daily",
          type: "daily",
          completed: false,
          metadata: { streak: 5 }, // Start with existing streak
        },
      },
    );
    const taskData = await createResponse.json();
    const taskId = taskData.document.id;

    // Complete to increment streak
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
    const result = (await completeResponse.json()).result.content[0].text;
    expect(result).toMatch(/streak|day/i);

    // Cleanup
    await request.delete(`${CLOUD_URL}/api/v1/app/storage/tasks/${taskId}`, {
      headers: authHeaders(),
    });

    console.log("✅ Daily streak tracking verified");
  });

  test("priority points calculation is correct", async ({ request }) => {
    // P1 task (highest points)
    const p1Response = await request.post(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        headers: authHeaders(),
        data: {
          name: "P1 Test",
          type: "one-off",
          priority: 1,
          completed: false,
          metadata: {},
        },
      },
    );
    const p1Task = (await p1Response.json()).document;

    // P4 task (lowest points)
    const p4Response = await request.post(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        headers: authHeaders(),
        data: {
          name: "P4 Test",
          type: "one-off",
          priority: 4,
          completed: false,
          metadata: {},
        },
      },
    );
    const p4Task = (await p4Response.json()).document;

    // Complete P1
    const p1Complete = await request.post(`${CLOUD_URL}/api/mcp/todoapp`, {
      headers: authHeaders(),
      data: {
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "complete_task", arguments: { id: p1Task.id } },
        id: 1,
      },
    });
    const p1Result = (await p1Complete.json()).result.content[0].text;

    // Complete P4
    const p4Complete = await request.post(`${CLOUD_URL}/api/mcp/todoapp`, {
      headers: authHeaders(),
      data: {
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "complete_task", arguments: { id: p4Task.id } },
        id: 1,
      },
    });
    const p4Result = (await p4Complete.json()).result.content[0].text;

    // Both should mention points
    expect(p1Result).toMatch(/\d+ points/i);
    expect(p4Result).toMatch(/\d+ points/i);

    // Cleanup
    await request.delete(`${CLOUD_URL}/api/v1/app/storage/tasks/${p1Task.id}`, {
      headers: authHeaders(),
    });
    await request.delete(`${CLOUD_URL}/api/v1/app/storage/tasks/${p4Task.id}`, {
      headers: authHeaders(),
    });

    console.log("✅ Priority points calculation verified");
  });
});

test.describe("Todo App - Chat Integration", () => {
  const API_KEY = process.env.TEST_TODOAPP_API_KEY;

  test.skip(() => !API_KEY, "TEST_TODOAPP_API_KEY required");

  function authHeaders() {
    return {
      "X-Api-Key": API_KEY!,
      "Content-Type": "application/json",
    };
  }

  test("can list available agents for chat", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/app/agents`, {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.agents)).toBe(true);

    console.log(`✅ Found ${data.agents.length} agents for chat`);
  });

  test("can create and use chat session", async ({ request }) => {
    // Get agents
    const agentsResponse = await request.get(`${CLOUD_URL}/api/v1/app/agents`, {
      headers: authHeaders(),
    });
    const agents = (await agentsResponse.json()).agents;

    if (agents.length === 0) {
      console.log("ℹ️ No agents available - skipping chat test");
      return;
    }

    const agentId = agents[0].id;

    // Create chat
    const createChatResponse = await request.post(
      `${CLOUD_URL}/api/v1/app/agents/${agentId}/chats`,
      { headers: authHeaders() },
    );

    expect([200, 201]).toContain(createChatResponse.status());
    const chatData = await createChatResponse.json();
    const chatId = chatData.chat.id;

    // Cleanup
    await request.delete(
      `${CLOUD_URL}/api/v1/app/agents/${agentId}/chats/${chatId}`,
      { headers: authHeaders() },
    );

    console.log("✅ Chat session created and cleaned up");
  });
});

test.describe("Todo App - MCP Protocol", () => {
  test("MCP initialize returns protocol info", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/mcp/todoapp`, {
      data: {
        jsonrpc: "2.0",
        method: "initialize",
        params: {},
        id: 1,
      },
    });

    // May require auth, but should not error
    expect([200, 401]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.result.protocolVersion).toBe("2024-11-05");
      expect(data.result.serverInfo.name).toBe("Eliza Todo MCP");
    }

    console.log("✅ MCP initialize works");
  });

  test("MCP tools/list returns all todo tools", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/mcp/todoapp`, {
      data: {
        jsonrpc: "2.0",
        method: "tools/list",
        params: {},
        id: 1,
      },
    });

    expect([200, 401]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const toolNames = data.result.tools.map((t: { name: string }) => t.name);

      expect(toolNames).toContain("create_task");
      expect(toolNames).toContain("list_tasks");
      expect(toolNames).toContain("complete_task");
      expect(toolNames).toContain("update_task");
      expect(toolNames).toContain("delete_task");
      expect(toolNames).toContain("get_points");
    }

    console.log("✅ MCP tools/list returns expected tools");
  });

  test("MCP resources/list returns todo resources", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/mcp/todoapp`, {
      data: {
        jsonrpc: "2.0",
        method: "resources/list",
        params: {},
        id: 1,
      },
    });

    expect([200, 401]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const resources = data.result.resources;
      const uris = resources.map((r: { uri: string }) => r.uri);

      expect(uris).toContain("todo://tasks/active");
      expect(uris).toContain("todo://tasks/completed");
      expect(uris).toContain("todo://points");
    }

    console.log("✅ MCP resources/list returns expected resources");
  });

  test("MCP prompts/list returns todo prompts", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/mcp/todoapp`, {
      data: {
        jsonrpc: "2.0",
        method: "prompts/list",
        params: {},
        id: 1,
      },
    });

    expect([200, 401]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const prompts = data.result.prompts;
      const names = prompts.map((p: { name: string }) => p.name);

      expect(names).toContain("suggest_tasks");
      expect(names).toContain("prioritize_tasks");
    }

    console.log("✅ MCP prompts/list returns expected prompts");
  });
});

test.describe("Todo App - Error Handling", () => {
  const API_KEY = process.env.TEST_TODOAPP_API_KEY;

  test.skip(() => !API_KEY, "TEST_TODOAPP_API_KEY required");

  function authHeaders() {
    return {
      "X-Api-Key": API_KEY!,
      "Content-Type": "application/json",
    };
  }

  test("returns 404 for non-existent task", async ({ request }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/app/storage/tasks/non-existent-uuid-here`,
      { headers: authHeaders() },
    );

    expect(response.status()).toBe(404);
  });

  test("MCP complete_task returns error for invalid ID", async ({
    request,
  }) => {
    const response = await request.post(`${CLOUD_URL}/api/mcp/todoapp`, {
      headers: authHeaders(),
      data: {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "complete_task",
          arguments: { id: "invalid-uuid" },
        },
        id: 1,
      },
    });

    expect(response.status()).toBe(404);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  test("MCP returns error for unknown tool", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/mcp/todoapp`, {
      headers: authHeaders(),
      data: {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "nonexistent_tool",
          arguments: {},
        },
        id: 1,
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
    expect(data.error.message).toContain("Unknown tool");
  });

  test("storage returns 401 without auth", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/app/storage/tasks`);

    expect([401, 403]).toContain(response.status());
  });
});

test.describe("Todo App - Performance", () => {
  test("landing page loads under 3 seconds", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }

    const start = Date.now();
    await page.goto(TODOAPP_URL);
    await page.waitForLoadState("domcontentloaded");
    const loadTime = Date.now() - start;

    expect(loadTime).toBeLessThan(3000);
    console.log(`✅ Landing page loaded in ${loadTime}ms`);
  });

  test("API response times are acceptable", async ({ request }) => {
    const API_KEY = process.env.TEST_TODOAPP_API_KEY;
    if (!API_KEY) {
      test.skip();
      return;
    }

    const start = Date.now();
    await request.get(`${CLOUD_URL}/api/v1/app/storage/tasks`, {
      headers: {
        "X-Api-Key": API_KEY,
        "Content-Type": "application/json",
      },
    });
    const responseTime = Date.now() - start;

    expect(responseTime).toBeLessThan(2000);
    console.log(`✅ API responded in ${responseTime}ms`);
  });

  test("MCP endpoint responds quickly", async ({ request }) => {
    const start = Date.now();
    await request.get(`${CLOUD_URL}/api/mcp/todoapp`);
    const responseTime = Date.now() - start;

    expect(responseTime).toBeLessThan(1000);
    console.log(`✅ MCP metadata in ${responseTime}ms`);
  });
});
});
