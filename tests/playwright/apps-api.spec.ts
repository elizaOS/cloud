import { test, expect } from "@playwright/test";

// Prerequisites: TEST_API_KEY env var required, cloud running on port 3000

const CLOUD_URL = process.env.CLOUD_URL ?? "http://localhost:3000";
const API_KEY = process.env.TEST_API_KEY;

// Helper for authenticated requests
function authHeaders() {
  return {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  };
}

const testAppData = {
  name: "E2E Test App",
  description: "App created for E2E testing",
  app_url: "https://test-app.example.com",
  allowed_origins: ["https://test-app.example.com"],
};

test.describe("Apps API - CRUD Operations", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let createdAppId: string | null = null;

  test.afterEach(async ({ request }) => {
    if (createdAppId) {
      await request.delete(`${CLOUD_URL}/api/v1/apps/${createdAppId}`, {
        headers: authHeaders(),
      });
      createdAppId = null;
    }
  });

  test("POST /apps creates a new app", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/apps`, {
      headers: authHeaders(),
      data: testAppData,
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.app).toHaveProperty("id");
    expect(data.app.name).toBe(testAppData.name);
    expect(data.app.description).toBe(testAppData.description);
    expect(data.app.app_url).toBe(testAppData.app_url);
    expect(data.app).toHaveProperty("slug");
    expect(data.apiKey).toBeTruthy(); // API key returned on creation

    createdAppId = data.app.id;
  });

  test("GET /apps lists all apps", async ({ request }) => {
    // Create app first
    const createResponse = await request.post(`${CLOUD_URL}/api/v1/apps`, {
      headers: authHeaders(),
      data: { ...testAppData, name: "List Test App" },
    });
    const { app: createdApp } = await createResponse.json();
    createdAppId = createdApp.id;

    // List apps
    const response = await request.get(`${CLOUD_URL}/api/v1/apps`, {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.apps)).toBe(true);
    expect(data.apps.length).toBeGreaterThan(0);

    const foundApp = data.apps.find(
      (app: { id: string }) => app.id === createdAppId,
    );
    expect(foundApp).toBeTruthy();
  });

  test("GET /apps/:id returns app details", async ({ request }) => {
    // Create app
    const createResponse = await request.post(`${CLOUD_URL}/api/v1/apps`, {
      headers: authHeaders(),
      data: { ...testAppData, name: "Detail Test App" },
    });
    const { app: createdApp } = await createResponse.json();
    createdAppId = createdApp.id;

    // Get details
    const response = await request.get(
      `${CLOUD_URL}/api/v1/apps/${createdAppId}`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.app.id).toBe(createdAppId);
    expect(data.app.name).toBe("Detail Test App");
    expect(data.app).toHaveProperty("monetization_enabled");
    expect(data.app).toHaveProperty("inference_markup_percentage");
    expect(data.app).toHaveProperty("purchase_share_percentage");
  });

  test("PUT /apps/:id updates an app", async ({ request }) => {
    // Create app
    const createResponse = await request.post(`${CLOUD_URL}/api/v1/apps`, {
      headers: authHeaders(),
      data: testAppData,
    });
    const { app: createdApp } = await createResponse.json();
    createdAppId = createdApp.id;

    // Update app
    const response = await request.put(
      `${CLOUD_URL}/api/v1/apps/${createdAppId}`,
      {
        headers: authHeaders(),
        data: {
          name: "Updated App Name",
          description: "Updated description",
        },
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.app.name).toBe("Updated App Name");
    expect(data.app.description).toBe("Updated description");
  });

  test("DELETE /apps/:id deletes an app", async ({ request }) => {
    // Create app
    const createResponse = await request.post(`${CLOUD_URL}/api/v1/apps`, {
      headers: authHeaders(),
      data: { ...testAppData, name: "Delete Test App" },
    });
    const { app: createdApp } = await createResponse.json();

    // Delete app
    const response = await request.delete(
      `${CLOUD_URL}/api/v1/apps/${createdApp.id}`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);

    // Verify it's deleted
    const getResponse = await request.get(
      `${CLOUD_URL}/api/v1/apps/${createdApp.id}`,
      {
        headers: authHeaders(),
      },
    );
    expect(getResponse.status()).toBe(404);

    createdAppId = null;
  });
});

test.describe("Apps API - Monetization Settings", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testAppId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/apps`, {
      headers: authHeaders(),
      data: { ...testAppData, name: "Monetization Test App" },
    });
    const { app } = await response.json();
    testAppId = app.id;
  });

  test.afterAll(async ({ request }) => {
    if (testAppId) {
      await request.delete(`${CLOUD_URL}/api/v1/apps/${testAppId}`, {
        headers: authHeaders(),
      });
    }
  });

  test("GET /apps/:id/monetization returns monetization settings", async ({
    request,
  }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/monetization`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.monetization).toHaveProperty("monetizationEnabled");
    expect(data.monetization).toHaveProperty("inferenceMarkupPercentage");
    expect(data.monetization).toHaveProperty("purchaseSharePercentage");
    expect(data.monetization).toHaveProperty("platformOffsetAmount");
    expect(data.monetization).toHaveProperty("totalCreatorEarnings");
  });

  test("PUT /apps/:id/monetization enables monetization", async ({
    request,
  }) => {
    const response = await request.put(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/monetization`,
      {
        headers: authHeaders(),
        data: {
          monetizationEnabled: true,
          inferenceMarkupPercentage: 25,
          purchaseSharePercentage: 15,
        },
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.monetization.monetizationEnabled).toBe(true);
    expect(data.monetization.inferenceMarkupPercentage).toBe(25);
    expect(data.monetization.purchaseSharePercentage).toBe(15);
  });

  test("PUT /apps/:id/monetization validates markup range (0-1000%)", async ({
    request,
  }) => {
    const response0 = await request.put(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/monetization`,
      {
        headers: authHeaders(),
        data: { inferenceMarkupPercentage: 0 },
      },
    );
    expect(response0.status()).toBe(200);

    const response1000 = await request.put(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/monetization`,
      {
        headers: authHeaders(),
        data: { inferenceMarkupPercentage: 1000 },
      },
    );
    expect(response1000.status()).toBe(200);

    const responseNegative = await request.put(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/monetization`,
      {
        headers: authHeaders(),
        data: { inferenceMarkupPercentage: -10 },
      },
    );
    expect(responseNegative.status()).toBe(400);

    const responseTooHigh = await request.put(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/monetization`,
      {
        headers: authHeaders(),
        data: { inferenceMarkupPercentage: 1001 },
      },
    );
    expect(responseTooHigh.status()).toBe(400);
  });

  test("PUT /apps/:id/monetization validates purchase share (0-100%)", async ({
    request,
  }) => {
    const response0 = await request.put(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/monetization`,
      {
        headers: authHeaders(),
        data: { purchaseSharePercentage: 0 },
      },
    );
    expect(response0.status()).toBe(200);

    const response100 = await request.put(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/monetization`,
      {
        headers: authHeaders(),
        data: { purchaseSharePercentage: 100 },
      },
    );
    expect(response100.status()).toBe(200);

    const responseTooHigh = await request.put(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/monetization`,
      {
        headers: authHeaders(),
        data: { purchaseSharePercentage: 101 },
      },
    );
    expect(responseTooHigh.status()).toBe(400);
  });

  test("PUT /apps/:id/monetization disables monetization", async ({
    request,
  }) => {
    const response = await request.put(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/monetization`,
      {
        headers: authHeaders(),
        data: {
          monetizationEnabled: false,
        },
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.monetization.monetizationEnabled).toBe(false);
  });
});

