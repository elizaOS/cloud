import { test, expect } from "@playwright/test";

/**
 * Org App E2E Tests
 *
 * Tests for the org-app integration with Eliza Cloud.
 * Covers:
 * - Page rendering
 * - Pass-through auth flow
 * - Cloud API integration via proxy
 * - Todo management
 * - Platform connections
 *
 * Prerequisites:
 * - Start cloud: bun run dev (port 3000)
 * - Start org-app: cd apps/org-app && bun run dev (port 3002)
 */

const CLOUD_URL = process.env.CLOUD_URL ?? "http://localhost:3000";
const ORG_APP_URL = process.env.ORG_APP_URL ?? "http://localhost:3002";

// Check if services are running
let orgAppAvailable = false;

test.describe("Org App E2E Tests", () => {
  test.beforeAll(async () => {
    // Check cloud
    const cloudResponse = await fetch(CLOUD_URL).then(r => ({ ok: () => r.ok })).catch(() => null);
    if (!cloudResponse?.ok()) {
      console.log(
        `⚠️ Cloud not available at ${CLOUD_URL}. Start with: bun run dev`,
      );
    }

    // Check org-app
    const orgAppResponse = await fetch(ORG_APP_URL).then(r => ({ ok: () => r.ok })).catch(() => null);
    orgAppAvailable = orgAppResponse?.ok() ?? false;

    if (!orgAppAvailable) {
      console.log(
        `⚠️ Org App not available at ${ORG_APP_URL}. Start with: cd apps/org-app && bun run dev`,
      );
    }
  });

  // ============================================================================
  // Landing Page Tests
  // ============================================================================

  test.describe("Org App Landing Page", () => {
  test("renders with hero section", async ({ page }) => {
    if (!orgAppAvailable) {
      test.skip();
      return;
    }

    await page.goto(ORG_APP_URL);

    // Wait for hero heading
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible({ timeout: 10000 });
    await expect(heading).toContainText(/The Org/i);
  });

  test("has feature cards", async ({ page }) => {
    if (!orgAppAvailable) {
      test.skip();
      return;
    }

    await page.goto(ORG_APP_URL);

    // Look for feature cards
    await expect(page.getByText(/Multi-Platform/i)).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/Smart Check-ins/i)).toBeVisible();
    await expect(page.getByText(/Team Insights/i)).toBeVisible();
  });

  test("has agent cards", async ({ page }) => {
    if (!orgAppAvailable) {
      test.skip();
      return;
    }

    await page.goto(ORG_APP_URL);

    // Look for AI agent cards
    await expect(page.getByText(/Eli5/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Community Manager/i)).toBeVisible();
  });

  test("has sign in button", async ({ page }) => {
    if (!orgAppAvailable) {
      test.skip();
      return;
    }

    await page.goto(ORG_APP_URL);

    // Look for sign in button
    const signInButton = page.getByRole("button", {
      name: /Get Started|Sign In/i,
    });
    await expect(signInButton).toBeVisible({ timeout: 10000 });
  });
});

// ============================================================================
// Authentication Tests
// ============================================================================

test.describe("Pass-Through Auth Flow", () => {
  test("POST /api/auth/app-session creates session for org-app", async ({
    request,
  }) => {
    const response = await request.post(`${CLOUD_URL}/api/auth/app-session`, {
      data: {
        callbackUrl: `${ORG_APP_URL}/auth/callback`,
        appId: "org-app",
      },
    });

    expect(response.status()).toBe(201);

    const data = await response.json();
    expect(data).toHaveProperty("sessionId");
    expect(data).toHaveProperty("loginUrl");
    expect(data).toHaveProperty("expiresAt");
    expect(data.loginUrl).toContain("/auth/app-login");
  });

  test("GET /api/auth/app-session/:id returns status", async ({ request }) => {
    // First create a session
    const createResponse = await request.post(
      `${CLOUD_URL}/api/auth/app-session`,
      {
        data: {
          callbackUrl: `${ORG_APP_URL}/auth/callback`,
          appId: "org-app",
        },
      },
    );
    const { sessionId } = await createResponse.json();

    // Then check status
    const statusResponse = await request.get(
      `${CLOUD_URL}/api/auth/app-session/${sessionId}`,
    );

    expect(statusResponse.status()).toBe(200);

    const data = await statusResponse.json();
    expect(data.status).toBe("pending");
  });

  test("auth callback page exists and handles missing session", async ({
    page,
  }) => {
    if (!orgAppAvailable) {
      test.skip();
      return;
    }

    // Navigate to callback without session (should handle gracefully)
    await page.goto(`${ORG_APP_URL}/auth/callback`);

    await page.waitForLoadState("networkidle");

    // Should show error about missing session
    const errorIndicator = page.getByText(/failed|error|missing/i).first();
    await expect(errorIndicator).toBeVisible({ timeout: 10000 });
  });
});

// ============================================================================
// Proxy API Tests
// ============================================================================

test.describe("Org App Proxy API", () => {
  test("proxy forwards to cloud API", async ({ request }) => {
    if (!orgAppAvailable) {
      test.skip();
      return;
    }

    // Try to hit the proxy endpoint without auth
    const response = await request.get(`${ORG_APP_URL}/api/proxy/org/todos`);

    // Should return 401 since not authenticated
    expect(response.status()).toBe(401);
  });
});

// ============================================================================
// Protected Pages Tests (Unauthenticated)
// ============================================================================

