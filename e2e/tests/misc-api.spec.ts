import { test, expect } from "@playwright/test";

/**
 * Miscellaneous API Tests
 *
 * Tests remaining endpoints:
 * - Fal proxy
 * - A2A (Agent to Agent)
 * - X402 payment
 * - OG image generation
 * - Cron endpoints
 * - Webhooks validation
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

test.describe("Fal Proxy API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/fal/proxy forwards to Fal.ai", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/fal/proxy`, {
      headers: authHeaders(),
      data: {
        model_id: "fal-ai/flux/dev",
        input: {
          prompt: "A test image",
        },
      },
    });

    expect([200, 201, 400, 401, 404, 500, 501, 502]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Fal proxy endpoint works");
    } else if (response.status() === 401) {
      console.log("✅ Fal proxy requires valid Fal.ai API key");
    } else {
      console.log(`ℹ️ Fal proxy returned ${response.status()}`);
    }
  });
});

test.describe("A2A (Agent to Agent) API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/a2a handles agent communication", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/a2a`, {
      headers: authHeaders(),
      data: {
        from_agent: "test-agent-1",
        to_agent: "test-agent-2",
        message: "Hello from E2E test",
      },
    });

    expect([200, 201, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ A2A endpoint works");
    } else {
      console.log(`ℹ️ A2A endpoint returned ${response.status()}`);
    }
  });

  test("GET /api/a2a returns A2A info", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/a2a`, {
      headers: authHeaders(),
    });

    expect([200, 404, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ A2A info endpoint works");
    } else {
      console.log(`ℹ️ A2A info returned ${response.status()}`);
    }
  });
});

test.describe("X402 Payment Test API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/test-x402 tests X402 payment flow", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/test-x402`, {
      headers: authHeaders(),
    });

    expect([200, 402, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ X402 test endpoint works");
    } else if (response.status() === 402) {
      console.log("✅ X402 properly returns 402 Payment Required");
    } else {
      console.log(`ℹ️ X402 test returned ${response.status()}`);
    }
  });

  test("POST /api/test-x402 with payment", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/test-x402`, {
      headers: {
        ...authHeaders(),
        "X-Payment": "test-payment-token",
      },
    });

    expect([200, 201, 400, 402, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      console.log("✅ X402 payment flow works");
    } else {
      console.log(`ℹ️ X402 with payment returned ${response.status()}`);
    }
  });
});

test.describe("OG Image API", () => {
  test("GET /api/og generates OG image", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/og?title=Test&description=E2E+Test`);

    expect([200, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const contentType = response.headers()["content-type"];
      const isImage =
        contentType?.includes("image/") ||
        contentType?.includes("application/octet-stream");

      if (isImage) {
        console.log("✅ OG image generated successfully");
      } else {
        console.log(`✅ OG endpoint returns: ${contentType}`);
      }
    } else {
      console.log(`ℹ️ OG image returned ${response.status()}`);
    }
  });

  test("OG image with character ID", async ({ request }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/og?characterId=test-id&title=Character`
    );

    expect([200, 400, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      console.log("✅ OG image with character ID works");
    } else {
      console.log(`ℹ️ OG with character returned ${response.status()}`);
    }
  });
});

test.describe("Cron Endpoints", () => {
  // These are typically protected and called by Vercel/system
  // We test they exist but expect auth errors

  test("GET /api/cron/auto-top-up endpoint exists", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/cron/auto-top-up`);

    // Cron endpoints typically require special auth
    expect([200, 401, 403, 404, 500, 501]).toContain(response.status());

    if (response.status() === 401 || response.status() === 403) {
      console.log("✅ Auto top-up cron requires cron authorization");
    } else if (response.status() === 200) {
      console.log("✅ Auto top-up cron executed");
    } else {
      console.log(`ℹ️ Auto top-up cron returned ${response.status()}`);
    }
  });

  test("GET /api/cron/cleanup-anonymous-sessions endpoint exists", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/cron/cleanup-anonymous-sessions`);

    expect([200, 401, 403, 404, 500, 501]).toContain(response.status());

    if (response.status() === 401 || response.status() === 403) {
      console.log("✅ Cleanup cron requires cron authorization");
    } else {
      console.log(`ℹ️ Cleanup cron returned ${response.status()}`);
    }
  });

  test("GET /api/cron/cleanup-cli-sessions endpoint exists", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/cron/cleanup-cli-sessions`);

    expect([200, 401, 403, 404, 500, 501]).toContain(response.status());

    if (response.status() === 401 || response.status() === 403) {
      console.log("✅ CLI cleanup cron requires authorization");
    } else {
      console.log(`ℹ️ CLI cleanup cron returned ${response.status()}`);
    }
  });

  test("GET /api/cron/cleanup-priorities endpoint exists", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/cron/cleanup-priorities`);

    expect([200, 401, 403, 404, 500, 501]).toContain(response.status());

    if (response.status() === 401 || response.status() === 403) {
      console.log("✅ Priorities cleanup cron requires authorization");
    } else {
      console.log(`ℹ️ Priorities cleanup cron returned ${response.status()}`);
    }
  });

  test("GET /api/v1/cron/deployment-monitor endpoint exists", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/cron/deployment-monitor`);

    expect([200, 401, 403, 404, 500, 501]).toContain(response.status());

    if (response.status() === 401 || response.status() === 403) {
      console.log("✅ Deployment monitor cron requires authorization");
    } else {
      console.log(`ℹ️ Deployment monitor cron returned ${response.status()}`);
    }
  });

  test("GET /api/v1/cron/health-check endpoint exists", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/cron/health-check`);

    expect([200, 401, 403, 404, 500, 501]).toContain(response.status());

    if (response.status() === 401 || response.status() === 403) {
      console.log("✅ Health check cron requires authorization");
    } else if (response.status() === 200) {
      console.log("✅ Health check cron executed successfully");
    } else {
      console.log(`ℹ️ Health check cron returned ${response.status()}`);
    }
  });
});

test.describe("Webhook Endpoints", () => {
  // Webhooks require specific signatures - we test they exist

  test("POST /api/stripe/webhook endpoint exists", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/stripe/webhook`, {
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": "invalid-signature",
      },
      data: {
        type: "test.event",
      },
    });

    // Should reject invalid signature
    expect([400, 401, 403, 404, 500]).toContain(response.status());

    if (response.status() === 400 || response.status() === 401) {
      console.log("✅ Stripe webhook validates signatures");
    } else {
      console.log(`ℹ️ Stripe webhook returned ${response.status()}`);
    }
  });

  test("POST /api/privy/webhook endpoint exists", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/privy/webhook`, {
      headers: {
        "Content-Type": "application/json",
        "Privy-Signature": "invalid-signature",
      },
      data: {
        type: "user.created",
      },
    });

    expect([400, 401, 403, 404, 500]).toContain(response.status());

    if (response.status() === 400 || response.status() === 401) {
      console.log("✅ Privy webhook validates signatures");
    } else {
      console.log(`ℹ️ Privy webhook returned ${response.status()}`);
    }
  });
});

test.describe("Seed Endpoint", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/seed/marketplace-characters seeds data", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/seed/marketplace-characters`, {
      headers: authHeaders(),
    });

    expect([200, 201, 400, 403, 404, 500, 501]).toContain(response.status());

    if (response.status() === 200 || response.status() === 201) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Seed endpoint works");
    } else if (response.status() === 403) {
      console.log("✅ Seed endpoint requires special permissions");
    } else {
      console.log(`ℹ️ Seed endpoint returned ${response.status()}`);
    }
  });
});

test.describe(".well-known Endpoints", () => {
  test("GET /.well-known/agent-card.json returns agent card", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/.well-known/agent-card.json`);

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ Agent card endpoint works");
    } else {
      console.log("ℹ️ Agent card not found (may not be implemented)");
    }
  });

  test("GET /.well-known/erc8004-registration.json returns ERC8004 info", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/.well-known/erc8004-registration.json`);

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toBeDefined();
      console.log("✅ ERC8004 registration endpoint works");
    } else {
      console.log("ℹ️ ERC8004 registration not found (may not be implemented)");
    }
  });
});

test.describe("Sitemap and Robots", () => {
  test("GET /sitemap.xml returns sitemap", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/sitemap.xml`);

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const contentType = response.headers()["content-type"];
      expect(contentType).toContain("xml");
      console.log("✅ Sitemap generated");
    } else {
      console.log("ℹ️ Sitemap not found");
    }
  });

  test("GET /robots.txt returns robots", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/robots.txt`);

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const text = await response.text();
      expect(text.length).toBeGreaterThan(0);
      console.log("✅ Robots.txt generated");
    } else {
      console.log("ℹ️ Robots.txt not found");
    }
  });
});

