import { describe, expect, test } from "bun:test";
import * as api from "../helpers/api-client";

/**
 * Affiliates, Referrals, Analytics & Tracking API E2E Tests
 */

describe("Affiliates API", () => {
  test("POST /api/affiliate/create-character validates input", async () => {
    const response = await api.post("/api/affiliate/create-character", {});
    expect([400, 401]).toContain(response.status);
  });

  test("POST /api/affiliate/create-session creates session", async () => {
    const response = await api.post("/api/affiliate/create-session", {});
    expect([200, 400, 401]).toContain(response.status);
  });

  test("GET /api/v1/affiliates requires auth", async () => {
    const response = await api.get("/api/v1/affiliates");
    expect([401, 403]).toContain(response.status);
  });

  test.skipIf(!api.hasApiKey())("GET /api/v1/affiliates returns data with auth", async () => {
    const response = await api.get("/api/v1/affiliates", { authenticated: true });
    expect(response.status).toBe(200);
  });

  test.skipIf(!api.hasApiKey())(
    "Affiliate SKU end-to-end: AI inference with X-Affiliate-Code credits owner",
    async () => {
      // 1. Ensure affiliate code exists with markup
      const createRes = await api.post(
        "/api/v1/affiliates",
        { markupPercent: 50 },
        { authenticated: true },
      );
      expect([200, 400]).toContain(createRes.status);

      const getRes = await api.get("/api/v1/affiliates", { authenticated: true });
      expect(getRes.status).toBe(200);
      const getBody = (await getRes.json()) as any;
      const affiliateCode = getBody.code?.code;
      expect(affiliateCode).toBeTruthy();

      // 2. Initial earnings check
      const initialUserRes = await api.get("/api/v1/user", { authenticated: true });
      const initialUserBody = (await initialUserRes.json()) as any;
      const initialEarnings = Number(initialUserBody.user?.redeemable_earnings || 0);

      // 3. Perform AI inference with X-Affiliate-Code
      const chatRes = await api.post(
        "/api/v1/chat/completions",
        {
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: "Say hello!" }],
          max_tokens: 10,
        },
        {
          authenticated: true,
          headers: { "X-Affiliate-Code": affiliateCode },
        },
      );
      expect(chatRes.status).toBe(200);

      // 4. Verify earnings increased
      const finalUserRes = await api.get("/api/v1/user", { authenticated: true });
      const finalUserBody = (await finalUserRes.json()) as any;
      const finalEarnings = Number(finalUserBody.user?.redeemable_earnings || 0);

      expect(finalEarnings).toBeGreaterThan(initialEarnings);
    },
  );
});

describe("Referrals API", () => {
  test("POST /api/v1/referrals/apply requires auth", async () => {
    const response = await api.post("/api/v1/referrals/apply", {
      code: "TEST123",
    });
    expect([401, 403]).toContain(response.status);
  });

  test("GET /api/v1/referrals requires auth", async () => {
    const response = await api.get("/api/v1/referrals");
    expect([401, 403]).toContain(response.status);
  });

  test.skipIf(!api.hasApiKey())("POST /api/v1/referrals/apply with invalid code", async () => {
    const response = await api.post(
      "/api/v1/referrals/apply",
      { code: "NONEXISTENT" },
      { authenticated: true },
    );
    expect([200, 400, 404]).toContain(response.status);
  });

  test.skipIf(!api.hasApiKey())("GET /api/v1/referrals returns flat code payload with auth", async () => {
    const first = await api.get("/api/v1/referrals", { authenticated: true });
    expect(first.status).toBe(200);
    const body = (await first.json()) as {
      code: string;
      total_referrals: number;
      is_active: boolean;
    };
    expect(typeof body.code).toBe("string");
    expect(body.code.length).toBeGreaterThan(0);
    expect(typeof body.total_referrals).toBe("number");
    expect(typeof body.is_active).toBe("boolean");

    const second = await api.get("/api/v1/referrals", { authenticated: true });
    expect(second.status).toBe(200);
    const body2 = (await second.json()) as { code: string };
    expect(body2.code).toBe(body.code);
  });
});

describe("Analytics API", () => {
  test("GET /api/analytics/overview requires auth", async () => {
    const response = await api.get("/api/analytics/overview");
    expect([401, 403]).toContain(response.status);
  });

  test("GET /api/analytics/export requires auth", async () => {
    const response = await api.get("/api/analytics/export");
    expect([401, 403]).toContain(response.status);
  });
});

describe("Tracking API", () => {
  test("POST /api/v1/track/pageview accepts tracking events", async () => {
    const response = await api.post("/api/v1/track/pageview", {
      path: "/test",
      title: "Test Page",
    });
    // Tracking may accept anonymously or require auth
    expect([200, 204, 400, 401]).toContain(response.status);
  });
});
