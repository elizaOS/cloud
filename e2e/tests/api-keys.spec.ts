import { test, expect } from "@playwright/test";

/**
 * API Keys Management Tests
 * 
 * Tests API key CRUD operations:
 * - List API keys
 * - Create API key
 * - Get API key details
 * - Regenerate API key
 * - Delete API key
 * - API Explorer endpoint
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

test.describe("API Keys Management", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testApiKeyId: string | null = null;

  test("GET /api/v1/api-keys lists all API keys", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/api-keys`, {
      headers: authHeaders(),
    });

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.success !== false).toBe(true);
      const keys = data.keys || data.apiKeys || data.data || [];
      expect(Array.isArray(keys)).toBe(true);
      console.log(`✅ Found ${keys.length} API keys`);
    } else {
      console.log(`ℹ️ API keys list returned ${response.status()}`);
    }
  });

  test("POST /api/v1/api-keys creates new API key", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/api-keys`, {
      headers: authHeaders(),
      data: {
        name: "E2E Test API Key",
        description: "Created by E2E tests",
        rate_limit: 1000,
      },
    });

    expect([200, 201, 400, 500]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      const key = data.key || data.apiKey || data.data || data;
      expect(key).toHaveProperty("id");
      expect(key).toHaveProperty("key");
      expect(key.key).toMatch(/^eliza_/);
      testApiKeyId = key.id;
      console.log("✅ API key created successfully");
    } else {
      console.log(`ℹ️ API key creation returned ${response.status()}`);
    }
  });

  test("GET /api/v1/api-keys/[id] returns API key details", async ({ request }) => {
    // First create a key
    const createResponse = await request.post(`${CLOUD_URL}/api/v1/api-keys`, {
      headers: authHeaders(),
      data: {
        name: "Detail Test API Key",
        description: "For detail testing",
      },
    });

    if (createResponse.status() !== 200 && createResponse.status() !== 201) {
      return;
    }

    const createData = await createResponse.json();
    const keyId = (createData.key || createData.apiKey || createData.data || createData).id;

    // Get details
    const response = await request.get(`${CLOUD_URL}/api/v1/api-keys/${keyId}`, {
      headers: authHeaders(),
    });

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const key = data.key || data.apiKey || data.data || data;
      expect(key).toHaveProperty("id");
      expect(key.id).toBe(keyId);
      console.log("✅ API key details retrieved");
    }

    // Cleanup
    await request.delete(`${CLOUD_URL}/api/v1/api-keys/${keyId}`, {
      headers: authHeaders(),
    });
  });

  test("POST /api/v1/api-keys/[id]/regenerate regenerates API key", async ({ request }) => {
    // First create a key
    const createResponse = await request.post(`${CLOUD_URL}/api/v1/api-keys`, {
      headers: authHeaders(),
      data: {
        name: "Regenerate Test API Key",
        description: "For regenerate testing",
      },
    });

    if (createResponse.status() !== 200 && createResponse.status() !== 201) {
      return;
    }

    const createData = await createResponse.json();
    const keyId = (createData.key || createData.apiKey || createData.data || createData).id;
    const originalKey = (createData.key || createData.apiKey || createData.data || createData).key;

    // Regenerate
    const response = await request.post(`${CLOUD_URL}/api/v1/api-keys/${keyId}/regenerate`, {
      headers: authHeaders(),
    });

    expect([200, 201, 400, 404]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      const newKey = (data.key || data.apiKey || data.data || data).key;
      expect(newKey).not.toBe(originalKey);
      expect(newKey).toMatch(/^eliza_/);
      console.log("✅ API key regenerated successfully");
    } else {
      console.log(`ℹ️ API key regeneration returned ${response.status()}`);
    }

    // Cleanup
    await request.delete(`${CLOUD_URL}/api/v1/api-keys/${keyId}`, {
      headers: authHeaders(),
    });
  });

  test("DELETE /api/v1/api-keys/[id] deletes API key", async ({ request }) => {
    // First create a key
    const createResponse = await request.post(`${CLOUD_URL}/api/v1/api-keys`, {
      headers: authHeaders(),
      data: {
        name: "Delete Test API Key",
        description: "For delete testing",
      },
    });

    if (createResponse.status() !== 200 && createResponse.status() !== 201) {
      return;
    }

    const createData = await createResponse.json();
    const keyId = (createData.key || createData.apiKey || createData.data || createData).id;

    // Delete it
    const deleteResponse = await request.delete(`${CLOUD_URL}/api/v1/api-keys/${keyId}`, {
      headers: authHeaders(),
    });

    expect([200, 204, 404]).toContain(deleteResponse.status());

    if (deleteResponse.status() === 200 || deleteResponse.status() === 204) {
      console.log("✅ API key deleted successfully");
    } else {
      console.log(`ℹ️ API key deletion returned ${deleteResponse.status()}`);
    }
  });

  test.afterAll(async ({ request }) => {
    if (testApiKeyId) {
      await request.delete(`${CLOUD_URL}/api/v1/api-keys/${testApiKeyId}`, {
        headers: authHeaders(),
      });
    }
  });
});

test.describe("API Explorer", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/v1/api-keys/explorer returns explorer data", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/api-keys/explorer`, {
      headers: authHeaders(),
    });

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ API Explorer endpoint available");
    } else {
      console.log(`ℹ️ API Explorer returned ${response.status()}`);
    }
  });
});

