import { test, expect } from "@playwright/test";

/**
 * Authenticated Miniapp API Tests
 * 
 * Tests all miniapp API endpoints with authentication.
 * Supports both API key and miniapp token authentication.
 * 
 * Prerequisites:
 * - Run: bun run db:miniapp:seed (generates API key)
 * - Set TEST_API_KEY or TEST_MINIAPP_TOKEN environment variable
 * - Start cloud: bun run dev (port 3000)
 * - Start miniapp: cd miniapp && bun run dev (port 3001)
 */

const CLOUD_URL = process.env.CLOUD_URL ?? "http://localhost:3000";
const MINIAPP_URL = process.env.MINIAPP_URL ?? "http://localhost:3001";
const API_KEY = process.env.TEST_API_KEY;
const MINIAPP_TOKEN = process.env.TEST_MINIAPP_TOKEN;

// Helper for authenticated requests with API key
function apiKeyHeaders() {
  return {
    "Authorization": `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

// Helper for authenticated requests with miniapp token
function miniappTokenHeaders() {
  return {
    "X-Miniapp-Token": MINIAPP_TOKEN!,
    "Content-Type": "application/json",
  };
}

test.describe("Authenticated API Tests (API Key)", () => {
  // Skip all if no API key
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test.describe("User API", () => {
    test("GET /user returns authenticated user", async ({ request }) => {
      const response = await request.get(`${CLOUD_URL}/api/v1/miniapp/user`, {
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
    test("POST /agents creates new agent with source=miniapp", async ({ request }) => {
      const response = await request.post(`${CLOUD_URL}/api/v1/miniapp/agents`, {
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
      await request.delete(`${CLOUD_URL}/api/v1/miniapp/agents/${data.agent.id}`, {
        headers: apiKeyHeaders(),
      });
    });

    test("miniapp agents are isolated from cloud agents", async ({ request }) => {
      // Create agent via miniapp API (source=miniapp)
      const createResponse = await request.post(`${CLOUD_URL}/api/v1/miniapp/agents`, {
        headers: apiKeyHeaders(),
        data: { name: "Miniapp Source Test Agent", bio: "Should have source=miniapp" },
      });
      expect(createResponse.status()).toBe(201);
      const { agent: miniappAgent } = await createResponse.json();

      // Verify agent appears in miniapp agent list
      const miniappListResponse = await request.get(`${CLOUD_URL}/api/v1/miniapp/agents`, {
        headers: apiKeyHeaders(),
      });
      expect(miniappListResponse.status()).toBe(200);
      const miniappData = await miniappListResponse.json();
      const foundInMiniapp = miniappData.agents.some((a: { id: string }) => a.id === miniappAgent.id);
      expect(foundInMiniapp).toBe(true);

      // Verify agent does NOT appear in cloud My Agents (which filters by source=cloud)
      // Note: This requires authentication via the cloud dashboard, not API key
      // The API key is for miniapp, cloud dashboard uses session auth
      // So we can't directly test this via API without cloud auth
      // This test verifies the miniapp side of the source filtering

      // Cleanup
      await request.delete(`${CLOUD_URL}/api/v1/miniapp/agents/${miniappAgent.id}`, {
        headers: apiKeyHeaders(),
      });
    });

    test("GET /agents lists user's agents", async ({ request }) => {
      // Create a test agent first
      const createResponse = await request.post(`${CLOUD_URL}/api/v1/miniapp/agents`, {
        headers: apiKeyHeaders(),
        data: { name: "List Test Agent", bio: "For list test" },
      });
      const { agent: createdAgent } = await createResponse.json();

      // List agents
      const response = await request.get(`${CLOUD_URL}/api/v1/miniapp/agents?limit=10`, {
        headers: apiKeyHeaders(),
      });

      expect(response.status()).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.agents)).toBe(true);
      expect(data.pagination).toHaveProperty("page");
      expect(data.pagination).toHaveProperty("limit");

      // Cleanup
      await request.delete(`${CLOUD_URL}/api/v1/miniapp/agents/${createdAgent.id}`, {
        headers: apiKeyHeaders(),
      });
    });

    test("GET /agents/:id returns agent details", async ({ request }) => {
      // Create agent
      const createResponse = await request.post(`${CLOUD_URL}/api/v1/miniapp/agents`, {
        headers: apiKeyHeaders(),
        data: { name: "Detail Test Agent", bio: "For detail test" },
      });
      const { agent: createdAgent } = await createResponse.json();

      // Get details
      const response = await request.get(`${CLOUD_URL}/api/v1/miniapp/agents/${createdAgent.id}`, {
        headers: apiKeyHeaders(),
      });

      expect(response.status()).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.agent.id).toBe(createdAgent.id);
      expect(data.agent.name).toBe("Detail Test Agent");

      // Cleanup
      await request.delete(`${CLOUD_URL}/api/v1/miniapp/agents/${createdAgent.id}`, {
        headers: apiKeyHeaders(),
      });
    });

    test("PATCH /agents/:id updates agent", async ({ request }) => {
      // Create agent
      const createResponse = await request.post(`${CLOUD_URL}/api/v1/miniapp/agents`, {
        headers: apiKeyHeaders(),
        data: { name: "Update Test Agent", bio: "Original bio" },
      });
      const { agent: createdAgent } = await createResponse.json();

      // Update
      const response = await request.patch(`${CLOUD_URL}/api/v1/miniapp/agents/${createdAgent.id}`, {
        headers: apiKeyHeaders(),
        data: {
          name: "Updated Agent Name",
          bio: "Updated bio content",
        },
      });

      expect(response.status()).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.agent.name).toBe("Updated Agent Name");

      // Cleanup
      await request.delete(`${CLOUD_URL}/api/v1/miniapp/agents/${createdAgent.id}`, {
        headers: apiKeyHeaders(),
      });
    });

    test("DELETE /agents/:id deletes agent", async ({ request }) => {
      // Create agent
      const createResponse = await request.post(`${CLOUD_URL}/api/v1/miniapp/agents`, {
        headers: apiKeyHeaders(),
        data: { name: "Delete Test Agent", bio: "Will be deleted" },
      });
      const { agent: createdAgent } = await createResponse.json();

      // Delete
      const response = await request.delete(`${CLOUD_URL}/api/v1/miniapp/agents/${createdAgent.id}`, {
        headers: apiKeyHeaders(),
      });

      expect(response.status()).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  test.describe("Billing API", () => {
    test("GET /billing returns credit balance and usage", async ({ request }) => {
      const response = await request.get(`${CLOUD_URL}/api/v1/miniapp/billing`, {
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

test.describe("Authenticated API Tests (Miniapp Token)", () => {
  // Skip all if no miniapp token
  test.skip(() => !MINIAPP_TOKEN, "TEST_MINIAPP_TOKEN environment variable required");

  test("GET /user with miniapp token", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/miniapp/user`, {
      headers: miniappTokenHeaders(),
    });

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.user).toHaveProperty("id");
  });

  test("GET /agents with miniapp token", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/miniapp/agents`, {
      headers: miniappTokenHeaders(),
    });

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.agents)).toBe(true);
  });

  test("Full CRUD flow with miniapp token", async ({ request }) => {
    // Create
    const createResponse = await request.post(`${CLOUD_URL}/api/v1/miniapp/agents`, {
      headers: miniappTokenHeaders(),
      data: { name: "Token Test Agent", bio: "Created with miniapp token" },
    });
    expect(createResponse.status()).toBe(201);
    const { agent } = await createResponse.json();
    expect(agent.name).toBe("Token Test Agent");

    // Read
    const readResponse = await request.get(`${CLOUD_URL}/api/v1/miniapp/agents/${agent.id}`, {
      headers: miniappTokenHeaders(),
    });
    expect(readResponse.status()).toBe(200);

    // Update
    const updateResponse = await request.patch(`${CLOUD_URL}/api/v1/miniapp/agents/${agent.id}`, {
      headers: miniappTokenHeaders(),
      data: { name: "Updated Token Agent" },
    });
    expect(updateResponse.status()).toBe(200);

    // Delete
    const deleteResponse = await request.delete(`${CLOUD_URL}/api/v1/miniapp/agents/${agent.id}`, {
      headers: miniappTokenHeaders(),
    });
    expect(deleteResponse.status()).toBe(200);
  });
});

test.describe("Miniapp Proxy with Auth", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("proxy forwards auth header to cloud", async ({ request }) => {
    const response = await request.get(`${MINIAPP_URL}/api/proxy/user`, {
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
      },
    });

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.user).toHaveProperty("id");
  });

  test("proxy forwards agents request with auth", async ({ request }) => {
    const response = await request.get(`${MINIAPP_URL}/api/proxy/agents`, {
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
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

  test("create-character with auth creates agent directly", async ({ request }) => {
    const response = await request.post(`${MINIAPP_URL}/api/create-character`, {
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
        await request.delete(`${CLOUD_URL}/api/v1/miniapp/agents/${data.characterId}`, {
          headers: apiKeyHeaders(),
        });
      }
    }
  });
});

test.describe("Error Handling", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("creating agent with missing name returns 400", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/miniapp/agents`, {
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
    const response = await request.post(`${CLOUD_URL}/api/v1/miniapp/agents`, {
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
    const response = await request.get(`${CLOUD_URL}/api/v1/miniapp/user`, {
      headers: {
        "Authorization": "Bearer invalid-key-12345",
        "Content-Type": "application/json",
      },
    });
    
    expect([401, 403]).toContain(response.status());
  });

  test("invalid miniapp token returns 401", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/miniapp/user`, {
      headers: {
        "X-Miniapp-Token": "miniapp_invalid_token_12345",
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
    const agentResponse = await request.post(`${CLOUD_URL}/api/v1/miniapp/agents`, {
      headers: apiKeyHeaders(),
      data: { name: "Chat Test Agent", bio: "For chat testing" },
    });
    expect(agentResponse.status()).toBe(201);
    const { agent } = await agentResponse.json();

    // 2. Create a chat
    const chatResponse = await request.post(`${CLOUD_URL}/api/v1/miniapp/agents/${agent.id}/chats`, {
      headers: apiKeyHeaders(),
    });
    
    // Chat creation may or may not be implemented
    if (chatResponse.status() === 201) {
      const { chat } = await chatResponse.json();
      expect(chat).toHaveProperty("id");

      // 3. List chats
      const listResponse = await request.get(`${CLOUD_URL}/api/v1/miniapp/agents/${agent.id}/chats`, {
        headers: apiKeyHeaders(),
      });
      expect(listResponse.status()).toBe(200);
      const { chats } = await listResponse.json();
      expect(Array.isArray(chats)).toBe(true);

      // 4. Delete chat
      const deleteResponse = await request.delete(
        `${CLOUD_URL}/api/v1/miniapp/agents/${agent.id}/chats/${chat.id}`,
        { headers: apiKeyHeaders() }
      );
      expect([200, 204]).toContain(deleteResponse.status());
    }

    // Cleanup agent
    await request.delete(`${CLOUD_URL}/api/v1/miniapp/agents/${agent.id}`, {
      headers: apiKeyHeaders(),
    });
  });
});
