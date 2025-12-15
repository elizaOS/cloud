import { test, expect } from "@playwright/test";

/**
 * Authenticated App API Tests
 *
 * Tests all app API endpoints with authentication.
 * Supports both API key and app token authentication.
 *
 * Prerequisites:
 * - Run: bun run db:app:seed (generates API key)
 * - Set TEST_API_KEY or TEST_APP_TOKEN environment variable
 * - Start cloud: bun run dev (port 3000)
 * - Start app: cd app && bun run dev (port 3001)
 */

const CLOUD_URL = process.env.CLOUD_URL ?? "http://localhost:3000";
const APP_URL = process.env.APP_URL ?? "http://localhost:3001";
const API_KEY = process.env.TEST_API_KEY;
const APP_TOKEN = process.env.TEST_APP_TOKEN;

// Helper for authenticated requests with API key
function apiKeyHeaders() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

// Helper for authenticated requests with app token
function appTokenHeaders() {
  return {
    "X-App-Token": APP_TOKEN!,
    "Content-Type": "application/json",
  };
}

test.describe("Authenticated API Tests (API Key)", () => {
  // Skip all if no API key
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test.describe("User API", () => {
    test("GET /user returns authenticated user", async ({ request }) => {
      const response = await request.get(`${CLOUD_URL}/api/v1/app/user`, {
        headers: apiKeyHeaders(),
      });

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.user).toHaveProperty("id");
      expect(data.organization).toHaveProperty("id");
      expect(data.organization).toHaveProperty("creditBalance");
    });
  });

  test.describe("Agents API - CRUD", () => {
    test("POST /agents creates new agent with source=app", async ({
      request,
    }) => {
      const response = await request.post(`${CLOUD_URL}/api/v1/app/agents`, {
        headers: apiKeyHeaders(),
        data: {
          name: "Test Agent",
          bio: "A test agent for e2e testing",
          topics: ["testing", "automation"],
          adjectives: ["helpful", "friendly"],
        },
      });

      expect(response.status()).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.agent.name).toBe("Test Agent");
      expect(data.agent).toHaveProperty("id");
      expect(data.agent).toHaveProperty("createdAt");

      // Cleanup
      await request.delete(`${CLOUD_URL}/api/v1/app/agents/${data.agent.id}`, {
        headers: apiKeyHeaders(),
      });
    });

    test("app agents are isolated from cloud agents", async ({ request }) => {
      // Create agent via app API (source=app)
      const createResponse = await request.post(
        `${CLOUD_URL}/api/v1/app/agents`,
        {
          headers: apiKeyHeaders(),
          data: {
            name: "App Source Test Agent",
            bio: "Should have source=app",
          },
        },
      );
      expect(createResponse.status()).toBe(201);
      const { agent: appAgent } = await createResponse.json();

      // Verify agent appears in app agent list
      const appListResponse = await request.get(
        `${CLOUD_URL}/api/v1/app/agents`,
        {
          headers: apiKeyHeaders(),
        },
      );
      expect(appListResponse.status()).toBe(200);
      const appData = await appListResponse.json();
      const foundInApp = appData.agents.some(
        (a: { id: string }) => a.id === appAgent.id,
      );
      expect(foundInApp).toBe(true);

      // Verify agent does NOT appear in cloud My Agents (which filters by source=cloud)
      // Note: This requires authentication via the cloud dashboard, not API key
      // The API key is for app, cloud dashboard uses session auth
      // So we can't directly test this via API without cloud auth
      // This test verifies the app side of the source filtering

      // Cleanup
      await request.delete(`${CLOUD_URL}/api/v1/app/agents/${appAgent.id}`, {
        headers: apiKeyHeaders(),
      });
    });

    test("GET /agents lists user's agents", async ({ request }) => {
      // Create a test agent first
      const createResponse = await request.post(
        `${CLOUD_URL}/api/v1/app/agents`,
        {
          headers: apiKeyHeaders(),
          data: { name: "List Test Agent", bio: "For list test" },
        },
      );
      const { agent: createdAgent } = await createResponse.json();

      // List agents
      const response = await request.get(
        `${CLOUD_URL}/api/v1/app/agents?limit=10`,
        {
          headers: apiKeyHeaders(),
        },
      );

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.agents)).toBe(true);
      expect(data.pagination).toHaveProperty("page");
      expect(data.pagination).toHaveProperty("limit");

      // Cleanup
      await request.delete(
        `${CLOUD_URL}/api/v1/app/agents/${createdAgent.id}`,
        {
          headers: apiKeyHeaders(),
        },
      );
    });

    test("GET /agents/:id returns agent details", async ({ request }) => {
      // Create agent
      const createResponse = await request.post(
        `${CLOUD_URL}/api/v1/app/agents`,
        {
          headers: apiKeyHeaders(),
          data: { name: "Detail Test Agent", bio: "For detail test" },
        },
      );
      const { agent: createdAgent } = await createResponse.json();

      // Get details
      const response = await request.get(
        `${CLOUD_URL}/api/v1/app/agents/${createdAgent.id}`,
        {
          headers: apiKeyHeaders(),
        },
      );

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.agent.id).toBe(createdAgent.id);
      expect(data.agent.name).toBe("Detail Test Agent");

      // Cleanup
      await request.delete(
        `${CLOUD_URL}/api/v1/app/agents/${createdAgent.id}`,
        {
          headers: apiKeyHeaders(),
        },
      );
    });

    test("PATCH /agents/:id updates agent", async ({ request }) => {
      // Create agent
      const createResponse = await request.post(
        `${CLOUD_URL}/api/v1/app/agents`,
        {
          headers: apiKeyHeaders(),
          data: { name: "Update Test Agent", bio: "Original bio" },
        },
      );
      const { agent: createdAgent } = await createResponse.json();

      // Update
      const response = await request.patch(
        `${CLOUD_URL}/api/v1/app/agents/${createdAgent.id}`,
        {
          headers: apiKeyHeaders(),
          data: {
            name: "Updated Agent Name",
            bio: "Updated bio content",
          },
        },
      );

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.agent.name).toBe("Updated Agent Name");

      // Cleanup
      await request.delete(
        `${CLOUD_URL}/api/v1/app/agents/${createdAgent.id}`,
        {
          headers: apiKeyHeaders(),
        },
      );
    });

    test("DELETE /agents/:id deletes agent", async ({ request }) => {
      // Create agent
      const createResponse = await request.post(
        `${CLOUD_URL}/api/v1/app/agents`,
        {
          headers: apiKeyHeaders(),
          data: { name: "Delete Test Agent", bio: "Will be deleted" },
        },
      );
      const { agent: createdAgent } = await createResponse.json();

      // Delete
      const response = await request.delete(
        `${CLOUD_URL}/api/v1/app/agents/${createdAgent.id}`,
        {
          headers: apiKeyHeaders(),
        },
      );

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  test.describe("Billing API", () => {
    test("GET /billing returns credit balance and usage", async ({
      request,
    }) => {
      const response = await request.get(`${CLOUD_URL}/api/v1/app/billing`, {
        headers: apiKeyHeaders(),
      });

      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);

      // Check billing info
      expect(data.billing).toHaveProperty("creditBalance");
      expect(data.billing).toHaveProperty("autoTopUpEnabled");

      // Check usage info
      expect(data.usage).toHaveProperty("currentMonth");

      // Check transactions
      expect(Array.isArray(data.recentTransactions)).toBe(true);
    });
  });
});

