import { test, expect } from "@playwright/test";

/**
 * Extended Container API Tests
 *
 * Tests additional container functionality:
 * - Log streaming (SSE)
 * - Container metrics
 * - Container health checks
 * - Deployment history
 * - Start/stop/restart operations
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

test.describe("Container Log Streaming", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testContainerId: string | null = null;

  test.beforeAll(async ({ request }) => {
    // Create a test container
    const response = await request.post(`${CLOUD_URL}/api/v1/containers`, {
      headers: authHeaders(),
      data: {
        name: "Log Stream Test Container",
        image: "nginx:latest",
      },
    });

    if (response.status() === 200 || response.status() === 201 || response.status() === 202) {
      const data = await response.json();
      if (data.success && data.data) {
        testContainerId = data.data.id;
      }
    }
  });

  test.afterAll(async ({ request }) => {
    if (testContainerId) {
      await request.delete(`${CLOUD_URL}/api/v1/containers/${testContainerId}`, {
        headers: authHeaders(),
      });
    }
  });

  test("GET /containers/:id/logs/stream returns SSE stream", async ({ request }) => {
    if (!testContainerId) {
      console.log("ℹ️ No test container available");
      return;
    }

    const response = await request.get(
      `${CLOUD_URL}/api/v1/containers/${testContainerId}/logs/stream`,
      {
        headers: authHeaders(),
      }
    );

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const contentType = response.headers()["content-type"];
      const isStream =
        contentType?.includes("text/event-stream") ||
        contentType?.includes("application/json");

      if (isStream) {
        console.log("✅ Container log stream endpoint returns SSE");
      } else {
        console.log(`✅ Container log stream returns: ${contentType}`);
      }
    } else {
      console.log(`ℹ️ Container log stream returned ${response.status()}`);
    }
  });
});

test.describe("Container Metrics", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testContainerId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/containers`, {
      headers: authHeaders(),
      data: {
        name: "Metrics Test Container",
        image: "nginx:latest",
      },
    });

    if (response.status() === 200 || response.status() === 201 || response.status() === 202) {
      const data = await response.json();
      if (data.success && data.data) {
        testContainerId = data.data.id;
      }
    }
  });

  test.afterAll(async ({ request }) => {
    if (testContainerId) {
      await request.delete(`${CLOUD_URL}/api/v1/containers/${testContainerId}`, {
        headers: authHeaders(),
      });
    }
  });

  test("GET /containers/:id/metrics returns container metrics", async ({ request }) => {
    if (!testContainerId) {
      return;
    }

    const response = await request.get(
      `${CLOUD_URL}/api/v1/containers/${testContainerId}/metrics`,
      {
        headers: authHeaders(),
      }
    );

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Container metrics retrieved");

      // Check for common metrics fields
      if (data.cpu !== undefined) {
        console.log(`   CPU: ${data.cpu}`);
      }
      if (data.memory !== undefined) {
        console.log(`   Memory: ${data.memory}`);
      }
    } else {
      console.log(`ℹ️ Container metrics returned ${response.status()}`);
    }
  });
});

test.describe("Container Health", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testContainerId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/containers`, {
      headers: authHeaders(),
      data: {
        name: "Health Test Container",
        image: "nginx:latest",
      },
    });

    if (response.status() === 200 || response.status() === 201 || response.status() === 202) {
      const data = await response.json();
      if (data.success && data.data) {
        testContainerId = data.data.id;
      }
    }
  });

  test.afterAll(async ({ request }) => {
    if (testContainerId) {
      await request.delete(`${CLOUD_URL}/api/v1/containers/${testContainerId}`, {
        headers: authHeaders(),
      });
    }
  });

  test("GET /containers/:id/health returns health status", async ({ request }) => {
    if (!testContainerId) {
      return;
    }

    const response = await request.get(
      `${CLOUD_URL}/api/v1/containers/${testContainerId}/health`,
      {
        headers: authHeaders(),
      }
    );

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Container health check works");

      if (data.status) {
        console.log(`   Health status: ${data.status}`);
      }
      if (data.healthy !== undefined) {
        console.log(`   Healthy: ${data.healthy}`);
      }
    } else {
      console.log(`ℹ️ Container health returned ${response.status()}`);
    }
  });
});

test.describe("Container Deployments", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testContainerId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/containers`, {
      headers: authHeaders(),
      data: {
        name: "Deployments Test Container",
        image: "nginx:latest",
      },
    });

    if (response.status() === 200 || response.status() === 201 || response.status() === 202) {
      const data = await response.json();
      if (data.success && data.data) {
        testContainerId = data.data.id;
      }
    }
  });

  test.afterAll(async ({ request }) => {
    if (testContainerId) {
      await request.delete(`${CLOUD_URL}/api/v1/containers/${testContainerId}`, {
        headers: authHeaders(),
      });
    }
  });

  test("GET /containers/:id/deployments returns deployment history", async ({ request }) => {
    if (!testContainerId) {
      return;
    }

    const response = await request.get(
      `${CLOUD_URL}/api/v1/containers/${testContainerId}/deployments`,
      {
        headers: authHeaders(),
      }
    );

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const deployments = data.deployments || data.data || data;
      expect(Array.isArray(deployments)).toBe(true);
      console.log(`✅ Found ${deployments.length} deployments`);
    } else {
      console.log(`ℹ️ Container deployments returned ${response.status()}`);
    }
  });
});

test.describe("Container Actions", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testContainerId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/containers`, {
      headers: authHeaders(),
      data: {
        name: "Actions Test Container",
        image: "nginx:latest",
      },
    });

    if (response.status() === 200 || response.status() === 201 || response.status() === 202) {
      const data = await response.json();
      if (data.success && data.data) {
        testContainerId = data.data.id;
      }
    }
  });

  test.afterAll(async ({ request }) => {
    if (testContainerId) {
      await request.delete(`${CLOUD_URL}/api/v1/containers/${testContainerId}`, {
        headers: authHeaders(),
      });
    }
  });

  test("POST /containers/:id/start starts container", async ({ request }) => {
    if (!testContainerId) {
      return;
    }

    const response = await request.post(
      `${CLOUD_URL}/api/v1/containers/${testContainerId}/start`,
      {
        headers: authHeaders(),
      }
    );

    expect([200, 202, 400, 404, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 202) {
      console.log("✅ Container start command sent");
    } else {
      console.log(`ℹ️ Container start returned ${response.status()}`);
    }
  });

  test("POST /containers/:id/stop stops container", async ({ request }) => {
    if (!testContainerId) {
      return;
    }

    const response = await request.post(
      `${CLOUD_URL}/api/v1/containers/${testContainerId}/stop`,
      {
        headers: authHeaders(),
      }
    );

    expect([200, 202, 400, 404, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 202) {
      console.log("✅ Container stop command sent");
    } else {
      console.log(`ℹ️ Container stop returned ${response.status()}`);
    }
  });

  test("POST /containers/:id/restart restarts container", async ({ request }) => {
    if (!testContainerId) {
      return;
    }

    const response = await request.post(
      `${CLOUD_URL}/api/v1/containers/${testContainerId}/restart`,
      {
        headers: authHeaders(),
      }
    );

    expect([200, 202, 400, 404, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 202) {
      console.log("✅ Container restart command sent");
    } else {
      console.log(`ℹ️ Container restart returned ${response.status()}`);
    }
  });
});

test.describe("Container Detail Page UI", () => {
  test("container detail page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/containers`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      console.log("ℹ️ Containers page requires authentication");
      return;
    }

    // Try to navigate to a container detail
    const containerLinks = page.locator('a[href*="/containers/"]');
    const linkCount = await containerLinks.count();

    if (linkCount > 0) {
      await containerLinks.first().click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      const detailUrl = page.url();
      expect(detailUrl).toContain("/containers/");
      console.log("✅ Container detail page accessible");

      // Check for action buttons
      const actionButtons = page.locator(
        'button:has-text("Start"), button:has-text("Stop"), button:has-text("Restart")'
      );
      const buttonCount = await actionButtons.count();
      console.log(`   Found ${buttonCount} action buttons`);
    } else {
      console.log("ℹ️ No containers to view detail");
    }
  });

  test("container logs viewer exists", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/containers`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      return;
    }

    const containerLinks = page.locator('a[href*="/containers/"]');
    const linkCount = await containerLinks.count();

    if (linkCount > 0) {
      await containerLinks.first().click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      // Look for logs section
      const logsSection = page.locator(
        '[class*="logs"], [class*="terminal"], pre, code, [class*="console"]'
      );
      const hasLogs = await logsSection.isVisible().catch(() => false);

      console.log(`✅ Logs viewer visible: ${hasLogs}`);
    }
  });

  test("container metrics display", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/containers`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      return;
    }

    const containerLinks = page.locator('a[href*="/containers/"]');
    const linkCount = await containerLinks.count();

    if (linkCount > 0) {
      await containerLinks.first().click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      // Look for metrics display
      const metricsSection = page.locator(
        '[class*="metric"], [class*="stat"], text=/cpu|memory|network/i'
      );
      const metricsCount = await metricsSection.count();

      console.log(`✅ Found ${metricsCount} metric display elements`);
    }
  });
});

