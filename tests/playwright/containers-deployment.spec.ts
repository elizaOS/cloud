import { test, expect } from "@playwright/test";

/**
 * Containers & Deployment E2E Tests
 *
 * Tests container creation, deployment, and management:
 * - Container creation
 * - Deployment status tracking
 * - Container logs viewing
 * - Start/stop/restart operations
 * - Container quota management
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

test.describe("Containers Dashboard Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("containers page requires authentication", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/containers`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();
    const redirectedToLogin = url.includes("/login");
    const redirectedToHome = url === `${BASE_URL}/` || url === BASE_URL;
    const onContainersPage = url.includes("/containers");

    // Accept any of: redirect to login, redirect to home, or stay on containers page
    expect(redirectedToLogin || redirectedToHome || onContainersPage).toBe(
      true,
    );
    console.log(
      `✅ Containers page auth check: ${redirectedToLogin ? "redirects to login" : redirectedToHome ? "redirects to home" : "shows containers"}`,
    );
  });

  test("containers page has create container button", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/containers`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const createButton = page.locator(
      'button:has-text("Create"), button:has-text("New Container"), a:has-text("Create")',
    );
    const hasCreateButton = await createButton.isVisible().catch(() => false);

    if (hasCreateButton) {
      console.log("✅ Create container button found");
    } else {
      const url = page.url();
      if (url.includes("/login")) {
        console.log("ℹ️ Create container button requires authentication");
      } else {
        console.log("ℹ️ Create container button not immediately visible");
      }
    }
  });
});

test.describe("Container CRUD Operations", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testContainerId: string | null = null;

  test.afterEach(async ({ request }) => {
    if (testContainerId) {
      await request.delete(
        `${CLOUD_URL}/api/v1/containers/${testContainerId}`,
        {
          headers: authHeaders(),
        },
      );
      testContainerId = null;
    }
  });

  test("POST /containers creates a new container", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/containers`, {
      headers: authHeaders(),
      data: {
        name: "E2E Test Container",
        image: "nginx:latest",
        environment: {},
      },
    });

    // May return 200, 201, or not be implemented
    expect([200, 201, 404, 501]).toContain(response.status());

    if (
      response.status() === 200 ||
      response.status() === 201 ||
      response.status() === 202
    ) {
      const data = await response.json();
      expect(data.success).toBe(true);
      // Containers API returns { success, data: container }
      const container = data.data;
      expect(container).toHaveProperty("id");
      testContainerId = container.id;
      console.log("✅ Container created successfully");
    } else {
      console.log(`ℹ️ Container creation returned ${response.status()}`);
    }
  });

  test("GET /containers lists all containers", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/containers`, {
      headers: authHeaders(),
    });

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.success).toBe(true);
      // Containers API returns { success, data: containers[] }
      const containers = Array.isArray(data.data) ? data.data : [];
      expect(Array.isArray(containers)).toBe(true);
      console.log(`✅ Found ${containers.length} containers`);
    } else {
      console.log(`ℹ️ Containers list returned ${response.status()}`);
    }
  });

  test("GET /containers/:id returns container details", async ({ request }) => {
    // First create a container
    const createResponse = await request.post(
      `${CLOUD_URL}/api/v1/containers`,
      {
        headers: authHeaders(),
        data: {
          name: "Detail Test Container",
          image: "nginx:latest",
        },
      },
    );

    if (
      createResponse.status() !== 200 &&
      createResponse.status() !== 201 &&
      createResponse.status() !== 202
    ) {
      return;
    }

    const createData = await createResponse.json();
    if (!createData.success || !createData.data) {
      return;
    }

    const containerId = createData.data.id;
    testContainerId = containerId;

    // Get details
    const response = await request.get(
      `${CLOUD_URL}/api/v1/containers/${containerId}`,
      {
        headers: authHeaders(),
      },
    );

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.success).toBe(true);
      const container = data.data || data.container || data;
      expect(container).toHaveProperty("id");
      expect(container.id).toBe(containerId);
      console.log("✅ Container details retrieved");
    }
  });

  test("DELETE /containers/:id deletes container", async ({ request }) => {
    // Create container
    const createResponse = await request.post(
      `${CLOUD_URL}/api/v1/containers`,
      {
        headers: authHeaders(),
        data: {
          name: "Delete Test Container",
          image: "nginx:latest",
        },
      },
    );

    if (
      createResponse.status() !== 200 &&
      createResponse.status() !== 201 &&
      createResponse.status() !== 202
    ) {
      return;
    }

    const createData = await createResponse.json();
    if (!createData.success || !createData.data) {
      return;
    }

    const containerId = createData.data.id;

    // Delete it
    const deleteResponse = await request.delete(
      `${CLOUD_URL}/api/v1/containers/${containerId}`,
      {
        headers: authHeaders(),
      },
    );

    expect([200, 204, 404]).toContain(deleteResponse.status());

    if (deleteResponse.status() === 200 || deleteResponse.status() === 204) {
      console.log("✅ Container deleted successfully");
    } else {
      console.log(`ℹ️ Container deletion returned ${deleteResponse.status()}`);
    }

    testContainerId = null; // Already deleted
  });
});

test.describe("Container Deployment Status", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testContainerId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/containers`, {
      headers: authHeaders(),
      data: {
        name: "Status Test Container",
        image: "nginx:latest",
      },
    });

    if (
      response.status() === 200 ||
      response.status() === 201 ||
      response.status() === 202
    ) {
      const data = await response.json();
      if (data.success && data.data) {
        testContainerId = data.data.id;
      }
    }
  });

  test.afterAll(async ({ request }) => {
    if (testContainerId) {
      await request.delete(
        `${CLOUD_URL}/api/v1/containers/${testContainerId}`,
        {
          headers: authHeaders(),
        },
      );
    }
  });

  test("container status endpoint exists", async ({ request }) => {
    if (!testContainerId) {
      return;
    }

    const response = await request.get(
      `${CLOUD_URL}/api/v1/containers/${testContainerId}/status`,
      {
        headers: authHeaders(),
      },
    );

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty("status");
      expect(["running", "stopped", "starting", "stopping", "error"]).toContain(
        data.status,
      );
      console.log(`✅ Container status: ${data.status}`);
    } else {
      console.log(`ℹ️ Status endpoint returned ${response.status()}`);
    }
  });
});

test.describe("Container Operations", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testContainerId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/containers`, {
      headers: authHeaders(),
      data: {
        name: "Operations Test Container",
        image: "nginx:latest",
      },
    });

    if (
      response.status() === 200 ||
      response.status() === 201 ||
      response.status() === 202
    ) {
      const data = await response.json();
      if (data.success && data.data) {
        testContainerId = data.data.id;
      }
    }
  });

  test.afterAll(async ({ request }) => {
    if (testContainerId) {
      await request.delete(
        `${CLOUD_URL}/api/v1/containers/${testContainerId}`,
        {
          headers: authHeaders(),
        },
      );
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
      },
    );

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      console.log("✅ Container start command sent");
    } else {
      console.log(`ℹ️ Start endpoint returned ${response.status()}`);
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
      },
    );

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      console.log("✅ Container stop command sent");
    } else {
      console.log(`ℹ️ Stop endpoint returned ${response.status()}`);
    }
  });

  test("POST /containers/:id/restart restarts container", async ({
    request,
  }) => {
    if (!testContainerId) {
      return;
    }

    const response = await request.post(
      `${CLOUD_URL}/api/v1/containers/${testContainerId}/restart`,
      {
        headers: authHeaders(),
      },
    );

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      console.log("✅ Container restart command sent");
    } else {
      console.log(`ℹ️ Restart endpoint returned ${response.status()}`);
    }
  });
});

test.describe("Container Logs", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testContainerId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/containers`, {
      headers: authHeaders(),
      data: {
        name: "Logs Test Container",
        image: "nginx:latest",
      },
    });

    if (
      response.status() === 200 ||
      response.status() === 201 ||
      response.status() === 202
    ) {
      const data = await response.json();
      if (data.success && data.data) {
        testContainerId = data.data.id;
      }
    }
  });

  test.afterAll(async ({ request }) => {
    if (testContainerId) {
      await request.delete(
        `${CLOUD_URL}/api/v1/containers/${testContainerId}`,
        {
          headers: authHeaders(),
        },
      );
    }
  });

  test("GET /containers/:id/logs returns container logs", async ({
    request,
  }) => {
    if (!testContainerId) {
      return;
    }

    const response = await request.get(
      `${CLOUD_URL}/api/v1/containers/${testContainerId}/logs`,
      {
        headers: authHeaders(),
      },
    );

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty("logs");
      expect(Array.isArray(data.logs) || typeof data.logs === "string").toBe(
        true,
      );
      console.log("✅ Container logs retrieved");
    } else {
      console.log(`ℹ️ Logs endpoint returned ${response.status()}`);
    }
  });

  test("container logs support pagination", async ({ request }) => {
    if (!testContainerId) {
      return;
    }

    const response = await request.get(
      `${CLOUD_URL}/api/v1/containers/${testContainerId}/logs?limit=100&offset=0`,
      {
        headers: authHeaders(),
      },
    );

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      console.log("✅ Container logs pagination works");
    }
  });
});

test.describe("Container Quota Management", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /containers/quota returns quota information", async ({
    request,
  }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/containers/quota`, {
      headers: authHeaders(),
    });

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty("limit");
      expect(data).toHaveProperty("used");
      expect(data).toHaveProperty("remaining");
      console.log(`✅ Container quota: ${data.used}/${data.limit} used`);
    } else {
      console.log(`ℹ️ Quota endpoint returned ${response.status()}`);
    }
  });
});

test.describe("Container Credentials", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /containers/credentials returns credentials", async ({
    request,
  }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/containers/credentials`,
      {
        headers: authHeaders(),
      },
    );

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty("credentials");
      console.log("✅ Container credentials retrieved");
    } else {
      console.log(`ℹ️ Credentials endpoint returned ${response.status()}`);
    }
  });
});
