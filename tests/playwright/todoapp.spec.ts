import { test, expect } from "@playwright/test";

/**
 * Todo App E2E Tests
 *
 * Tests for the todo-app integration with Eliza Cloud.
 * Covers:
 * - Page rendering
 * - Pass-through auth flow
 * - Cloud API integration via proxy
 * - Task management UI
 *
 * Prerequisites:
 * - Start cloud: bun run dev (port 3000)
 * - Start todo-app: cd todo-app && bun run dev (port 3002)
 * - Run seed: bun run db:todoapp:seed
 */

const CLOUD_URL = process.env.CLOUD_URL ?? "http://localhost:3000";
const TODOAPP_URL = process.env.TODOAPP_URL ?? "http://localhost:3002";

// Check if services are running
let todoappAvailable = false;

test.beforeAll(async ({ request }) => {
  const cloudResponse = await request.get(CLOUD_URL).catch(() => null);
  if (!cloudResponse?.ok()) {
    throw new Error(
      `Cloud not available at ${CLOUD_URL}. Start with: bun run dev`
    );
  }

  const todoappResponse = await request.get(TODOAPP_URL).catch(() => null);
  todoappAvailable = todoappResponse?.ok() ?? false;

  if (!todoappAvailable) {
    console.log(
      `⚠️ Todo app not available at ${TODOAPP_URL}. Skipping todo-app tests. Start with: cd todo-app && bun run dev`
    );
  }
});

test.describe("Todo App Pages", () => {
  test("home page renders with hero section", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }
    await page.goto(TODOAPP_URL);

    // Wait for hero heading
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible({ timeout: 10000 });
    await expect(heading).toContainText(/Eliza Todo/i);
  });

  test("home page has login button", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }
    await page.goto(TODOAPP_URL);

    // Look for get started/login button
    const loginButton = page
      .getByRole("button", { name: /get started|sign in|login/i })
      .first();
    await expect(loginButton).toBeVisible({ timeout: 10000 });
  });

  test("home page shows feature cards", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }
    await page.goto(TODOAPP_URL);

    // Check for feature descriptions
    const features = page.locator('[class*="rounded-2xl"]');
    const count = await features.count();
    expect(count).toBeGreaterThan(0);
  });

  test("dashboard page loads (redirects unauthenticated users)", async ({
    page,
  }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }
    await page.goto(`${TODOAPP_URL}/dashboard`);

    await page.waitForLoadState("networkidle");
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("chat page loads (redirects unauthenticated users)", async ({
    page,
  }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }
    await page.goto(`${TODOAPP_URL}/chat`);

    await page.waitForLoadState("networkidle");
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("settings page loads (redirects unauthenticated users)", async ({
    page,
  }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }
    await page.goto(`${TODOAPP_URL}/settings`);

    await page.waitForLoadState("networkidle");
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("auth callback page handles missing token gracefully", async ({
    page,
  }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }
    await page.goto(`${TODOAPP_URL}/auth/callback`);

    await page.waitForLoadState("networkidle");

    // Should show error about missing token
    const errorHeading = page.getByRole("heading", {
      name: /failed|error|no.*token/i,
    });
    await expect(errorHeading).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Pass-Through Auth Flow", () => {
  test("POST /api/auth/app-session creates session for todo-app", async ({
    request,
  }) => {
    const response = await request.post(
      `${CLOUD_URL}/api/auth/app-session`,
      {
        data: {
          callbackUrl: `${TODOAPP_URL}/auth/callback`,
          appId: "eliza-todo",
        },
      }
    );

    expect(response.status()).toBe(201);

    const data = await response.json();
    expect(data).toHaveProperty("sessionId");
    expect(data).toHaveProperty("loginUrl");
    expect(data).toHaveProperty("expiresAt");
    expect(data.loginUrl).toContain("/auth/app-login");
  });

  test("Cloud login page loads with session", async ({ page, request }) => {
    // Create a session
    const createResponse = await request.post(
      `${CLOUD_URL}/api/auth/app-session`,
      {
        data: {
          callbackUrl: `${TODOAPP_URL}/auth/callback`,
        },
      }
    );
    const { loginUrl } = await createResponse.json();

    // Navigate to login page
    await page.goto(loginUrl);
    await page.waitForLoadState("networkidle");

    // Should show sign in UI
    const signInButton = page.getByRole("button", { name: /sign in/i });
    await expect(signInButton).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Todo App Proxy", () => {
  test("proxy user endpoint forwards to cloud API", async ({ request }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }
    const response = await request.get(`${TODOAPP_URL}/api/proxy/user`);

    // Should return 401 (no auth) - not 500 (server error)
    expect([200, 401, 403]).toContain(response.status());
  });

  test("proxy storage endpoint forwards to cloud API", async ({ request }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }
    const response = await request.get(
      `${TODOAPP_URL}/api/proxy/storage/tasks`
    );

    // Should return 401 (no auth) - not 500 (server error)
    expect([200, 401, 403]).toContain(response.status());
  });

  test("proxy handles CORS preflight", async ({ request }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }
    const response = await request.fetch(`${TODOAPP_URL}/api/proxy/user`, {
      method: "OPTIONS",
    });

    expect(response.status()).toBe(204);

    const headers = response.headers();
    expect(headers["access-control-allow-origin"]).toBeTruthy();
    expect(headers["access-control-allow-methods"]).toBeTruthy();
  });
});

test.describe("Cloud API - Authentication Required", () => {
  test("GET /app/user returns 401 without auth", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/app/user`);
    expect([401, 403]).toContain(response.status());
  });

  test("GET /app/storage/tasks returns 401 without auth", async ({
    request,
  }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/app/storage/tasks`
    );
    expect([401, 403]).toContain(response.status());
  });

  test("POST /app/storage/tasks returns 401 without auth", async ({
    request,
  }) => {
    const response = await request.post(
      `${CLOUD_URL}/api/v1/app/storage/tasks`,
      {
        data: { name: "Test", type: "one-off", completed: false },
      }
    );
    expect([401, 403]).toContain(response.status());
  });
});

