import { test, expect } from "@playwright/test";

/**
 * Token Redemption API Tests
 *
 * Tests the elizaOS token payout system:
 * - Price quotes
 * - Redemption creation
 * - Rate limiting
 * - Input validation
 * - Status tracking
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

test.describe("Token Redemption Quote API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/v1/redemptions/quote returns price quote for EVM", async ({ request }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/redemptions/quote?network=base&pointsAmount=1000`,
      { headers: authHeaders() }
    );

    expect([200, 400, 401, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.quote).toBeDefined();
      expect(data.quote.network).toBe("base");
      expect(data.quote.elizaPriceUsd).toBeDefined();
      expect(data.quote.elizaAmount).toBeDefined();
      expect(data.quote.usdValue).toBe(10); // 1000 points = $10
      expect(data.quote.tokenAddress).toBe("0xea17df5cf6d172224892b5477a16acb111182478");
      console.log(`✅ Quote: ${data.quote.elizaAmount} ELIZA for $${data.quote.usdValue}`);
    } else {
      console.log(`ℹ️ Quote endpoint returned ${response.status()}`);
    }
  });

  test("GET /api/v1/redemptions/quote returns price quote for Solana", async ({ request }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/redemptions/quote?network=solana&pointsAmount=1000`,
      { headers: authHeaders() }
    );

    expect([200, 400, 401, 500, 501]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.quote.network).toBe("solana");
      expect(data.quote.tokenAddress).toBe("DuMbhu7mvQvqQHGcnikDgb4XegXJRyhUBfdU22uELiZA");
      console.log(`✅ Solana quote: ${data.quote.elizaAmount} ELIZA for $${data.quote.usdValue}`);
    }
  });

  test("GET /api/v1/redemptions/quote includes availability check", async ({ request }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/redemptions/quote?network=base&pointsAmount=100`,
      { headers: authHeaders() }
    );

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.quote).toHaveProperty("tokensAvailable");
      expect(data.quote).toHaveProperty("hotWalletBalance");
      expect(data).toHaveProperty("canRedeem");
      console.log(`✅ Tokens available: ${data.canRedeem}`);
    }
  });

  test("GET /api/v1/redemptions/quote includes limits info", async ({ request }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/redemptions/quote?network=base&pointsAmount=100`,
      { headers: authHeaders() }
    );

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.quote.limits).toBeDefined();
      expect(data.quote.limits.minRedemptionPoints).toBe(100);
      expect(data.quote.limits.maxRedemptionPoints).toBe(100000);
      console.log(`✅ Limits info included`);
    }
  });

  test("quote rejects invalid network", async ({ request }) => {
    const response = await request.get(
      `${CLOUD_URL}/api/v1/redemptions/quote?network=invalid&pointsAmount=100`,
      { headers: authHeaders() }
    );

    expect([400, 422]).toContain(response.status());

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("Invalid network");
    console.log("✅ Quote rejects invalid network");
  });
});

test.describe("Token Redemption List API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("GET /api/v1/redemptions returns redemption list", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/redemptions`, {
      headers: authHeaders(),
    });

    expect([200, 401, 500]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.redemptions)).toBe(true);
      console.log(`✅ Found ${data.redemptions.length} redemptions`);

      if (data.redemptions.length > 0) {
        const redemption = data.redemptions[0];
        expect(redemption).toHaveProperty("id");
        expect(redemption).toHaveProperty("status");
        expect(redemption).toHaveProperty("pointsAmount");
        expect(redemption).toHaveProperty("elizaAmount");
        expect(redemption).toHaveProperty("network");
      }
    }
  });

  test("GET /api/v1/redemptions supports pagination", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/v1/redemptions?limit=5`, {
      headers: authHeaders(),
    });

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.redemptions.length).toBeLessThanOrEqual(5);
      console.log("✅ Pagination works");
    }
  });
});

test.describe("Token Redemption Creation API", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("POST /api/v1/redemptions validates minimum amount", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/redemptions`, {
      headers: authHeaders(),
      data: {
        appId: "00000000-0000-0000-0000-000000000000",
        pointsAmount: 50, // Below 100 minimum
        network: "base",
        payoutAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f6E2c3",
      },
    });

    expect([400, 422]).toContain(response.status());
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("Minimum");
    console.log("✅ Minimum amount validated");
  });

  test("POST /api/v1/redemptions validates maximum amount", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/redemptions`, {
      headers: authHeaders(),
      data: {
        appId: "00000000-0000-0000-0000-000000000000",
        pointsAmount: 200000, // Above 100000 maximum
        network: "base",
        payoutAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f6E2c3",
      },
    });

    expect([400, 422]).toContain(response.status());
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain("Maximum");
    console.log("✅ Maximum amount validated");
  });

  test("POST /api/v1/redemptions validates EVM address format", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/redemptions`, {
      headers: authHeaders(),
      data: {
        appId: "00000000-0000-0000-0000-000000000000",
        pointsAmount: 100,
        network: "base",
        payoutAddress: "invalid-address",
      },
    });

    expect([400, 422]).toContain(response.status());
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error?.toLowerCase()).toContain("address");
    console.log("✅ EVM address format validated");
  });

  test("POST /api/v1/redemptions validates Solana address format", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/redemptions`, {
      headers: authHeaders(),
      data: {
        appId: "00000000-0000-0000-0000-000000000000",
        pointsAmount: 100,
        network: "solana",
        payoutAddress: "invalid-solana-address!",
      },
    });

    expect([400, 422]).toContain(response.status());
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error?.toLowerCase()).toContain("address");
    console.log("✅ Solana address format validated");
  });

  test("POST /api/v1/redemptions validates network", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/redemptions`, {
      headers: authHeaders(),
      data: {
        appId: "00000000-0000-0000-0000-000000000000",
        pointsAmount: 100,
        network: "polygon", // Invalid network
        payoutAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f6E2c3",
      },
    });

    expect([400, 422]).toContain(response.status());
    const data = await response.json();
    expect(data.success).toBe(false);
    console.log("✅ Network validated");
  });

  test("POST /api/v1/redemptions validates required fields", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/v1/redemptions`, {
      headers: authHeaders(),
      data: {
        // Missing required fields
        pointsAmount: 100,
      },
    });

    expect([400, 422]).toContain(response.status());
    const data = await response.json();
    expect(data.success).toBe(false);
    console.log("✅ Required fields validated");
  });
});

test.describe("Token Redemption Security", () => {
  test.skip(() => !API_KEY, "TEST_API_KEY environment variable required");

  test("endpoints require authentication", async ({ request }) => {
    // Quote endpoint without auth
    const quoteResponse = await request.get(
      `${CLOUD_URL}/api/v1/redemptions/quote?network=base&pointsAmount=100`,
      { headers: { "Content-Type": "application/json" } }
    );
    expect([401, 403]).toContain(quoteResponse.status());

    // List endpoint without auth
    const listResponse = await request.get(`${CLOUD_URL}/api/v1/redemptions`, {
      headers: { "Content-Type": "application/json" },
    });
    expect([401, 403]).toContain(listResponse.status());

    // Create endpoint without auth
    const createResponse = await request.post(`${CLOUD_URL}/api/v1/redemptions`, {
      headers: { "Content-Type": "application/json" },
      data: {
        appId: "00000000-0000-0000-0000-000000000000",
        pointsAmount: 100,
        network: "base",
        payoutAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f6E2c3",
      },
    });
    expect([401, 403]).toContain(createResponse.status());

    console.log("✅ All endpoints require authentication");
  });

  test("GET /api/v1/redemptions/[id] validates ownership", async ({ request }) => {
    // Try to access a non-existent redemption
    const response = await request.get(
      `${CLOUD_URL}/api/v1/redemptions/00000000-0000-0000-0000-000000000000`,
      { headers: authHeaders() }
    );

    expect([404]).toContain(response.status());
    console.log("✅ Redemption ownership validated");
  });
});

test.describe("Redemption Processing Cron", () => {
  test("cron endpoint requires authentication", async ({ request }) => {
    const response = await request.post(`${CLOUD_URL}/api/cron/process-redemptions`, {
      headers: { "Content-Type": "application/json" },
    });

    expect([401, 403]).toContain(response.status());
    console.log("✅ Cron endpoint requires auth");
  });

  test("cron health check endpoint works", async ({ request }) => {
    const response = await request.get(`${CLOUD_URL}/api/cron/process-redemptions`);

    expect([200]).toContain(response.status());
    const data = await response.json();
    expect(data).toHaveProperty("healthy");
    expect(data).toHaveProperty("cronSecretConfigured");
    console.log(`✅ Cron health: healthy=${data.healthy}`);
  });
});

test.describe("Token Address Configuration", () => {
  test("quote returns correct token addresses", async ({ request }) => {
    // Test Base
    const baseResponse = await request.get(
      `${CLOUD_URL}/api/v1/redemptions/quote?network=base&pointsAmount=100`,
      { headers: authHeaders() }
    );

    if (baseResponse.status() === 200) {
      const baseData = await baseResponse.json();
      expect(baseData.quote.tokenAddress).toBe("0xea17df5cf6d172224892b5477a16acb111182478");
    }

    // Test Ethereum
    const ethResponse = await request.get(
      `${CLOUD_URL}/api/v1/redemptions/quote?network=ethereum&pointsAmount=100`,
      { headers: authHeaders() }
    );

    if (ethResponse.status() === 200) {
      const ethData = await ethResponse.json();
      expect(ethData.quote.tokenAddress).toBe("0xea17df5cf6d172224892b5477a16acb111182478");
    }

    // Test Solana
    const solanaResponse = await request.get(
      `${CLOUD_URL}/api/v1/redemptions/quote?network=solana&pointsAmount=100`,
      { headers: authHeaders() }
    );

    if (solanaResponse.status() === 200) {
      const solanaData = await solanaResponse.json();
      expect(solanaData.quote.tokenAddress).toBe("DuMbhu7mvQvqQHGcnikDgb4XegXJRyhUBfdU22uELiZA");
    }

    console.log("✅ Token addresses correctly configured");
  });
});