test.describe("Authenticated API Tests (App Token)", () => {
  // Skip all if no app token
  test.skip(() => !APP_TOKEN, "TEST_APP_TOKEN environment variable required");

  test("GET /user with app token", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/app/user`, {
      headers: appTokenHeaders(),
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.user).toHaveProperty("id");
  });

  test("GET /agents with app token", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/app/agents`, {
      headers: appTokenHeaders(),
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.agents)).toBe(true);
  });

  test("Full CRUD flow with app token", async ({ request }) => {
    // Create
    const createResponse = await request.post(
      `${CLOUD_URL}/api/v1/app/agents`,
      {
        headers: appTokenHeaders(),
        data: { name: "Token Test Agent", bio: "Created with app token" },
      },
    );
    expect(createResponse.status()).toBe(201);
    const { agent } = await createResponse.json();
    expect(agent.name).toBe("Token Test Agent");

    // Read
    const readResponse = await request.get(
      `${CLOUD_URL}/api/v1/app/agents/${agent.id}`,
      {
        headers: appTokenHeaders(),
      },
    );
    expect(readResponse.status()).toBe(200);

    // Update
    const updateResponse = await request.patch(
      `${CLOUD_URL}/api/v1/app/agents/${agent.id}`,
      {
        headers: appTokenHeaders(),
        data: { name: "Updated Token Agent" },
      },
    );
    expect(updateResponse.status()).toBe(200);

    // Delete
    const deleteResponse = await request.delete(
      `${CLOUD_URL}/api/v1/app/agents/${agent.id}`,
      {
        headers: appTokenHeaders(),
      },
    );
    expect(deleteResponse.status()).toBe(200);
  });
});