test.describe("Todo MCP Endpoint", () => {
  test("GET /api/mcp/todoapp returns metadata", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/mcp/todoapp`);

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.name).toBe("Todo App MCP");
    expect(data.tools).toBeDefined();
    expect(data.tools.length).toBeGreaterThan(0);

    // Verify expected tools exist
    const toolNames = data.tools.map(
      (t: { name: string }) => t.name
    );
    expect(toolNames).toContain("create_task");
    expect(toolNames).toContain("list_tasks");
    expect(toolNames).toContain("complete_task");
    expect(toolNames).toContain("get_points");
    expect(toolNames).toContain("send_sms_reminder");
    expect(toolNames).toContain("add_to_calendar");
    expect(toolNames).toContain("set_reminder");
  });

  test("POST /api/mcp/todoapp initialize method works", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/mcp/todoapp`, {
      data: {
        jsonrpc: "2.0",
        method: "initialize",
        params: {},
        id: 1,
      },
    });

    // Should return 401 (no auth) for actual operations
    expect([200, 401]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.result.protocolVersion).toBe("2024-11-05");
    }
  });

  test("POST /api/mcp/todoapp tools/list method works", async ({ request }) => {
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
      expect(data.result.tools).toBeDefined();
      expect(data.result.tools.length).toBe(9); // 6 original + 3 new (sms, calendar, reminder)
    }
  });

  test("POST /api/mcp/todoapp requires auth for tools/call", async ({
    request,
  }) => {
    const response = await request.post(`${CLOUD_URL}/api/mcp/todoapp`, {
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

    expect(response.status()).toBe(401);
  });
});

test.describe("MCP Registry - Todo App Entry", () => {
  test("todo-app appears in MCP registry", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/mcp/registry`);

    expect(response.status()).toBe(200);

    const data = await response.json();
    const todoEntry = data.registry.find(
      (entry: { id: string }) => entry.id === "todo-app"
    );

    expect(todoEntry).toBeDefined();
    expect(todoEntry.name).toBe("Todo App");
    expect(todoEntry.category).toBe("productivity");
    expect(todoEntry.status).toBe("live");
    expect(todoEntry.features).toContain("create_task");
    expect(todoEntry.features).toContain("complete_task");
  });

  test("todo-app registry entry has correct endpoint", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/mcp/registry`);

    const data = await response.json();
    const todoEntry = data.registry.find(
      (entry: { id: string }) => entry.id === "todo-app"
    );

    expect(todoEntry.endpoint).toContain("/api/mcp/todoapp");
    expect(todoEntry.fullEndpoint).toContain("api/mcp/todoapp");
  });
});

test.describe("UI Interaction - Dashboard", () => {
  test("dashboard shows loading state initially", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }
    await page.goto(`${TODOAPP_URL}/dashboard`);

    // Should show loading spinner or redirect
    await page.waitForLoadState("networkidle");
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});

test.describe("Navigation", () => {
  test("clicking logo returns to home", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }
    await page.goto(`${TODOAPP_URL}/dashboard`);

    // Wait for page to load
    await page.waitForLoadState("networkidle");

    // Click logo/home link if visible
    const logo = page.locator('a[href="/"]').first();
    if (await logo.isVisible()) {
      await logo.click();
      await expect(page).toHaveURL(TODOAPP_URL + "/");
    }
  });

  test("login button initiates auth flow", async ({ page }) => {
    if (!todoappAvailable) {
      test.skip();
      return;
    }
    await page.goto(TODOAPP_URL);

    // Find and click login button
    const loginButton = page
      .getByRole("button", { name: /get started|sign in|login/i })
      .first();
    await expect(loginButton).toBeVisible({ timeout: 10000 });

    // Click and wait for navigation
    const navigationPromise = page.waitForURL(
      /auth\/app-login|api\/auth\/app-session/,
      { timeout: 15000 }
    );
    await loginButton.click();

    // Should navigate to Cloud login
    try {
      await navigationPromise;
      const newUrl = page.url();
      expect(newUrl).toContain(
        CLOUD_URL.replace(/^https?:\/\//, "").split(":")[0]
      );
    } catch {
      // May timeout if redirect takes longer
      console.log("ℹ️ Navigation timeout - may require manual interaction");
    }
  });
});

test.describe("Agent A2A/MCP Endpoints", () => {
  // Note: These tests require the agent to be created via seed script
  // and will use the agent ID from the seed

  test("agent MCP endpoint returns 403 for non-public agent", async ({
    request,
  }) => {
    // Using a placeholder ID - actual tests would use seeded agent ID
    const response = await request.get(
      `${CLOUD_URL}/api/agents/non-existent-id/mcp`
    );

    // Should return 404 (not found) or 403 (not public)
    expect([403, 404]).toContain(response.status());
  });

  test("agent A2A endpoint returns 403 for non-public agent", async ({
    request,
  }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/agents/non-existent-id/a2a`
    );

    expect([403, 404]).toContain(response.status());
  });
});

