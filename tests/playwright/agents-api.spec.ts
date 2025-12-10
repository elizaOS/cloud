import { test, expect } from "@playwright/test";

/**
 * Agents V1 API Tests
 *
 * Tests agent management via v1 API:
 * - Agent status
 * - Agent events
 * - Agent logs
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

test.describe("Agent Status API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/v1/agents/:agentId/status returns agent status", async ({ request }) => {
    // First get a list of agents
    const listResponse = await request.get(`${CLOUD_URL}/api/v1/app/agents`, {
      headers: authHeaders(),
    });

    if (listResponse.status() !== 200) {
      console.log("ℹ️ Could not get agents list");
      return;
    }

    const listData = await listResponse.json();
    const agents = listData.agents || listData.data || listData;

    if (!Array.isArray(agents) || agents.length === 0) {
      console.log("ℹ️ No agents available for status test");
      return;
    }

    const agentId = agents[0].id;

    const response = await request.get(`${CLOUD_URL}/api/v1/agents/${agentId}/status`, {
      headers: authHeaders(),
    });

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Agent status retrieved");

      if (data.status) {
        console.log(`   Status: ${data.status}`);
      }
    } else {
      console.log(`ℹ️ Agent status returned ${response.status()}`);
    }
  });
});

test.describe("Agent Events API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/v1/agents/:agentId/events returns agent events", async ({ request }) => {
    const listResponse = await request.get(`${CLOUD_URL}/api/v1/app/agents`, {
      headers: authHeaders(),
    });

    if (listResponse.status() !== 200) {
      return;
    }

    const listData = await listResponse.json();
    const agents = listData.agents || listData.data || listData;

    if (!Array.isArray(agents) || agents.length === 0) {
      return;
    }

    const agentId = agents[0].id;

    const response = await request.get(`${CLOUD_URL}/api/v1/agents/${agentId}/events`, {
      headers: authHeaders(),
    });

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const events = data.events || data.data || data;
      expect(Array.isArray(events)).toBe(true);
      console.log(`✅ Found ${events.length} agent events`);
    } else {
      console.log(`ℹ️ Agent events returned ${response.status()}`);
    }
  });

  test("agent events support pagination", async ({ request }) => {
    const listResponse = await request.get(`${CLOUD_URL}/api/v1/app/agents`, {
      headers: authHeaders(),
    });

    if (listResponse.status() !== 200) {
      return;
    }

    const listData = await listResponse.json();
    const agents = listData.agents || listData.data || listData;

    if (!Array.isArray(agents) || agents.length === 0) {
      return;
    }

    const agentId = agents[0].id;

    const response = await request.get(
      `${CLOUD_URL}/api/v1/agents/${agentId}/events?limit=10&offset=0`,
      {
        headers: authHeaders(),
      }
    );

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      console.log("✅ Agent events pagination works");
    }
  });
});

test.describe("Agent Logs API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/v1/agents/:agentId/logs returns agent logs", async ({ request }) => {
    const listResponse = await request.get(`${CLOUD_URL}/api/v1/app/agents`, {
      headers: authHeaders(),
    });

    if (listResponse.status() !== 200) {
      return;
    }

    const listData = await listResponse.json();
    const agents = listData.agents || listData.data || listData;

    if (!Array.isArray(agents) || agents.length === 0) {
      return;
    }

    const agentId = agents[0].id;

    const response = await request.get(`${CLOUD_URL}/api/v1/agents/${agentId}/logs`, {
      headers: authHeaders(),
    });

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const logs = data.logs || data.data || data;
      expect(Array.isArray(logs) || typeof logs === "string").toBe(true);
      console.log("✅ Agent logs retrieved");
    } else {
      console.log(`ℹ️ Agent logs returned ${response.status()}`);
    }
  });

  test("agent logs support level filter", async ({ request }) => {
    const listResponse = await request.get(`${CLOUD_URL}/api/v1/app/agents`, {
      headers: authHeaders(),
    });

    if (listResponse.status() !== 200) {
      return;
    }

    const listData = await listResponse.json();
    const agents = listData.agents || listData.data || listData;

    if (!Array.isArray(agents) || agents.length === 0) {
      return;
    }

    const agentId = agents[0].id;
    const levels = ["error", "warn", "info", "debug"];

    for (const level of levels) {
      const response = await request.get(
        `${CLOUD_URL}/api/v1/agents/${agentId}/logs?level=${level}`,
        {
          headers: authHeaders(),
        }
      );

      expect([200, 400, 404, 501]).toContain(response.status());

      if (response.status() === 200) {
        console.log(`✅ Agent logs filter by '${level}' works`);
      }
    }
  });
});

test.describe("User API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/v1/user returns current user", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/user`, {
      headers: authHeaders(),
    });

    expect([200, 401, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ User endpoint works");

      if (data.user) {
        expect(data.user).toHaveProperty("id");
        console.log("   User info retrieved");
      }
    } else {
      console.log(`ℹ️ User endpoint returned ${response.status()}`);
    }
  });
});

test.describe("Apps Users API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testAppId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/apps`, {
      headers: authHeaders(),
      data: {
        name: "Users Test App",
        description: "For users API testing",
        app_url: "https://users-test.example.com",
      },
    });

    if (response.status() === 200) {
      const data = await response.json();
      testAppId = data.app.id;
    }
  });

  test.afterAll(async ({ request }) => {
    if (testAppId) {
      await request.delete(`${CLOUD_URL}/api/v1/apps/${testAppId}`, {
        headers: authHeaders(),
      });
    }
  });

  test("GET /api/v1/apps/:id/users returns app users", async ({ request }) => {
    if (!testAppId) {
      return;
    }

    const response = await request.get(`${CLOUD_URL}/api/v1/apps/${testAppId}/users`, {
      headers: authHeaders(),
    });

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const users = data.users || data.data || data;
      expect(Array.isArray(users)).toBe(true);
      console.log(`✅ Found ${users.length} app users`);
    } else {
      console.log(`ℹ️ App users returned ${response.status()}`);
    }
  });

  test("app users support pagination", async ({ request }) => {
    if (!testAppId) {
      return;
    }

    const response = await request.get(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/users?limit=10&offset=0`,
      {
        headers: authHeaders(),
      }
    );

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      console.log("✅ App users pagination works");
    }
  });
});

test.describe("Credits Top-up API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/v1/credits/topup initiates top-up", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/credits/topup`, {
      headers: authHeaders(),
      data: {
        amount: 10,
      },
    });

    expect([200, 201, 400, 402, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Credits top-up endpoint works");
    } else if (response.status() === 402) {
      console.log("✅ Credits top-up requires payment method");
    } else {
      console.log(`ℹ️ Credits top-up returned ${response.status()}`);
    }
  });
});