test.describe("Apps API - Earnings", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testAppId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/apps`, {
      headers: authHeaders(),
      data: { ...testAppData, name: "Earnings Test App" },
    });
    const { app } = await response.json();
    testAppId = app.id;

    await request.put(`${CLOUD_URL}/api/v1/apps/${testAppId}/monetization`, {
      headers: authHeaders(),
      data: { monetizationEnabled: true },
    });
  });

  test.afterAll(async ({ request }) => {
    if (testAppId) {
      await request.delete(`${CLOUD_URL}/api/v1/apps/${testAppId}`, {
        headers: authHeaders(),
      });
    }
  });

  test("GET /apps/:id/earnings returns earnings dashboard data", async ({
    request,
  }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/earnings`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.earnings).toHaveProperty("summary");
    expect(data.earnings).toHaveProperty("breakdown");
    expect(data.earnings).toHaveProperty("recentTransactions");
    expect(data.earnings).toHaveProperty("chartData");

    if (data.earnings.breakdown) {
      expect(data.earnings.breakdown).toHaveProperty("today");
      expect(data.earnings.breakdown).toHaveProperty("thisWeek");
      expect(data.earnings.breakdown).toHaveProperty("thisMonth");
      expect(data.earnings.breakdown).toHaveProperty("allTime");
    }

    expect(data.monetization).toHaveProperty("enabled");
    expect(data.monetization).toHaveProperty("inferenceMarkupPercentage");
  });

  test("GET /apps/:id/earnings supports days query parameter", async ({
    request,
  }) => {
    const response7 = await request.get(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/earnings?days=7`,
      { headers: authHeaders() },
    );
    expect(response7.status()).toBe(200);

    const response30 = await request.get(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/earnings?days=30`,
      { headers: authHeaders() },
    );
    expect(response30.status()).toBe(200);

    const response90 = await request.get(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/earnings?days=90`,
      { headers: authHeaders() },
    );
    expect(response90.status()).toBe(200);
  });

  test("GET /apps/:id/earnings/history returns transaction history", async ({
    request,
  }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/earnings/history`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.transactions)).toBe(true);
    expect(data.pagination).toHaveProperty("limit");
    expect(data.pagination).toHaveProperty("offset");
  });

  test("GET /apps/:id/earnings/history supports pagination", async ({
    request,
  }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/earnings/history?limit=10&offset=0`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.pagination.limit).toBe(10);
    expect(data.pagination.offset).toBe(0);
  });

  test("GET /apps/:id/earnings/history supports type filter", async ({
    request,
  }) => {
    const responseInference = await request.get(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/earnings/history?type=inference_markup`,
      { headers: authHeaders() },
    );
    expect(responseInference.status()).toBe(200);

    const responsePurchase = await request.get(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/earnings/history?type=purchase_share`,
      { headers: authHeaders() },
    );
    expect(responsePurchase.status()).toBe(200);
  });
});

test.describe("Apps API - App Users", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testAppId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/apps`, {
      headers: authHeaders(),
      data: { ...testAppData, name: "Users Test App" },
    });
    const { app } = await response.json();
    testAppId = app.id;
  });

  test.afterAll(async ({ request }) => {
    if (testAppId) {
      await request.delete(`${CLOUD_URL}/api/v1/apps/${testAppId}`, {
        headers: authHeaders(),
      });
    }
  });

  test("GET /apps/:id/users returns app users list", async ({ request }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/users`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.users)).toBe(true);
    expect(data).toHaveProperty("pagination");
  });
});

test.describe("Apps API - App Analytics", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  let testAppId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/apps`, {
      headers: authHeaders(),
      data: { ...testAppData, name: "Analytics Test App" },
    });
    const { app } = await response.json();
    testAppId = app.id;
  });

  test.afterAll(async ({ request }) => {
    if (testAppId) {
      await request.delete(`${CLOUD_URL}/api/v1/apps/${testAppId}`, {
        headers: authHeaders(),
      });
    }
  });

  test("GET /apps/:id/analytics returns analytics data", async ({
    request,
  }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/analytics`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.analytics)).toBe(true);
  });

  test("GET /apps/:id/analytics supports period parameter", async ({
    request,
  }) => {
    const responseDaily = await request.get(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/analytics?period=daily`,
      { headers: authHeaders() },
    );
    expect(responseDaily.status()).toBe(200);

    const responseHourly = await request.get(
      `${CLOUD_URL}/api/v1/apps/${testAppId}/analytics?period=hourly`,
      { headers: authHeaders() },
    );
    expect(responseHourly.status()).toBe(200);
  });
});