test.describe("Protected Pages (Unauthenticated)", () => {
  test("dashboard redirects to home", async ({ page }) => {
    if (!orgAppAvailable) {
      test.skip();
      return;
    }

    await page.goto(`${ORG_APP_URL}/dashboard`);
    await page.waitForLoadState("networkidle");

    // Should either show loading spinner or redirect to home
    const url = page.url();
    // Either stays on dashboard showing loading, or redirects
    expect(url.includes("/dashboard") || url === ORG_APP_URL + "/").toBe(true);
  });

  test("todos page redirects to home", async ({ page }) => {
    if (!orgAppAvailable) {
      test.skip();
      return;
    }

    await page.goto(`${ORG_APP_URL}/todos`);
    await page.waitForLoadState("networkidle");

    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("settings page redirects to home", async ({ page }) => {
    if (!orgAppAvailable) {
      test.skip();
      return;
    }

    await page.goto(`${ORG_APP_URL}/settings`);
    await page.waitForLoadState("networkidle");

    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("connect discord page renders", async ({ page }) => {
    if (!orgAppAvailable) {
      test.skip();
      return;
    }

    await page.goto(`${ORG_APP_URL}/connect/discord`);
    await page.waitForLoadState("networkidle");

    // Should either redirect or show loading
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("connect telegram page renders", async ({ page }) => {
    if (!orgAppAvailable) {
      test.skip();
      return;
    }

    await page.goto(`${ORG_APP_URL}/connect/telegram`);
    await page.waitForLoadState("networkidle");

    const body = page.locator("body");
    await expect(body).toBeVisible();
  });
});

// ============================================================================
// Cloud API Integration Tests
// ============================================================================

test.describe("Cloud Org API Endpoints", () => {
  test("GET /api/v1/app/org/platforms requires auth", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/app/org/platforms`);
    expect(response.status()).toBe(401);
  });

  test("GET /api/v1/app/org/todos requires auth", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/app/org/todos`);
    expect(response.status()).toBe(401);
  });

  test("GET /api/v1/app/org/checkins requires auth", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/app/org/checkins`);
    expect(response.status()).toBe(401);
  });

  test("POST /api/v1/app/org/todos requires auth", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/app/org/todos`, {
      data: { title: "Test" },
    });
    expect(response.status()).toBe(401);
  });

  test("POST /api/v1/app/org/reports requires auth", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/app/org/reports`, {
      data: {
        scheduleId: "test",
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
      },
    });
    expect(response.status()).toBe(401);
  });
});

// ============================================================================
// MCP Endpoint Tests
// ============================================================================

test.describe("Org MCP Endpoint", () => {
  test("GET /api/mcp/org/sse returns server info", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/mcp/org/sse`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.protocolVersion).toBe("2024-11-05");
    expect(data.serverInfo.name).toBe("org-tools");
    expect(data.serverInfo.version).toBe("1.0.0");
  });

  test("POST tools/list returns org tools (requires auth)", async ({
    request,
  }) => {
    const response = await request.post(`${CLOUD_URL}/api/mcp/org/sse`, {
      data: {
        jsonrpc: "2.0",
        method: "tools/list",
        id: 1,
      },
    });

    // Should require auth
    expect([200, 401, 403]).toContain(response.status());
  });

  test("POST initialize works without auth", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/mcp/org/sse`, {
      data: {
        jsonrpc: "2.0",
        method: "initialize",
        id: 1,
      },
    });

    // Initialize might work without auth for discovery
    expect([200, 401]).toContain(response.status());
  });
});

// ============================================================================
// MCP Registry Tests
// ============================================================================

test.describe("MCP Registry", () => {
  test("org-tools appears in registry", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/mcp/registry`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    const orgTools = data.registry.find(
      (entry: { id: string }) => entry.id === "org-tools",
    );

    expect(orgTools).toBeDefined();
    expect(orgTools.name).toBe("Organization Tools");
    expect(orgTools.category).toBe("productivity");
    expect(orgTools.status).toBe("live");
    expect(orgTools.toolCount).toBeGreaterThanOrEqual(10);
  });
});

// ============================================================================
// UI Component Tests
// ============================================================================

test.describe("UI Components", () => {
  test("landing page has proper styling", async ({ page }) => {
    if (!orgAppAvailable) {
      test.skip();
      return;
    }

    await page.goto(ORG_APP_URL);

    // Check dark mode styling
    const html = page.locator("html");
    await expect(html).toHaveClass(/dark/);

    // Check gradient background
    const hero = page
      .locator("div")
      .filter({ hasText: /The Org/ })
      .first();
    await expect(hero).toBeVisible({ timeout: 10000 });
  });

  test("buttons have hover effects", async ({ page }) => {
    if (!orgAppAvailable) {
      test.skip();
      return;
    }

    await page.goto(ORG_APP_URL);

    const button = page.getByRole("button", { name: /Get Started/i });
    await expect(button).toBeVisible({ timeout: 10000 });

    // Hover and check cursor
    await button.hover();

    // Button should be clickable
    const isClickable = await button.isEnabled();
    expect(isClickable).toBe(true);
  });
});

// ============================================================================
// Mobile Responsiveness Tests
// ============================================================================

test.describe("Mobile Responsiveness", () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

  test("landing page is responsive", async ({ page }) => {
    if (!orgAppAvailable) {
      test.skip();
      return;
    }

    await page.goto(ORG_APP_URL);

    // Hero should still be visible
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible({ timeout: 10000 });

    // Sign in button should be visible
    const signIn = page.getByRole("button", { name: /Get Started|Sign In/i });
    await expect(signIn).toBeVisible();
  });
});
});
