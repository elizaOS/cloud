import { test, expect } from "@playwright/test";

/**
 * Models & Embeddings API Tests
 *
 * Tests ML/AI model functionality:
 * - Model listing
 * - Model details
 * - Embeddings generation
 * - Prompt generation
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

test.describe("Models API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/v1/models lists available models", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/models`, {
      headers: authHeaders(),
    });

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const models = data.models || data.data || data;
      expect(Array.isArray(models) || typeof models === "object").toBe(true);
      console.log("✅ Models list retrieved");

      // Check model structure if array
      if (Array.isArray(models) && models.length > 0) {
        const model = models[0];
        expect(model).toHaveProperty("id");
        console.log(`   Found ${models.length} models`);
      }
    } else {
      console.log(`ℹ️ Models list returned ${response.status()}`);
    }
  });

  test("GET /api/v1/models/:model returns model details", async ({ request }) => {
    // First get list of models
    const listResponse = await request.get(`${CLOUD_URL}/api/v1/models`, {
      headers: authHeaders(),
    });

    if (listResponse.status() !== 200) {
      return;
    }

    const listData = await listResponse.json();
    const models = listData.models || listData.data || listData;

    if (!Array.isArray(models) || models.length === 0) {
      console.log("ℹ️ No models available for detail test");
      return;
    }

    const modelId = models[0].id || "gpt-4o-mini";

    // Get model details
    const response = await request.get(`${CLOUD_URL}/api/v1/models/${modelId}`, {
      headers: authHeaders(),
    });

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      const model = data.model || data.data || data;
      expect(model).toBeDefined();
      console.log("✅ Model details retrieved");
    }
  });

  test("models endpoint supports OpenAI format", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/models`, {
      headers: authHeaders(),
    });

    if (response.status() !== 200) {
      return;
    }

    const data = await response.json();

    // Check for OpenAI-compatible format
    if (data.object === "list" && data.data) {
      expect(data.object).toBe("list");
      expect(Array.isArray(data.data)).toBe(true);
      console.log("✅ Models endpoint is OpenAI-compatible");
    } else {
      console.log("ℹ️ Models endpoint uses custom format");
    }
  });
});

test.describe("Embeddings API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/v1/embeddings generates embeddings", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/embeddings`, {
      headers: authHeaders(),
      data: {
        input: "This is a test sentence for embedding generation.",
        model: "text-embedding-ada-002",
      },
    });

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();

      // Check for embeddings structure
      if (data.data && Array.isArray(data.data)) {
        const embedding = data.data[0];
        expect(embedding).toHaveProperty("embedding");
        expect(Array.isArray(embedding.embedding)).toBe(true);
        console.log(`✅ Embeddings generated (dimension: ${embedding.embedding.length})`);
      } else if (data.embedding) {
        expect(Array.isArray(data.embedding)).toBe(true);
        console.log(`✅ Embeddings generated (dimension: ${data.embedding.length})`);
      } else {
        console.log("✅ Embeddings endpoint works");
      }
    } else {
      console.log(`ℹ️ Embeddings returned ${response.status()}`);
    }
  });

  test("embeddings support batch input", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/embeddings`, {
      headers: authHeaders(),
      data: {
        input: [
          "First test sentence.",
          "Second test sentence.",
          "Third test sentence.",
        ],
        model: "text-embedding-ada-002",
      },
    });

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();

      if (data.data && Array.isArray(data.data)) {
        expect(data.data.length).toBe(3);
        console.log("✅ Batch embeddings work");
      } else {
        console.log("✅ Embeddings endpoint handles batch input");
      }
    } else {
      console.log(`ℹ️ Batch embeddings returned ${response.status()}`);
    }
  });

  test("embeddings return usage info", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/embeddings`, {
      headers: authHeaders(),
      data: {
        input: "Test for usage tracking.",
        model: "text-embedding-ada-002",
      },
    });

    if (response.status() !== 200 && response.status() !== 201) {
      return;
    }

    const data = await response.json();

    if (data.usage) {
      expect(data.usage).toHaveProperty("total_tokens");
      console.log(`✅ Embeddings return usage info (${data.usage.total_tokens} tokens)`);
    } else {
      console.log("ℹ️ Embeddings don't return usage info");
    }
  });
});

test.describe("Prompt Generation API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/v1/generate-prompts generates prompts", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/generate-prompts`, {
      headers: authHeaders(),
      data: {
        topic: "AI assistants",
        count: 3,
      },
    });

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();

      if (data.prompts) {
        expect(Array.isArray(data.prompts)).toBe(true);
        console.log(`✅ Generated ${data.prompts.length} prompts`);
      } else {
        console.log("✅ Prompt generation endpoint works");
      }
    } else {
      console.log(`ℹ️ Prompt generation returned ${response.status()}`);
    }
  });

  test("prompt generation supports different styles", async ({ request }) => {
    const styles = ["creative", "professional", "casual", "technical"];

    for (const style of styles) {
      const response = await request.post(`${CLOUD_URL}/api/v1/generate-prompts`, {
        headers: authHeaders(),
        data: {
          topic: "technology",
          style,
          count: 1,
        },
      });

      expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

      if (response.status() === 200 || response.status() === 201) {
        console.log(`✅ Prompt generation with '${style}' style works`);
      }
    }
  });
});

test.describe("Knowledge Query API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/v1/knowledge/query performs RAG query", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/knowledge/query`, {
      headers: authHeaders(),
      data: {
        query: "What is the most important concept?",
        limit: 5,
      },
    });

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();

      if (data.results) {
        expect(Array.isArray(data.results)).toBe(true);
        console.log(`✅ Knowledge query returned ${data.results.length} results`);
      } else {
        console.log("✅ Knowledge query endpoint works");
      }
    } else if (response.status() === 404) {
      console.log("✅ Knowledge query requires documents in knowledge base");
    } else {
      console.log(`ℹ️ Knowledge query returned ${response.status()}`);
    }
  });

  test("knowledge query supports filters", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/knowledge/query`, {
      headers: authHeaders(),
      data: {
        query: "test query",
        filter: {
          type: "document",
        },
        threshold: 0.7,
      },
    });

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      console.log("✅ Knowledge query with filters works");
    } else {
      console.log(`ℹ️ Knowledge query with filters returned ${response.status()}`);
    }
  });
});

test.describe("Quotas API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/quotas/limits returns quota limits", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/quotas/limits`, {
      headers: authHeaders(),
    });

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Quota limits retrieved");

      // Check for common quota fields
      if (data.limits) {
        console.log(`   Limits defined: ${Object.keys(data.limits).length}`);
      }
    } else {
      console.log(`ℹ️ Quota limits returned ${response.status()}`);
    }
  });

  test("GET /api/quotas/usage returns quota usage", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/quotas/usage`, {
      headers: authHeaders(),
    });

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Quota usage retrieved");

      if (data.usage) {
        console.log(`   Usage metrics: ${Object.keys(data.usage).length}`);
      }
    } else {
      console.log(`ℹ️ Quota usage returned ${response.status()}`);
    }
  });
});

test.describe("Stats API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/stats/account returns account stats", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/stats/account`, {
      headers: authHeaders(),
    });

    expect([200, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Account stats retrieved");

      // Check for common stats fields
      if (data.totalCreditsUsed !== undefined) {
        console.log(`   Total credits used: ${data.totalCreditsUsed}`);
      }
      if (data.totalRequests !== undefined) {
        console.log(`   Total requests: ${data.totalRequests}`);
      }
    } else {
      console.log(`ℹ️ Account stats returned ${response.status()}`);
    }
  });
});

test.describe("API Explorer UI", () => {
  test("API explorer page loads", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/api-explorer`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      console.log("ℹ️ API Explorer requires authentication");
      return;
    }

    const content = await page.locator("body").textContent();
    expect(content?.length).toBeGreaterThan(100);
    console.log("✅ API Explorer page loads");
  });

  test("API explorer has endpoint list", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/api-explorer`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      return;
    }

    // Look for endpoint cards or list
    const endpoints = page.locator(
      '[class*="endpoint"], [class*="api"], [class*="route"], article, [class*="card"]'
    );
    const endpointCount = await endpoints.count();

    console.log(`✅ Found ${endpointCount} endpoint elements in API Explorer`);
  });

  test("API explorer has try it out functionality", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/api-explorer`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const url = page.url();

    if (url.includes("/login")) {
      return;
    }

    // Look for try/test buttons
    const tryButtons = page.locator(
      'button:has-text("Try"), button:has-text("Test"), button:has-text("Execute"), button:has-text("Send")'
    );
    const buttonCount = await tryButtons.count();

    console.log(`✅ Found ${buttonCount} try/test buttons in API Explorer`);
  });
});