test.describe("Apps API - Error Handling", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /apps/:id returns 404 for non-existent app", async ({
    request,
  }) => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const response = await request.get(`${CLOUD_URL}/api/v1/apps/${fakeId}`, {
      headers: authHeaders(),
    });

    expect(response.status()).toBe(404);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBeTruthy();
  });

  test("POST /apps returns 400 for missing required fields", async ({
    request,
  }) => {
    const responseMissingName = await request.post(`${CLOUD_URL}/api/v1/apps`, {
      headers: authHeaders(),
      data: { app_url: "https://example.com" },
    });
    expect(responseMissingName.status()).toBe(400);

    const responseMissingUrl = await request.post(`${CLOUD_URL}/api/v1/apps`, {
      headers: authHeaders(),
      data: { name: "Test App" },
    });
    expect(responseMissingUrl.status()).toBe(400);
  });

  test("POST /apps returns 400 for invalid URL", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/apps`, {
      headers: authHeaders(),
      data: {
        name: "Test App",
        app_url: "not-a-valid-url",
      },
    });

    expect(response.status()).toBe(400);
  });

  test("PUT /apps/:id returns 404 for non-existent app", async ({
    request,
  }) => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const response = await request.put(`${CLOUD_URL}/api/v1/apps/${fakeId}`, {
      headers: authHeaders(),
      data: { name: "Updated Name" },
    });

    expect(response.status()).toBe(404);
  });

  test("DELETE /apps/:id returns 404 for non-existent app", async ({
    request,
  }) => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const response = await request.delete(
      `${CLOUD_URL}/api/v1/apps/${fakeId}`,
      {
        headers: authHeaders(),
      },
    );

    expect(response.status()).toBe(404);
  });

  test("returns 401 for unauthenticated requests", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/apps`, {
      headers: { "Content-Type": "application/json" },
    });

    expect([401, 403]).toContain(response.status());
  });

  test("returns 401 for invalid API key", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/apps`, {
      headers: {
        Authorization: "Bearer invalid-api-key-12345",
        "Content-Type": "application/json",
      },
    });

    expect([401, 403]).toContain(response.status());
  });
});

test.describe("Apps API - Full Lifecycle", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("complete app lifecycle with monetization", async ({ request }) => {
    const createResponse = await request.post(`${CLOUD_URL}/api/v1/apps`, {
      headers: authHeaders(),
      data: {
        name: "Lifecycle Test App",
        description: "Testing full app lifecycle",
        app_url: "https://lifecycle-test.example.com",
      },
    });
    expect(createResponse.status()).toBe(200);

    const { app, apiKey } = await createResponse.json();
    expect(app.id).toBeTruthy();
    expect(apiKey).toBeTruthy();

    try {
      const getResponse = await request.get(
        `${CLOUD_URL}/api/v1/apps/${app.id}`,
        { headers: authHeaders() },
      );
      expect(getResponse.status()).toBe(200);

      const monetizationResponse = await request.put(
        `${CLOUD_URL}/api/v1/apps/${app.id}/monetization`,
        {
          headers: authHeaders(),
          data: {
            monetizationEnabled: true,
            inferenceMarkupPercentage: 50,
            purchaseSharePercentage: 20,
          },
        },
      );
      expect(monetizationResponse.status()).toBe(200);

      const monetizationData = await monetizationResponse.json();
      expect(monetizationData.monetization.monetizationEnabled).toBe(true);
      expect(monetizationData.monetization.inferenceMarkupPercentage).toBe(50);

      const earningsResponse = await request.get(
        `${CLOUD_URL}/api/v1/apps/${app.id}/earnings`,
        { headers: authHeaders() },
      );
      expect(earningsResponse.status()).toBe(200);
      expect((await earningsResponse.json()).monetization.enabled).toBe(true);

      const updateResponse = await request.put(
        `${CLOUD_URL}/api/v1/apps/${app.id}`,
        {
          headers: authHeaders(),
          data: { name: "Updated Lifecycle App" },
        },
      );
      expect(updateResponse.status()).toBe(200);

      const analyticsResponse = await request.get(
        `${CLOUD_URL}/api/v1/apps/${app.id}/analytics`,
        { headers: authHeaders() },
      );
      expect(analyticsResponse.status()).toBe(200);

      const usersResponse = await request.get(
        `${CLOUD_URL}/api/v1/apps/${app.id}/users`,
        { headers: authHeaders() },
      );
      expect(usersResponse.status()).toBe(200);

      const disableResponse = await request.put(
        `${CLOUD_URL}/api/v1/apps/${app.id}/monetization`,
        {
          headers: authHeaders(),
          data: { monetizationEnabled: false },
        },
      );
      expect(disableResponse.status()).toBe(200);

      const deleteResponse = await request.delete(
        `${CLOUD_URL}/api/v1/apps/${app.id}`,
        { headers: authHeaders() },
      );
      expect(deleteResponse.status()).toBe(200);

      const verifyResponse = await request.get(
        `${CLOUD_URL}/api/v1/apps/${app.id}`,
        { headers: authHeaders() },
      );
      expect(verifyResponse.status()).toBe(404);
    } catch (error) {
      await request.delete(`${CLOUD_URL}/api/v1/apps/${app.id}`, {
        headers: authHeaders(),
      });
      throw error;
    }
  });
});

test.describe("Apps API - API Key Regeneration", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /apps/:id/regenerate-api-key generates new API key", async ({
    request,
  }) => {
    const createResponse = await request.post(`${CLOUD_URL}/api/v1/apps`, {
      headers: authHeaders(),
      data: { ...testAppData, name: "API Key Regen Test" },
    });
    const { app: createdApp, apiKey: originalApiKey } =
      await createResponse.json();

    try {
      const regenResponse = await request.post(
        `${CLOUD_URL}/api/v1/apps/${createdApp.id}/regenerate-api-key`,
        { headers: authHeaders() },
      );
      expect(regenResponse.status()).toBe(200);

      const regenData = await regenResponse.json();
      expect(regenData.success).toBe(true);
      expect(regenData.apiKey).toBeTruthy();
      expect(regenData.apiKey).not.toBe(originalApiKey);
    } finally {
      await request.delete(`${CLOUD_URL}/api/v1/apps/${createdApp.id}`, {
        headers: authHeaders(),
      });
    }
  });
});