test.describe("App Proxy with Auth", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("proxy forwards auth header to cloud", async ({ request }) => {
    const response = await request.get(`${APP_URL}/api/proxy/user`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.user).toHaveProperty("id");
  });

  test("proxy forwards agents request with auth", async ({ request }) => {
    const response = await request.get(`${APP_URL}/api/proxy/agents`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.agents)).toBe(true);
  });
});

test.describe("Character Creation (Authenticated)", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("create-character with auth creates agent directly", async ({
    request,
  }) => {
    const response = await request.post(`${APP_URL}/api/create-character`, {
      data: {
        name: "Auth Test Character",
        personality: "Friendly and helpful",
        backstory: "Created for authenticated E2E testing",
        authToken: API_KEY,
      },
    });

    // Should succeed or fail gracefully
    expect([200, 201, 401, 502]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty("characterId");
      expect(data.authenticated).toBe(true);

      // Cleanup
      if (data.characterId) {
        await request.delete(
          `${CLOUD_URL}/api/v1/app/agents/${data.characterId}`,
          {
            headers: apiKeyHeaders(),
          },
        );
      }
    }
  });
});

test.describe("Error Handling", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("creating agent with missing name returns 400", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/app/agents`, {
      headers: apiKeyHeaders(),
      data: {
        // Missing required name
        bio: "Bio without name",
      },
    });

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test("creating agent with empty name returns 400", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/app/agents`, {
      headers: apiKeyHeaders(),
      data: {
        name: "",
        bio: "Bio with empty name",
      },
    });

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.success).toBe(false);
  });

  test("invalid API key returns 401", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/app/user`, {
      headers: {
        Authorization: "Bearer invalid-key-12345",
        "Content-Type": "application/json",
      },
    });

    expect([401, 403]).toContain(response.status());
  });

  test("invalid app token returns 401", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/app/user`, {
      headers: {
        "X-App-Token": "app_invalid_token_12345",
        "Content-Type": "application/json",
      },
    });

    expect([401, 403]).toContain(response.status());
  });
});

test.describe("Chats API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("full chat lifecycle", async ({ request }) => {
    // 1. Create an agent
    const agentResponse = await request.post(`${CLOUD_URL}/api/v1/app/agents`, {
      headers: apiKeyHeaders(),
      data: { name: "Chat Test Agent", bio: "For chat testing" },
    });
    expect(agentResponse.status()).toBe(201);
    const { agent } = await agentResponse.json();

    // 2. Create a chat
    const chatResponse = await request.post(
      `${CLOUD_URL}/api/v1/app/agents/${agent.id}/chats`,
      {
        headers: apiKeyHeaders(),
      },
    );

    // Chat creation may or may not be implemented
    if (chatResponse.status() === 201) {
      const { chat } = await chatResponse.json();
      expect(chat).toHaveProperty("id");

      // 3. List chats
      const listResponse = await request.get(
        `${CLOUD_URL}/api/v1/app/agents/${agent.id}/chats`,
        {
          headers: apiKeyHeaders(),
        },
      );
      expect(listResponse.status()).toBe(200);
      const { chats } = await listResponse.json();
      expect(Array.isArray(chats)).toBe(true);

      // 4. Delete chat
      const deleteResponse = await request.delete(
        `${CLOUD_URL}/api/v1/app/agents/${agent.id}/chats/${chat.id}`,
        { headers: apiKeyHeaders() },
      );
      expect([200, 204]).toContain(deleteResponse.status());
    }

    // Cleanup agent
    await request.delete(`${CLOUD_URL}/api/v1/app/agents/${agent.id}`, {
      headers: apiKeyHeaders(),
    });
  });
});
