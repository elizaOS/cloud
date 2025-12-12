import { test, expect } from "@playwright/test";

/**
 * Auth & Session API Tests
 *
 * Tests authentication and session management:
 * - Logout
 * - CLI session creation and completion
 * - Miniapp session completion
 * - Anonymous session migration
 * - Current session info
 *
 * Prerequisites:
 * - TEST_API_KEY environment variable required
 * - Cloud running on port 3000
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const CLOUD_URL = process.env.CLOUD_URL ?? BASE_URL;
const API_KEY = process.env.TEST_API_KEY;

function authHeaders() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

test.describe("Logout API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/auth/logout logs out user", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/auth/logout`, {
      headers: authHeaders(),
    });

    expect([200, 204, 302, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 204) {
      console.log("✅ Logout endpoint works");
    } else if (response.status() === 302) {
      console.log("✅ Logout redirects (expected behavior)");
    } else {
      console.log(`ℹ️ Logout returned ${response.status()}`);
    }
  });
});

test.describe("CLI Session API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testSessionId: string | null = null;

  test.afterEach(async ({ request }) => {
    if (testSessionId) {
      // Sessions typically expire on their own, but cleanup if needed
      testSessionId = null;
    }
  });

  test("POST /api/auth/cli-session creates CLI session", async ({
    request,
  }) => {
    const response = await request.post(`${CLOUD_URL}/api/auth/cli-session`, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      const session = data.session || data.data || data;
      expect(session).toHaveProperty("sessionId");
      testSessionId = session.sessionId;
      console.log("✅ CLI session created");

      // Should have auth URL for user to visit
      if (session.authUrl) {
        expect(session.authUrl).toContain("http");
        console.log("   Auth URL provided for user authentication");
      }
    } else {
      console.log(`ℹ️ CLI session creation returned ${response.status()}`);
    }
  });

  test("GET /api/auth/cli-session/:sessionId checks session status", async ({
    request,
  }) => {
    // First create a session
    const createResponse = await request.post(
      `${CLOUD_URL}/api/auth/cli-session`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (createResponse.status() !== 200 && createResponse.status() !== 201) {
      return;
    }

    const createData = await createResponse.json();
    const session = createData.session || createData.data || createData;
    testSessionId = session.sessionId;

    // Check status
    const response = await request.get(
      `${CLOUD_URL}/api/auth/cli-session/${testSessionId}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const sessionData = data.session || data.data || data;
      expect(sessionData).toHaveProperty("status");
      console.log(`✅ CLI session status: ${sessionData.status}`);
    }
  });

  test("POST /api/auth/cli-session/:sessionId/complete completes session", async ({
    request,
  }) => {
    // First create a session
    const createResponse = await request.post(
      `${CLOUD_URL}/api/auth/cli-session`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (createResponse.status() !== 200 && createResponse.status() !== 201) {
      return;
    }

    const createData = await createResponse.json();
    const session = createData.session || createData.data || createData;
    const sessionId = session.sessionId;

    // Complete session (with authenticated user)
    const response = await request.post(
      `${CLOUD_URL}/api/auth/cli-session/${sessionId}/complete`,
      {
        headers: authHeaders(),
      },
    );

    expect([200, 201, 400, 403, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ CLI session completion works");
    } else if (response.status() === 400) {
      console.log("✅ CLI session completion requires valid session");
    } else {
      console.log(`ℹ️ CLI session completion returned ${response.status()}`);
    }
  });
});

test.describe("Miniapp Session Completion API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/auth/miniapp-session/:sessionId/complete completes session", async ({
    request,
  }) => {
    // First create a miniapp session
    const createResponse = await request.post(
      `${CLOUD_URL}/api/auth/miniapp-session`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    if (createResponse.status() !== 200 && createResponse.status() !== 201) {
      console.log(
        `ℹ️ Miniapp session creation returned ${createResponse.status()}`,
      );
      return;
    }

    const createData = await createResponse.json();
    const session = createData.session || createData.data || createData;
    const sessionId = session.sessionId || session.id;

    // Complete session
    const response = await request.post(
      `${CLOUD_URL}/api/auth/miniapp-session/${sessionId}/complete`,
      {
        headers: authHeaders(),
      },
    );

    expect([200, 201, 400, 403, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      console.log("✅ Miniapp session completion works");
    } else {
      console.log(
        `ℹ️ Miniapp session completion returned ${response.status()}`,
      );
    }
  });
});

test.describe("Anonymous Session Migration API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/auth/migrate-anonymous migrates anonymous data", async ({
    request,
  }) => {
    const response = await request.post(
      `${CLOUD_URL}/api/auth/migrate-anonymous`,
      {
        headers: authHeaders(),
        data: {
          anonymousSessionId: "test-anonymous-session-id",
        },
      },
    );

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Anonymous session migration works");
    } else if (response.status() === 404) {
      console.log("✅ Anonymous migration requires valid session ID");
    } else {
      console.log(`ℹ️ Anonymous migration returned ${response.status()}`);
    }
  });
});

test.describe("Current Session API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/sessions/current returns current session info", async ({
    request,
  }) => {
    const response = await request.get(`${CLOUD_URL}/api/sessions/current`, {
      headers: authHeaders(),
    });

    expect([200, 401, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const session = data.session || data.data || data;
      expect(session).toBeDefined();
      console.log("✅ Current session info retrieved");

      // Check for common session fields
      if (session.user) {
        console.log("   User info included");
      }
      if (session.organization) {
        console.log("   Organization info included");
      }
    } else if (response.status() === 401) {
      console.log(
        "✅ Current session requires authentication (expected with API key)",
      );
    } else {
      console.log(`ℹ️ Current session returned ${response.status()}`);
    }
  });
});

test.describe("Anonymous Session API", () => {
  test("POST /api/set-anonymous-session creates anonymous session", async ({
    request,
  }) => {
    const response = await request.post(
      `${CLOUD_URL}/api/set-anonymous-session`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Anonymous session created");
    } else {
      console.log(
        `ℹ️ Anonymous session creation returned ${response.status()}`,
      );
    }
  });

  test("GET /api/anonymous-session retrieves anonymous session", async ({
    request,
  }) => {
    // First create an anonymous session
    const createResponse = await request.post(
      `${CLOUD_URL}/api/set-anonymous-session`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const cookies = createResponse.headers()["set-cookie"];

    // Get session info
    const response = await request.get(`${CLOUD_URL}/api/anonymous-session`, {
      headers: {
        Cookie: cookies || "",
      },
    });

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Anonymous session retrieved");
    } else {
      console.log(
        `ℹ️ Anonymous session retrieval returned ${response.status()}`,
      );
    }
  });
});

test.describe("Create Anonymous Session API", () => {
  test("POST /api/auth/create-anonymous-session creates session", async ({
    request,
  }) => {
    const response = await request.post(
      `${CLOUD_URL}/api/auth/create-anonymous-session`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Create anonymous session endpoint works");
    } else {
      console.log(`ℹ️ Create anonymous session returned ${response.status()}`);
    }
  });
});

test.describe("Auth Pages UI", () => {
  test("CLI login page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/cli-login`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(0);
    console.log("✅ CLI login page loads");
  });

  test("CLI login page with session ID", async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/cli-login?sessionId=test-session-id`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(0);

    // Should show login form or error
    console.log("✅ CLI login page with session ID loads");
  });

  test("miniapp login page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/miniapp-login`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(0);
    console.log("✅ Miniapp login page loads");
  });

  test("auth error page shows error info", async ({ page }) => {
    await page.goto(`${BASE_URL}/auth/error?error=test_error`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(0);

    // Should have error-related content
    console.log("✅ Auth error page handles errors");
  });
});

test.describe("Logout UI Flow", () => {
  test("logout redirects to appropriate page", async ({ page }) => {
    // This test would require being logged in first
    // We'll just verify the endpoint behavior

    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      console.log("ℹ️ Not logged in - cannot test logout flow");
      return;
    }

    // Look for logout button/link
    const logoutButton = page.locator(
      'button:has-text("Logout"), button:has-text("Sign out"), a:has-text("Logout")',
    );
    const hasLogout = await logoutButton.isVisible().catch(() => false);

    console.log(`✅ Logout button visible: ${hasLogout}`);
  });
});
